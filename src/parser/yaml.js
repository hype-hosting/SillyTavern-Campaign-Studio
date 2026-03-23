/**
 * Campaign Studio — Lightweight YAML Parser
 * Handles the subset of YAML used in campaign_data blocks:
 * scalars, lists, nested objects. No anchors/aliases/multiline.
 */

/**
 * Parse a YAML string into a JavaScript object.
 * @param {string} yamlStr - Raw YAML text
 * @returns {object} Parsed data
 */
export function parseYaml(yamlStr) {
    if (!yamlStr || typeof yamlStr !== 'string') return {};

    const lines = yamlStr.split('\n');
    return parseBlock(lines, 0, 0).value;
}

/**
 * Serialize a JavaScript object to YAML string.
 * @param {*} obj - The data to serialize
 * @param {number} indent - Current indent level
 * @returns {string}
 */
export function toYaml(obj, indent = 0) {
    if (obj === null || obj === undefined) return 'null';
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
    if (typeof obj === 'string') return yamlString(obj);

    if (Array.isArray(obj)) {
        if (obj.length === 0) return '[]';
        const prefix = ' '.repeat(indent);
        return obj.map(item => {
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                const inner = toYaml(item, indent + 2);
                // Inline simple objects on first line after dash
                const firstLine = inner.split('\n')[0];
                const rest = inner.split('\n').slice(1);
                const result = `${prefix}- ${firstLine}`;
                if (rest.length > 0) {
                    return result + '\n' + rest.map(l => `${prefix}  ${l}`).join('\n');
                }
                return result;
            }
            return `${prefix}- ${toYaml(item, indent + 2)}`;
        }).join('\n');
    }

    if (typeof obj === 'object') {
        const prefix = ' '.repeat(indent);
        const entries = Object.entries(obj);
        if (entries.length === 0) return '{}';
        return entries.map(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
                return `${prefix}${key}:\n${toYaml(value, indent + 2)}`;
            }
            return `${prefix}${key}: ${toYaml(value, indent + 2)}`;
        }).join('\n');
    }

    return String(obj);
}

// --- Internal parser ---

function parseBlock(lines, startIdx, baseIndent) {
    const result = {};
    let i = startIdx;

    while (i < lines.length) {
        const line = lines[i];
        const stripped = line.replace(/\s+$/, '');

        // Skip empty lines and comments
        if (stripped === '' || stripped.trimStart().startsWith('#')) {
            i++;
            continue;
        }

        const currentIndent = getIndent(line);

        // If we've de-indented back past our block, stop
        if (currentIndent < baseIndent) break;

        // Skip lines indented deeper than expected (handled by sub-parsers)
        if (currentIndent > baseIndent) {
            i++;
            continue;
        }

        const content = stripped.trimStart();

        // List item at this level
        if (content.startsWith('- ')) {
            const key = findKeyForList(result, lines, i, baseIndent);
            if (key === null) {
                // Top-level list — return as array
                const listResult = parseList(lines, i, baseIndent);
                return { value: listResult.value, nextIdx: listResult.nextIdx };
            }
            i++;
            continue;
        }

        // Key-value pair
        const colonIdx = content.indexOf(':');
        if (colonIdx > 0) {
            const key = content.substring(0, colonIdx).trim();
            const afterColon = content.substring(colonIdx + 1).trim();

            if (afterColon === '' || afterColon === '|' || afterColon === '>') {
                // Check what follows: list or nested object?
                const nextNonEmpty = findNextNonEmpty(lines, i + 1);
                if (nextNonEmpty !== null) {
                    const nextIndent = getIndent(lines[nextNonEmpty]);
                    const nextContent = lines[nextNonEmpty].trimStart();

                    if (nextIndent > currentIndent && nextContent.startsWith('- ')) {
                        // It's a list
                        const listResult = parseList(lines, nextNonEmpty, nextIndent);
                        result[key] = listResult.value;
                        i = listResult.nextIdx;
                        continue;
                    } else if (nextIndent > currentIndent) {
                        // It's a nested object
                        const nested = parseBlock(lines, nextNonEmpty, nextIndent);
                        result[key] = nested.value;
                        i = nested.nextIdx;
                        continue;
                    }
                }
                result[key] = null;
            } else {
                result[key] = parseScalar(afterColon);
            }
        }

        i++;
    }

    return { value: result, nextIdx: i };
}

function parseList(lines, startIdx, baseIndent) {
    const items = [];
    let i = startIdx;

    while (i < lines.length) {
        const line = lines[i];
        const stripped = line.replace(/\s+$/, '');

        if (stripped === '' || stripped.trimStart().startsWith('#')) {
            i++;
            continue;
        }

        const currentIndent = getIndent(line);
        if (currentIndent < baseIndent) break;
        if (currentIndent > baseIndent) {
            i++;
            continue;
        }

        const content = stripped.trimStart();
        if (!content.startsWith('- ')) break;

        const itemContent = content.substring(2).trim();

        // Check for inline flow mapping: - {key: val, key: val}
        if (itemContent.startsWith('{') && itemContent.endsWith('}')) {
            items.push(parseFlowMapping(itemContent));
            i++;
            continue;
        }

        // Check for inline flow sequence: - [a, b, c]
        if (itemContent.startsWith('[') && itemContent.endsWith(']')) {
            items.push(parseFlowSequence(itemContent));
            i++;
            continue;
        }

        // Check if item has nested content (key: value on same line or indented block)
        const itemColonIdx = itemContent.indexOf(':');
        if (itemColonIdx > 0 && !itemContent.startsWith('"') && !itemContent.startsWith("'")) {
            // Could be an inline object: - key: val
            // Check if there are more indented lines following
            const nextNonEmpty = findNextNonEmpty(lines, i + 1);
            if (nextNonEmpty !== null && getIndent(lines[nextNonEmpty]) > currentIndent + 2) {
                // Multi-line nested object under this list item
                const obj = {};
                const key = itemContent.substring(0, itemColonIdx).trim();
                const val = itemContent.substring(itemColonIdx + 1).trim();
                obj[key] = val ? parseScalar(val) : null;

                const nested = parseBlock(lines, nextNonEmpty, currentIndent + 2);
                Object.assign(obj, nested.value);
                items.push(obj);
                i = nested.nextIdx;
                continue;
            }

            // Simple inline key-value object
            const obj = {};
            const key = itemContent.substring(0, itemColonIdx).trim();
            const val = itemContent.substring(itemColonIdx + 1).trim();
            obj[key] = val ? parseScalar(val) : null;
            items.push(obj);
            i++;
            continue;
        }

        // Simple scalar list item
        items.push(parseScalar(itemContent));
        i++;
    }

    return { value: items, nextIdx: i };
}

function parseFlowMapping(str) {
    // Parse {key: val, key: val}
    const inner = str.slice(1, -1).trim();
    if (!inner) return {};
    const result = {};
    // Simple split on commas (doesn't handle nested structures)
    const pairs = splitFlowItems(inner);
    for (const pair of pairs) {
        const colonIdx = pair.indexOf(':');
        if (colonIdx > 0) {
            const key = pair.substring(0, colonIdx).trim();
            const val = pair.substring(colonIdx + 1).trim();
            result[key] = parseScalar(val);
        }
    }
    return result;
}

function parseFlowSequence(str) {
    const inner = str.slice(1, -1).trim();
    if (!inner) return [];
    return splitFlowItems(inner).map(item => parseScalar(item.trim()));
}

function splitFlowItems(str) {
    const items = [];
    let depth = 0;
    let current = '';
    for (const ch of str) {
        if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') depth--;
        else if (ch === ',' && depth === 0) {
            items.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim()) items.push(current);
    return items;
}

function parseScalar(str) {
    if (str === '' || str === 'null' || str === '~') return null;
    if (str === 'true') return true;
    if (str === 'false') return false;

    // Quoted string
    if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
        return str.slice(1, -1);
    }

    // Number
    const num = Number(str);
    if (!isNaN(num) && str !== '') return num;

    return str;
}

function getIndent(line) {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
}

function findNextNonEmpty(lines, startIdx) {
    for (let i = startIdx; i < lines.length; i++) {
        const stripped = lines[i].replace(/\s+$/, '');
        if (stripped !== '' && !stripped.trimStart().startsWith('#')) return i;
    }
    return null;
}

function findKeyForList(resultSoFar, lines, listStartIdx, baseIndent) {
    // Look backwards to find the key that owns this list
    for (let i = listStartIdx - 1; i >= 0; i--) {
        const line = lines[i].replace(/\s+$/, '');
        if (line === '' || line.trimStart().startsWith('#')) continue;
        const indent = getIndent(lines[i]);
        if (indent < baseIndent) {
            const content = line.trimStart();
            const colonIdx = content.indexOf(':');
            if (colonIdx > 0) return content.substring(0, colonIdx).trim();
        }
        break;
    }
    return null;
}
