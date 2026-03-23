/**
 * Campaign Studio — World State Renderer
 * Renders key-value world data with specialized sub-renderers
 * for weather, path breadcrumbs, NPC pills, diary quotes, etc.
 * Uses a 2-column grid for compact entries, full-width for longer ones.
 */

import { sanitizeText } from '../../utils/sanitize.js';

/**
 * Renderers that produce short, single-line output (suitable for compact grid).
 */
const COMPACT_RENDERERS = new Set(['text', 'numeric-badge']);

/**
 * Renderers that always need full width.
 */
const WIDE_RENDERERS = new Set(['breadcrumb', 'character-pills', 'quote-block', 'text-atmosphere']);

/**
 * Simple hash function for generating avatar colors from names.
 */
function hashColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 45%)`;
}

/**
 * Render world/key-value data into a container.
 * @param {object} data - Key-value map
 * @param {object} sectionConfig - Section configuration from preset
 * @param {jQuery} $container - Target container
 */
export function renderWorld(data, sectionConfig, $container) {
    $container.empty();

    if (!data || Object.keys(data).length === 0) {
        $container.html('<div class="cs-empty-section">No world data tracked</div>');
        return;
    }

    const $list = $('<div class="cs-world-list"></div>');
    const fields = sectionConfig.fields || {};

    for (const [key, value] of Object.entries(data)) {
        if (!value || value === 'n/a') continue;

        const fieldConfig = fields[key] || {};
        const renderer = fieldConfig.renderer || 'text';

        // Determine if this entry is compact (fits in grid) or wide (full-width)
        const isCompact = COMPACT_RENDERERS.has(renderer) && String(value).length < 30;
        const isWide = WIDE_RENDERERS.has(renderer) || String(value).length >= 50;

        const entryClass = isWide ? 'cs-world-entry cs-world-wide' :
            isCompact ? 'cs-world-entry cs-world-compact' :
                'cs-world-entry cs-world-inline';

        const $entry = $(`<div class="${entryClass}"></div>`);
        $entry.append(`<div class="cs-world-key">${sanitizeText(key)}</div>`);

        const $value = $('<div class="cs-world-value"></div>');

        switch (renderer) {
        case 'breadcrumb':
            renderBreadcrumb($value, value, fieldConfig.separator || '→');
            break;
        case 'character-pills':
            renderCharacterPills($value, value, fieldConfig.separator || ',');
            break;
        case 'quote-block':
            renderQuoteBlock($value, value);
            break;
        case 'numeric-badge':
            renderNumericBadge($value, value);
            break;
        case 'text-atmosphere':
            renderAtmosphere($value, value);
            break;
        default:
            $value.text(value);
            break;
        }

        $entry.append($value);
        $list.append($entry);
    }

    $container.append($list);
}

function renderBreadcrumb($container, value, separator) {
    const parts = value.split(separator).map(p => p.trim()).filter(Boolean);
    const $trail = $('<div class="cs-breadcrumb-trail"></div>');

    parts.forEach((part, idx) => {
        const isLast = idx === parts.length - 1;
        const $crumb = $(`<span class="cs-breadcrumb ${isLast ? 'cs-breadcrumb-active' : ''}">${sanitizeText(part)}</span>`);
        $trail.append($crumb);

        if (!isLast) {
            $trail.append(`<span class="cs-breadcrumb-sep">${sanitizeText(separator)}</span>`);
        }
    });

    $container.append($trail);
}

function renderCharacterPills($container, value, separator) {
    const characters = value.split(separator).map(c => c.trim()).filter(Boolean);
    const $pills = $('<div class="cs-character-pills"></div>');

    for (const character of characters) {
        const initial = character.charAt(0).toUpperCase();
        const bgColor = hashColor(character);
        const $pill = $(`<span class="cs-character-pill"></span>`);
        $pill.append(`<span class="cs-character-initial" style="background: ${bgColor}">${sanitizeText(initial)}</span>`);
        $pill.append(sanitizeText(character));
        $pills.append($pill);
    }

    $container.append($pills);
}

function renderQuoteBlock($container, value) {
    $container.append(`<blockquote class="cs-diary-quote">${sanitizeText(value)}</blockquote>`);
}

function renderNumericBadge($container, value) {
    const num = parseFloat(value);
    const isPositive = !isNaN(num) && num > 0;
    const isNegative = !isNaN(num) && num < 0;
    const cls = isPositive ? 'cs-badge-positive' : isNegative ? 'cs-badge-negative' : 'cs-badge-neutral';
    $container.append(`<span class="cs-numeric-badge ${cls}">${sanitizeText(value)}</span>`);
}

function renderAtmosphere($container, value) {
    $container.append(`<div class="cs-atmosphere-text">${sanitizeText(value)}</div>`);
}
