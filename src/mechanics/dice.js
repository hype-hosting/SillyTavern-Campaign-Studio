/**
 * Campaign Studio — Dice Roller
 * Parses dN+M notation, rolls dice with animation, displays results.
 */

import { LIMITS, ANIMATION } from '../core/config.js';

const rollHistory = [];
const pendingRolls = [];
let activeAnimationInterval = null;

/**
 * Consume and clear all pending dice rolls (for injection into AI context).
 * @returns {Array<{ notation: string, rolls: number[], modifier: number, total: number, context: string|null, timestamp: number }>}
 */
export function consumePendingRolls() {
    const rolls = [...pendingRolls];
    pendingRolls.length = 0;
    return rolls;
}

/**
 * Get pending rolls without clearing them.
 * @returns {Array}
 */
export function getPendingRolls() {
    return [...pendingRolls];
}

/**
 * Initialize dice roller UI event listeners.
 */
export function initDice() {
    // Preset dice buttons
    $(document).on('click', '.cs-dice-preset', function () {
        const dice = $(this).data('dice');
        const context = $('#cs-dice-context').val().trim() || null;
        rollFromNotation(`1${dice}`, context);
    });

    // Custom roll button
    $('#cs-dice-roll-btn').on('click', () => {
        const input = $('#cs-dice-input').val().trim();
        const context = $('#cs-dice-context').val().trim() || null;
        if (input) rollFromNotation(input, context);
    });

    // Enter key on input
    $('#cs-dice-input').on('keydown', (e) => {
        if (e.key === 'Enter') {
            const input = $(e.target).val().trim();
            const context = $('#cs-dice-context').val().trim() || null;
            if (input) rollFromNotation(input, context);
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

    const count = parseInt(match[1] || '1', 10);
    const sides = parseInt(match[2], 10);
    if (count < 1 || sides < 1) return null;

    return {
        count,
        sides,
        modifier: match[3] ? parseInt(match[3].replace(/\s/g, ''), 10) : 0,
    };
}

/**
 * Roll dice from a notation string and display the result.
 * @param {string} notation - Dice notation like "2d6+3"
 * @param {string|null} rollContext - Optional context label (e.g., "Perception check")
 */
export function rollFromNotation(notation, rollContext = null) {
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

    // Record in history and pending queue
    const entry = { notation, rolls, modifier, total, context: rollContext, timestamp: Date.now() };
    rollHistory.unshift(entry);
    if (rollHistory.length > LIMITS.ROLL_HISTORY_MAX) rollHistory.pop();
    pendingRolls.push(entry);
    updateHistory();

    return entry;
}

function animateResult(total, notation, detail) {
    const $result = $('#cs-dice-result .cs-dice-result-value');

    // Clear any in-progress animation
    if (activeAnimationInterval) {
        clearInterval(activeAnimationInterval);
    }

    // Quick random flash animation
    let flashes = 0;
    activeAnimationInterval = setInterval(() => {
        const fake = Math.floor(Math.random() * 100) + 1;
        $result.text(fake);
        flashes++;
        if (flashes >= ANIMATION.DICE_FLASH_COUNT) {
            clearInterval(activeAnimationInterval);
            activeAnimationInterval = null;
            showResult(total, detail);
        }
    }, ANIMATION.DICE_FLASH_INTERVAL_MS);
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
    if (activeAnimationInterval) {
        clearInterval(activeAnimationInterval);
        activeAnimationInterval = null;
    }
    $(document).off('click', '.cs-dice-preset');
    $(document).off('click', '.cs-dice-close');
    $('#cs-dice-roll-btn').off('click');
    $('#cs-dice-input').off('keydown');
    $('#cs-dice-trigger').off('click');
}
