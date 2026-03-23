/**
 * Campaign Studio — Inventory Renderer
 * Renders item lists with tags, currency, and state indicators.
 */

import { sanitizeText } from '../../utils/sanitize.js';

/**
 * Render inventory data into a container.
 * @param {object[]} items - Array of { name, tags, quantity, note }
 * @param {object} sectionConfig - Section configuration from preset
 * @param {jQuery} $container - Target container
 */
export function renderInventory(items, sectionConfig, $container) {
    $container.empty();

    if (!items || items.length === 0) {
        $container.html('<div class="cs-empty-section">No items tracked</div>');
        return;
    }

    const $list = $('<div class="cs-inventory-list"></div>');

    for (const item of items) {
        const $item = $('<div class="cs-inventory-item cs-card"></div>');

        // Item name
        const $name = $(`<span class="cs-item-name">${sanitizeText(item.name)}</span>`);
        $item.append($name);

        // Tags as pills
        if (item.tags?.length) {
            const $tags = $('<span class="cs-item-tags"></span>');
            for (const tag of item.tags) {
                $tags.append(`<span class="cs-tag">${sanitizeText(tag)}</span>`);
            }
            $item.append($tags);
        }

        // Currency / note
        if (item.note) {
            $item.append(`<span class="cs-item-note">${sanitizeText(item.note)}</span>`);
        }

        // Quantity badge (only if > 1)
        if (item.quantity > 1) {
            $item.append(`<span class="cs-item-qty">×${item.quantity}</span>`);
        }

        $list.append($item);
    }

    $container.append($list);
}
