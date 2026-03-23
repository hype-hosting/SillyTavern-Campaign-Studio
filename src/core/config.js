/**
 * Campaign Studio — Constants and defaults
 */

export const EXTENSION_NAME = 'campaign-studio';
export const EXTENSION_DISPLAY = 'Campaign Studio';

export const DEFAULT_SETTINGS = {
    enabled: true,
    activePreset: 'universal',
    panelPosition: 'right',
    panelOpen: false,
    accentColor: '#7c6bde',
    showTimeline: true,
    showLocationTracker: true,
    customPresets: [],
    mechanics: {
        diceEnabled: true,
        encounterEnabled: false,
    },
    injection: {
        systemPrompt: true,
        stateContext: true,
        outputFormat: 'yaml',  // 'yaml' | 'details' | 'both'
    },
    presetRules: {},
    ruleOverrides: {},  // { [presetId]: { [ruleId]: boolean } }
};

export const PANEL_POSITIONS = ['right', 'left', 'bottom'];

export const SECTION_TYPES = {
    INVENTORY: 'inventory',
    KEY_VALUE: 'key-value',
    NUMERIC_BARS: 'numeric-bars',
};

export const PARSE_FORMATS = {
    MARKDOWN_LIST: 'markdown-list',
    KEY_VALUE: 'key-value',
    KEY_VALUE_NUMERIC: 'key-value-numeric',
    STAT_BLOCK: 'stat-block',
};

export const MATCH_MODES = {
    EXACT: 'exact',
    CONTAINS: 'contains',
    ENDS_WITH: 'endsWith',
    REGEX: 'regex',
};

export const CSS_PREFIX = 'cs';

export const TAB_TYPES = {
    OVERVIEW: 'overview',
    INVENTORY: 'inventory',
    JOURNAL: 'journal',
};

export const DEFAULT_TABS = [
    { id: TAB_TYPES.OVERVIEW, label: 'Overview', icon: '🧭' },
    { id: TAB_TYPES.INVENTORY, label: 'Inventory', icon: '🎒' },
    { id: TAB_TYPES.JOURNAL, label: 'Journal', icon: '📜' },
];
