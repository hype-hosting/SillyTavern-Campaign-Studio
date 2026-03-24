/**
 * Campaign Studio — Preset Schema Validation
 */

import { SECTION_TYPES, PARSE_FORMATS, MATCH_MODES } from '../core/config.js';

const VALID_TYPES = Object.values(SECTION_TYPES);
const VALID_FORMATS = Object.values(PARSE_FORMATS);
const VALID_MATCH_MODES = Object.values(MATCH_MODES);

/**
 * Validate a preset configuration object.
 * @param {object} preset
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePreset(preset) {
    const errors = [];

    if (!preset) {
        return { valid: false, errors: ['Preset is null or undefined'] };
    }

    // Required top-level fields
    if (!preset.id || typeof preset.id !== 'string') {
        errors.push('Missing or invalid "id" (must be a non-empty string)');
    }
    if (!preset.name || typeof preset.name !== 'string') {
        errors.push('Missing or invalid "name" (must be a non-empty string)');
    }

    // Marker
    if (!preset.marker || !preset.marker.type) {
        errors.push('Missing "marker.type" (e.g., "details-summary")');
    }

    // Sections
    if (!Array.isArray(preset.sections) || preset.sections.length === 0) {
        errors.push('Missing or empty "sections" array');
    } else {
        const sectionIds = new Set();
        for (let i = 0; i < preset.sections.length; i++) {
            const section = preset.sections[i];
            const prefix = `sections[${i}]`;

            if (!section.id) {
                errors.push(`${prefix}: missing "id"`);
            } else if (sectionIds.has(section.id)) {
                errors.push(`${prefix}: duplicate id "${section.id}"`);
            } else {
                sectionIds.add(section.id);
            }

            if (!section.match) {
                errors.push(`${prefix}: missing "match" pattern`);
            }

            if (section.matchMode && !VALID_MATCH_MODES.includes(section.matchMode)) {
                errors.push(`${prefix}: invalid matchMode "${section.matchMode}"`);
            }

            if (section.type && !VALID_TYPES.includes(section.type)) {
                errors.push(`${prefix}: invalid type "${section.type}"`);
            }

            if (section.parse?.format && !VALID_FORMATS.includes(section.parse.format)) {
                errors.push(`${prefix}: invalid parse format "${section.parse.format}"`);
            }

            // Validate regex patterns won't crash
            if (section.parse?.tagPattern) {
                try {
                    new RegExp(section.parse.tagPattern);
                } catch (e) {
                    errors.push(`${prefix}: invalid tagPattern regex: ${e.message}`);
                }
            }

            if (section.matchMode === 'regex') {
                try {
                    new RegExp(section.match);
                } catch (e) {
                    errors.push(`${prefix}: invalid match regex: ${e.message}`);
                }
            }

            // Optional tab assignment
            if (section.tab !== undefined && typeof section.tab !== 'string') {
                errors.push(`${prefix}: "tab" must be a string if provided`);
            }
        }
    }

    // Optional top-level tabs array
    if (preset.tabs !== undefined) {
        if (!Array.isArray(preset.tabs)) {
            errors.push('"tabs" must be an array if provided');
        } else {
            for (let i = 0; i < preset.tabs.length; i++) {
                const tab = preset.tabs[i];
                if (!tab.id || !tab.label) {
                    errors.push(`tabs[${i}]: must have "id" and "label"`);
                }
            }
        }
    }

    // Optional extraction config
    if (preset.extraction) {
        if (preset.extraction.sources !== undefined) {
            if (!Array.isArray(preset.extraction.sources)) {
                errors.push('"extraction.sources" must be an array');
            } else {
                for (let i = 0; i < preset.extraction.sources.length; i++) {
                    const source = preset.extraction.sources[i];
                    const prefix = `extraction.sources[${i}]`;

                    if (!source.summaryMatch || typeof source.summaryMatch !== 'string') {
                        errors.push(`${prefix}: missing or invalid "summaryMatch"`);
                    }

                    if (source.format && !VALID_FORMATS.includes(source.format)) {
                        errors.push(`${prefix}: invalid format "${source.format}"`);
                    }

                    if (source.matchMode && !VALID_MATCH_MODES.includes(source.matchMode)) {
                        errors.push(`${prefix}: invalid matchMode "${source.matchMode}"`);
                    }

                    if (source.summaryMatch && source.matchMode === 'regex') {
                        try {
                            new RegExp(source.summaryMatch);
                        } catch (e) {
                            errors.push(`${prefix}: invalid summaryMatch regex: ${e.message}`);
                        }
                    }

                    if (source.fieldMap !== undefined && (typeof source.fieldMap !== 'object' || Array.isArray(source.fieldMap))) {
                        errors.push(`${prefix}: "fieldMap" must be an object`);
                    } else if (source.fieldMap) {
                        for (const [fieldKey, mapping] of Object.entries(source.fieldMap)) {
                            if (!mapping.section || typeof mapping.section !== 'string') {
                                errors.push(`${prefix}.fieldMap["${fieldKey}"]: missing or invalid "section"`);
                            }
                        }
                    }
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
}
