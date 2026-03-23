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
        }
    }

    return { valid: errors.length === 0, errors };
}
