/**
 * Campaign Studio — Dice Roller
 * Parses dN+M notation, rolls dice with animation, displays results.
 */

const rollHistory = [];

/**
 * Initialize dice roller UI event listeners.
 */
export function initDice() {
    // Preset dice buttons
    $(document).on('click', '.cs-dice-preset', function () {
        const dice = $(this).data('dice');
        rollFromNotation(`1${dice}`);
    });

    // Custom roll button
    $('#cs-dice-roll-btn').on('click', () => {
        const input = $('#cs-dice-input').val().trim();
        if (input) rollFromNotation(input);
    });

    // Enter key on input
    $('#cs-dice-input').on('keydown', (e) => {
        if (e.key === 'Enter') {
            const input = $(e.target).val().trim();
            if (input) rollFromNotation(input);
        }
    });

    // Toggle dice overlay
    $('#cs-dice-trigger').on('click', () => {
        $('#cs-dice-overlay').toggleClass('cs-hidden');
    });

    // Close dice overlay
    $(document).on('click', '.cs-dice-close', () => {
        $('#cs-dice-overlay').addClass('cs-hidden');
    });
}

/**
 * Parse dice notation like "2d6+3", "1d20", "3d8-1".
 * @param {string} notation
 * @returns {{ count: number, sides: number, modifier: number } | null}
 */
export function parseDiceNotation(notation) {
    const match = notation.trim().match(/^(\d*)d(\d+)\s*([+-]\s*\d+)?$/i);
    if (!match) return null;

    return {
        count: parseInt(match[1] || '1', 10),
        sides: parseInt(match[2], 10),
        modifier: match[3] ? parseInt(match[3].replace(/\s/g, ''), 10) : 0,
    };
}

/**
 * Roll dice from a notation string and display the result.
 */
export function rollFromNotation(notation) {
    const parsed = parseDiceNotation(notation);
    if (!parsed) {
        showResult('?', `Invalid: ${notation}`);
        return null;
    }

    const { count, sides, modifier } = parsed;
    const rolls = [];
    let total = 0;

    for (let i = 0; i < count; i++) {
        const roll = Math.floor(Math.random() * sides) + 1;
        rolls.push(roll);
        total += roll;
    }

    total += modifier;

    const modStr = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : '';
    const detail = count > 1
        ? `[${rolls.join(', ')}]${modStr}`
        : modStr ? `${rolls[0]}${modStr}` : '';

    // Animate result
    animateResult(total, notation, detail);

    // Record in history
    const entry = { notation, rolls, modifier, total, timestamp: Date.now() };
    rollHistory.unshift(entry);
    if (rollHistory.length > 20) rollHistory.pop();
    updateHistory();

    return entry;
}

function animateResult(total, notation, detail) {
    const $result = $('#cs-dice-result .cs-dice-result-value');

    // Quick random flash animation
    let flashes = 0;
    const maxFlashes = 8;
    const interval = setInterval(() => {
        const fake = Math.floor(Math.random() * 100) + 1;
        $result.text(fake);
        flashes++;
        if (flashes >= maxFlashes) {
            clearInterval(interval);
            showResult(total, detail);
        }
    }, 60);
}

function showResult(total, detail) {
    const $result = $('#cs-dice-result .cs-dice-result-value');
    $result.text(total);

    // Trigger highlight animation
    $result.removeClass('cs-changed');
    void $result[0]?.offsetWidth; // Force reflow
    $result.addClass('cs-changed');
}

function updateHistory() {
    const $history = $('#cs-dice-history');
    $history.empty();

    for (const entry of rollHistory.slice(0, 10)) {
        const modStr = entry.modifier > 0 ? `+${entry.modifier}` : entry.modifier < 0 ? `${entry.modifier}` : '';
        const rollStr = entry.rolls.length > 1 ? `[${entry.rolls.join(',')}]${modStr}` : '';
        $history.append(`
            <div class="cs-dice-history-entry">
                ${entry.notation} → <strong>${entry.total}</strong> ${rollStr}
            </div>
        `);
    }
}

export function destroyDice() {
    $(document).off('click', '.cs-dice-preset');
    $(document).off('click', '.cs-dice-close');
    $('#cs-dice-roll-btn').off('click');
    $('#cs-dice-input').off('keydown');
    $('#cs-dice-trigger').off('click');
}
