/**
 * Campaign Studio — Parser Adapters
 * Convert raw text lines into structured data for each section type.
 */

/**
 * Parse a markdown-style list into inventory items.
 * Input lines like:
 *   "> - Ladonian Gloves (worn)"
 *   "> - Coin: 12 shillings, 6 pence"
 *
 * @param {string[]} lines
 * @param {object} parseConfig - { tagPattern, currencyKeys }
 * @returns {object[]} Array of { name, tags, quantity, note }
 */
export function parseMarkdownList(lines, parseConfig = {}) {
    const tagPattern = parseConfig.tagPattern
        ? new RegExp(parseConfig.tagPattern, 'g')
        : /\(([^)]+)\)/g;

    const items = [];

    for (const rawLine of lines) {
        // Strip blockquote and list prefixes: "> - ", "- ", "> "
        let line = rawLine.trim();
        line = line.replace(/^>\s*/, '');
        line = line.replace(/^[-*]\s*/, '');
        line = line.trim();

        if (!line) continue;

        // Extract tags from parenthetical expressions
        const tags = [];
        let tagMatch;
        const tagRegex = new RegExp(tagPattern.source, tagPattern.flags);
        while ((tagMatch = tagRegex.exec(line)) !== null) {
            tags.push(tagMatch[1].trim());
        }

        // Remove tag expressions from the name
        let name = line.replace(tagPattern, '').trim();

        // Handle "Key: value" currency pattern
        let note = null;
        const colonIdx = name.indexOf(':');
        if (colonIdx > 0) {
            const potentialKey = name.substring(0, colonIdx).trim();
            const potentialValue = name.substring(colonIdx + 1).trim();
            if (potentialValue) {
                name = potentialKey;
                note = potentialValue;
            }
        }

        // Clean trailing/leading punctuation
        name = name.replace(/[,;]\s*$/, '').trim();

        if (name) {
            items.push({
                name,
                tags,
                quantity: 1,
                note,
            });
        }
    }

    return items;
}

/**
 * Parse key-value pairs from lines.
 * Input lines like:
 *   "> - Weather: A sullen thaw, air heavy and damp"
 *   "> - Intent: Navigate Adelaide's invitation"
 *
 * @param {string[]} lines
 * @param {object} parseConfig - { separator, stripQuotePrefix }
 * @returns {object} Map of key → string value
 */
export function parseKeyValue(lines, parseConfig = {}) {
    const separator = parseConfig.separator || ':';
    const result = {};

    for (const rawLine of lines) {
        let line = rawLine.trim();
        // Strip blockquote and list prefixes
        line = line.replace(/^>\s*/, '');
        line = line.replace(/^[-*]\s*/, '');
        line = line.trim();

        if (!line) continue;

        const sepIdx = line.indexOf(separator);
        if (sepIdx > 0) {
            const key = line.substring(0, sepIdx).trim();
            const value = line.substring(sepIdx + separator.length).trim();
            result[key] = value;
        }
    }

    return result;
}

/**
 * Parse key-value pairs where values are numeric (floats).
 * Input lines like:
 *   "> - Shroud: -0.18"
 *   "> - Physik: +0.20"
 *
 * @param {string[]} lines
 * @param {object} parseConfig - { separator, range }
 * @returns {object} Map of key → number
 */
/**
 * Parse an emoji-labeled stat block into key-value pairs.
 * Handles formats commonly output by RPG bots:
 *   "❤️ HP: 25/30"
 *   "⚔️ STR 14 | 🏃 DEX 16 | 🛡️ CON 14"
 *   "📋 Conditions: Restrained (Enchanted Rope)"
 *
 * Splits pipe-delimited lines, strips emoji prefixes, and parses
 * each segment as Key: Value or Key Value.
 *
 * @param {string[]} lines
 * @param {object} parseConfig - { pipeSeparator }
 * @returns {object} Map of key → string value
 */
export function parseStatBlock(lines, parseConfig = {}) {
    const pipeSep = parseConfig.pipeSeparator || '|';
    const result = {};

    for (const rawLine of lines) {
        let line = rawLine.trim();
        // Strip blockquote and list prefixes
        line = line.replace(/^>\s*/, '');
        line = line.replace(/^[-*]\s*/, '');
        line = line.trim();

        if (!line) continue;

        // Split on pipe separator (normalize nbsp U+00A0 around pipes)
        const segments = line.split(new RegExp(`[\\s\\u00A0]*${escapeRegex(pipeSep)}[\\s\\u00A0]*`));

        for (let segment of segments) {
            segment = segment.trim();
            if (!segment) continue;

            // Strip leading emoji / non-letter-digit characters
            segment = segment.replace(/^[^\p{L}\p{N}]+/u, '').trim();
            if (!segment) continue;

            // Try Key: Value (colon separator)
            const colonIdx = segment.indexOf(':');
            if (colonIdx > 0) {
                const key = segment.substring(0, colonIdx).trim();
                const value = segment.substring(colonIdx + 1).trim();
                if (key) {
                    result[key] = value;
                }
                continue;
            }

            // Try Key Value where Value is the trailing number/token (e.g., "STR 14")
            const spaceMatch = segment.match(/^(.+?)\s+([\d+\-][\d.+\-/]*)$/);
            if (spaceMatch) {
                result[spaceMatch[1].trim()] = spaceMatch[2].trim();
                continue;
            }

            // Fallback: treat entire segment as a standalone label
            result[segment] = '';
        }
    }

    return result;
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseKeyValueNumeric(lines, parseConfig = {}) {
    const separator = parseConfig.separator || ':';
    const result = {};

    for (const rawLine of lines) {
        let line = rawLine.trim();
        line = line.replace(/^>\s*/, '');
        line = line.replace(/^[-*]\s*/, '');
        line = line.trim();

        if (!line) continue;

        const sepIdx = line.indexOf(separator);
        if (sepIdx > 0) {
            const key = line.substring(0, sepIdx).trim();
            const rawValue = line.substring(sepIdx + separator.length).trim();
            const numValue = parseFloat(rawValue);

            if (!isNaN(numValue)) {
                result[key] = numValue;
            }
        }
    }

    return result;
}
