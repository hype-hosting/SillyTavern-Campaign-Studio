/**
 * Campaign Studio — Tab Navigation Controller
 * Groups preset sections into tabs: Overview (flow), Inventory (collapsible), Journal (collapsible).
 */

import { emit, CS_EVENTS } from '../core/events.js';
import { TAB_TYPES, DEFAULT_TABS, SECTION_TYPES } from '../core/config.js';

const SECTION_ICONS = {
    backpack: '🎒',
    globe: '🌍',
    shield: '🛡',
    scroll: '📜',
    clock: '⏱',
    map: '🗺',
    default: '◆',
};

/**
 * Built-in sections appended after preset sections.
 */
const BUILTIN_SECTIONS = [
    { id: '_location', label: 'Location', icon: 'map', tab: TAB_TYPES.JOURNAL },
    { id: '_timeline', label: 'Timeline', icon: 'clock', tab: TAB_TYPES.JOURNAL },
];

let activeTabId = null;
let tabSectionMap = new Map(); // sectionId → tabId

// ── Public API ──────────────────────────────────────────────

/**
 * Initialize tab bar + tab panels from a preset's section definitions.
 */
export function initTabs(preset) {
    const $tabBar = $('#cs-tab-bar');
    const $tabPanels = $('#cs-tab-panels');
    if (!$tabBar.length || !$tabPanels.length) return;

    $tabBar.empty();
    $tabPanels.empty();
    tabSectionMap.clear();

    if (!preset?.sections?.length) return;

    // Determine tab definitions
    const tabs = preset.tabs || DEFAULT_TABS;

    // Build tab bar buttons
    buildTabBar(tabs, $tabBar);

    // Build empty tab panel containers
    buildTabPanels(tabs, $tabPanels);

    // Assign preset sections to tabs
    for (const section of preset.sections) {
        const tabId = resolveTabAssignment(section);
        tabSectionMap.set(section.id, tabId);

        const $panel = $tabPanels.find(`[data-tab-panel="${tabId}"]`);
        if (!$panel.length) continue;

        if (tabId === TAB_TYPES.OVERVIEW) {
            createFlowSection(section.id, section.match || section.id, section.icon, $panel);
        } else {
            createCollapsibleSection(section.id, section.match || section.id, section.icon, $panel, false);
        }
    }

    // Add built-in sections (Location, Timeline) to Journal tab
    for (const builtin of BUILTIN_SECTIONS) {
        tabSectionMap.set(builtin.id, builtin.tab);
        const $panel = $tabPanels.find(`[data-tab-panel="${builtin.tab}"]`);
        if ($panel.length) {
            createCollapsibleSection(builtin.id, builtin.label, builtin.icon, $panel, true);
        }
    }

    // Hide tabs with no sections
    hideEmptyTabs(tabs, $tabBar, $tabPanels);

    // Activate first tab with content
    const firstVisibleTab = tabs.find(t =>
        $tabPanels.find(`[data-tab-panel="${t.id}"]`).children().length > 0,
    );
    switchTab(firstVisibleTab?.id || tabs[0].id);

    // Show tab area, hide empty state
    $('#cs-empty-state').addClass('cs-hidden');
    $tabPanels.removeClass('cs-hidden');
}

/**
 * Get the content pane for a specific section.
 */
export function getPane(sectionId) {
    return $(`[data-pane-id="${sectionId}"]`);
}

/**
 * Update the count badge for a section header.
 */
export function updateSectionCount(sectionId, text) {
    const $count = $(`[data-count-id="${sectionId}"]`);
    if ($count.length) {
        $count.text(text || '');
    }
}

/**
 * Switch to a specific tab.
 */
export function switchTab(tabId) {
    if (!tabId) return;
    activeTabId = tabId;

    // Update tab buttons
    $('.cs-tab-btn').removeClass('cs-tab-active');
    $(`.cs-tab-btn[data-tab="${tabId}"]`).addClass('cs-tab-active');

    // Update tab panels
    $('.cs-tab-panel').removeClass('cs-tab-panel-active');
    $(`.cs-tab-panel[data-tab-panel="${tabId}"]`).addClass('cs-tab-panel-active');
}

/**
 * Get the currently active tab ID.
 */
export function getActiveTabId() {
    return activeTabId;
}

/**
 * Get which tab a section belongs to.
 */
export function getTabForSection(sectionId) {
    return tabSectionMap.get(sectionId) || TAB_TYPES.OVERVIEW;
}

/**
 * Update the badge count on a tab button.
 */
export function updateTabBadge(tabId, count) {
    const $badge = $(`.cs-tab-btn[data-tab="${tabId}"] .cs-tab-badge`);
    if (!$badge.length) return;
    if (count > 0) {
        $badge.text(count).removeClass('cs-hidden');
    } else {
        $badge.addClass('cs-hidden');
    }
}

// ── Internal ────────────────────────────────────────────────

/**
 * Resolve which tab a section belongs to.
 */
function resolveTabAssignment(section) {
    // Explicit tab assignment in preset
    if (section.tab && typeof section.tab === 'string') {
        return section.tab;
    }
    // Infer from section type
    switch (section.type) {
    case SECTION_TYPES.INVENTORY:
        return TAB_TYPES.INVENTORY;
    case SECTION_TYPES.KEY_VALUE:
    case SECTION_TYPES.NUMERIC_BARS:
    default:
        return TAB_TYPES.OVERVIEW;
    }
}

/**
 * Build the tab bar buttons.
 */
function buildTabBar(tabs, $container) {
    for (const tab of tabs) {
        const $btn = $(`
            <button class="cs-tab-btn" data-tab="${tab.id}">
                <span class="cs-tab-btn-icon">${tab.icon || ''}</span>
                <span class="cs-tab-btn-label">${tab.label}</span>
                <span class="cs-tab-badge cs-hidden" data-tab-badge="${tab.id}"></span>
            </button>
        `);
        $btn.on('click', () => switchTab(tab.id));
        $container.append($btn);
    }
}

/**
 * Build empty tab panel containers.
 */
function buildTabPanels(tabs, $container) {
    for (const tab of tabs) {
        $container.append(`<div class="cs-tab-panel" data-tab-panel="${tab.id}"></div>`);
    }
}

/**
 * Create a flow section (no collapse) for Overview tab.
 */
function createFlowSection(id, label, iconKey, $panel) {
    const icon = SECTION_ICONS[iconKey] || SECTION_ICONS.default;

    const $section = $(`<div class="cs-section-flow" data-section-id="${id}"></div>`);

    const $label = $(`
        <div class="cs-section-label">
            <span class="cs-section-icon">${icon}</span>
            <span class="cs-section-label-text">${label}</span>
            <span class="cs-section-count" data-count-id="${id}"></span>
        </div>
    `);

    const $body = $(`<div class="cs-section-body" data-pane-id="${id}"></div>`);

    $section.append($label, $body);
    $panel.append($section);
}

/**
 * Create a collapsible section for Inventory/Journal tabs.
 */
function createCollapsibleSection(id, label, iconKey, $panel, startCollapsed = false) {
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

    $section.append($header, $body);
    $panel.append($section);
}

/**
 * Hide tabs that have zero sections assigned.
 */
function hideEmptyTabs(tabs, $tabBar, $tabPanels) {
    for (const tab of tabs) {
        const $panel = $tabPanels.find(`[data-tab-panel="${tab.id}"]`);
        if ($panel.children().length === 0) {
            $tabBar.find(`[data-tab="${tab.id}"]`).addClass('cs-hidden');
            $panel.addClass('cs-hidden');
        }
    }
}
