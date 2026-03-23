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
        'At the end of every reply, output game state inside a collapsed HTML drawer with a code block. Use this exact format:\n' +
        '<details><summary>⬡</summary>\n\n```\n<campaign_data>\n...YAML content here...\n</campaign_data>\n```\n</details>\n\n' +
        'The YAML inside <campaign_data> tags must follow the schema below.';
    parts.push(baseInstruction);

    // Rule snippets from preset (new system) or fall through to legacy
    const settings = getSettings();
    if (preset.rules?.length) {
        const overrides = settings.ruleOverrides?.[preset.id] || {};
        const enabledRules = preset.rules.filter(rule => {
            const override = overrides[rule.id];
            return override !== undefined ? override : rule.enabled;
        });
        if (enabledRules.length) {
            parts.push(enabledRules.map(r => r.content).join('\n\n'));
        }
    }

    // Schema from sections
    if (injection.includeSchema !== false) {
        const schema = buildSchemaBlock(preset);
        if (schema) parts.push(schema);
    }

    // Example
    parts.push(buildExampleBlock(preset));

    // Custom user rules (per preset)
    const rulesText = settings.presetRules?.[preset.id];
    if (rulesText?.trim()) {
        parts.push(rulesText.trim());
    }

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
    const yamlLines = [];

    for (const section of (preset.sections || [])) {
        switch (section.type) {
        case 'inventory':
            yamlLines.push(`${section.id}:`);
            yamlLines.push('  - Example Item (tag)');
            yamlLines.push('  - Another Item');
            break;
        case 'key-value':
            yamlLines.push(`${section.id}:`);
            if (section.fields) {
                const fields = Object.keys(section.fields);
                for (const field of fields.slice(0, 3)) {
                    yamlLines.push(`  ${field}: example value`);
                }
                if (fields.length > 3) yamlLines.push('  ...');
            } else {
                yamlLines.push('  Key: value');
            }
            break;
        case 'numeric-bars':
            yamlLines.push(`${section.id}:`);
            yamlLines.push('  Faction Name: 0.25');
            break;
        }
    }

    const lines = [
        'Example (append at end of every reply):',
        '<details><summary>⬡</summary>',
        '',
        '```',
        '<campaign_data>',
        ...yamlLines,
        '</campaign_data>',
        '```',
        '</details>',
    ];
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
