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
 * @param {object[]|null} previousItems - Previous items for delta indicators
 */
export function renderInventory(items, sectionConfig, $container, previousItems = null) {
    $container.empty();

    if (!items || items.length === 0) {
        $container.html('<div class="cs-empty-section">No items tracked</div>');
        return;
    }

    // Compute delta sets
    const prevNames = new Set(previousItems?.map(i => i.name) || []);
    const currNames = new Set(items.map(i => i.name));
    const addedNames = new Set([...currNames].filter(n => !prevNames.has(n)));
    const removedNames = [...prevNames].filter(n => !currNames.has(n));

    const $list = $('<div class="cs-inventory-list"></div>');

    // Show removed items briefly (struck-through)
    if (previousItems) {
        for (const name of removedNames) {
            const $removed = $(`<div class="cs-inventory-item cs-item-removed"></div>`);
            $removed.append(`<span class="cs-item-name">${sanitizeText(name)}</span>`);
            $removed.append('<span class="cs-delta-badge cs-delta-negative">removed</span>');
            $list.append($removed);
        }
    }

    for (const item of items) {
        const isNew = addedNames.has(item.name);
        const $item = $(`<div class="cs-inventory-item${isNew ? ' cs-item-new' : ''}"></div>`);

        // Item name
        const $name = $(`<span class="cs-item-name">${sanitizeText(item.name)}</span>`);
        $item.append($name);

        // New indicator
        if (isNew) {
            $item.append('<span class="cs-delta-badge cs-delta-positive">new</span>');
        }

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
