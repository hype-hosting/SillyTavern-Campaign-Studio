/**
 * Campaign Studio — Internal event bus
 * Decoupled from SillyTavern's eventSource for fine-grained UI updates.
 */

const listeners = new Map();

export function on(event, callback) {
    if (!listeners.has(event)) {
        listeners.set(event, new Set());
    }
    listeners.get(event).add(callback);
}

export function off(event, callback) {
    if (listeners.has(event)) {
        listeners.get(event).delete(callback);
        if (listeners.get(event).size === 0) {
            listeners.delete(event);
        }
    }
}

export function emit(event, data) {
    if (listeners.has(event)) {
        for (const callback of listeners.get(event)) {
            try {
                callback(data);
            } catch (err) {
                console.error(`[Campaign Studio] Event handler error for "${event}":`, err);
            }
        }
    }
}

// Event name constants
export const CS_EVENTS = {
    STATE_CHANGED: 'cs:state-changed',
    SECTION_UPDATED: 'cs:section-updated',
    PRESET_CHANGED: 'cs:preset-changed',
    PANEL_TOGGLED: 'cs:panel-toggled',
    TAB_CHANGED: 'cs:tab-changed',
};
