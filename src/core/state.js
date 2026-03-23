/**
 * Campaign Studio — Centralized reactive state store
 */

import { emit, CS_EVENTS } from './events.js';

let state = {
    activePreset: null,
    currentMessageId: -1,
    sections: {},
    history: [],
    locationHistory: [],
};

export function getState() {
    return state;
}

export function getSection(sectionId) {
    return state.sections[sectionId] || null;
}

export function getAllSections() {
    return state.sections;
}

/**
 * Update a specific section's data.
 * @param {string} sectionId
 * @param {object} sectionConfig - { type, label }
 * @param {*} newData - The parsed data for this section
 * @param {number} messageId
 */
export function updateSection(sectionId, sectionConfig, newData, messageId) {
    const previous = state.sections[sectionId]?.data || null;

    state.sections[sectionId] = {
        type: sectionConfig.type,
        label: sectionConfig.label || sectionId,
        data: newData,
        lastMessageId: messageId,
    };

    state.currentMessageId = Math.max(state.currentMessageId, messageId);

    // Record in history
    state.history.push({
        messageId,
        sectionId,
        timestamp: Date.now(),
        previous,
        current: newData,
    });

    // Track location changes
    if (sectionConfig.type === 'key-value' && newData && newData['Path']) {
        const lastLoc = state.locationHistory[state.locationHistory.length - 1];
        if (!lastLoc || lastLoc.path !== newData['Path']) {
            state.locationHistory.push({
                messageId,
                path: newData['Path'],
                timestamp: newData['Time'] || new Date().toLocaleTimeString(),
            });
        }
    }

    emit(CS_EVENTS.SECTION_UPDATED, { sectionId, previous, current: newData, messageId });
    emit(CS_EVENTS.STATE_CHANGED, { sections: state.sections, messageId });
}

export function setActivePreset(presetId) {
    state.activePreset = presetId;
    emit(CS_EVENTS.PRESET_CHANGED, { presetId });
}

/**
 * Restore state from a persisted snapshot.
 */
export function restoreState(snapshot) {
    if (!snapshot) return;
    state = {
        activePreset: snapshot.activePreset || state.activePreset,
        currentMessageId: snapshot.currentMessageId || -1,
        sections: snapshot.sections || {},
        history: snapshot.history || [],
        locationHistory: snapshot.locationHistory || [],
    };
    emit(CS_EVENTS.STATE_CHANGED, { sections: state.sections, messageId: state.currentMessageId });
}

/**
 * Get a serializable snapshot for persistence.
 */
export function getSnapshot() {
    return {
        activePreset: state.activePreset,
        currentMessageId: state.currentMessageId,
        sections: JSON.parse(JSON.stringify(state.sections)),
        history: state.history,
        locationHistory: state.locationHistory,
    };
}

/**
 * Reset state (e.g., on chat change).
 */
export function resetState() {
    state = {
        activePreset: state.activePreset,
        currentMessageId: -1,
        sections: {},
        history: [],
        locationHistory: [],
    };
}
