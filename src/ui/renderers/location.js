/**
 * Campaign Studio — Location Tracker Renderer
 * Displays current location as a breadcrumb and recent location history.
 */

import { sanitizeText } from '../../utils/sanitize.js';

/**
 * Render the location tracker into a container.
 * @param {object[]} locationHistory - Array of { messageId, path, timestamp }
 * @param {object} fieldConfig - Field configuration (separator, etc.)
 * @param {jQuery} $container - Target container
 */
export function renderLocation(locationHistory, fieldConfig, $container) {
    $container.empty();

    if (!locationHistory || locationHistory.length === 0) {
        $container.html('<div class="cs-empty-section">No location data yet</div>');
        return;
    }

    const separator = fieldConfig?.separator || '→';
    const current = locationHistory[locationHistory.length - 1];

    // Current location breadcrumb
    const $current = $('<div class="cs-location-current"></div>');
    const segments = current.path.split(separator).map(s => s.trim()).filter(Boolean);

    for (let i = 0; i < segments.length; i++) {
        const isLast = i === segments.length - 1;
        const $seg = $(`<span class="cs-location-segment${isLast ? ' cs-location-active' : ''}">${sanitizeText(segments[i])}</span>`);
        $current.append($seg);

        if (!isLast) {
            $current.append('<span class="cs-location-arrow">→</span>');
        }
    }

    $container.append($current);

    // Recent location history (last 8, excluding current)
    const history = locationHistory.slice(0, -1).reverse().slice(0, 8);
    if (history.length > 0) {
        const $history = $('<div class="cs-location-history"></div>');
        $history.append('<div class="cs-location-history-label">Recent</div>');

        for (let i = 0; i < history.length; i++) {
            const entry = history[i];
            const histSegments = entry.path.split(separator).map(s => s.trim()).filter(Boolean);
            const lastSeg = histSegments[histSegments.length - 1] || entry.path;
            const fullPath = histSegments.join(' → ');

            const opacity = Math.max(0.3, 1 - (i * 0.1));
            const $entry = $(`
                <div class="cs-location-history-entry" style="opacity: ${opacity}" title="${sanitizeText(fullPath)}">
                    <span class="cs-location-history-dot"></span>
                    <span class="cs-location-history-text">${sanitizeText(lastSeg)}</span>
                    <span class="cs-location-history-time">${formatTime(entry.timestamp)}</span>
                </div>
            `);
            $history.append($entry);
        }

        $container.append($history);
    }
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    if (typeof timestamp === 'string') return timestamp;
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
