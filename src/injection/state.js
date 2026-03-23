/**
 * Campaign Studio — State Injection (Message Level)
 * Injects current game state and pending dice rolls into the
 * conversation context before each AI generation.
 */

import { EXTENSION_NAME } from '../core/config.js';
import { getSettings } from '../core/persistence.js';
import { getAllSections, getState } from '../core/state.js';
import { getActivePreset } from '../presets/manager.js';
import { toYaml } from '../parser/yaml.js';
import { consumePendingRolls } from '../mechanics/dice.js';

const STATE_INJECTION_KEY = `${EXTENSION_NAME}_state`;

let registered = false;

/**
 * Register the state injection hook on SillyTavern's generation events.
 * Call once during initialization.
 */
export function registerStateInjection() {
    if (registered) return;

    try {
        const context = SillyTavern.getContext();
        const eventSource = context.eventSource;
        const eventTypes = context.event_types;

        // Inject state before prompt assembly
        if (eventTypes.GENERATE_BEFORE_COMBINE_PROMPTS) {
            eventSource.on(eventTypes.GENERATE_BEFORE_COMBINE_PROMPTS, handleBeforeGenerate);
            registered = true;
        } else {
            // Fallback: try the generation started event
            console.warn('[Campaign Studio] GENERATE_BEFORE_COMBINE_PROMPTS not available, state injection may not work');
        }
    } catch (e) {
        console.error('[Campaign Studio] Failed to register state injection:', e);
    }
}

/**
 * Unregister the state injection hook.
 */
export function unregisterStateInjection() {
    if (!registered) return;
    try {
        const context = SillyTavern.getContext();
        const eventSource = context.eventSource;
        const eventTypes = context.event_types;
        if (eventTypes.GENERATE_BEFORE_COMBINE_PROMPTS) {
            eventSource.removeListener(eventTypes.GENERATE_BEFORE_COMBINE_PROMPTS, handleBeforeGenerate);
        }
        registered = false;
    } catch (e) {
        console.warn('[Campaign Studio] Failed to unregister state injection:', e);
    }
}

/**
 * Handle pre-generation: build and inject current state.
 */
function handleBeforeGenerate() {
    const settings = getSettings();
    if (!settings.enabled || !settings.injection?.stateContext) {
        clearStateInjection();
        return;
    }

    const preset = getActivePreset();
    if (!preset) {
        clearStateInjection();
        return;
    }

    const stateText = buildStateContext(preset);
    if (!stateText) {
        clearStateInjection();
        return;
    }

    injectState(stateText);
}

/**
 * Build a YAML representation of current game state + dice rolls.
 */
function buildStateContext(preset) {
    const sections = getAllSections();
    const state = getState();
    const pendingRolls = consumePendingRolls();

    // Skip if nothing to inject
    const hasSections = Object.keys(sections).length > 0;
    const hasRolls = pendingRolls.length > 0;
    if (!hasSections && !hasRolls) return null;

    const parts = ['[Campaign Studio — Current Game State]'];

    // Build state snapshot from sections
    if (hasSections) {
        for (const sectionDef of (preset.sections || [])) {
            const section = sections[sectionDef.id];
            if (!section?.data) continue;

            parts.push(`${sectionDef.id}:`);
            const yamlData = toYaml(section.data, 2);
            parts.push(yamlData);
        }
    }

    // Location breadcrumb
    if (state.locationHistory?.length > 0) {
        const current = state.locationHistory[state.locationHistory.length - 1];
        if (current?.path) {
            parts.push(`current_location: ${current.path}`);
        }
    }

    // Pending dice rolls
    if (hasRolls) {
        parts.push('recent_dice_rolls:');
        for (const roll of pendingRolls) {
            const rollObj = {
                notation: roll.notation,
                result: roll.total,
            };
            if (roll.context) rollObj.context = roll.context;
            parts.push(`  - ${formatInlineObj(rollObj)}`);
        }
    }

    return parts.join('\n');
}

/**
 * Format a simple object as inline YAML: {key: val, key: val}
 */
function formatInlineObj(obj) {
    const pairs = Object.entries(obj).map(([k, v]) => {
        if (typeof v === 'string') return `${k}: "${v}"`;
        return `${k}: ${v}`;
    });
    return `{${pairs.join(', ')}}`;
}

/**
 * Inject state context via SillyTavern's prompt API.
 */
function injectState(text) {
    try {
        const context = SillyTavern.getContext();
        if (!context.setExtensionPrompt) return;

        const depth = 1; // 1 message from the end
        // IN_CHAT = 1, position relative
        context.setExtensionPrompt(STATE_INJECTION_KEY, text, 1, depth);
    } catch (e) {
        console.error('[Campaign Studio] Failed to inject state context:', e);
    }
}

function clearStateInjection() {
    try {
        const context = SillyTavern.getContext();
        if (context.setExtensionPrompt) {
            context.setExtensionPrompt(STATE_INJECTION_KEY, '', 1, 0);
        }
    } catch (e) {
        console.warn('[Campaign Studio] Failed to clear state injection:', e);
    }
}
