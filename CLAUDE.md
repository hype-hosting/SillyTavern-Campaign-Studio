# Campaign Studio — Developer Reference

## Project Overview

Campaign Studio is a **SillyTavern third-party extension** that extracts structured game state from AI chat messages and displays it in a dockable side panel. It's designed for tabletop RPG / interactive fiction campaigns where the AI outputs inventory, world state, faction standings, and other trackable data.

The extension is **bidirectional**: it parses AI output AND injects game state + dice rolls back into the conversation context so the AI can reference current state when generating responses.

**Key design decisions:**
- Pure client-side JavaScript (no server component, no build step)
- ES modules loaded directly by SillyTavern's extension system
- jQuery for DOM manipulation (SillyTavern convention)
- All CSS classes use the `cs-` prefix to avoid collisions
- XSS prevention via `sanitizeText()` (creates text nodes, never raw innerHTML from user/AI data)

## File Tree

```
SillyTavern-Campaign-Studio/
├── index.js                          # Entry point — bootstrap, ST event hooks, render orchestration
├── manifest.json                     # ST extension manifest (display_name, version, js/css refs)
├── style.css                         # All styles — design tokens, panel layout, components (~1225 lines)
├── panel.html                        # Panel DOM template (injected into <body>)
├── settings.html                     # Settings panel template (injected into ST Extensions drawer)
├── assets/icons/                     # (empty — icons are inline Unicode/emoji)
│
├── src/core/
│   ├── config.js                     # Constants, DEFAULT_SETTINGS, enums (SECTION_TYPES, MATCH_MODES, etc.)
│   ├── state.js                      # Centralized reactive state store (sections, history, locationHistory)
│   ├── events.js                     # Internal event bus (on/off/emit) — decoupled from ST's eventSource
│   └── persistence.js                # 3-layer persistence: extension settings, chat metadata, message extras
│
├── src/parser/
│   ├── extractor.js                  # PRIMARY: Extracts <campaign_data> YAML blocks from message text
│   ├── yaml.js                       # Lightweight YAML parser + serializer (parseYaml / toYaml)
│   ├── router.js                     # Routes parsed YAML data to preset sections by key matching
│   ├── engine.js                     # LEGACY: Extracts <details><summary> blocks from message HTML
│   ├── adapters.js                   # LEGACY: Converts raw text lines → structured data (markdown-list, key-value, key-value-numeric)
│   └── collapse.js                   # Collapses parsed blocks in chat DOM (both <campaign_data> and <details>)
│
├── src/injection/
│   ├── prompt.js                     # System prompt injection — YAML schema + format instructions + rules
│   └── state.js                      # Message-level injection — current state snapshot + dice rolls
│
├── src/mechanics/
│   └── dice.js                       # Dice roller — notation parser, RNG, animation, pending rolls queue
│
├── src/presets/
│   ├── manager.js                    # Preset registry — load, register, activate, save custom presets
│   ├── schema.js                     # Preset JSON validation
│   └── builtin/
│       └── vigil-falls.json          # Built-in preset for the Vigil Falls campaign
│
├── src/ui/
│   ├── panel.js                      # Panel lifecycle — open/close/dock/position cycling
│   ├── tabs.js                       # Stacked section controller — creates collapsible sections from preset
│   └── renderers/
│       ├── inventory.js              # Renders item lists with tags, currency, NEW/removed indicators
│       ├── world.js                  # Renders key-value data with specialized sub-renderers (breadcrumb, pills, quote, etc.)
│       ├── factions.js               # Renders center-zero bidirectional bars with delta indicators
│       ├── location.js               # Location breadcrumb + history trail
│       └── timeline.js              # Session timeline — scrollable event log with change descriptions
│
└── src/utils/
    ├── dom.js                        # csEl() helper, loadTemplate()
    ├── sanitize.js                   # sanitizeText() — XSS-safe text insertion, stripHtml()
    └── diff.js                       # State diffing — compares snapshots, returns added/removed/modified
```

## Architecture: Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        INBOUND (AI → Extension)                  │
│                                                                   │
│  1. ST fires MESSAGE_RECEIVED event with messageId               │
│  2. index.js:handleMessageReceived() reads message.mes           │
│  3. Try PRIMARY path: extractor.js extracts <campaign_data> YAML │
│     → yaml.js parses YAML → router.js routes to sections        │
│  4. If no YAML found, try LEGACY path: engine.js extracts        │
│     <details><summary> HTML → adapters.js parses text lines      │
│  5. state.js:updateSection() stores data, records history        │
│  6. persistence.js:saveMessageSnapshot() persists to message.extra│
│  7. Internal event bus emits SECTION_UPDATED                     │
│  8. index.js re-renders affected section + built-in sections     │
│  9. On CHARACTER_MESSAGE_RENDERED, collapse.js hides parsed      │
│     blocks in chat DOM                                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     OUTBOUND (Extension → AI)                    │
│                                                                   │
│  SYSTEM PROMPT (prompt.js):                                      │
│    - Builds YAML schema from preset sections                     │
│    - Appends format instructions + example block                 │
│    - Appends user-defined game mechanics rules                   │
│    - Injected via setExtensionPrompt(key, text, IN_PROMPT, 0)   │
│                                                                   │
│  STATE CONTEXT (state.js):                                       │
│    - Hooks GENERATE_BEFORE_COMBINE_PROMPTS event                 │
│    - Builds YAML snapshot of current game state                  │
│    - Includes pending dice rolls (consumed from dice.js queue)   │
│    - Injected via setExtensionPrompt(key, text, IN_CHAT, 1)     │
└─────────────────────────────────────────────────────────────────┘
```

## Dual Parser Pipeline

### Primary: YAML in `<campaign_data>` tags
- `extractor.js` uses regex to find `<campaign_data>` blocks in raw message text
- Supports optional `type` attribute: `<campaign_data type="world">`
- Content is parsed by `yaml.js` (custom lightweight parser, not a library)
- `router.js` matches YAML top-level keys to preset section IDs (case-insensitive, normalized)
- `router.js:coerceData()` converts YAML structures to renderer-expected formats

### Legacy fallback: `<details><summary>` HTML
- `engine.js` parses rendered HTML to find `<details>` elements
- Matches `<summary>` text against preset section `match` patterns
- Inner content extracted as text lines, routed through `adapters.js` format parsers
- Three formats: `markdown-list` (inventory), `key-value`, `key-value-numeric`

### Collapse behavior
- `collapse.js` handles both formats
- `<details>` blocks: closed + hexagon badge added
- `<campaign_data>` blocks: hidden via CSS class or replaced with badge
- Handles both DOM element form and HTML-escaped `&lt;campaign_data&gt;` form

## State Management

### Three-layer persistence model:

| Layer | Scope | Storage | API |
|-------|-------|---------|-----|
| 1. Extension settings | Global (cross-chat) | `extensionSettings[EXTENSION_NAME]` | `getSettings()`, `updateSettings()` |
| 2. Chat metadata | Per-chat | `chatMetadata.campaignStudio` | `getChatMetadata()`, `updateChatMetadata()` |
| 3. Message extras | Per-message, per-swipe | `message.extra.campaignStudio.swipes[swipeId]` | `saveMessageSnapshot()` |

### State store (`state.js`):
```js
{
    activePreset: string,
    currentMessageId: number,
    sections: {
        [sectionId]: { type, label, data, lastMessageId }
    },
    history: [
        { messageId, sectionId, timestamp, previous, current }
    ],
    locationHistory: [
        { messageId, path, timestamp }
    ]
}
```

- `updateSection()` automatically tracks history and location changes
- Emits `SECTION_UPDATED` and `STATE_CHANGED` events
- `restoreState()` / `getSnapshot()` for serialization
- On chat change: `rebuildStateFromChat()` walks messages backwards to find latest snapshot

## Preset System

Presets define what data to extract and how to display it. JSON format validated by `schema.js`.

### Key preset fields:
```json
{
    "id": "vigil-falls",
    "name": "Vigil Falls",
    "marker": { "type": "details-summary", "prefix": "❖" },
    "sections": [
        {
            "id": "items",
            "match": "Items",           // Text to match in <summary> (legacy) or YAML key
            "matchMode": "endsWith",    // exact | contains | endsWith | regex
            "type": "inventory",        // inventory | key-value | numeric-bars
            "icon": "backpack",         // backpack | globe | shield | scroll | clock | map
            "parse": {
                "format": "markdown-list",
                "tagPattern": "\\(([^)]+)\\)"
            },
            "fields": { ... },          // For key-value type: per-field renderer config
            "display": { ... }          // For numeric-bars: colors, range, showDelta
        }
    ],
    "injection": {
        "systemPrompt": "...",
        "includeSchema": true,
        "includeCurrentState": true,
        "stateDepth": 1
    }
}
```

### Section types and their renderers:
| Type | Renderer | Data format | Display |
|------|----------|-------------|---------|
| `inventory` | `inventory.js` | `[{ name, tags, quantity, note }]` | Item cards with tag pills, NEW/removed badges |
| `key-value` | `world.js` | `{ Key: "value" }` | Cards with specialized sub-renderers per field |
| `numeric-bars` | `factions.js` | `{ Faction: 0.25 }` | Center-zero bidirectional bars with delta arrows |

### World renderer sub-renderers (configured per field in preset):
- `text` — plain text (default)
- `text-atmosphere` — styled atmospheric text
- `breadcrumb` — path segments with separator (e.g., `Location A → Location B`)
- `character-pills` — comma-separated names as pill buttons
- `quote-block` — blockquote styling
- `numeric-badge` — colored positive/negative badge

## SillyTavern API Usage

### Events listened to:
| Event | Handler | Purpose |
|-------|---------|---------|
| `MESSAGE_RECEIVED` | `handleMessageReceived()` | Parse new bot messages for campaign data |
| `CHARACTER_MESSAGE_RENDERED` | `handleMessageRendered()` | Collapse parsed blocks in chat DOM |
| `CHAT_CHANGED` | `handleChatChanged()` | Rebuild state from new chat's history |
| `GENERATE_BEFORE_COMBINE_PROMPTS` | `handleBeforeGenerate()` | Inject current state before generation |

### Context methods used:
- `SillyTavern.getContext()` — get the ST context object
- `context.extensionSettings` — read/write extension settings
- `context.chat` — access current chat messages
- `context.chatMetadata` — per-chat metadata
- `context.eventSource` / `context.event_types` — event system
- `context.setExtensionPrompt(key, text, position, depth)` — inject prompts
- `context.saveSettingsDebounced()` — persist settings
- `context.saveChatDebounced()` — persist chat data
- `context.saveMetadataDebounced()` — persist metadata

### Extension loading:
- `manifest.json` declares `js: "index.js"` and `css: "style.css"`
- `index.js` uses `jQuery(async () => { ... })` as entry point
- Settings HTML loaded via `$.get()` and appended to `#extensions_settings2`
- Panel HTML loaded via `fetch()` and appended to `<body>`

## CSS Architecture

### Design tokens (`.cs-root` custom properties):
- `--cs-bg-glass` / `--cs-bg-glass-hover` / `--cs-bg-glass-deep` — glass backgrounds
- `--cs-blur` — backdrop filter
- `--cs-border` / `--cs-border-hover` / `--cs-border-active` — border colors
- `--cs-accent` / `--cs-accent-rgb` / `--cs-accent-glow` — accent color system
- `--cs-text-primary` / `--cs-text-secondary` / `--cs-text-muted` — text hierarchy
- `--cs-radius` / `--cs-radius-sm` / `--cs-radius-xs` — border radii
- `--cs-transition` / `--cs-transition-fast` — timing functions
- `--cs-color-positive` / `--cs-color-negative` / `--cs-color-neutral` / `--cs-color-gold`

### Panel positioning:
- `position: fixed` with `top: calc(var(--topBarBlockSize) + 10px)` and `bottom: 10px`
- Width: `calc(50vw - var(--sheldWidth, 50vw) / 2 - 20px)` — fills chat-to-viewport gap
- `min-width: 280px`, `max-width: 500px`
- Three positions: `.cs-position-right` (10px from right), `.cs-position-left` (10px from left), `.cs-position-bottom` (full width, 55vh)
- Slide animations via `transform: translateX()` / `translateY()`
- Visibility toggled via `.cs-panel-visible` class

### Responsive:
- `@media (max-width: 768px)` — all positions collapse to bottom sheet (60vh)

### Key SillyTavern CSS variables consumed:
- `--sheldWidth` — chat container width (default `50vw`)
- `--topBarBlockSize` — toolbar height (default `45px`)

## Internal Event Bus

Decoupled from SillyTavern's `eventSource`. Used for fine-grained UI updates:

```js
CS_EVENTS = {
    STATE_CHANGED:    'cs:state-changed',     // Any section data changed
    SECTION_UPDATED:  'cs:section-updated',   // Specific section updated
    PRESET_CHANGED:   'cs:preset-changed',    // Active preset switched
    PANEL_TOGGLED:    'cs:panel-toggled',      // Panel opened/closed
    TAB_CHANGED:      'cs:tab-changed',        // (legacy, unused)
}
```

## Key Patterns

1. **XSS prevention**: Always use `sanitizeText()` from `src/utils/sanitize.js` when inserting AI-generated text into DOM. It uses `textContent` → `innerHTML` to escape HTML entities.

2. **jQuery everywhere**: All DOM manipulation uses jQuery (SillyTavern convention). Element references stored as `$variables`.

3. **No build step**: Raw ES modules with `import`/`export`. No bundler, no transpilation. Code must run directly in modern browsers.

4. **Preset-driven**: Almost all behavior is configurable via preset JSON. Adding a new campaign type = adding a new preset file.

5. **Graceful degradation**: Without the extension, `<campaign_data>` in `<details>` drawers renders as collapsible text in ST. The AI output remains readable.

## Settings (DEFAULT_SETTINGS in config.js)

```js
{
    enabled: true,
    activePreset: 'vigil-falls',
    panelPosition: 'right',          // 'right' | 'left' | 'bottom'
    panelOpen: false,
    accentColor: '#7c6bde',
    showTimeline: true,
    showLocationTracker: true,
    customPresets: [],
    mechanics: {
        diceEnabled: true,
        encounterEnabled: false,     // Stub — not yet implemented
    },
    injection: {
        systemPrompt: true,
        stateContext: true,
        outputFormat: 'yaml',        // 'yaml' | 'details' | 'both'
    },
    presetRules: {},                 // { presetId: "rules text..." }
}
```

## Known Limitations / Future Work

- **Custom preset editor UI**: Users must edit JSON manually; no in-app preset builder yet
- **Encounter system**: `encounterEnabled` setting exists but the encounter module is not implemented
- **Mobile polish**: Bottom sheet mode works but could use gesture support and better sizing
- **Swipe handling**: Snapshots are per-swipe but there's no UI to navigate between swipe states
- **No undo**: State changes from parsed messages are permanent (no revert mechanism)
- **YAML parser limitations**: Custom lightweight parser; no anchors, aliases, multiline blocks, or flow collections nested more than one level
- **Single preset active**: Only one preset can be active at a time; no multi-preset overlay
