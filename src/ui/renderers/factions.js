/**
 * Campaign Studio — Faction/Standing Bars Renderer
 * Renders numeric scores as horizontal bars with color interpolation.
 */

import { sanitizeText } from '../../utils/sanitize.js';

/**
 * Render faction standing data as horizontal bars.
 * @param {object} data - Key-value map of faction → numeric score
 * @param {object} sectionConfig - Section configuration from preset
 * @param {jQuery} $container - Target container
 * @param {object} [previousData] - Previous data for delta indicators
 */
export function renderFactions(data, sectionConfig, $container, previousData = null) {
    $container.empty();

    if (!data || Object.keys(data).length === 0) {
        $container.html('<div class="cs-empty-section">No faction data tracked</div>');
        return;
    }

    const range = sectionConfig.parse?.range || [-1.0, 1.0];
    const display = sectionConfig.display || {};
    const colorNeg = display.colorNegative || '#e05555';
    const colorNeutral = display.colorNeutral || '#666666';
    const colorPos = display.colorPositive || '#7c6bde';
    const showDelta = display.showDelta !== false;

    const $list = $('<div class="cs-faction-list"></div>');

    for (const [faction, score] of Object.entries(data)) {
        const $row = $('<div class="cs-faction-row cs-card"></div>');

        // Faction name
        $row.append(`<div class="cs-faction-name">${sanitizeText(faction)}</div>`);

        // Bar container
        const $barWrap = $('<div class="cs-faction-bar-wrap"></div>');

        // Calculate fill percentage (map range to 0-100%)
        const [min, max] = range;
        const normalized = ((score - min) / (max - min)) * 100;
        const clampedPct = Math.max(0, Math.min(100, normalized));

        // Determine color based on score
        const color = score < 0 ? colorNeg : score > 0 ? colorPos : colorNeutral;

        // Center line (represents 0 on the scale)
        const zeroPos = ((0 - min) / (max - min)) * 100;

        const $bar = $('<div class="cs-faction-bar"></div>');
        $bar.append(`<div class="cs-faction-bar-zero" style="left: ${zeroPos}%"></div>`);
        $bar.append(`<div class="cs-faction-bar-fill" style="width: ${clampedPct}%; background: ${color}"></div>`);
        $barWrap.append($bar);
        $row.append($barWrap);

        // Score value
        const sign = score > 0 ? '+' : '';
        const $score = $(`<span class="cs-faction-score" style="color: ${color}">${sign}${score.toFixed(2)}</span>`);
        $row.append($score);

        // Delta indicator
        if (showDelta && previousData && previousData[faction] !== undefined) {
            const delta = score - previousData[faction];
            if (Math.abs(delta) > 0.001) {
                const deltaSign = delta > 0 ? '▲' : '▼';
                const deltaCls = delta > 0 ? 'cs-delta-up' : 'cs-delta-down';
                $row.append(`<span class="cs-faction-delta ${deltaCls}">${deltaSign}${Math.abs(delta).toFixed(2)}</span>`);
            }
        }

        $list.append($row);
    }

    $container.append($list);
}
