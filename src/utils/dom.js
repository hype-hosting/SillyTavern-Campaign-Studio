/**
 * Campaign Studio — DOM utilities
 */

import { CSS_PREFIX, EXTENSION_PATH } from '../core/config.js';

/**
 * Create a namespaced jQuery element.
 * @param {string} tag - HTML tag
 * @param {string} className - Class name (without cs- prefix)
 * @param {object} [attrs] - Additional attributes
 * @returns {jQuery}
 */
export function csEl(tag, className, attrs = {}) {
    const $el = $(`<${tag}>`);
    if (className) {
        $el.addClass(`${CSS_PREFIX}-${className}`);
    }
    for (const [key, value] of Object.entries(attrs)) {
        $el.attr(key, value);
    }
    return $el;
}

/**
 * Load an HTML template file and inject it into the DOM.
 * @param {string} templateFile - Filename relative to extension root
 * @param {string|jQuery} target - CSS selector or jQuery element to inject into
 * @returns {Promise<jQuery>}
 */
export async function loadTemplate(templateFile, target) {
    const response = await fetch(`/${EXTENSION_PATH}/${templateFile}`);
    if (!response.ok) {
        throw new Error(`Failed to load template: ${templateFile}`);
    }
    const html = await response.text();
    const $target = typeof target === 'string' ? $(target) : target;
    $target.append(html);
    return $target;
}
