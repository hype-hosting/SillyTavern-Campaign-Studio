/**
 * Campaign Studio — State diffing utility
 * Detects changes between state snapshots for animations and delta indicators.
 */

/**
 * Compare two data objects and return a diff.
 * @param {*} previous
 * @param {*} current
 * @returns {{ changed: boolean, added: string[], removed: string[], modified: string[] }}
 */
export function diffData(previous, current) {
    const result = { changed: false, added: [], removed: [], modified: [] };

    if (!previous && !current) return result;
    if (!previous) {
        result.changed = true;
        if (typeof current === 'object' && !Array.isArray(current)) {
            result.added = Object.keys(current);
        }
        return result;
    }
    if (!current) {
        result.changed = true;
        if (typeof previous === 'object' && !Array.isArray(previous)) {
            result.removed = Object.keys(previous);
        }
        return result;
    }

    // Array comparison (for inventory items)
    if (Array.isArray(previous) && Array.isArray(current)) {
        const prevNames = new Set(previous.map(i => i.name));
        const currNames = new Set(current.map(i => i.name));

        for (const name of currNames) {
            if (!prevNames.has(name)) {
                result.added.push(name);
                result.changed = true;
            }
        }
        for (const name of prevNames) {
            if (!currNames.has(name)) {
                result.removed.push(name);
                result.changed = true;
            }
        }
        // Check for modifications in shared items
        for (const currItem of current) {
            const prevItem = previous.find(i => i.name === currItem.name);
            if (prevItem && JSON.stringify(prevItem) !== JSON.stringify(currItem)) {
                result.modified.push(currItem.name);
                result.changed = true;
            }
        }
        return result;
    }

    // Object comparison (for key-value and numeric data)
    if (typeof previous === 'object' && typeof current === 'object') {
        const allKeys = new Set([...Object.keys(previous), ...Object.keys(current)]);
        for (const key of allKeys) {
            if (!(key in previous)) {
                result.added.push(key);
                result.changed = true;
            } else if (!(key in current)) {
                result.removed.push(key);
                result.changed = true;
            } else if (JSON.stringify(previous[key]) !== JSON.stringify(current[key])) {
                result.modified.push(key);
                result.changed = true;
            }
        }
        return result;
    }

    if (previous !== current) {
        result.changed = true;
    }
    return result;
}
