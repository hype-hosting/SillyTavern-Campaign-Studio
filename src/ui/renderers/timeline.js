/**
 * Campaign Studio — Session Timeline Renderer
 * Scrollable event log showing state changes over time.
 */

import { sanitizeText } from '../../utils/sanitize.js';
import { diffData } from '../../utils/diff.js';
import { LIMITS } from '../../core/config.js';

/**
 * Render the session timeline into a container.
 * @param {object[]} history - Array of { messageId, sectionId, timestamp, previous, current }
 * @param {object} preset - Active preset (for section icons/labels)
 * @param {jQuery} $container - Target container
 */
export function renderTimeline(history, preset, $container) {
    $container.empty();

    if (!history || history.length === 0) {
        $container.html('<div class="cs-empty-section">No events yet</div>');
        return;
    }

    const $header = $('<div class="cs-timeline-header"></div>');
    $header.append(`<span class="cs-timeline-count">${history.length} events</span>`);
    const $clearBtn = $('<button class="cs-btn cs-btn-sm cs-timeline-clear" title="Clear history">Clear</button>');
    $clearBtn.on('click', () => {
        $container.empty();
        $container.html('<div class="cs-empty-section">Timeline cleared</div>');
    });
    $header.append($clearBtn);
    $container.append($header);

    const $list = $('<div class="cs-timeline-list"></div>');

    const entries = history.slice(-LIMITS.TIMELINE_DISPLAY_MAX).reverse();

    for (const entry of entries) {
        const sectionDef = preset?.sections?.find(s => s.id === entry.sectionId);
        const icon = getSectionIcon(sectionDef);
        const label = sectionDef?.match || entry.sectionId;
        const changes = describeChanges(entry, sectionDef);

        if (!changes.length) continue;

        // Determine dominant change type for dot coloring
        const dominantType = changes[0]?.type || 'modified';
        const entryClass = dominantType === 'added' ? 'cs-timeline-added' :
            dominantType === 'removed' ? 'cs-timeline-removed' : '';

        const $entry = $(`
            <div class="cs-timeline-entry ${entryClass}">
                <div class="cs-timeline-entry-header">
                    <span class="cs-timeline-icon">${icon}</span>
                    <span class="cs-timeline-label">${sanitizeText(label)}</span>
                    <span class="cs-timeline-time">${formatRelativeTime(entry.timestamp)}</span>
                </div>
                <div class="cs-timeline-changes"></div>
            </div>
        `);

        const $changes = $entry.find('.cs-timeline-changes');
        for (const change of changes) {
            const cls = change.type === 'added' ? 'cs-delta-positive' :
                change.type === 'removed' ? 'cs-delta-negative' : 'cs-timeline-modified';
            const $change = $('<div>').addClass(`cs-timeline-change ${cls}`).text(change.text);
            $changes.append($change);
        }

        $list.append($entry);
    }

    $container.append($list);
}

const SECTION_ICONS = {
    backpack: '🎒',
    globe: '🌍',
    shield: '🛡',
    scroll: '📜',
    clock: '⏱',
    map: '🗺',
    default: '◆',
};

function getSectionIcon(sectionDef) {
    if (!sectionDef?.icon) return SECTION_ICONS.default;
    return SECTION_ICONS[sectionDef.icon] || SECTION_ICONS.default;
}

/**
 * Generate human-readable change descriptions.
 */
function describeChanges(entry, sectionDef) {
    const { previous, current } = entry;
    const changes = [];

    if (!previous && current) {
        changes.push({ type: 'added', text: 'Initialized' });
        return changes;
    }

    const diff = diffData(previous, current);
    if (!diff.changed) return changes;

    const type = sectionDef?.type || 'key-value';

    switch (type) {
    case 'inventory':
        for (const name of diff.added) {
            changes.push({ type: 'added', text: `+ ${name}` });
        }
        for (const name of diff.removed) {
            changes.push({ type: 'removed', text: `− ${name}` });
        }
        for (const name of diff.modified) {
            changes.push({ type: 'modified', text: `~ ${name} (updated)` });
        }
        break;

    case 'numeric-bars':
        if (typeof previous === 'object' && typeof current === 'object') {
            for (const key of Object.keys(current)) {
                if (previous[key] !== undefined && previous[key] !== current[key]) {
                    const delta = current[key] - previous[key];
                    const sign = delta > 0 ? '+' : '';
                    changes.push({
                        type: delta > 0 ? 'added' : 'removed',
                        text: `${key}: ${sign}${delta.toFixed(2)} → ${current[key].toFixed(2)}`,
                    });
                }
            }
        }
        break;

    case 'key-value':
        for (const key of diff.modified) {
            const prev = previous?.[key] || '';
            const curr = current?.[key] || '';
            // For Path changes, show the transition
            if (key.toLowerCase() === 'path') {
                changes.push({ type: 'modified', text: `Path: ${curr}` });
            } else {
                changes.push({ type: 'modified', text: `${key}: ${truncate(curr, 40)}` });
            }
        }
        for (const key of diff.added) {
            changes.push({ type: 'added', text: `+ ${key}: ${truncate(current[key], 40)}` });
        }
        for (const key of diff.removed) {
            changes.push({ type: 'removed', text: `− ${key}` });
        }
        break;
    }

    return changes;
}

function truncate(str, max) {
    if (!str) return '';
    str = String(str);
    return str.length > max ? str.slice(0, max) + '…' : str;
}

function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
}
