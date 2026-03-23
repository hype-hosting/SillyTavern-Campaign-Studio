/**
 * Campaign Studio — XML Drawer Extractor
 * Extracts <campaign_data> blocks from raw message text,
 * with fallback to <details><summary> parsing.
 */

import { parseYaml } from './yaml.js';

/**
 * @typedef {object} ExtractedBlock
 * @property {string} type - Section type hint from attribute, or null
 * @property {object} data - Parsed YAML data
 * @property {string} raw - The raw matched text (full tag)
 */

// Match <campaign_data> or <campaign_data type="something">
// Works whether the tags are bare, inside code fences, or inside <details> wrappers
const CAMPAIGN_DATA_REGEX = /<campaign_data(?:\s+type\s*=\s*"([^"]*)")?\s*>([\s\S]*?)<\/campaign_data>/gi;

/**
 * Extract all <campaign_data> blocks from a message.
 * @param {string} messageText - Raw message text (message.mes)
 * @returns {{ blocks: ExtractedBlock[], hasCampaignData: boolean }}
 */
export function extractCampaignData(messageText) {
    if (!messageText) return { blocks: [], hasCampaignData: false };

    const blocks = [];
    let match;

    // Reset lastIndex since we reuse the regex
    CAMPAIGN_DATA_REGEX.lastIndex = 0;

    while ((match = CAMPAIGN_DATA_REGEX.exec(messageText)) !== null) {
        const typeAttr = match[1] || null;
        const yamlContent = decodeHtmlEntities(match[2].trim());

        let data;
        try {
            data = parseYaml(yamlContent);
        } catch (e) {
            console.warn('[Campaign Studio] Failed to parse YAML in campaign_data block:', e);
            continue;
        }

        blocks.push({
            type: typeAttr,
            data,
            raw: match[0],
        });
    }

    return { blocks, hasCampaignData: blocks.length > 0 };
}

/**
 * Decode common HTML entities that may appear in rendered message text.
 * @param {string} str
 * @returns {string}
 */
function decodeHtmlEntities(str) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
}
