/**
 * Campaign Studio — Prompt Injection (System Level)
 * Injects YAML schema and format instructions into the system prompt
 * so the AI knows how to output structured campaign data.
 */

import { EXTENSION_NAME } from '../core/config.js';
import { getSettings } from '../core/persistence.js';
import { getActivePreset } from '../presets/manager.js';

const INJECTION_KEY = `${EXTENSION_NAME}_system`;

/**
 * Build and inject the system-level prompt with YAML schema instructions.
 * Should be called on init and whenever the preset changes.
 */
export function updateSystemPrompt() {
    const settings = getSettings();
    if (!settings.enabled || !settings.injection?.systemPrompt) {
        clearSystemPrompt();
        return;
    }

    const preset = getActivePreset();
    if (!preset) {
        clearSystemPrompt();
        return;
    }

    const promptText = buildSystemPrompt(preset);
    if (!promptText) {
        clearSystemPrompt();
        return;
    }

    injectPrompt(promptText);
}

/**
 * Remove the injected system prompt.
 */
export function clearSystemPrompt() {
    try {
        const context = SillyTavern.getContext();
        if (context.setExtensionPrompt) {
            context.setExtensionPrompt(INJECTION_KEY, '', 0, 0);
        }
    } catch (e) {
        console.warn('[Campaign Studio] Failed to clear system prompt:', e);
    }
}

/**
 * Build the full system prompt from preset config.
 */
function buildSystemPrompt(preset) {
    const injection = preset.injection || {};
    const parts = [];

    // Base instruction
    const baseInstruction = injection.systemPrompt ||
        'When updating game state, output changes inside <campaign_data> XML tags using YAML format.';
    parts.push(baseInstruction);

    // Schema from sections
    if (injection.includeSchema !== false) {
        const schema = buildSchemaBlock(preset);
        if (schema) parts.push(schema);
    }

    // Example
    parts.push(buildExampleBlock(preset));

    return parts.join('\n\n');
}

/**
 * Build a YAML schema description from preset sections.
 */
function buildSchemaBlock(preset) {
    if (!preset.sections?.length) return '';

    const lines = ['The campaign_data YAML should use these sections:'];

    for (const section of preset.sections) {
        const sectionLine = `- "${section.id}": ${describeSection(section)}`;
        lines.push(sectionLine);
    }

    return lines.join('\n');
}

function describeSection(section) {
    switch (section.type) {
    case 'inventory':
        return 'A list of items. Each item is a string, optionally with tags in parentheses. Example: "Iron Key (quest, unique)"';
    case 'key-value':
        if (section.fields) {
            const fieldNames = Object.keys(section.fields).join(', ');
            return `Key-value pairs. Expected fields: ${fieldNames}`;
        }
        return 'Key-value pairs with string values.';
    case 'numeric-bars': {
        const range = section.parse?.range || [-1, 1];
        return `Key-value pairs with numeric values in range [${range[0]}, ${range[1]}].`;
    }
    default:
        return 'Structured data.';
    }
}

/**
 * Build an example output block for the AI.
 */
function buildExampleBlock(preset) {
    const lines = ['Example output format:', '<campaign_data>'];

    for (const section of (preset.sections || [])) {
        switch (section.type) {
        case 'inventory':
            lines.push(`${section.id}:`);
            lines.push('  - Example Item (tag)');
            lines.push('  - Another Item');
            break;
        case 'key-value':
            lines.push(`${section.id}:`);
            if (section.fields) {
                const fields = Object.keys(section.fields);
                for (const field of fields.slice(0, 3)) {
                    lines.push(`  ${field}: example value`);
                }
                if (fields.length > 3) lines.push('  ...');
            } else {
                lines.push('  Key: value');
            }
            break;
        case 'numeric-bars':
            lines.push(`${section.id}:`);
            lines.push('  Faction Name: 0.25');
            break;
        }
    }

    lines.push('</campaign_data>');
    return lines.join('\n');
}

/**
 * Inject the prompt text via SillyTavern's extension prompt API.
 */
function injectPrompt(text) {
    try {
        const context = SillyTavern.getContext();
        if (!context.setExtensionPrompt) {
            console.warn('[Campaign Studio] setExtensionPrompt not available');
            return;
        }

        // extension_prompt_types.IN_PROMPT = 0, depth 0 = end of system prompt
        // role: 0 = system
        context.setExtensionPrompt(INJECTION_KEY, text, 0, 0);
    } catch (e) {
        console.error('[Campaign Studio] Failed to inject system prompt:', e);
    }
}
