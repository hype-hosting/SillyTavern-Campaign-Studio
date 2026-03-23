/**
 * Campaign Studio — Collapse parsed blocks in chat DOM
 * Instead of stripping, we collapse the <details> elements
 * so they remain accessible but don't clutter the view.
 */

/**
 * Collapse matched <details> blocks in a rendered message element.
 * Also adds a subtle visual indicator that the data is tracked by Campaign Studio.
 *
 * @param {jQuery} $messageElement - The rendered message DOM element
 * @param {string[]} matchedSummaryTexts - Summary texts that were successfully parsed
 */
export function collapseParsedBlocks($messageElement, matchedSummaryTexts) {
    if (!$messageElement || !matchedSummaryTexts?.length) return;

    const detailsElements = $messageElement.find('details');

    detailsElements.each(function () {
        const $details = $(this);
        const $summary = $details.find('summary').first();
        if (!$summary.length) return;

        const summaryText = $summary.text().trim();

        // Check if this block's summary matches any of our parsed blocks
        const isMatched = matchedSummaryTexts.some(matchText =>
            summaryText === matchText || summaryText.includes(matchText),
        );

        if (isMatched) {
            // Ensure it's collapsed
            $details.removeAttr('open');

            // Add a CSS class for subtle styling
            $details.addClass('cs-tracked-block');

            // Add a small indicator to the summary if not already present
            if (!$summary.find('.cs-tracked-badge').length) {
                $summary.append('<span class="cs-tracked-badge" title="Tracked by Campaign Studio">⬡</span>');
            }
        }
    });
}
