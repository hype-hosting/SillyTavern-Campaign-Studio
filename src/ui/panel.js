/**
 * Campaign Studio — Panel lifecycle management
 * Handles open/close/dock/position of the side panel.
 * Positioning follows patterns from the Lovense Cloud extension:
 * right (default), left, or bottom (mobile).
 */

import { getSettings, updateSettings } from '../core/persistence.js';
import { emit, CS_EVENTS } from '../core/events.js';
import { PANEL_POSITIONS } from '../core/config.js';

let $panel = null;
let $fab = null;
let isOpen = false;

/**
 * Initialize the panel DOM references and event listeners.
 */
export function initPanel() {
    $panel = $('#cs-panel');
    $fab = $('#cs-fab');

    if (!$panel.length) {
        console.error('[Campaign Studio] Panel template not found in DOM');
        return;
    }

    const settings = getSettings();

    // Apply saved position
    setPosition(settings.panelPosition || 'right');

    // Close button
    $panel.find('.cs-btn-close').on('click', () => closePanel());

    // Dock/position toggle button
    $panel.find('.cs-btn-dock').on('click', () => cyclePosition());

    // FAB button opens panel
    $fab.on('click', () => openPanel());

    // Escape key closes panel
    $(document).on('keydown.campaignStudio', (e) => {
        if (e.key === 'Escape' && isOpen) {
            closePanel();
        }
    });

    // Show FAB
    $fab.removeClass('cs-hidden');

    // Auto-open if it was open last time
    if (settings.panelOpen) {
        openPanel();
    }
}

export function openPanel() {
    if (!$panel) return;
    isOpen = true;
    $panel.removeClass('cs-hidden');
    $panel.addClass('cs-panel-visible');
    $fab.addClass('cs-hidden');
    updateSettings({ panelOpen: true });
    emit(CS_EVENTS.PANEL_TOGGLED, { open: true });
}

export function closePanel() {
    if (!$panel) return;
    isOpen = false;
    $panel.removeClass('cs-panel-visible');
    // Delay hiding to allow transition
    setTimeout(() => {
        if (!isOpen) {
            $panel.addClass('cs-hidden');
        }
    }, 350);
    $fab.removeClass('cs-hidden');
    updateSettings({ panelOpen: false });
    emit(CS_EVENTS.PANEL_TOGGLED, { open: false });
}

export function togglePanel() {
    if (isOpen) {
        closePanel();
    } else {
        openPanel();
    }
}

export function isPanelOpen() {
    return isOpen;
}

/**
 * Set panel position: 'right', 'left', or 'bottom'.
 */
function setPosition(position) {
    if (!$panel) return;
    // Remove all position classes
    PANEL_POSITIONS.forEach(pos => {
        $panel.removeClass(`cs-position-${pos}`);
    });
    $panel.addClass(`cs-position-${position}`);

    // Update FAB position to match
    $fab.removeClass('cs-fab-right cs-fab-left cs-fab-bottom');
    $fab.addClass(`cs-fab-${position}`);

    updateSettings({ panelPosition: position });
}

/**
 * Cycle through panel positions.
 */
function cyclePosition() {
    const settings = getSettings();
    const currentIdx = PANEL_POSITIONS.indexOf(settings.panelPosition || 'right');
    const nextIdx = (currentIdx + 1) % PANEL_POSITIONS.length;
    setPosition(PANEL_POSITIONS[nextIdx]);
}

/**
 * Destroy panel and clean up listeners.
 */
export function destroyPanel() {
    $(document).off('keydown.campaignStudio');
    if ($panel) {
        $panel.find('.cs-btn-close').off('click');
        $panel.find('.cs-btn-dock').off('click');
    }
    if ($fab) {
        $fab.off('click');
    }
    $panel = null;
    $fab = null;
    isOpen = false;
}
