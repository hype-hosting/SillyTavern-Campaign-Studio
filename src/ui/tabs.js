/**
 * Campaign Studio — Section controller
 * Generates stacked, at-a-glance sections from the active preset.
 * All sections are visible simultaneously (no tabs).
 */

import { emit, CS_EVENTS } from '../core/events.js';

const SECTION_ICONS = {
    backpack: '🎒',
    globe: '🌍',
    shield: '🛡',
    scroll: '📜',
    clock: '⏱',
    map: '🗺',
    default: '◆',
};

let $container = null;

/**
 * Built-in sections that appear after preset sections.
 */
const BUILTIN_SECTIONS = [
    { id: '_location', label: 'Location', icon: 'map' },
    { id: '_timeline', label: 'Timeline', icon: 'clock' },
];

/**
 * Initialize stacked sections from a preset's section definitions.
 */
export function initTabs(preset) {
    $container = $('#cs-section-container');
    if (!$container.length) return;

    $container.empty();

    if (!preset?.sections?.length) return;

    // Create a stacked section for each preset section
    for (const section of preset.sections) {
        createSection(section.id, section.match || section.id, section.icon);
    }

    // Add built-in sections (Location, Timeline)
    for (const builtin of BUILTIN_SECTIONS) {
        createSection(builtin.id, builtin.label, builtin.icon, true);
    }

    // Show container, hide empty state
    $('#cs-empty-state').addClass('cs-hidden');
    $container.removeClass('cs-hidden');
}

/**
 * Create a collapsible section in the panel.
 */
function createSection(id, label, iconKey, startCollapsed = false) {
    const icon = SECTION_ICONS[iconKey] || SECTION_ICONS.default;

    const $section = $(`<div class="cs-section" data-section-id="${id}"></div>`);
    if (startCollapsed) $section.addClass('cs-section-collapsed');

    const $header = $(`
        <div class="cs-section-header">
            <span class="cs-section-icon">${icon}</span>
            <span class="cs-section-title">${label}</span>
            <span class="cs-section-count" data-count-id="${id}"></span>
            <span class="cs-section-toggle">${startCollapsed ? '▸' : '▾'}</span>
        </div>
    `);

    const $body = $(`<div class="cs-section-body" data-pane-id="${id}"></div>`);

    // Toggle collapse on header click
    $header.on('click', () => {
        const isCollapsed = $section.hasClass('cs-section-collapsed');
        $section.toggleClass('cs-section-collapsed', !isCollapsed);
        $header.find('.cs-section-toggle').text(isCollapsed ? '▾' : '▸');
    });

    $section.append($header);
    $section.append($body);
    $container.append($section);
}

/**
 * Get the content pane for a specific section.
 */
export function getPane(sectionId) {
    return $(`[data-pane-id="${sectionId}"]`);
}

/**
 * Update the count badge for a section header.
 * @param {string} sectionId - Section ID
 * @param {string} text - Count text (e.g., "6 items", "4 factions")
 */
export function updateSectionCount(sectionId, text) {
    const $count = $(`[data-count-id="${sectionId}"]`);
    if ($count.length) {
        $count.text(text || '');
    }
}

/**
 * Compatibility shims — these are no-ops now but kept so
 * callers don't break.
 */
export function switchTab() {}
export function getActiveTabId() { return null; }
