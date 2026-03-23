/**
 * Campaign Studio — Tab controller
 * Dynamically generates tabs from the active preset's sections.
 */

import { emit, on, CS_EVENTS } from '../core/events.js';

const TAB_ICONS = {
    backpack: '🎒',
    globe: '🌍',
    shield: '🛡',
    scroll: '📜',
    clock: '⏱',
    map: '🗺',
    default: '◆',
};

let activeTabId = null;
let $tabBar = null;
let $container = null;

/**
 * Initialize tabs from a preset's sections.
 */
export function initTabs(preset) {
    $tabBar = $('#cs-tab-bar');
    $container = $('#cs-section-container');

    if (!$tabBar.length || !$container.length) return;

    $tabBar.empty();
    $container.empty();

    if (!preset?.sections?.length) return;

    // Create a tab + content pane for each section
    for (const section of preset.sections) {
        const icon = TAB_ICONS[section.icon] || TAB_ICONS.default;

        const $tab = $(`
            <button class="cs-tab" data-tab-id="${section.id}" title="${section.match}">
                <span class="cs-tab-icon">${icon}</span>
                <span class="cs-tab-label">${section.id}</span>
            </button>
        `);

        $tab.on('click', () => switchTab(section.id));
        $tabBar.append($tab);

        const $pane = $(`<div class="cs-tab-pane cs-hidden" data-pane-id="${section.id}"></div>`);
        $container.append($pane);
    }

    // Add built-in Timeline tab
    const $timelineTab = $(`
        <button class="cs-tab" data-tab-id="timeline" title="Session Timeline">
            <span class="cs-tab-icon">${TAB_ICONS.clock}</span>
            <span class="cs-tab-label">Log</span>
        </button>
    `);
    $timelineTab.on('click', () => switchTab('timeline'));
    $tabBar.append($timelineTab);

    const $timelinePane = $('<div class="cs-tab-pane cs-hidden" data-pane-id="timeline"></div>');
    $container.append($timelinePane);

    // Add Location tab
    const $locationTab = $(`
        <button class="cs-tab" data-tab-id="location" title="Location Tracker">
            <span class="cs-tab-icon">${TAB_ICONS.map}</span>
            <span class="cs-tab-label">Map</span>
        </button>
    `);
    $locationTab.on('click', () => switchTab('location'));
    $tabBar.append($locationTab);

    const $locationPane = $('<div class="cs-tab-pane cs-hidden" data-pane-id="location"></div>');
    $container.append($locationPane);

    // Activate first tab
    if (preset.sections.length > 0) {
        switchTab(preset.sections[0].id);
    }
}

/**
 * Switch to a specific tab.
 */
export function switchTab(tabId) {
    if (activeTabId === tabId) return;

    // Deactivate current
    $tabBar?.find('.cs-tab').removeClass('cs-tab-active');
    $('#cs-section-container').find('.cs-tab-pane').addClass('cs-hidden');

    // Activate new
    $tabBar?.find(`[data-tab-id="${tabId}"]`).addClass('cs-tab-active');
    $(`[data-pane-id="${tabId}"]`).removeClass('cs-hidden');

    activeTabId = tabId;

    // Hide empty state if we have tabs
    $('#cs-empty-state').addClass('cs-hidden');
    $('#cs-section-container').removeClass('cs-hidden');

    emit(CS_EVENTS.TAB_CHANGED, { tabId });
}

/**
 * Get the content pane for a specific section.
 */
export function getPane(sectionId) {
    return $(`[data-pane-id="${sectionId}"]`);
}

export function getActiveTabId() {
    return activeTabId;
}
