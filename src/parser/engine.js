/**
 * Campaign Studio — Parser Engine
 * Extracts <details><summary> blocks from bot response HTML
 * and routes them to the appropriate adapters.
 */

import { MATCH_MODES } from '../core/config.js';
import { parseMarkdownList, parseKeyValue, parseKeyValueNumeric, parseStatBlock } from './adapters.js';

/**
 * Extract all matching <details><summary> blocks from message HTML.
 *
 * @param {string} messageHtml - The raw HTML of the bot's response
 * @param {object} preset - The active preset configuration
 * @returns {{ matched: Map<string, object>, unmatchedBlocks: string[] }}
 */
export function extractBlocks(messageHtml, preset) {
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
            unmatchedBlocks.push(details.outerHTML);
        }
    }

    return { matched, unmatchedBlocks };
}

/**
 * Check if summary text matches a section's match pattern.
 */
function matchesSummary(summaryText, matchPattern, matchMode) {
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
function parseSection(rawLines, sectionConfig) {
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
