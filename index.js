/**
 * Campaign Studio — Main Entry Point
 * Bootstrap, SillyTavern event hooks, template loading.
 */

import { EXTENSION_NAME, EXTENSION_DISPLAY, EXTENSION_PATH } from './src/core/config.js';
import { initSettings, getSettings, updateSettings, saveMessageSnapshot, rebuildStateFromChat } from './src/core/persistence.js';
import { getState, updateSection, getAllSections, getSection } from './src/core/state.js';
import { extractBlocks } from './src/parser/engine.js';
import { extractCampaignData } from './src/parser/extractor.js';
import { routeBlocks } from './src/parser/router.js';
import { collapseParsedBlocks } from './src/parser/collapse.js';
import { initPresets, getActivePreset, getAllPresets, activatePreset, isBuiltinPreset } from './src/presets/manager.js';
import { openPresetEditor, importPresetJSON } from './src/ui/preset-editor.js';
import { initPanel, openPanel, closePanel, togglePanel, destroyPanel } from './src/ui/panel.js';
import { initTabs, getPane, updateSectionCount, switchTab, getTabForSection, updateTabBadge } from './src/ui/tabs.js';
import { renderInventory } from './src/ui/renderers/inventory.js';
import { renderWorld } from './src/ui/renderers/world.js';
import { renderFactions } from './src/ui/renderers/factions.js';
import { renderLocation } from './src/ui/renderers/location.js';
import { renderTimeline } from './src/ui/renderers/timeline.js';
import { initDice, destroyDice } from './src/mechanics/dice.js';
import { updateSystemPrompt, clearSystemPrompt } from './src/injection/prompt.js';
import { registerStateInjection, unregisterStateInjection } from './src/injection/state.js';
import { loadTemplate } from './src/utils/dom.js';
import { on, CS_EVENTS } from './src/core/events.js';

// Extension path is now imported from config.js

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

        // 3. Load presets and populate dropdown
        await initPresets();
        populatePresetDropdown();

        // 4. Load panel template into DOM
        await loadTemplate('panel.html', $('body'));

        // 5. Initialize panel UI
        initPanel();

        // 6. Initialize tabs from active preset
        const activePreset = getActivePreset();
        if (activePreset) {
            initTabs(activePreset);
            $('#cs-active-preset-name').text(activePreset.name);
            applyAmbientEffect(activePreset);
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
            renderBuiltinSections();
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

    // Preset dropdown — populated later by populatePresetDropdown() after presets load
    const $presetSelect = $('#cs-settings-preset');

    $presetSelect.on('change', function () {
        const presetId = $(this).val();
        activatePreset(presetId);
        const preset = getActivePreset();
        if (preset) {
            initTabs(preset);
            $('#cs-active-preset-name').text(preset.name);
            // Refresh rule cards and custom textarea for new preset
            renderRuleCards(preset);
            const customRules = getSettings().presetRules?.[presetId] || '';
            $('#cs-settings-rules-custom').val(customRules);
            // Apply ambient effect
            applyAmbientEffect(preset);
            // Refresh injection with new preset schema
            updateSystemPrompt();
            // Re-parse current chat with new preset
            reparseChat();
        }
    });

    // Preset editor buttons
    $('#cs-btn-edit-preset').on('click', () => {
        const preset = getActivePreset();
        if (!preset) return;
        const needsClone = isBuiltinPreset(preset.id);
        openPresetEditor(preset, { clone: needsClone, onSave: refreshAfterPresetEdit });
    });

    $('#cs-btn-new-preset').on('click', () => {
        openPresetEditor(null, { onSave: refreshAfterPresetEdit });
    });

    $('#cs-btn-import-preset').on('click', () => {
        $('#cs-import-file').trigger('click');
    });

    $('#cs-import-file').on('change', function () {
        const file = this.files?.[0];
        if (file) {
            importPresetJSON(file);
            $(this).val(''); // Reset for re-import
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

    // Auto-extract toggle
    $('#cs-settings-auto-extract').prop('checked', settings.mechanics?.autoExtract !== false).on('change', function () {
        const enabled = $(this).is(':checked');
        updateSettings({ mechanics: { ...settings.mechanics, autoExtract: enabled } });
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

    // Rule snippet cards for current preset
    renderRuleCards(getActivePreset());

    // Custom rules textarea
    const activePresetId = settings.activePreset || 'vigil-falls';
    const currentCustomRules = settings.presetRules?.[activePresetId] || '';
    $('#cs-settings-rules-custom').val(currentCustomRules).on('input', function () {
        const presetId = getSettings().activePreset;
        const rules = { ...getSettings().presetRules, [presetId]: $(this).val() };
        updateSettings({ presetRules: rules });
        updateSystemPrompt();
    });
}

/**
 * Populate the preset dropdown after presets have been loaded.
 */
function populatePresetDropdown() {
    const $presetSelect = $('#cs-settings-preset');
    const settings = getSettings();
    $presetSelect.empty();
    for (const preset of getAllPresets()) {
        $presetSelect.append(`<option value="${preset.id}">${preset.name}</option>`);
    }
    $presetSelect.val(settings.activePreset);
}

/**
 * Render rule snippet toggle cards for a preset.
 * If the preset has no rules[] array, shows a fallback textarea.
 */
function renderRuleCards(preset) {
    const $container = $('#cs-rules-container');
    $container.empty();

    if (!preset?.rules?.length) {
        // Fallback for custom presets without snippets — show a plain textarea
        const presetId = preset?.id || getSettings().activePreset;
        const legacyRules = getSettings().presetRules?.[presetId] || '';
        const $fallback = $('<textarea>')
            .addClass('cs-settings-textarea')
            .attr({ rows: 6, placeholder: 'Write campaign-specific rules here...' })
            .val(legacyRules)
            .on('input', function () {
                const rules = { ...getSettings().presetRules, [presetId]: $(this).val() };
                updateSettings({ presetRules: rules });
                updateSystemPrompt();
            });
        $container.append($fallback);
        $('#cs-rules-count').text('');
        // Hide custom section since fallback already is a textarea
        $('.cs-rules-custom-section').addClass('cs-hidden');
        return;
    }

    $('.cs-rules-custom-section').removeClass('cs-hidden');
    const settings = getSettings();
    const overrides = settings.ruleOverrides?.[preset.id] || {};

    for (const rule of preset.rules) {
        const isEnabled = overrides[rule.id] !== undefined ? overrides[rule.id] : rule.enabled;
        const previewText = rule.content.split('\n')[0].substring(0, 80);

        const $card = $('<div>').addClass('cs-rule-card').toggleClass('cs-rule-disabled', !isEnabled);
        const $header = $('<div>').addClass('cs-rule-header');
        const $chevron = $('<span>').addClass('cs-rule-chevron').text('\u25B8');
        const $icon = $('<span>').addClass('cs-rule-icon').text(rule.icon || '\u2022');
        const $name = $('<span>').addClass('cs-rule-name').text(rule.name);
        const $toggle = $('<label>').addClass('cs-rule-toggle');
        const $input = $('<input>').attr('type', 'checkbox').prop('checked', isEnabled);
        const $track = $('<span>').addClass('cs-rule-toggle-track');
        const $thumb = $('<span>').addClass('cs-rule-toggle-thumb');
        $toggle.append($input, $track, $thumb);

        $header.append($chevron, $icon, $name, $toggle);
        const $preview = $('<div>').addClass('cs-rule-preview').text(previewText + (rule.content.length > 80 ? '...' : ''));
        const $content = $('<div>').addClass('cs-rule-content').text(rule.content);

        $card.append($header, $preview, $content);
        $container.append($card);

        // Toggle enable/disable
        $input.on('change', function (e) {
            e.stopPropagation();
            const checked = $(this).prop('checked');
            $card.toggleClass('cs-rule-disabled', !checked);
            const currentOverrides = { ...getSettings().ruleOverrides };
            currentOverrides[preset.id] = { ...(currentOverrides[preset.id] || {}), [rule.id]: checked };
            updateSettings({ ruleOverrides: currentOverrides });
            updateSystemPrompt();
            updateRuleCount(preset);
        });

        // Prevent toggle click from toggling expansion
        $toggle.on('click', function (e) {
            e.stopPropagation();
        });

        // Expand/collapse on header click
        $header.on('click', function () {
            $card.toggleClass('cs-rule-expanded');
        });
    }

    updateRuleCount(preset);
}

/**
 * Update the "X/Y active" rule count badge.
 */
function updateRuleCount(preset) {
    if (!preset?.rules?.length) {
        $('#cs-rules-count').text('');
        return;
    }
    const overrides = getSettings().ruleOverrides?.[preset.id] || {};
    const total = preset.rules.length;
    const active = preset.rules.filter(r => {
        const override = overrides[r.id];
        return override !== undefined ? override : r.enabled;
    }).length;
    $('#cs-rules-count').text(`${active}/${total} active`);
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

    // Strategy 2: ALWAYS try <details> extraction (not just as fallback)
    // This handles bot-native trackers like "Fate's Ledger" stat blocks
    const autoExtract = settings.mechanics?.autoExtract !== false;
    const legacy = extractBlocks(messageText, preset, { autoExtract });
    if (legacy.matched.size > 0) {
        if (!matched) matched = new Map();
        for (const [sectionId, result] of legacy.matched) {
            if (!matched.has(sectionId)) {
                // Only add if YAML didn't already provide this section
                matched.set(sectionId, result);
            }
        }
        // Track summary texts for collapse
        for (const [, result] of legacy.matched) {
            if (result.summaryText) {
                lastParsedSummaryTexts.push(result.summaryText);
            }
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
        applyAmbientEffect(preset);
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

    const settings = getSettings();
    const autoExtract = settings.mechanics?.autoExtract !== false;

    // Walk through all messages and re-extract
    for (let i = 0; i < chat.length; i++) {
        const message = chat[i];
        if (!message.mes) continue;

        // Try YAML first
        let matched;
        const { blocks, hasCampaignData } = extractCampaignData(message.mes);
        if (hasCampaignData) {
            matched = routeBlocks(blocks, preset);
        }

        // ALWAYS also try <details> extraction (handles bot-native trackers)
        const legacy = extractBlocks(message.mes, preset, { autoExtract });
        if (legacy.matched.size > 0) {
            if (!matched) matched = new Map();
            for (const [sectionId, result] of legacy.matched) {
                if (!matched.has(sectionId)) {
                    matched.set(sectionId, result);
                }
            }
        }

        if (!matched) continue;
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
    const preset = getActivePreset();
    if (!preset) return;

    for (const section of preset.sections) {
        renderSection(section.id);
    }

    renderBuiltinSections();
}

/**
 * Render built-in sections (Location, Timeline).
 */
function renderBuiltinSections() {
    const state = getState();
    const preset = getActivePreset();

    // Location tracker
    const $locationPane = getPane('_location');
    if ($locationPane?.length) {
        const pathField = preset?.sections?.find(s => s.type === 'key-value');
        const fieldConfig = pathField?.fields?.['Path'] || {};
        renderLocation(state.locationHistory, fieldConfig, $locationPane);
        updateSectionCount('_location', state.locationHistory?.length ? `${state.locationHistory.length} stops` : '');
    }

    // Session timeline
    const $timelinePane = getPane('_timeline');
    if ($timelinePane?.length) {
        renderTimeline(state.history, preset, $timelinePane);
        updateSectionCount('_timeline', state.history?.length ? `${state.history.length} events` : '');
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

    // Find previous data from history for delta indicators
    const state = getState();
    const previousData = getPreviousData(state, sectionId);

    switch (sectionData.type) {
    case 'inventory':
        renderInventory(sectionData.data, sectionConfig, $pane, previousData);
        updateSectionCount(sectionId, sectionData.data?.length ? `${sectionData.data.length} items` : '');
        break;
    case 'key-value':
        renderWorld(sectionData.data, sectionConfig, $pane);
        updateSectionCount(sectionId, sectionData.data ? `${Object.keys(sectionData.data).length} fields` : '');
        break;
    case 'numeric-bars':
        renderFactions(sectionData.data, sectionConfig, $pane, previousData);
        updateSectionCount(sectionId, sectionData.data ? `${Object.keys(sectionData.data).length} factions` : '');
        break;
    default:
        renderWorld(sectionData.data, sectionConfig, $pane);
        updateSectionCount(sectionId, sectionData.data ? `${Object.keys(sectionData.data).length} fields` : '');
        break;
    }

    // Hide empty state, show content
    $('#cs-empty-state').addClass('cs-hidden');
    $('#cs-tab-panels').removeClass('cs-hidden');

    // Pulse animation on section update
    const $sectionEl = $(`[data-section-id="${sectionId}"]`);
    if ($sectionEl.length) {
        $sectionEl.addClass('cs-section-updated');
        $sectionEl.one('animationend', () => $sectionEl.removeClass('cs-section-updated'));
    }
}

/**
 * Get the previous data for a section from history (for delta indicators).
 */
function getPreviousData(state, sectionId) {
    if (!state.history?.length) return null;
    // Find the second-to-last entry for this section
    const entries = state.history.filter(h => h.sectionId === sectionId);
    if (entries.length < 2) return null;
    return entries[entries.length - 2]?.current || null;
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

/**
 * Refresh everything after the preset editor saves a new/edited preset.
 */
function refreshAfterPresetEdit(savedPreset) {
    // Activate the saved preset
    activatePreset(savedPreset.id);

    // Repopulate preset dropdown
    populatePresetDropdown();
    $('#cs-settings-preset').val(savedPreset.id);

    // Re-init tabs and panel
    const preset = getActivePreset();
    if (preset) {
        initTabs(preset);
        $('#cs-active-preset-name').text(preset.name);
        renderRuleCards(preset);

        // Apply theme accent if preset has one
        if (preset.theme?.accentColor) {
            applyAccentColor(preset.theme.accentColor);
            $('#cs-settings-accent').val(preset.theme.accentColor);
        }

        // Apply ambient effect
        applyAmbientEffect(preset);
    }

    // Update injection and re-parse
    updateSystemPrompt();
    reparseChat();
}

/**
 * Apply ambient visual effect from preset theme.
 */
function applyAmbientEffect(preset) {
    const panel = document.getElementById('cs-panel');
    if (!panel) return;
    // Remove any existing ambient classes
    panel.className = panel.className.replace(/\bcs-ambient-\w+/g, '').trim();
    if (preset?.theme?.ambientEffect) {
        panel.classList.add(`cs-ambient-${preset.theme.ambientEffect}`);
    }
}
