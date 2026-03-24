/**
 * Campaign Studio — Auto Router
 * Zero-config intelligent field routing for unmatched <details> blocks.
 *
 * Parses structured data from ANY bot tracker block and automatically
 * routes fields to preset sections using field name matching with
 * a built-in alias dictionary.
 */

/**
 * Common RPG field abbreviations → normalized canonical names.
 * Keys and values are already normalized (lowercase, no spaces/hyphens).
 */
const ALIAS_TO_CANONICAL = {
    // Health / HP
    'hp': 'hitpoints',
    'health': 'hitpoints',
    'hitpoint': 'hitpoints',

    // D&D ability scores
    'str': 'strength',
    'dex': 'dexterity',
    'con': 'constitution',
    'int': 'intelligence',
    'wis': 'wisdom',
    'cha': 'charisma',

    // Inventory-like fields
    'notableitems': 'items',
    'equipment': 'items',
    'gear': 'items',
    'loot': 'items',
    'possessions': 'items',
    'belongings': 'items',

    // Location
    'loc': 'location',
    'place': 'location',
    'area': 'location',

    // Status / conditions
    'condition': 'conditions',
    'effect': 'activeeffects',
    'effects': 'activeeffects',
    'buffs': 'activeeffects',
    'debuffs': 'activeeffects',

    // Combat stats
    'ac': 'armorclass',
    'armourclass': 'armorclass',
    'atk': 'attack',
    'def': 'defense',
    'defence': 'defense',
    'spd': 'speed',
    'mp': 'manapoints',
    'mana': 'manapoints',
    'sp': 'spellpoints',
    'lvl': 'level',
    'lv': 'level',
    'exp': 'xp',
    'experience': 'xp',
};

/**
 * Field name patterns that indicate inventory-type data.
 * If a parsed field name matches any of these and there's an inventory section,
 * route the value there.
 */
const INVENTORY_FIELD_PATTERNS = [
    'item', 'inventory', 'equipment', 'gear', 'loot',
    'weapon', 'armor', 'armour', 'possession', 'belonging',
];

/**
 * Normalize a string for matching: lowercase, strip spaces/hyphens/underscores.
 */
function normalize(str) {
    return str.toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Build a field index from a preset's sections.
 * Maps normalized field names (and their aliases) to section info.
 *
 * @param {object} preset
 * @returns {{ fieldIndex: Map<string, object>, sectionsByType: object }}
 */
export function buildFieldIndex(preset) {
    const fieldIndex = new Map();
    const sectionsByType = { inventory: null, 'key-value': null, 'numeric-bars': null };

    for (const section of preset.sections) {
        // Track first section of each type for fallback routing
        if (!sectionsByType[section.type]) {
            sectionsByType[section.type] = section;
        }

        // Index explicitly configured field names
        if (section.fields) {
            for (const fieldName of Object.keys(section.fields)) {
                const normalizedField = normalize(fieldName);
                const entry = {
                    sectionId: section.id,
                    section,
                    canonicalFieldName: fieldName,
                };

                // Direct normalized name
                fieldIndex.set(normalizedField, entry);

                // Check if any alias maps TO this canonical name
                const canonical = ALIAS_TO_CANONICAL[normalizedField] || normalizedField;
                if (canonical !== normalizedField) {
                    fieldIndex.set(canonical, entry);
                }
            }
        }

        // Also index by section match pattern and ID for top-level key routing
        const normalizedId = normalize(section.id);
        const normalizedMatch = normalize(section.match || '');
        if (!fieldIndex.has(normalizedId)) {
            fieldIndex.set(normalizedId, {
                sectionId: section.id,
                section,
                canonicalFieldName: null, // entire section, not a specific field
            });
        }
        if (normalizedMatch && !fieldIndex.has(normalizedMatch)) {
            fieldIndex.set(normalizedMatch, {
                sectionId: section.id,
                section,
                canonicalFieldName: null,
            });
        }
    }

    // Add reverse alias entries: alias → look up what canonical maps to
    for (const [alias, canonical] of Object.entries(ALIAS_TO_CANONICAL)) {
        if (!fieldIndex.has(alias) && fieldIndex.has(canonical)) {
            fieldIndex.set(alias, fieldIndex.get(canonical));
        }
    }

    return { fieldIndex, sectionsByType };
}

/**
 * Auto-route parsed fields from an unmatched <details> block to preset sections.
 *
 * @param {object} parsedData - Flat key-value from parseStatBlock/parseKeyValue
 * @param {object} preset - Active preset
 * @param {string} rawHtml - Source block HTML
 * @param {string} summaryText - Summary text for collapse tracking
 * @returns {Map<string, { sectionConfig, data, rawHtml, summaryText }>}
 */
export function autoRouteUnmatchedBlock(parsedData, preset, rawHtml, summaryText) {
    const result = new Map();

    if (!parsedData || typeof parsedData !== 'object' || !preset?.sections) {
        return result;
    }

    const { fieldIndex, sectionsByType } = buildFieldIndex(preset);

    // Accumulate fields per target section
    const buckets = new Map(); // sectionId → { section, fields: {} }

    for (const [fieldName, fieldValue] of Object.entries(parsedData)) {
        const normalizedField = normalize(fieldName);
        const canonical = ALIAS_TO_CANONICAL[normalizedField] || normalizedField;

        // Try direct match, then canonical alias match
        let entry = fieldIndex.get(normalizedField) || fieldIndex.get(canonical);

        if (entry) {
            const targetField = entry.canonicalFieldName || fieldName;
            addToBucket(buckets, entry.section, targetField, fieldValue);
            continue;
        }

        // Heuristic: inventory-like field names
        const lowerField = fieldName.toLowerCase();
        if (INVENTORY_FIELD_PATTERNS.some(p => lowerField.includes(p)) && sectionsByType.inventory) {
            addToBucket(buckets, sectionsByType.inventory, fieldName, fieldValue);
            continue;
        }

        // Fallback: route to the first key-value section
        if (sectionsByType['key-value']) {
            addToBucket(buckets, sectionsByType['key-value'], fieldName, fieldValue);
        }
    }

    // Coerce each bucket and build result map
    for (const [sectionId, { section, fields }] of buckets) {
        const data = coerceFieldData(fields, section);

        // Skip if coercion produced empty data
        if (data === null || data === undefined) continue;
        if (Array.isArray(data) && data.length === 0) continue;
        if (typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0) continue;

        result.set(sectionId, {
            sectionConfig: {
                type: section.type,
                label: section.match || section.id,
                icon: section.icon,
            },
            data,
            rawHtml,
            summaryText,
        });
    }

    return result;
}

function addToBucket(buckets, section, fieldName, fieldValue) {
    if (!buckets.has(section.id)) {
        buckets.set(section.id, { section, fields: {} });
    }
    buckets.get(section.id).fields[fieldName] = fieldValue;
}

/**
 * Coerce accumulated field data based on section type.
 */
function coerceFieldData(fields, section) {
    switch (section.type) {
    case 'inventory':
        return coerceToInventory(fields, section);
    case 'numeric-bars':
        return coerceToNumericBars(fields);
    case 'key-value':
    default:
        return coerceToKeyValue(fields);
    }
}

/**
 * Coerce fields into inventory array format.
 * Splits comma-separated values into individual items with tag extraction.
 */
function coerceToInventory(fields, section) {
    let tagPattern = /\(([^)]+)\)/g;
    if (section.parse?.tagPattern) {
        try {
            tagPattern = new RegExp(section.parse.tagPattern, 'g');
        } catch { /* use default */ }
    }

    const items = [];

    for (const [, value] of Object.entries(fields)) {
        if (!value || value === '-' || value.toLowerCase() === 'none') continue;

        // Split comma-separated lists
        const parts = String(value).split(/,\s*/);
        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'none') continue;

            // Extract tags from parenthetical expressions
            const tags = [];
            let tagMatch;
            const regex = new RegExp(tagPattern.source, tagPattern.flags);
            while ((tagMatch = regex.exec(trimmed)) !== null) {
                tags.push(tagMatch[1].trim());
            }
            const name = trimmed.replace(tagPattern, '').trim();

            if (name) {
                items.push({ name, tags, quantity: 1, note: null });
            }
        }
    }

    return items;
}

/**
 * Coerce fields into key-value object format.
 */
function coerceToKeyValue(fields) {
    const result = {};
    for (const [key, value] of Object.entries(fields)) {
        result[key] = String(value ?? '');
    }
    return result;
}

/**
 * Coerce fields into numeric-bars object format.
 */
function coerceToNumericBars(fields) {
    const result = {};
    for (const [key, value] of Object.entries(fields)) {
        const num = parseFloat(value);
        if (!isNaN(num)) {
            result[key] = num;
        }
    }
    return result;
}
