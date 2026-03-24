/**
 * Campaign Studio — Section Router
 * Routes parsed YAML data from <campaign_data> blocks
 * to the correct state sections based on preset config.
 */

/**
 * Route extracted campaign_data blocks to preset sections.
 *
 * Strategy:
 *   1. If block has type="sectionId", route directly
 *   2. If YAML has top-level keys matching section IDs, route each
 *   3. If YAML has top-level keys matching section match patterns, route by match
 *
 * @param {import('./extractor.js').ExtractedBlock[]} blocks - Extracted blocks
 * @param {object} preset - Active preset config
 * @returns {Map<string, { sectionConfig: object, data: * }>}
 */
export function routeBlocks(blocks, preset) {
    const matched = new Map();
    if (!blocks?.length || !preset?.sections) return matched;

    for (const block of blocks) {
        // Strategy 1: explicit type attribute
        if (block.type) {
            const section = preset.sections.find(s => s.id === block.type);
            if (section) {
                matched.set(section.id, {
                    sectionConfig: {
                        type: section.type,
                        label: section.match || section.id,
                        icon: section.icon,
                    },
                    data: coerceData(block.data, section),
                });
                continue;
            }
        }

        // Strategy 2 & 3: match top-level YAML keys to sections
        if (block.data && typeof block.data === 'object' && !Array.isArray(block.data)) {
            routeByKeys(block.data, preset, matched);
        }
    }

    return matched;
}

/**
 * Route a YAML object's top-level keys to sections.
 */
function routeByKeys(data, preset, matched) {
    for (const section of preset.sections) {
        // Try matching by section ID (e.g., "items", "world", "orders")
        const byId = findKeyMatch(data, section.id);
        // Try matching by section match pattern (e.g., "Items", "World", "Order Standing")
        const byMatch = findKeyMatch(data, section.match);

        const key = byId || byMatch;
        if (key && data[key] !== undefined) {
            matched.set(section.id, {
                sectionConfig: {
                    type: section.type,
                    label: section.match || section.id,
                    icon: section.icon,
                },
                data: coerceData(data[key], section),
            });
        }
    }
}

/**
 * Find a matching key in data (case-insensitive, underscore/space normalized).
 */
function findKeyMatch(data, pattern) {
    if (!pattern) return null;
    const normalized = normalize(pattern);
    for (const key of Object.keys(data)) {
        if (normalize(key) === normalized) return key;
    }
    return null;
}

function normalize(str) {
    return str.toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Coerce YAML data into the format expected by the existing renderers.
 * - inventory sections expect: array of { name, tags, quantity, note }
 * - key-value sections expect: { Key: "value" } object
 * - numeric-bars sections expect: { Key: number } object
 */
function coerceData(data, section) {
    switch (section.type) {
    case 'inventory':
        return coerceInventory(data, section);
    case 'key-value':
        return coerceKeyValue(data);
    case 'numeric-bars':
        return coerceNumericBars(data);
    default:
        return data;
    }
}

/**
 * Coerce YAML into inventory array format.
 * Accepts:
 *   - Array of strings: ["Sword", "Shield"]
 *   - Array of objects: [{name: "Sword", tags: ["equipped"]}]
 *   - Object with item names as keys
 */
function coerceInventory(data, section) {
    let tagPattern = /\(([^)]+)\)/g;
    if (section.parse?.tagPattern) {
        try {
            tagPattern = new RegExp(section.parse.tagPattern, 'g');
        } catch (e) {
            console.warn(`[Campaign Studio] Invalid tagPattern "${section.parse.tagPattern}":`, e.message);
        }
    }

    if (Array.isArray(data)) {
        return data.map(item => {
            if (typeof item === 'string') {
                return parseItemString(item, tagPattern);
            }
            if (typeof item === 'object' && item !== null) {
                return {
                    name: item.name || Object.keys(item)[0] || 'Unknown',
                    tags: item.tags || [],
                    quantity: item.quantity || item.qty || 1,
                    note: item.note || item.description || null,
                };
            }
            return { name: String(item), tags: [], quantity: 1, note: null };
        });
    }

    // Object form: { "Sword": "equipped", "Shield": null }
    if (typeof data === 'object' && data !== null) {
        return Object.entries(data).map(([name, value]) => ({
            name,
            tags: typeof value === 'string' ? [value] : (Array.isArray(value) ? value : []),
            quantity: 1,
            note: null,
        }));
    }

    return [];
}

function parseItemString(str, tagPattern) {
    const tags = [];
    let tagMatch;
    const regex = new RegExp(tagPattern.source, tagPattern.flags);
    while ((tagMatch = regex.exec(str)) !== null) {
        tags.push(tagMatch[1].trim());
    }
    const name = str.replace(tagPattern, '').trim();
    return { name, tags, quantity: 1, note: null };
}

/**
 * Coerce YAML into key-value object. Already an object in most cases.
 */
function coerceKeyValue(data) {
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        // Stringify any non-scalar values
        const result = {};
        for (const [key, value] of Object.entries(data)) {
            result[key] = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
        }
        return result;
    }
    return {};
}

/**
 * Coerce YAML into numeric bars object.
 */
function coerceNumericBars(data) {
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        const result = {};
        for (const [key, value] of Object.entries(data)) {
            const num = parseFloat(value);
            if (!isNaN(num)) result[key] = num;
        }
        return result;
    }
    return {};
}
