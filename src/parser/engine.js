/**
 * Campaign Studio — Parser Engine
 * Extracts <details><summary> blocks from bot response HTML
 * and routes them to the appropriate adapters.
 */

import { MATCH_MODES } from '../core/config.js';
import { parseMarkdownList, parseKeyValue, parseKeyValueNumeric, parseStatBlock } from './adapters.js';
import { routeFieldsToSections } from './field-router.js';
import { autoRouteUnmatchedBlock } from './auto-router.js';

/**
 * Extract all matching <details><summary> blocks from message HTML.
 *
 * @param {string} messageHtml - The raw HTML of the bot's response
 * @param {object} preset - The active preset configuration
 * @param {{ autoExtract?: boolean }} options - Extraction options
 * @returns {{ matched: Map<string, object>, unmatchedBlocks: string[] }}
 */
export function extractBlocks(messageHtml, preset, options = {}) {
    if (!messageHtml || !preset?.sections) {
        return { matched: new Map(), unmatchedBlocks: [] };
    }

    const matched = new Map();
    const unmatchedBlocks = [];

    // Parse HTML into a temporary container
    const temp = document.createElement('div');
    temp.innerHTML = messageHtml;

    const detailsElements = temp.querySelectorAll('details');

    for (const details of detailsElements) {
        const summary = details.querySelector('summary');
        if (!summary) continue;

        let summaryText = summary.textContent.trim();

        // Strip prefix if configured
        if (preset.marker?.prefix) {
            summaryText = summaryText.replace(new RegExp(`^${escapeRegex(preset.marker.prefix)}\\s*`), '');
        }

        // Try to match against preset sections
        let matchedSection = null;
        for (const section of preset.sections) {
            if (matchesSummary(summaryText, section.match, section.matchMode)) {
                matchedSection = section;
                break;
            }
        }

        if (matchedSection) {
            // Extract inner content (everything after <summary>, as text lines)
            const rawContent = extractInnerContent(details, summary);
            const parsed = parseSection(rawContent, matchedSection);

            matched.set(matchedSection.id, {
                sectionConfig: {
                    type: matchedSection.type,
                    label: summaryText,
                    icon: matchedSection.icon,
                },
                data: parsed,
                rawHtml: details.outerHTML,
                summaryText: summary.textContent.trim(),
            });
        } else {
            unmatchedBlocks.push({ element: details, summary, summaryText });
        }
    }

    // Second pass: try extraction sources on unmatched blocks
    const sources = preset.extraction?.sources;
    const processedBySource = new Set();
    if (sources?.length && unmatchedBlocks.length > 0) {
        for (let i = 0; i < unmatchedBlocks.length; i++) {
            const unmatched = unmatchedBlocks[i];
            for (const source of sources) {
                if (!source.summaryMatch || !source.fieldMap) continue;

                if (matchesSummary(unmatched.summaryText, source.summaryMatch, source.matchMode)) {
                    const rawContent = extractInnerContent(unmatched.element, unmatched.summary);
                    const parsed = parseSection(rawContent, { parse: { format: source.format } });
                    const fieldRouted = routeFieldsToSections(
                        parsed, source, preset,
                        unmatched.element.outerHTML,
                        unmatched.summary.textContent.trim(),
                    );

                    mergeIntoMatched(matched, fieldRouted);
                    processedBySource.add(i);
                    break; // First matching source wins for this block
                }
            }
        }
    }

    // Third pass: auto-route remaining unmatched blocks (zero-config)
    if (options.autoExtract !== false) {
        for (let i = 0; i < unmatchedBlocks.length; i++) {
            if (processedBySource.has(i)) continue;

            const unmatched = unmatchedBlocks[i];
            const rawContent = extractInnerContent(unmatched.element, unmatched.summary);

            // Try stat-block format first (handles emoji + pipe-delimited)
            let parsed = parseStatBlock(rawContent, {});
            if (Object.keys(parsed).length === 0) {
                parsed = parseKeyValue(rawContent, {});
            }
            if (Object.keys(parsed).length === 0) continue;

            const autoRouted = autoRouteUnmatchedBlock(
                parsed, preset,
                unmatched.element.outerHTML,
                unmatched.summary.textContent.trim(),
            );

            mergeIntoMatched(matched, autoRouted);
        }
    }

    return { matched, unmatchedBlocks: unmatchedBlocks.map(u => u.element.outerHTML) };
}

/**
 * Merge routed results into the matched map.
 */
function mergeIntoMatched(matched, routed) {
    for (const [sectionId, result] of routed) {
        if (matched.has(sectionId)) {
            const existing = matched.get(sectionId);
            existing.data = mergeData(existing.data, result.data, result.sectionConfig.type);
        } else {
            matched.set(sectionId, result);
        }
    }
}

/**
 * Merge new data into existing section data.
 */
function mergeData(existing, incoming, sectionType) {
    if (sectionType === 'inventory') {
        // Concatenate inventory arrays
        return [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])];
    }
    // For key-value and numeric-bars, spread merge
    if (typeof existing === 'object' && typeof incoming === 'object') {
        return { ...existing, ...incoming };
    }
    return incoming;
}

/**
 * Check if summary text matches a section's match pattern.
 */
export function matchesSummary(summaryText, matchPattern, matchMode) {
    const mode = matchMode || MATCH_MODES.CONTAINS;
    const lower = summaryText.toLowerCase();
    const pattern = matchPattern.toLowerCase();

    switch (mode) {
    case MATCH_MODES.EXACT:
        return lower === pattern;
    case MATCH_MODES.CONTAINS:
        return lower.includes(pattern);
    case MATCH_MODES.ENDS_WITH:
        return lower.endsWith(pattern);
    case MATCH_MODES.REGEX:
        try {
            return new RegExp(matchPattern, 'i').test(summaryText);
        } catch {
            return false;
        }
    default:
        return lower.includes(pattern);
    }
}

/**
 * Extract text content from a <details> element, excluding the <summary>.
 */
function extractInnerContent(details, summary) {
    // Clone to avoid modifying the original
    const clone = details.cloneNode(true);
    const clonedSummary = clone.querySelector('summary');
    if (clonedSummary) clonedSummary.remove();

    // Get text content, preserving line breaks
    const html = clone.innerHTML;
    // Convert <br> to newlines, strip remaining HTML
    const text = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim();

    return text.split('\n').filter(line => line.trim().length > 0);
}

/**
 * Route raw content lines to the appropriate parser adapter.
 */
export function parseSection(rawLines, sectionConfig) {
    const format = sectionConfig.parse?.format || 'key-value';

    switch (format) {
    case 'markdown-list':
        return parseMarkdownList(rawLines, sectionConfig.parse);
    case 'key-value':
        return parseKeyValue(rawLines, sectionConfig.parse);
    case 'key-value-numeric':
        return parseKeyValueNumeric(rawLines, sectionConfig.parse);
    case 'stat-block':
        return parseStatBlock(rawLines, sectionConfig.parse);
    default:
        return parseKeyValue(rawLines, sectionConfig.parse);
    }
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
