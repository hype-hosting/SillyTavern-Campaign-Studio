/**
 * Campaign Studio — Faction/Standing Bars Renderer
 * Renders numeric scores as bars.
 * Supports two modes:
 * - Bipolar (e.g., [-1, 1]): Center-zero bidirectional bars
 * - Unipolar (e.g., [0, 1]): Left-to-right fill bars
 * Optional invertedKeys for meters where high values are negative (e.g., Stress).
 */

import { sanitizeText } from '../../utils/sanitize.js';

/**
 * Render faction/standing data as bars.
 * @param {object} data - Key-value map of name → numeric score
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
    const colorNeg = display.colorNegative || '#c0392b';
    const colorNeutral = display.colorNeutral || '#666666';
    const colorPos = display.colorPositive || '#7c6bde';
    const showDelta = display.showDelta !== false;
    const invertedKeys = display.invertedKeys || [];

    const $list = $('<div class="cs-faction-list"></div>');
    const [min, max] = range;
    const isUnipolar = min >= 0;

    for (const [faction, score] of Object.entries(data)) {
        const $row = $('<div class="cs-faction-row cs-card"></div>');
        const isInverted = invertedKeys.includes(faction);

        // Faction name
        $row.append(`<div class="cs-faction-name">${sanitizeText(faction)}</div>`);

        // Bar container
        const $barWrap = $('<div class="cs-faction-bar-wrap"></div>');
        const $bar = $('<div class="cs-faction-bar"></div>');

        let fillLeft, fillWidth, color;

        if (isUnipolar) {
            // Unipolar: left-to-right fill (0% = empty, 100% = full)
            const fillPct = Math.min(Math.max(score / max, 0), 1.0) * 100;
            fillLeft = 0;
            fillWidth = fillPct;
            // Inverted keys use negative color (high = bad), normal use positive
            color = isInverted ? colorNeg : colorPos;
        } else {
            // Bipolar: center-zero layout
            $bar.append('<div class="cs-faction-bar-zero"></div>');

            const absMax = Math.max(Math.abs(min), Math.abs(max));
            const fillPct = Math.min(Math.abs(score) / absMax, 1.0) * 50;

            color = score < 0 ? colorNeg : score > 0 ? colorPos : colorNeutral;

            if (score >= 0) {
                fillLeft = 50;
                fillWidth = fillPct;
            } else {
                fillLeft = 50 - fillPct;
                fillWidth = fillPct;
            }
        }

        $bar.append(`<div class="cs-faction-bar-fill" style="left: ${fillLeft}%; width: ${fillWidth}%; background: ${color}"></div>`);
        $barWrap.append($bar);
        $row.append($barWrap);

        // Score value
        const sign = !isUnipolar && score > 0 ? '+' : '';
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
