/**
 * Campaign Studio — Preset Manager
 * Loads, switches, and manages presets (built-in and custom).
 */

import { validatePreset } from './schema.js';
import { getSettings, updateSettings } from '../core/persistence.js';
import { setActivePreset } from '../core/state.js';

const presetRegistry = new Map();

const BUILTIN_PRESETS = [
    'universal',
    'vigil-falls',
    'forgotten-realms',
    'cyberpunk',
    'cozy-life',
];

/**
 * Initialize the preset manager, loading built-in and custom presets.
 */
export async function initPresets() {
    // Load built-in presets
    for (const presetId of BUILTIN_PRESETS) {
        try {
            const response = await fetch(
                `/scripts/extensions/third-party/SillyTavern-Campaign-Studio/src/presets/builtin/${presetId}.json`,
            );
            if (response.ok) {
                const preset = await response.json();
                registerPreset(preset);
            }
        } catch (err) {
            console.error(`[Campaign Studio] Failed to load built-in preset "${presetId}":`, err);
        }
    }

    // Load custom presets from settings
    const settings = getSettings();
    if (settings.customPresets?.length) {
        for (const preset of settings.customPresets) {
            registerPreset(preset);
        }
    }

    // Activate the configured preset
    const activeId = settings.activePreset || 'vigil-falls';
    activatePreset(activeId);
}

/**
 * Register a preset in the registry after validation.
 */
export function registerPreset(preset) {
    const { valid, errors } = validatePreset(preset);
    if (!valid) {
        console.warn(`[Campaign Studio] Invalid preset "${preset?.id || 'unknown'}":`, errors);
        return false;
    }
    presetRegistry.set(preset.id, preset);
    return true;
}

/**
 * Activate a preset by ID.
 */
export function activatePreset(presetId) {
    const preset = presetRegistry.get(presetId);
    if (!preset) {
        console.warn(`[Campaign Studio] Preset "${presetId}" not found. Available:`, [...presetRegistry.keys()]);
        // Fallback to first available
        const first = presetRegistry.values().next().value;
        if (first) {
            setActivePreset(first.id);
            return first;
        }
        return null;
    }

    setActivePreset(presetId);
    updateSettings({ activePreset: presetId });
    return preset;
}

/**
 * Get the currently active preset configuration.
 */
export function getActivePreset() {
    const settings = getSettings();
    return presetRegistry.get(settings.activePreset) || null;
}

/**
 * Get a preset by ID.
 */
export function getPreset(presetId) {
    return presetRegistry.get(presetId) || null;
}

/**
 * Get all registered presets.
 */
export function getAllPresets() {
    return [...presetRegistry.values()];
}

/**
 * Save a custom preset.
 */
export function saveCustomPreset(preset) {
    const success = registerPreset(preset);
    if (!success) return false;

    const settings = getSettings();
    const existing = settings.customPresets.findIndex(p => p.id === preset.id);
    if (existing >= 0) {
        settings.customPresets[existing] = preset;
    } else {
        settings.customPresets.push(preset);
    }
    updateSettings({ customPresets: settings.customPresets });
    return true;
}

/**
 * Check if a preset is a built-in (non-editable) preset.
 */
export function isBuiltinPreset(presetId) {
    return BUILTIN_PRESETS.includes(presetId);
}

/**
 * Delete a custom preset.
 */
export function deleteCustomPreset(presetId) {
    presetRegistry.delete(presetId);
    const settings = getSettings();
    settings.customPresets = settings.customPresets.filter(p => p.id !== presetId);
    updateSettings({ customPresets: settings.customPresets });
}
