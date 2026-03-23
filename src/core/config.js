/**
 * Campaign Studio — Constants and defaults
 */

export const EXTENSION_NAME = 'campaign-studio';
export const EXTENSION_DISPLAY = 'Campaign Studio';

export const DEFAULT_SETTINGS = {
    enabled: true,
    activePreset: 'vigil-falls',
    panelPosition: 'right',
    panelWidth: 360,
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
};

export const MATCH_MODES = {
    EXACT: 'exact',
    CONTAINS: 'contains',
    ENDS_WITH: 'endsWith',
    REGEX: 'regex',
};

export const CSS_PREFIX = 'cs';
