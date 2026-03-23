/**
 * Campaign Studio — HTML sanitization
 */

/**
 * Sanitize text content to prevent XSS when inserting into DOM.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeText(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/**
 * Strip HTML tags from a string.
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || '';
}
