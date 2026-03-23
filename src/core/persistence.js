/**
 * Campaign Studio — Data persistence
 *
 * Layer 1: Extension settings (global, cross-chat)
 * Layer 2: Chat metadata (per-chat)
 * Layer 3: Message extra (per-message/per-swipe snapshots)
 */

import { EXTENSION_NAME, DEFAULT_SETTINGS } from './config.js';
import { getSnapshot, restoreState, resetState } from './state.js';

let settings = null;

/**
 * Initialize settings, merging defaults with any persisted values.
 */
export function initSettings() {
    const context = SillyTavern.getContext();
    if (!context.extensionSettings[EXTENSION_NAME]) {
        context.extensionSettings[EXTENSION_NAME] = {};
    }
    settings = Object.assign({}, DEFAULT_SETTINGS, context.extensionSettings[EXTENSION_NAME]);
    context.extensionSettings[EXTENSION_NAME] = settings;
    return settings;
}

export function getSettings() {
    if (!settings) return initSettings();
    return settings;
}

export function updateSettings(partial) {
    Object.assign(settings, partial);
    const context = SillyTavern.getContext();
    context.extensionSettings[EXTENSION_NAME] = settings;
    context.saveSettingsDebounced();
}

/**
 * Save state snapshot to the current message's extra data.
 */
export function saveMessageSnapshot(messageId) {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || !chat[messageId]) return;

    const message = chat[messageId];
    if (!message.extra) message.extra = {};
    if (!message.extra.campaignStudio) message.extra.campaignStudio = { swipes: {} };

    const swipeId = message.swipe_id || 0;
    message.extra.campaignStudio.swipes[swipeId] = getSnapshot();

    context.saveChatDebounced();
}

/**
 * Rebuild state from chat history on chat load.
 * Walk messages in order, applying the latest swipe's snapshot.
 */
export function rebuildStateFromChat() {
    resetState();

    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return;

    // Walk backwards to find the most recent complete snapshot
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        const csData = message?.extra?.campaignStudio;
        if (!csData?.swipes) continue;

        const swipeId = message.swipe_id || 0;
        const snapshot = csData.swipes[swipeId];
        if (snapshot && snapshot.sections && Object.keys(snapshot.sections).length > 0) {
            restoreState(snapshot);
            return;
        }
    }
}

/**
 * Get chat-level metadata.
 */
export function getChatMetadata() {
    const context = SillyTavern.getContext();
    if (!context.chatMetadata) return {};
    return context.chatMetadata.campaignStudio || {};
}

export function updateChatMetadata(partial) {
    const context = SillyTavern.getContext();
    if (!context.chatMetadata) return;
    if (!context.chatMetadata.campaignStudio) {
        context.chatMetadata.campaignStudio = {};
    }
    Object.assign(context.chatMetadata.campaignStudio, partial);
    context.saveMetadataDebounced();
}
