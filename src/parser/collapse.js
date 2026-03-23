/**
 * Campaign Studio — Collapse parsed blocks in chat DOM
 * Handles both <details> blocks and <campaign_data> XML drawers.
 */

/**
 * Collapse matched <details> blocks in a rendered message element.
 * Also adds a subtle visual indicator that the data is tracked by Campaign Studio.
 *
 * @param {jQuery} $messageElement - The rendered message DOM element
 * @param {string[]} matchedSummaryTexts - Summary texts that were successfully parsed
 */
export function collapseParsedBlocks($messageElement, matchedSummaryTexts) {
    if (!$messageElement) return;

    // Collapse <details> blocks (legacy / fallback format)
    if (matchedSummaryTexts?.length) {
        collapseDetailsBlocks($messageElement, matchedSummaryTexts);
    }

    // Collapse <campaign_data> blocks (new YAML format)
    collapseCampaignDataBlocks($messageElement);
}

/**
 * Collapse matched <details><summary> blocks.
 */
function collapseDetailsBlocks($messageElement, matchedSummaryTexts) {
    const detailsElements = $messageElement.find('details');

    detailsElements.each(function () {
        const $details = $(this);
        const $summary = $details.find('summary').first();
        if (!$summary.length) return;

        const summaryText = $summary.text().trim();

        // Match by summary text from parsed sections
        const isMatched = matchedSummaryTexts.some(matchText =>
            summaryText === matchText || summaryText.includes(matchText),
        );

        // Also match the ⬡ hexagon drawer (campaign_data wrapped in details)
        const isHexDrawer = summaryText === '⬡' || summaryText.includes('⬡');

        if (isMatched || isHexDrawer) {
            $details.removeAttr('open');
            $details.addClass('cs-tracked-block');

            if (!$summary.find('.cs-tracked-badge').length && !isHexDrawer) {
                $summary.append('<span class="cs-tracked-badge" title="Tracked by Campaign Studio">⬡</span>');
            }
        }
    });
}

/**
 * Collapse <campaign_data> blocks in the rendered message.
 * These may appear as raw text or within pre/code blocks depending
 * on how SillyTavern renders unrecognized XML tags.
 */
function collapseCampaignDataBlocks($messageElement) {
    const messageHtml = $messageElement.html();
    if (!messageHtml || !messageHtml.includes('campaign_data')) return;

    // Strategy 1: If rendered as actual DOM elements, hide them
    $messageElement.find('campaign_data').each(function () {
        const $el = $(this);
        if (!$el.hasClass('cs-campaign-data-collapsed')) {
            $el.addClass('cs-campaign-data-collapsed');
            $el.before(
                '<span class="cs-tracked-badge cs-campaign-data-badge" title="Campaign data (tracked by Campaign Studio)">⬡ Campaign Data</span>',
            );
        }
    });

    // Strategy 2: If rendered as escaped text, wrap and hide the raw text
    // This handles the case where <campaign_data> is escaped to &lt;campaign_data&gt;
    const raw = $messageElement.html();
    const pattern = /&lt;campaign_data(?:\s+type\s*=\s*"[^"]*")?\s*&gt;[\s\S]*?&lt;\/campaign_data&gt;/gi;

    if (pattern.test(raw)) {
        const replaced = raw.replace(pattern, (match) => {
            return `<span class="cs-campaign-data-collapsed" title="Campaign data (tracked by Campaign Studio)"><span class="cs-tracked-badge cs-campaign-data-badge">⬡ Campaign Data</span><span class="cs-campaign-data-raw">${match}</span></span>`;
        });
        $messageElement.html(replaced);
    }
}
