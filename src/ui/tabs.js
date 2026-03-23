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
 * Initialize stacked sections from a preset's section definitions.
 */
export function initTabs(preset) {
    $container = $('#cs-section-container');
    if (!$container.length) return;

    $container.empty();

    if (!preset?.sections?.length) return;

    // Create a stacked section for each preset section
    for (const section of preset.sections) {
        const icon = SECTION_ICONS[section.icon] || SECTION_ICONS.default;

        const $section = $(`<div class="cs-section" data-section-id="${section.id}"></div>`);

        const $header = $(`
            <div class="cs-section-header">
                <span class="cs-section-icon">${icon}</span>
                <span class="cs-section-title">${section.match || section.id}</span>
                <span class="cs-section-toggle">▾</span>
            </div>
        `);

        const $body = $(`<div class="cs-section-body" data-pane-id="${section.id}"></div>`);

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

    // Show container, hide empty state
    $('#cs-empty-state').addClass('cs-hidden');
    $container.removeClass('cs-hidden');
}

/**
 * Get the content pane for a specific section.
 */
export function getPane(sectionId) {
    return $(`[data-pane-id="${sectionId}"]`);
}

/**
 * Compatibility shims — these are no-ops now but kept so
 * callers don't break.
 */
export function switchTab() {}
export function getActiveTabId() { return null; }
