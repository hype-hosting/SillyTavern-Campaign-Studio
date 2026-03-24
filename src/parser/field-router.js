/**
 * Campaign Studio — Field-Level Router
 * Routes individual fields from a parsed block to multiple preset sections.
 *
 * This enables extraction from bots that put ALL game state in a single
 * tracker block (e.g., a "Fate's Ledger" <details> with HP, stats, items,
 * and conditions all in one place).
 */

/**
 * Normalize a field name for matching (case-insensitive, strip spaces/underscores/hyphens).
 */
function normalize(str) {
    return str.toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Find a fieldMap entry for the given parsed field name.
 * Tries exact key first, then normalized match.
 *
 * @param {string} fieldName - The parsed field name (e.g., "HP", "Notable Items")
 * @param {object} fieldMap - The source's fieldMap config
 * @returns {{ mapping: object, mapKey: string } | null}
 */
function findFieldMapping(fieldName, fieldMap) {
    // Exact key match
    if (fieldMap[fieldName]) {
        return { mapping: fieldMap[fieldName], mapKey: fieldName };
    }

    // Normalized match
    const normalizedField = normalize(fieldName);
    for (const [mapKey, mapping] of Object.entries(fieldMap)) {
        if (normalize(mapKey) === normalizedField) {
            return { mapping, mapKey };
        }
    }

    return null;
}

/**
 * Route parsed fields from a single block to multiple preset sections.
 *
 * @param {object} parsedData - Flat key-value object from an adapter (e.g., parseStatBlock)
 * @param {object} source - The extraction source config with fieldMap
 * @param {object} preset - The active preset (for looking up section configs)
 * @param {string} rawHtml - The raw HTML of the source block
 * @param {string} summaryText - The summary text of the source block
 * @returns {Map<string, { sectionConfig: object, data: *, rawHtml: string, summaryText: string }>}
 */
export function routeFieldsToSections(parsedData, source, preset, rawHtml, summaryText) {
    const result = new Map();

    if (!parsedData || typeof parsedData !== 'object' || !source.fieldMap || !preset?.sections) {
        return result;
    }

    // Build a section lookup by ID for quick access
    const sectionById = new Map();
    for (const section of preset.sections) {
        sectionById.set(section.id, section);
    }

    // Accumulate fields per target section
    const buckets = new Map(); // sectionId → { fields: {}, section: sectionConfig }

    for (const [fieldName, fieldValue] of Object.entries(parsedData)) {
        const match = findFieldMapping(fieldName, source.fieldMap);
        if (!match) continue;

        const { mapping } = match;
        const targetSectionId = mapping.section;
        const targetField = mapping.field || fieldName;
        const section = sectionById.get(targetSectionId);

        if (!section) {
            console.warn(`[Campaign Studio] Field router: section "${targetSectionId}" not found in preset`);
            continue;
        }

        if (!buckets.has(targetSectionId)) {
            buckets.set(targetSectionId, { section, fields: {} });
        }

        buckets.get(targetSectionId).fields[targetField] = fieldValue;
    }

    // Coerce each bucket's accumulated fields into the section's expected format
    for (const [sectionId, { section, fields }] of buckets) {
        const data = coerceFieldData(fields, section);

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

/**
 * Coerce accumulated field data into the format expected by section renderers.
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
 * Each field becomes an item, or comma-separated values become multiple items.
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

        // Split comma-separated lists: "Sword, Shield, Potion"
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
