/**
 * Campaign Studio — Preset Editor
 * Full-screen modal for creating and editing presets with a visual field mapper.
 */

import { validatePreset } from '../presets/schema.js';
import { saveCustomPreset, isBuiltinPreset } from '../presets/manager.js';
import { extractCampaignData } from '../parser/extractor.js';
import { parseStatBlock, parseKeyValue } from '../parser/adapters.js';
import { renderInventory } from './renderers/inventory.js';
import { renderWorld } from './renderers/world.js';
import { renderFactions } from './renderers/factions.js';
import { sanitizeText } from '../utils/sanitize.js';
import { loadTemplate } from '../utils/dom.js';

const SECTION_ICONS = {
    backpack: '\u{1F392}', globe: '\u{1F30D}', shield: '\u{1F6E1}',
    scroll: '\u{1F4DC}', clock: '\u23F1', map: '\u{1F5FA}', default: '\u25C6',
};

const RENDERERS = [
    { value: 'text', label: 'text' },
    { value: 'text-atmosphere', label: 'text-atmosphere' },
    { value: 'breadcrumb', label: 'breadcrumb' },
    { value: 'character-pills', label: 'character-pills' },
    { value: 'quote-block', label: 'quote-block' },
    { value: 'numeric-badge', label: 'numeric-badge' },
];

// ── State ──────────────────────────────────────────────────────

let workingPreset = null;      // The preset being edited (deep clone)
let selectedSectionId = null;  // Currently selected section for detail editing
let selectedRuleId = null;     // Currently selected rule for detail editing
let detectedFields = [];       // Fields found by the mapper
let isOpen = false;
let $overlay = null;
let onSaveCallback = null;

// ── Public API ─────────────────────────────────────────────────

/**
 * Open the preset editor modal.
 * @param {object|null} preset - Preset to edit, or null for blank
 * @param {{ clone?: boolean, onSave?: Function }} options
 */
export async function openPresetEditor(preset, options = {}) {
    if (isOpen) return;

    // Load template if not yet in DOM
    $overlay = $('#cs-editor-overlay');
    if (!$overlay.length) {
        await loadTemplate('preset-editor.html', $('body'));
        $overlay = $('#cs-editor-overlay');
        wireGlobalEvents();
    }

    // Build working copy
    if (preset && options.clone) {
        workingPreset = clonePresetForEdit(preset);
    } else if (preset) {
        workingPreset = JSON.parse(JSON.stringify(preset));
    } else {
        workingPreset = createBlankPreset();
    }

    onSaveCallback = options.onSave || null;
    selectedSectionId = null;
    selectedRuleId = null;
    detectedFields = [];

    populateEditor();
    $overlay.removeClass('cs-hidden');
    isOpen = true;
}

/**
 * Close the editor modal.
 */
export function closePresetEditor() {
    if (!isOpen) return;
    $overlay.addClass('cs-hidden');
    isOpen = false;
    workingPreset = null;
    selectedSectionId = null;
    selectedRuleId = null;
    detectedFields = [];
    onSaveCallback = null;
}

// ── Initialization ─────────────────────────────────────────────

function wireGlobalEvents() {
    // Close on backdrop click
    $overlay.on('click', function (e) {
        if (e.target === this) closePresetEditor();
    });

    // Close on Escape
    $(document).on('keydown.csEditor', (e) => {
        if (e.key === 'Escape' && isOpen) closePresetEditor();
    });

    // Header buttons
    $('#cs-editor-back').on('click', () => closePresetEditor());
    $('#cs-editor-save').on('click', () => savePreset());
    $('#cs-editor-export').on('click', () => exportPresetJSON());

    // Add section
    $('#cs-editor-add-section').on('click', () => addSection());

    // Add field
    $('#cs-editor-add-field').on('click', () => addField());

    // Parse button
    $('#cs-editor-parse-btn').on('click', () => parsePreviewInput());

    // Section detail: type change shows/hides fields editor
    $('#cs-editor-sec-type').on('change', function () {
        syncSectionFromForm();
        const type = $(this).val();
        $('#cs-editor-fields-section').toggleClass('cs-hidden', type !== 'key-value');
        $('#cs-editor-display-section').toggleClass('cs-hidden', type !== 'numeric-bars');
    });

    // Section detail: auto-sync changes to working preset
    $('#cs-editor-sec-id, #cs-editor-sec-match, #cs-editor-sec-matchmode, #cs-editor-sec-type, #cs-editor-sec-icon, #cs-editor-sec-format')
        .on('change input', () => syncSectionFromForm());

    // Display config sync
    $('#cs-editor-display-positive, #cs-editor-display-negative, #cs-editor-display-neutral, #cs-editor-display-delta, #cs-editor-display-range-min, #cs-editor-display-range-max, #cs-editor-display-inverted')
        .on('change', () => syncSectionFromForm());

    // Preset metadata sync
    $('#cs-editor-name').on('input', function () {
        workingPreset.name = $(this).val();
        $('#cs-editor-title').text(`Editing: ${workingPreset.name || 'Untitled'}`);
    });
    $('#cs-editor-description').on('input', function () {
        workingPreset.description = $(this).val();
    });
    $('#cs-editor-marker').on('input', function () {
        workingPreset.marker = workingPreset.marker || { type: 'details-summary' };
        workingPreset.marker.prefix = $(this).val();
    });
    $('#cs-editor-accent').on('change', function () {
        workingPreset.theme = workingPreset.theme || {};
        workingPreset.theme.accentColor = $(this).val();
    });

    // Rule CRUD
    $('#cs-editor-add-rule').on('click', () => addRule());
    $('#cs-editor-rule-id, #cs-editor-rule-name, #cs-editor-rule-icon, #cs-editor-rule-enabled, #cs-editor-rule-content')
        .on('change input', () => syncRuleFromForm());

    // Injection config sync
    $('#cs-editor-injection-prompt').on('input', function () {
        workingPreset.injection = workingPreset.injection || {};
        workingPreset.injection.systemPrompt = $(this).val();
    });
    $('#cs-editor-injection-schema').on('change', function () {
        workingPreset.injection = workingPreset.injection || {};
        workingPreset.injection.includeSchema = $(this).prop('checked');
    });
    $('#cs-editor-injection-state').on('change', function () {
        workingPreset.injection = workingPreset.injection || {};
        workingPreset.injection.includeCurrentState = $(this).prop('checked');
    });
    $('#cs-editor-injection-depth').on('change', function () {
        workingPreset.injection = workingPreset.injection || {};
        workingPreset.injection.stateDepth = parseInt($(this).val(), 10) || 1;
    });
}

// ── Populate / Render ──────────────────────────────────────────

function populateEditor() {
    const p = workingPreset;
    $('#cs-editor-title').text(`Editing: ${p.name || 'Untitled'}`);
    $('#cs-editor-name').val(p.name || '');
    $('#cs-editor-description').val(p.description || '');
    $('#cs-editor-marker').val(p.marker?.prefix || '');
    $('#cs-editor-accent').val(p.theme?.accentColor || '#7c6bde');

    renderSectionList();
    renderRuleList();
    hideDetail();
    hideRuleDetail();
    hideErrors();
    clearMapper();

    // Populate injection config
    const inj = p.injection || {};
    $('#cs-editor-injection-prompt').val(inj.systemPrompt || '');
    $('#cs-editor-injection-schema').prop('checked', inj.includeSchema !== false);
    $('#cs-editor-injection-state').prop('checked', inj.includeCurrentState !== false);
    $('#cs-editor-injection-depth').val(inj.stateDepth ?? 1);
}

function renderSectionList() {
    const $list = $('#cs-editor-section-list');
    $list.empty();

    for (let i = 0; i < workingPreset.sections.length; i++) {
        const section = workingPreset.sections[i];
        const icon = SECTION_ICONS[section.icon] || SECTION_ICONS.default;
        const isActive = section.id === selectedSectionId;

        const $card = $('<div>')
            .addClass('cs-editor-section-card')
            .toggleClass('cs-active', isActive)
            .attr('data-section-id', section.id);

        const $icon = $('<span>').addClass('cs-editor-section-icon').text(icon);
        const $info = $('<div>').addClass('cs-editor-section-info');
        $info.append(
            $('<div>').addClass('cs-editor-section-name').text(section.match || section.id),
            $('<div>').addClass('cs-editor-section-meta').text(`${section.type} \u00B7 ${section.matchMode || 'contains'}`),
        );

        const $actions = $('<div>').addClass('cs-editor-section-actions');
        if (i > 0) {
            $actions.append(
                $('<button>').addClass('cs-editor-section-btn').text('\u25B2').attr('title', 'Move up')
                    .on('click', (e) => { e.stopPropagation(); moveSection(i, -1); }),
            );
        }
        if (i < workingPreset.sections.length - 1) {
            $actions.append(
                $('<button>').addClass('cs-editor-section-btn').text('\u25BC').attr('title', 'Move down')
                    .on('click', (e) => { e.stopPropagation(); moveSection(i, 1); }),
            );
        }
        $actions.append(
            $('<button>').addClass('cs-editor-section-btn cs-danger').text('\u2715').attr('title', 'Remove')
                .on('click', (e) => { e.stopPropagation(); removeSection(i); }),
        );

        $card.append($icon, $info, $actions);
        $card.on('click', () => selectSection(section.id));
        $list.append($card);
    }
}

function selectSection(sectionId) {
    selectedSectionId = sectionId;
    hideRuleDetail(); // Mutual exclusion: only one detail panel at a time
    const section = workingPreset.sections.find(s => s.id === sectionId);
    if (!section) return;

    // Highlight in list
    $('.cs-editor-section-card').removeClass('cs-active');
    $(`.cs-editor-section-card[data-section-id="${sectionId}"]`).addClass('cs-active');

    // Populate detail form
    $('#cs-editor-detail').removeClass('cs-hidden');
    $('#cs-editor-detail-title').text(`Editing: ${section.match || section.id}`);
    $('#cs-editor-sec-id').val(section.id);
    $('#cs-editor-sec-match').val(section.match || '');
    $('#cs-editor-sec-matchmode').val(section.matchMode || 'contains');
    $('#cs-editor-sec-type').val(section.type || 'key-value');
    $('#cs-editor-sec-icon').val(section.icon || 'backpack');
    $('#cs-editor-sec-format').val(section.parse?.format || 'key-value');

    // Show/hide type-specific sections
    $('#cs-editor-fields-section').toggleClass('cs-hidden', section.type !== 'key-value');
    $('#cs-editor-display-section').toggleClass('cs-hidden', section.type !== 'numeric-bars');

    // Display config
    if (section.display) {
        $('#cs-editor-display-positive').val(section.display.colorPositive || '#7c6bde');
        $('#cs-editor-display-negative').val(section.display.colorNegative || '#e05555');
        $('#cs-editor-display-neutral').val(section.display.colorNeutral || '#666666');
        $('#cs-editor-display-delta').prop('checked', section.display.showDelta !== false);
        $('#cs-editor-display-inverted').val((section.display.invertedKeys || []).join(', '));
    } else {
        $('#cs-editor-display-neutral').val('#666666');
        $('#cs-editor-display-delta').prop('checked', true);
        $('#cs-editor-display-inverted').val('');
    }
    // Range config
    const range = section.parse?.range || [-1.0, 1.0];
    $('#cs-editor-display-range-min').val(range[0]);
    $('#cs-editor-display-range-max').val(range[1]);

    // Render fields
    renderFieldEditor(section);
}

function renderFieldEditor(section) {
    const $list = $('#cs-editor-field-list');
    $list.empty();

    const fields = section.fields || {};
    for (const [fieldName, config] of Object.entries(fields)) {
        $list.append(createFieldRow(fieldName, config));
    }
}

function createFieldRow(fieldName, config) {
    const $row = $('<div>').addClass('cs-editor-field-row');

    const $name = $('<div>').addClass('cs-editor-field-name');
    const $nameInput = $('<input>').attr('type', 'text').val(fieldName)
        .on('change', function () {
            renameField(fieldName, $(this).val());
        });
    $name.append($nameInput);

    const $renderer = $('<div>').addClass('cs-editor-field-renderer');
    const $select = $('<select>');
    for (const r of RENDERERS) {
        $select.append($('<option>').val(r.value).text(r.label));
    }
    $select.val(config.renderer || 'text');

    // Separator input (shown for breadcrumb and character-pills)
    const needsSeparator = ['breadcrumb', 'character-pills'].includes(config.renderer);
    const $sep = $('<div>').addClass('cs-editor-field-separator').toggleClass('cs-hidden', !needsSeparator);
    const $sepInput = $('<input>').attr({ type: 'text', placeholder: '\u2192', title: 'Separator' })
        .val(config.separator || '')
        .on('change', function () {
            updateFieldSeparator(fieldName, $(this).val());
        });
    $sep.append($sepInput);

    $select.on('change', function () {
        const renderer = $(this).val();
        updateFieldRenderer(fieldName, renderer);
        $sep.toggleClass('cs-hidden', !['breadcrumb', 'character-pills'].includes(renderer));
    });
    $renderer.append($select);

    const $remove = $('<button>').addClass('cs-editor-field-remove').text('\u2715')
        .on('click', () => removeField(fieldName));

    $row.append($name, $renderer, $sep, $remove);
    return $row;
}

function hideDetail() {
    $('#cs-editor-detail').addClass('cs-hidden');
    selectedSectionId = null;
}

// ── Section CRUD ───────────────────────────────────────────────

function addSection() {
    const idx = workingPreset.sections.length + 1;
    const newSection = {
        id: `section-${idx}`,
        match: `Section ${idx}`,
        matchMode: 'contains',
        type: 'key-value',
        icon: 'globe',
        parse: { format: 'key-value', separator: ':' },
        fields: {},
    };
    workingPreset.sections.push(newSection);
    renderSectionList();
    selectSection(newSection.id);
}

function removeSection(index) {
    const removed = workingPreset.sections[index];
    workingPreset.sections.splice(index, 1);
    if (selectedSectionId === removed.id) hideDetail();
    renderSectionList();
}

function moveSection(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= workingPreset.sections.length) return;
    const sections = workingPreset.sections;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    renderSectionList();
}

// ── Rule CRUD ──────────────────────────────────────────────────

function renderRuleList() {
    const $list = $('#cs-editor-rule-list');
    $list.empty();

    const rules = workingPreset.rules || [];
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const isActive = rule.id === selectedRuleId;

        const $card = $('<div>')
            .addClass('cs-editor-rule-card')
            .toggleClass('cs-active', isActive)
            .attr('data-rule-id', rule.id);

        const $icon = $('<span>').addClass('cs-editor-rule-icon').text(rule.icon || '\u25C6');
        const $info = $('<div>').addClass('cs-editor-rule-info');
        $info.append(
            $('<div>').addClass('cs-editor-rule-name').text(rule.name || rule.id),
        );

        const enabledClass = rule.enabled !== false ? 'cs-enabled' : 'cs-disabled';
        const enabledText = rule.enabled !== false ? 'on' : 'off';
        const $badge = $('<span>').addClass(`cs-editor-rule-enabled-badge ${enabledClass}`).text(enabledText);

        const $actions = $('<div>').addClass('cs-editor-section-actions');
        if (i > 0) {
            $actions.append(
                $('<button>').addClass('cs-editor-section-btn').text('\u25B2').attr('title', 'Move up')
                    .on('click', (e) => { e.stopPropagation(); moveRule(i, -1); }),
            );
        }
        if (i < rules.length - 1) {
            $actions.append(
                $('<button>').addClass('cs-editor-section-btn').text('\u25BC').attr('title', 'Move down')
                    .on('click', (e) => { e.stopPropagation(); moveRule(i, 1); }),
            );
        }
        $actions.append(
            $('<button>').addClass('cs-editor-section-btn cs-danger').text('\u2715').attr('title', 'Remove')
                .on('click', (e) => { e.stopPropagation(); removeRule(i); }),
        );

        $card.append($icon, $info, $badge, $actions);
        $card.on('click', () => selectRule(rule.id));
        $list.append($card);
    }
}

function selectRule(ruleId) {
    selectedRuleId = ruleId;
    hideDetail(); // Mutual exclusion: hide section detail
    const rules = workingPreset.rules || [];
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;

    // Highlight in list
    $('.cs-editor-rule-card').removeClass('cs-active');
    $(`.cs-editor-rule-card[data-rule-id="${ruleId}"]`).addClass('cs-active');

    // Populate rule detail form
    $('#cs-editor-rule-detail').removeClass('cs-hidden');
    $('#cs-editor-rule-detail-title').text(`Editing: ${rule.name || rule.id}`);
    $('#cs-editor-rule-id').val(rule.id);
    $('#cs-editor-rule-icon').val(rule.icon || '');
    $('#cs-editor-rule-name').val(rule.name || '');
    $('#cs-editor-rule-enabled').prop('checked', rule.enabled !== false);
    $('#cs-editor-rule-content').val(rule.content || '');
}

function syncRuleFromForm() {
    const rules = workingPreset.rules || [];
    const rule = rules.find(r => r.id === selectedRuleId);
    if (!rule) return;

    const newId = $('#cs-editor-rule-id').val().trim();
    if (newId && newId !== rule.id) {
        selectedRuleId = newId;
        rule.id = newId;
    }

    rule.name = $('#cs-editor-rule-name').val().trim();
    rule.icon = $('#cs-editor-rule-icon').val().trim();
    rule.enabled = $('#cs-editor-rule-enabled').prop('checked');
    rule.content = $('#cs-editor-rule-content').val();

    renderRuleList();
}

function addRule() {
    workingPreset.rules = workingPreset.rules || [];
    const idx = workingPreset.rules.length + 1;
    const newRule = {
        id: `rule-${idx}`,
        name: `Rule ${idx}`,
        icon: '\u{1F4DC}',
        enabled: true,
        content: '',
    };
    workingPreset.rules.push(newRule);
    renderRuleList();
    selectRule(newRule.id);
}

function removeRule(index) {
    const rules = workingPreset.rules || [];
    const removed = rules[index];
    rules.splice(index, 1);
    if (selectedRuleId === removed.id) hideRuleDetail();
    renderRuleList();
}

function moveRule(index, direction) {
    const rules = workingPreset.rules || [];
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    [rules[index], rules[target]] = [rules[target], rules[index]];
    renderRuleList();
}

function hideRuleDetail() {
    $('#cs-editor-rule-detail').addClass('cs-hidden');
    selectedRuleId = null;
    $('.cs-editor-rule-card').removeClass('cs-active');
}

// ── Field CRUD ─────────────────────────────────────────────────

function addField() {
    const section = workingPreset.sections.find(s => s.id === selectedSectionId);
    if (!section) return;
    section.fields = section.fields || {};

    let name = 'NewField';
    let i = 1;
    while (section.fields[name]) { name = `NewField${++i}`; }

    section.fields[name] = { renderer: 'text' };
    renderFieldEditor(section);
}

function removeField(fieldName) {
    const section = workingPreset.sections.find(s => s.id === selectedSectionId);
    if (!section?.fields) return;
    delete section.fields[fieldName];
    renderFieldEditor(section);
}

function renameField(oldName, newName) {
    const section = workingPreset.sections.find(s => s.id === selectedSectionId);
    if (!section?.fields || !newName || oldName === newName) return;

    // Preserve order by rebuilding
    const newFields = {};
    for (const [key, val] of Object.entries(section.fields)) {
        newFields[key === oldName ? newName : key] = val;
    }
    section.fields = newFields;
    renderFieldEditor(section);
}

function updateFieldRenderer(fieldName, renderer) {
    const section = workingPreset.sections.find(s => s.id === selectedSectionId);
    if (!section?.fields?.[fieldName]) return;
    section.fields[fieldName].renderer = renderer;
    // Clear separator if renderer doesn't use it
    if (!['breadcrumb', 'character-pills'].includes(renderer)) {
        delete section.fields[fieldName].separator;
    }
}

function updateFieldSeparator(fieldName, separator) {
    const section = workingPreset.sections.find(s => s.id === selectedSectionId);
    if (!section?.fields?.[fieldName]) return;
    if (separator) {
        section.fields[fieldName].separator = separator;
    } else {
        delete section.fields[fieldName].separator;
    }
}

// ── Sync Form → Working Preset ────────────────────────────────

function syncSectionFromForm() {
    const section = workingPreset.sections.find(s => s.id === selectedSectionId);
    if (!section) return;

    const newId = $('#cs-editor-sec-id').val().trim();
    if (newId && newId !== section.id) {
        // Update selectedSectionId to track the rename
        selectedSectionId = newId;
        section.id = newId;
    }

    section.match = $('#cs-editor-sec-match').val().trim();
    section.matchMode = $('#cs-editor-sec-matchmode').val();
    section.type = $('#cs-editor-sec-type').val();
    section.icon = $('#cs-editor-sec-icon').val();
    section.parse = section.parse || {};
    section.parse.format = $('#cs-editor-sec-format').val();

    // Display config for numeric-bars
    if (section.type === 'numeric-bars') {
        section.display = section.display || {};
        section.display.colorPositive = $('#cs-editor-display-positive').val();
        section.display.colorNegative = $('#cs-editor-display-negative').val();
        section.display.colorNeutral = $('#cs-editor-display-neutral').val();
        section.display.showDelta = $('#cs-editor-display-delta').prop('checked');

        // Range config
        section.parse = section.parse || {};
        section.parse.range = [
            parseFloat($('#cs-editor-display-range-min').val()) || -1.0,
            parseFloat($('#cs-editor-display-range-max').val()) || 1.0,
        ];

        // Inverted keys
        const invertedStr = $('#cs-editor-display-inverted').val().trim();
        if (invertedStr) {
            section.display.invertedKeys = invertedStr.split(',').map(s => s.trim()).filter(Boolean);
        } else {
            delete section.display.invertedKeys;
        }
    }

    renderSectionList();
}

// ── Visual Field Mapper ────────────────────────────────────────

function parsePreviewInput() {
    const rawInput = $('#cs-editor-mapper-input').val().trim();
    if (!rawInput) {
        $('#cs-editor-parse-status').text('Nothing to parse.');
        return;
    }

    detectedFields = [];

    // Strategy 1: Try <campaign_data> YAML blocks
    try {
        const { blocks, hasCampaignData } = extractCampaignData(rawInput);
        if (hasCampaignData) {
            for (const block of blocks) {
                if (block.data && typeof block.data === 'object') {
                    for (const [topKey, topValue] of Object.entries(block.data)) {
                        // Try to match this top-level key to a section
                        const matchedSection = findMatchingSection(topKey);

                        if (matchedSection && typeof topValue === 'object' && !Array.isArray(topValue)) {
                            // Add sub-fields with auto-assignment to matched section
                            for (const [subKey, subValue] of Object.entries(topValue)) {
                                addDetectedField(subKey, subValue, matchedSection.id);
                            }
                        } else {
                            addDetectedField(topKey, topValue);
                        }
                    }
                }
            }
        }
    } catch (e) {
        // Ignore YAML parse errors
    }

    // Strategy 2: Find <details> blocks and parse their content
    try {
        const temp = document.createElement('div');
        temp.innerHTML = rawInput;
        const detailsElements = temp.querySelectorAll('details');

        for (const details of detailsElements) {
            const clone = details.cloneNode(true);
            const summary = clone.querySelector('summary');
            if (summary) {
                addDetectedField('_summary', summary.textContent.trim());
                summary.remove();
            }

            const html = clone.innerHTML;
            const text = decodeHtmlEntities(
                html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''),
            ).trim();
            const lines = text.split('\n').filter(l => l.trim());

            if (lines.length > 0) {
                // Try stat-block first (handles emoji prefixes + pipes)
                const statResult = parseStatBlock(lines, {});
                if (Object.keys(statResult).length > 0) {
                    for (const [key, value] of Object.entries(statResult)) {
                        addDetectedField(key, value);
                    }
                } else {
                    // Fall back to key-value
                    const kvResult = parseKeyValue(lines, { separator: ':' });
                    for (const [key, value] of Object.entries(kvResult)) {
                        addDetectedField(key, value);
                    }
                }
            }
        }
    } catch (e) {
        // Ignore HTML parse errors
    }

    // Strategy 3: Try parsing as plain text lines (no HTML wrapper)
    if (detectedFields.length === 0) {
        const decoded = decodeHtmlEntities(rawInput);
        const lines = decoded.split('\n').filter(l => l.trim());
        const statResult = parseStatBlock(lines, {});
        for (const [key, value] of Object.entries(statResult)) {
            addDetectedField(key, value);
        }
    }

    renderDetectedFields();
    renderLivePreview();
}

function addDetectedField(key, value, assignedSection = null) {
    // Skip internal fields and duplicates
    if (key.startsWith('_')) return;
    if (detectedFields.some(f => f.key === key)) return;

    let displayValue = value;
    if (typeof value === 'object') {
        displayValue = JSON.stringify(value);
    }
    const field = {
        key,
        value: String(displayValue || ''),
        assignedSection,
    };
    detectedFields.push(field);

    // Auto-apply field assignment if pre-assigned
    if (assignedSection) {
        applyFieldAssignment(field);
    }
}

function findMatchingSection(key) {
    const normalized = key.toLowerCase().trim();
    for (const section of workingPreset.sections) {
        const match = (section.match || '').toLowerCase().trim();
        if (!match) continue;
        switch (section.matchMode || 'contains') {
        case 'exact':
            if (normalized === match) return section;
            break;
        case 'contains':
            if (normalized.includes(match) || match.includes(normalized)) return section;
            break;
        case 'endsWith':
            if (normalized.endsWith(match)) return section;
            break;
        case 'regex':
            try { if (new RegExp(section.match, 'i').test(key)) return section; } catch { /* ignore */ }
            break;
        }
    }
    return null;
}

function renderDetectedFields() {
    const $container = $('#cs-editor-detected');
    const $list = $('#cs-editor-detected-list');
    $list.empty();

    if (detectedFields.length === 0) {
        $container.addClass('cs-hidden');
        $('#cs-editor-parse-status').text('No fields detected.');
        return;
    }

    $container.removeClass('cs-hidden');
    $('#cs-editor-detected-count').text(detectedFields.length);
    $('#cs-editor-parse-status').text(`${detectedFields.length} field(s) detected.`);

    // Build section options for assignment dropdown
    const sectionOptions = workingPreset.sections.map(s => ({
        id: s.id,
        label: s.match || s.id,
    }));

    for (const field of detectedFields) {
        const $row = $('<div>').addClass('cs-editor-mapper-field');

        const $key = $('<span>').addClass('cs-editor-mapper-key').text(sanitizeText(field.key));
        const $val = $('<span>').addClass('cs-editor-mapper-value').text(
            sanitizeText(field.value.length > 40 ? field.value.substring(0, 40) + '\u2026' : field.value),
        );
        const $arrow = $('<span>').addClass('cs-editor-mapper-arrow').text('\u2192');

        const $assign = $('<div>').addClass('cs-editor-mapper-assign');
        const $select = $('<select>');
        $select.append($('<option>').val('').text('-- assign --'));
        for (const opt of sectionOptions) {
            $select.append($('<option>').val(opt.id).text(opt.label));
        }
        if (field.assignedSection) {
            $select.val(field.assignedSection);
        }
        $select.on('change', function () {
            field.assignedSection = $(this).val() || null;
            applyFieldAssignment(field);
            renderLivePreview();
        });
        $assign.append($select);

        $row.append($key, $val, $arrow, $assign);
        $list.append($row);
    }
}

function applyFieldAssignment(field) {
    // When a field is assigned to a key-value section, add it to that section's fields
    if (!field.assignedSection) return;

    const section = workingPreset.sections.find(s => s.id === field.assignedSection);
    if (!section || section.type !== 'key-value') return;

    section.fields = section.fields || {};
    if (!section.fields[field.key]) {
        section.fields[field.key] = { renderer: guessRenderer(field.key, field.value) };

        // Refresh field editor if this section is currently selected
        if (selectedSectionId === section.id) {
            renderFieldEditor(section);
        }
    }
}

const RENDERER_PATTERNS = [
    { patterns: ['path', 'location', 'route'], renderer: 'breadcrumb' },
    { patterns: ['npc', 'companion', 'present', 'conditions', 'effects'], renderer: 'character-pills' },
    { patterns: ['weather', 'atmosphere', 'mood'], renderer: 'text-atmosphere' },
    { patterns: ['diary', 'journal', 'quote', 'thoughts'], renderer: 'quote-block' },
    { patterns: ['gold', 'xp', 'hp', 'level', 'health', 'currency', 'score', 'points',
        'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'], renderer: 'numeric-badge' },
    { patterns: ['objectives', 'quests', 'goals', 'tasks', 'time', 'date', 'spell', 'slots',
        'resources', 'roll', 'dice', 'scene', 'note'], renderer: 'text' },
];

const ENTITY_MAP = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&apos;': "'" };
const ENTITY_REGEX = /&(?:amp|lt|gt|quot|apos|#39|#x27);/g;

function decodeHtmlEntities(str) {
    if (!str || !str.includes('&')) return str;
    return str.replace(ENTITY_REGEX, match => ENTITY_MAP[match] || match);
}

function guessRenderer(key, value) {
    const lower = key.toLowerCase();

    for (const { patterns, renderer } of RENDERER_PATTERNS) {
        if (patterns.some(p => lower.includes(p))) return renderer;
    }

    // Numeric-looking values fallback
    const num = parseFloat(value);
    if (!isNaN(num) && String(num) === value.trim()) return 'numeric-badge';

    return 'text';
}

// ── Live Preview ───────────────────────────────────────────────

function renderLivePreview() {
    const $content = $('#cs-editor-preview-content');
    const $empty = $('#cs-editor-preview-empty');
    $content.empty();

    // Build data from detected fields grouped by assigned section
    const sectionData = {};
    for (const field of detectedFields) {
        if (!field.assignedSection) continue;
        sectionData[field.assignedSection] = sectionData[field.assignedSection] || {};
        sectionData[field.assignedSection][field.key] = field.value;
    }

    if (Object.keys(sectionData).length === 0) {
        $empty.removeClass('cs-hidden');
        $content.empty();
        return;
    }

    $empty.addClass('cs-hidden');

    for (const [sectionId, data] of Object.entries(sectionData)) {
        const section = workingPreset.sections.find(s => s.id === sectionId);
        if (!section) continue;

        const $sectionContainer = $('<div>').css({ marginBottom: '12px' });
        const icon = SECTION_ICONS[section.icon] || SECTION_ICONS.default;
        $sectionContainer.append(
            $('<div>').css({
                fontSize: '10px',
                fontFamily: "'Space Grotesk', -apple-system, system-ui, sans-serif",
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--cs-text-muted)',
                marginBottom: '6px',
            }).text(`${icon} ${section.match || section.id}`),
        );

        const $pane = $('<div>');

        try {
            switch (section.type) {
            case 'inventory': {
                const items = Object.entries(data).map(([name, val]) => ({
                    name, tags: [], quantity: 1, note: val || null,
                }));
                renderInventory(items, section, $pane);
                break;
            }
            case 'key-value':
                renderWorld(data, section, $pane);
                break;
            case 'numeric-bars': {
                const numData = {};
                for (const [k, v] of Object.entries(data)) {
                    const n = parseFloat(v);
                    if (!isNaN(n)) numData[k] = n;
                }
                renderFactions(numData, section, $pane);
                break;
            }
            default:
                renderWorld(data, section, $pane);
            }
        } catch (e) {
            $pane.text(`Preview error: ${e.message}`);
        }

        $sectionContainer.append($pane);
        $content.append($sectionContainer);
    }
}

// ── Save / Export / Import ─────────────────────────────────────

function savePreset() {
    hideErrors();

    // Generate ID from name if not set
    if (!workingPreset.id && workingPreset.name) {
        workingPreset.id = workingPreset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    // Ensure marker exists
    workingPreset.marker = workingPreset.marker || { type: 'details-summary', prefix: '\u2726' };
    if (!workingPreset.marker.type) workingPreset.marker.type = 'details-summary';

    // Ensure version
    workingPreset.version = workingPreset.version || '1.0.0';

    // Clean up empty fields objects
    for (const section of workingPreset.sections) {
        if (section.fields && Object.keys(section.fields).length === 0 && section.type !== 'key-value') {
            delete section.fields;
        }
    }

    const { valid, errors } = validatePreset(workingPreset);
    if (!valid) {
        showErrors(errors);
        return;
    }

    const success = saveCustomPreset(workingPreset);
    if (!success) {
        showErrors(['Failed to save preset. Check console for details.']);
        return;
    }

    if (onSaveCallback) {
        onSaveCallback(workingPreset);
    }

    closePresetEditor();
}

function exportPresetJSON() {
    const json = JSON.stringify(workingPreset, null, 4);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workingPreset.id || 'preset'}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Import a preset from a JSON file and open it in the editor.
 * @param {File} file
 */
export async function importPresetJSON(file) {
    try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        await openPresetEditor(parsed, { clone: false });
    } catch (e) {
        toastr.error(`Failed to import preset: ${e.message}`);
    }
}

// ── Helpers ────────────────────────────────────────────────────

function clonePresetForEdit(preset) {
    const clone = JSON.parse(JSON.stringify(preset));
    clone.id = `${preset.id}-custom`;
    clone.name = `${preset.name} (Custom)`;
    clone.author = 'custom';
    return clone;
}

function createBlankPreset() {
    return {
        id: '',
        name: '',
        version: '1.0.0',
        description: '',
        author: 'custom',
        marker: { type: 'details-summary', prefix: '\u2726' },
        sections: [],
        injection: {
            systemPrompt: 'Track game state using <campaign_data> YAML blocks appended to every reply.',
            includeSchema: true,
            includeCurrentState: true,
            stateDepth: 1,
        },
        theme: { accentColor: '#7c6bde' },
    };
}

function showErrors(errors) {
    const $container = $('#cs-editor-errors');
    $container.empty().removeClass('cs-hidden');
    for (const err of errors) {
        $container.append($('<div>').addClass('cs-editor-error-item').text(err));
    }
    // Scroll to top of left column
    $('.cs-editor-left').scrollTop(0);
}

function hideErrors() {
    $('#cs-editor-errors').empty().addClass('cs-hidden');
}

function clearMapper() {
    $('#cs-editor-mapper-input').val('');
    $('#cs-editor-detected').addClass('cs-hidden');
    $('#cs-editor-detected-list').empty();
    $('#cs-editor-parse-status').text('');
    $('#cs-editor-preview-content').empty();
    $('#cs-editor-preview-empty').removeClass('cs-hidden');
}
