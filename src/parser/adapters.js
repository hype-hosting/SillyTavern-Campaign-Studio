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
