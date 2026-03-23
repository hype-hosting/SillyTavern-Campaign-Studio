/**
 * Campaign Studio — Main Entry Point
 * Bootstrap, SillyTavern event hooks, template loading.
 */

import { EXTENSION_NAME, EXTENSION_DISPLAY } from './src/core/config.js';
import { initSettings, getSettings, updateSettings, saveMessageSnapshot, rebuildStateFromChat } from './src/core/persistence.js';
import { getState, updateSection, getAllSections, getSection } from './src/core/state.js';
import { extractBlocks } from './src/parser/engine.js';
import { extractCampaignData } from './src/parser/extractor.js';
import { routeBlocks } from './src/parser/router.js';
import { collapseParsedBlocks } from './src/parser/collapse.js';
import { initPresets, getActivePreset, getAllPresets, activatePreset } from './src/presets/manager.js';
import { initPanel, openPanel, closePanel, togglePanel, destroyPanel } from './src/ui/panel.js';
import { initTabs, getPane } from './src/ui/tabs.js';
import { renderInventory } from './src/ui/renderers/inventory.js';
import { renderWorld } from './src/ui/renderers/world.js';
import { renderFactions } from './src/ui/renderers/factions.js';
import { initDice, destroyDice } from './src/mechanics/dice.js';
import { updateSystemPrompt, clearSystemPrompt } from './src/injection/prompt.js';
import { registerStateInjection, unregisterStateInjection } from './src/injection/state.js';
import { loadTemplate } from './src/utils/dom.js';
import { on, CS_EVENTS } from './src/core/events.js';

const EXTENSION_PATH = `scripts/extensions/third-party/SillyTavern-Campaign-Studio`;

// Track which summary texts were parsed per message for collapse
let lastParsedSummaryTexts = [];
// Track whether last message used campaign_data format
let lastHadCampaignData = false;

/**
 * Main initialization.
 */
jQuery(async () => {
    try {
        // 1. Initialize settings
        const settings = initSettings();
        if (!settings.enabled) {
            console.log(`[${EXTENSION_DISPLAY}] Extension is disabled.`);
            return;
        }

        // 2. Load settings panel into ST Extensions drawer
        await loadSettingsPanel();

        // 3. Load presets
        await initPresets();

        // 4. Load panel template into DOM
        await loadTemplate('panel.html', $('body'));

        // 5. Initialize panel UI
        initPanel();

        // 6. Initialize tabs from active preset
        const activePreset = getActivePreset();
        if (activePreset) {
            initTabs(activePreset);
            $('#cs-active-preset-name').text(activePreset.name);
        }

        // 7. Initialize dice roller
        if (settings.mechanics.diceEnabled) {
            initDice();
        }

        // 8. Initialize injection pipeline
        initInjection(settings);

        // 9. Register SillyTavern event listeners
        registerSTEvents();

        // 10. If there's an active chat, rebuild state
        const context = SillyTavern.getContext();
        if (context.chat && context.chat.length > 0) {
            rebuildStateFromChat();
            renderAllSections();
        }

        // 11. Listen for internal state changes to trigger re-renders
        on(CS_EVENTS.SECTION_UPDATED, ({ sectionId }) => {
            renderSection(sectionId);
        });

        console.log(`[${EXTENSION_DISPLAY}] Initialized successfully.`);
    } catch (err) {
        console.error(`[${EXTENSION_DISPLAY}] Initialization failed:`, err);
        toastr.error(`${EXTENSION_DISPLAY} failed to initialize. Check console for details.`);
    }
});

/**
 * Load the settings panel HTML into the ST Extensions drawer.
 */
async function loadSettingsPanel() {
    const settingsHtml = await $.get(`${EXTENSION_PATH}/settings.html`);
    $('#extensions_settings2').append(settingsHtml);

    const settings = getSettings();

    // Enable toggle
    $('#cs-settings-enabled').prop('checked', settings.enabled).on('change', function () {
        updateSettings({ enabled: $(this).is(':checked') });
    });

    // Preset dropdown
    const $presetSelect = $('#cs-settings-preset');
    // Will be populated after presets are loaded — use a short delay
    setTimeout(() => {
        $presetSelect.empty();
        for (const preset of getAllPresets()) {
            $presetSelect.append(`<option value="${preset.id}">${preset.name}</option>`);
        }
        $presetSelect.val(settings.activePreset);
    }, 500);

    $presetSelect.on('change', function () {
        const presetId = $(this).val();
        activatePreset(presetId);
        const preset = getActivePreset();
        if (preset) {
            initTabs(preset);
            $('#cs-active-preset-name').text(preset.name);
            // Refresh injection with new preset schema
            updateSystemPrompt();
            // Re-parse current chat with new preset
            reparseChat();
        }
    });

    // Position dropdown
    $('#cs-settings-position').val(settings.panelPosition).on('change', function () {
        updateSettings({ panelPosition: $(this).val() });
        // Re-initialize panel to apply position
        destroyPanel();
        initPanel();
    });

    // Accent color
    $('#cs-settings-accent').val(settings.accentColor).on('change', function () {
        const color = $(this).val();
        updateSettings({ accentColor: color });
        applyAccentColor(color);
    });

    // Dice toggle
    $('#cs-settings-dice').prop('checked', settings.mechanics.diceEnabled).on('change', function () {
        const enabled = $(this).is(':checked');
        updateSettings({ mechanics: { ...settings.mechanics, diceEnabled: enabled } });
        if (enabled) {
            initDice();
            $('#cs-mechanics-bar').removeClass('cs-hidden');
        } else {
            destroyDice();
            $('#cs-mechanics-bar').addClass('cs-hidden');
        }
    });

    // Injection: system prompt toggle
    const injection = settings.injection || {};
    $('#cs-settings-injection-system').prop('checked', injection.systemPrompt !== false).on('change', function () {
        const enabled = $(this).is(':checked');
        updateSettings({ injection: { ...settings.injection, systemPrompt: enabled } });
        if (enabled) {
            updateSystemPrompt();
        } else {
            clearSystemPrompt();
        }
    });

    // Injection: state context toggle
    $('#cs-settings-injection-state').prop('checked', injection.stateContext !== false).on('change', function () {
        const enabled = $(this).is(':checked');
        updateSettings({ injection: { ...settings.injection, stateContext: enabled } });
        if (enabled) {
            registerStateInjection();
        } else {
            unregisterStateInjection();
        }
    });

    // Injection: output format
    $('#cs-settings-output-format').val(injection.outputFormat || 'yaml').on('change', function () {
        updateSettings({ injection: { ...settings.injection, outputFormat: $(this).val() } });
        updateSystemPrompt();
    });
}

/**
 * Register SillyTavern event listeners.
 */
function registerSTEvents() {
    const context = SillyTavern.getContext();
    const eventSource = context.eventSource;
    const eventTypes = context.event_types;

    // When a new bot message arrives
    eventSource.on(eventTypes.MESSAGE_RECEIVED, (messageId) => {
        handleMessageReceived(messageId);
    });

    // When a message is rendered in the DOM (for collapsing details blocks)
    eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        handleMessageRendered(messageId);
    });

    // When the chat changes (switch character, load chat, etc.)
    eventSource.on(eventTypes.CHAT_CHANGED, () => {
        handleChatChanged();
    });
}

/**
 * Handle a new bot message — extract and parse tracking data.
 * Tries <campaign_data> YAML blocks first, falls back to <details><summary>.
 */
function handleMessageReceived(messageId) {
    const settings = getSettings();
    if (!settings.enabled) return;

    const preset = getActivePreset();
    if (!preset) return;

    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || !chat[messageId]) return;

    const message = chat[messageId];
    const messageText = message.mes;
    if (!messageText) return;

    let matched;
    lastParsedSummaryTexts = [];
    lastHadCampaignData = false;

    // Strategy 1: Try <campaign_data> YAML extraction
    const { blocks, hasCampaignData } = extractCampaignData(messageText);
    if (hasCampaignData) {
        matched = routeBlocks(blocks, preset);
        lastHadCampaignData = true;
    }

    // Strategy 2: Fall back to <details><summary> HTML extraction
    if (!matched || matched.size === 0) {
        const legacy = extractBlocks(messageText, preset);
        matched = legacy.matched;

        // Track summary texts for collapse (legacy only)
        for (const [, result] of matched) {
            lastParsedSummaryTexts.push(result.summaryText);
        }
    }

    if (!matched || matched.size === 0) return;

    for (const [sectionId, result] of matched) {
        updateSection(sectionId, result.sectionConfig, result.data, messageId);
    }

    // Persist snapshot
    saveMessageSnapshot(messageId);

    // Auto-open panel if it has data
    const { panelOpen } = settings;
    if (!panelOpen) {
        openPanel();
    }
}

/**
 * Handle message rendering — collapse parsed blocks in chat DOM.
 */
function handleMessageRendered(messageId) {
    const settings = getSettings();
    if (!settings.enabled) return;

    const hasContent = lastParsedSummaryTexts.length > 0 || lastHadCampaignData;
    if (!hasContent) return;

    // Find the rendered message element
    const $message = $(`.mes[mesid="${messageId}"] .mes_text`);
    if ($message.length) {
        collapseParsedBlocks($message, lastParsedSummaryTexts);
    }
}

/**
 * Handle chat changed — rebuild state from the new chat's history.
 */
function handleChatChanged() {
    const settings = getSettings();
    if (!settings.enabled) return;

    rebuildStateFromChat();

    const preset = getActivePreset();
    if (preset) {
        initTabs(preset);
        $('#cs-active-preset-name').text(preset.name);
    }

    renderAllSections();
}

/**
 * Re-parse the entire current chat (e.g., after preset change).
 */
function reparseChat() {
    const preset = getActivePreset();
    if (!preset) return;

    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat) return;

    // Walk through all messages and re-extract
    for (let i = 0; i < chat.length; i++) {
        const message = chat[i];
        if (!message.mes) continue;

        // Try YAML first, then fall back to details
        let matched;
        const { blocks, hasCampaignData } = extractCampaignData(message.mes);
        if (hasCampaignData) {
            matched = routeBlocks(blocks, preset);
        }
        if (!matched || matched.size === 0) {
            const legacy = extractBlocks(message.mes, preset);
            matched = legacy.matched;
        }

        for (const [sectionId, result] of matched) {
            updateSection(sectionId, result.sectionConfig, result.data, i);
        }
    }

    renderAllSections();
}

/**
 * Render all sections based on current state.
 */
function renderAllSections() {
    const state = getState();
    const preset = getActivePreset();
    if (!preset) return;

    for (const section of preset.sections) {
        renderSection(section.id);
    }
}

/**
 * Render a specific section into its tab pane.
 */
function renderSection(sectionId) {
    const sectionData = getSection(sectionId);
    if (!sectionData) return;

    const $pane = getPane(sectionId);
    if (!$pane || !$pane.length) return;

    const preset = getActivePreset();
    const sectionConfig = preset?.sections?.find(s => s.id === sectionId) || {};

    switch (sectionData.type) {
    case 'inventory':
        renderInventory(sectionData.data, sectionConfig, $pane);
        break;
    case 'key-value':
        renderWorld(sectionData.data, sectionConfig, $pane);
        break;
    case 'numeric-bars':
        renderFactions(sectionData.data, sectionConfig, $pane);
        break;
    default:
        renderWorld(sectionData.data, sectionConfig, $pane);
        break;
    }

    // Hide empty state, show content
    $('#cs-empty-state').addClass('cs-hidden');
    $('#cs-section-container').removeClass('cs-hidden');
}

/**
 * Initialize the injection pipeline based on settings.
 */
function initInjection(settings) {
    const injection = settings.injection || {};

    if (injection.systemPrompt) {
        updateSystemPrompt();
    }

    if (injection.stateContext) {
        registerStateInjection();
    }
}

/**
 * Apply a custom accent color via CSS custom properties.
 */
function applyAccentColor(color) {
    // Convert hex to RGB for rgba() usage
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    document.documentElement.style.setProperty('--cs-accent', color);
    document.documentElement.style.setProperty('--cs-accent-rgb', `${r}, ${g}, ${b}`);
    document.documentElement.style.setProperty('--cs-accent-glow', `rgba(${r}, ${g}, ${b}, 0.15)`);
    document.documentElement.style.setProperty('--cs-accent-glow-strong', `rgba(${r}, ${g}, ${b}, 0.3)`);
}
