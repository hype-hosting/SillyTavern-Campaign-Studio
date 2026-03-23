# Campaign Studio

A SillyTavern extension that extracts structured game state from AI responses and displays it in a glassmorphic side panel. Built for tabletop RPG and interactive fiction campaigns.

Campaign Studio creates a **bidirectional data loop** between you and your AI — it parses campaign data from bot messages (inventory, world state, faction standings) into an at-a-glance panel, and injects the current game state back into the conversation so the AI always knows where things stand.

## Features

- **Automatic data extraction** — Parses `<campaign_data>` YAML blocks from AI responses (with `<details><summary>` fallback for legacy bots)
- **Dockable side panel** — Right, left, or bottom positioning with slide animations. Dynamically fills the gap between the chat column and viewport edge
- **Preset system** — JSON-configurable presets define what data to track and how to display it. Ships with a Vigil Falls campaign preset
- **Inventory tracker** — Item lists with tag pills, currency notes, NEW/removed indicators
- **World state display** — Key-value data with specialized renderers: location breadcrumbs, character pills, atmosphere text, diary quotes
- **Faction standing bars** — Center-zero bidirectional bars with delta indicators showing change direction and magnitude
- **Location tracker** — Breadcrumb display of current location path with recent location history
- **Session timeline** — Scrollable event log showing all state changes (items gained/lost, faction shifts, location moves)
- **Dice roller** — Standard RPG dice notation (2d6+3), preset buttons, roll history, context labels
- **AI prompt injection** — Automatically injects YAML schema instructions and current game state into the AI's context
- **Game mechanics rules editor** — Per-preset textarea for custom rules (e.g., faction standing update formulas) injected into the system prompt
- **Glassmorphism design** — Dark glass aesthetic with customizable accent color, matching SillyTavern's visual language

## Installation

1. Navigate to your SillyTavern installation's extensions directory:
   ```bash
   cd SillyTavern/data/default-user/extensions/
   ```

2. Clone the repository:
   ```bash
   git clone https://github.com/hype-hosting/SillyTavern-Campaign-Studio.git
   ```

3. Restart SillyTavern or reload the page.

4. Enable Campaign Studio in **Extensions** > **Campaign Studio** > check **Enable Extension**.

## Configuration

Open the SillyTavern **Extensions** panel (puzzle piece icon) and find the **Campaign Studio** section.

### General
| Setting | Description |
|---------|-------------|
| **Enable Extension** | Master toggle for the entire extension |
| **Active Preset** | Which campaign preset to use for parsing and display |
| **Panel Position** | Right (default), Left, or Bottom |

### Appearance
| Setting | Description |
|---------|-------------|
| **Accent Color** | Color picker for the accent color used throughout the panel UI |

### Mechanics
| Setting | Description |
|---------|-------------|
| **Dice Roller** | Show/hide the dice roller in the panel's bottom toolbar |

### AI Integration
| Setting | Description |
|---------|-------------|
| **Prompt Injection** | Inject YAML format instructions into the system prompt so the AI knows how to output structured data |
| **State Context** | Send current game state to the AI before each message generation |
| **Output Format** | YAML Drawers (recommended), Details Blocks (legacy), or Both |
| **Game Mechanics Rules** | Free-text rules injected alongside the schema (e.g., faction update formulas) |

## How It Works

### AI Output Format

Campaign Studio instructs the AI to output game state in YAML inside `<campaign_data>` XML tags, wrapped in a collapsed HTML drawer:

```html
<details><summary>⬡</summary>

```
<campaign_data>
items:
  - Ladonian Gloves (worn)
  - Iron Skeleton Key (quest)
  - Tattered Journal
world:
  Weather: Cold rain, fog rolling in
  Intent: Investigate the old mine
  Path: Ravenwood Castle → Harbottle (The Black Boar)
  Characters: Barmaid, Drunk Miner, Hooded Stranger
  Vigil Falls's Diary: The air in Harbottle tastes of copper and lies.
  Affinity Level: 0
  Affinity Notes: Neutral
orders:
  Weaver: 0.00
  Shroud: 0.00
  Physik: 0.00
  Bloom: 0.00
</campaign_data>
```

</details>
```

When **Prompt Injection** is enabled, the extension automatically adds format instructions to the system prompt — you don't need to put formatting rules in your character card.

### State Injection

When **State Context** is enabled, the extension sends the current game state (all tracked sections + any pending dice rolls) to the AI before each generation. This means the AI always has access to current inventory, location, faction standings, and recent dice rolls.

## Creating Custom Presets

Presets are JSON files that define what data to extract and how to display it. Place custom presets in `src/presets/builtin/` or save them via the API.

### Preset Structure

```json
{
    "id": "my-campaign",
    "name": "My Campaign",
    "version": "1.0.0",
    "description": "Description of your campaign",
    "author": "your-name",
    "marker": {
        "type": "details-summary",
        "prefix": "❖"
    },
    "sections": [
        {
            "id": "items",
            "match": "Items",
            "matchMode": "endsWith",
            "type": "inventory",
            "icon": "backpack",
            "parse": {
                "format": "markdown-list",
                "tagPattern": "\\(([^)]+)\\)"
            }
        },
        {
            "id": "world",
            "match": "World",
            "matchMode": "exact",
            "type": "key-value",
            "icon": "globe",
            "parse": {
                "format": "key-value",
                "separator": ":"
            },
            "fields": {
                "Location": { "renderer": "breadcrumb", "separator": "→" },
                "NPCs": { "renderer": "character-pills", "separator": "," },
                "Weather": { "renderer": "text-atmosphere" },
                "Journal": { "renderer": "quote-block" }
            }
        },
        {
            "id": "factions",
            "match": "Faction Standing",
            "matchMode": "exact",
            "type": "numeric-bars",
            "icon": "shield",
            "parse": {
                "format": "key-value-numeric",
                "separator": ":",
                "range": [-1.0, 1.0]
            },
            "display": {
                "colorNegative": "#e05555",
                "colorPositive": "#7c6bde",
                "showDelta": true
            }
        }
    ],
    "injection": {
        "systemPrompt": "Output game state changes inside <campaign_data> tags using YAML...",
        "includeSchema": true,
        "includeCurrentState": true,
        "stateDepth": 1
    }
}
```

### Section Types

| Type | Purpose | Data format |
|------|---------|-------------|
| `inventory` | Item/equipment lists | Array of items with optional tags in parentheses |
| `key-value` | World state, character info | Key-value pairs with string values |
| `numeric-bars` | Faction standings, skill scores | Key-value pairs with numeric values |

### Match Modes

| Mode | Behavior |
|------|----------|
| `exact` | Summary text must exactly match the pattern |
| `contains` | Summary text must contain the pattern (default) |
| `endsWith` | Summary text must end with the pattern |
| `regex` | Pattern is treated as a regular expression |

### Field Renderers (for `key-value` sections)

| Renderer | Description |
|----------|-------------|
| `text` | Plain text (default) |
| `text-atmosphere` | Styled atmospheric/flavor text |
| `breadcrumb` | Path segments separated by a configurable separator |
| `character-pills` | Names displayed as clickable-looking pill buttons |
| `quote-block` | Blockquote styling for diary entries, quotes |
| `numeric-badge` | Colored positive/negative numeric badge |

### Available Icons

`backpack`, `globe`, `shield`, `scroll`, `clock`, `map`

## Dice Roller

Click the **Dice** button at the bottom of the panel to open the roller.

- **Preset buttons**: d4, d6, d8, d10, d12, d20, d100
- **Custom notation**: Type any standard notation like `2d6+3`, `1d20-1`, `3d8`
- **Context label**: Optionally describe the roll (e.g., "Perception check") — this is included when the state is sent to the AI
- **Roll history**: Last 10 rolls displayed below the result

Dice rolls are automatically included in the state context sent to the AI on the next generation.

## Compatibility

- **SillyTavern**: Requires a recent version with extension support and the `setExtensionPrompt` API
- **Browsers**: Modern browsers with ES module and `backdrop-filter` support
- **AI models**: Works with any model that can follow structured output instructions. Best results with Claude, GPT-4, and other instruction-following models

## Credits

- **Author**: [hype-hosting](https://github.com/hype-hosting)
- **Design**: Glassmorphism panel inspired by [SillyTavern-Lovense-Cloud](https://github.com/hype-hosting/SillyTavern-Lovense-Cloud) panel patterns
- **Architecture**: Data extraction patterns informed by [RPG Companion](https://github.com/SpicyMarinara/rpg-companion-sillytavern)
