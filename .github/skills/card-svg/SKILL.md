---
name: card-svg
description: 'Create a new card SVG image for the Load game. Use when adding a new traffic card, event card, or action card and you need a matching pixel-art illustration in packages/web/public/cards/. Follows the established isometric pixel-art design language: crispEdges rendering, 160×100 canvas, 32×32 virtual drawing grid.'
argument-hint: "Card name and type, e.g. 'traffic-vpn-tunnel' or 'event-fiber-cut'"
---

# Card SVG Creation

Generates a new pixel-art card illustration consistent with the existing art in `packages/web/public/cards/`.

## When to Use

- Adding a new `TrafficCard`, `EventCard`, or `ActionCard` to the game-core data
- The card's `id` doesn't yet have a matching `.svg` in `packages/web/public/cards/`

## Design System

### Canvas

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" shape-rendering="crispEdges">
```

- `160×100` px — 16:10 ratio, landscape
- `shape-rendering="crispEdges"` — preserves pixel-art crispness at any scale
- Background: `<rect width="160" height="100" fill="BGCOLOR"/>`

### Virtual Drawing Grid

All artwork lives inside:

```xml
<g transform="translate(30,0) scale(3.125)">
  <!-- 32×32 coordinate space -->
</g>
```

- `translate(30,0)` centers the 100 px art horizontally on the 160 px canvas
- `scale(3.125)` maps the 32×32 virtual grid to 100×100 rendered px
- Work in virtual coordinates (0–31 x, 0–31 y); the transform does the rest

### Color Palettes by Card Type

| Card Type                             | Background                 | Primary Accent                   | Secondary / Danger                         |
| ------------------------------------- | -------------------------- | -------------------------------- | ------------------------------------------ |
| `traffic-*`                           | `#001828` deep navy        | `#00f5ff` / `#00b8d4` cyan       | `#005577` rack top, `#003355` rack front   |
| `event-*` negative (attacks, outages) | `#1a0000`–`#0a0014` dark   | `#ff3b30` red or `#ff9500` amber | `#ffd60a` warning amber                    |
| `event-*` positive (capacity boosts)  | `#001a0a` forest-black     | `#00ffcc` mint                   | (`#00ffcc` at varying opacity)             |
| `action-*`                            | `#001505` dark green-black | `#30d158` green                  | `#145520` rack surface, `#1a6b30` rack top |

### Shading Convention for Isometric Faces

| Face       | Shade                    | Notes                           |
| ---------- | ------------------------ | ------------------------------- |
| Top        | Lightest (accent-tinted) | +20–30% lightness vs front face |
| Front      | Medium                   | Base color                      |
| Right side | Darkest                  | ~40–50% darker than front       |

---

## Reusable Atoms

### Isometric 3-Face Box (server rack / router)

Standard dimensions: ~20 px wide, ~12–13 px tall front face.

```xml
<!-- Top face (isometric parallelogram) -->
<polygon points="X0,FY X1,FY X1+2,FY-2 X0+2,FY-2" fill="TOP_COLOR"/>
<!-- Right side face -->
<polygon points="X1,FY X1+2,FY-2 X1+2,FY+H X1,FY+H" fill="SIDE_COLOR"/>
<!-- Front face -->
<rect x="X0" y="FY" width="W" height="H" fill="FRONT_COLOR"/>
```

Where `FY` is the y of the front face top edge, `W` is front width, `H` is front height.

**Standard trimmings (add to every box):**

- Mounting ears: `<rect x="X0" y="FY" width="2" height="H" fill="SIDE_COLOR"/>` + same at right edge
- Top-edge highlight: `<rect x="X0" y="FY" width="W" height="1" fill="ACCENT" opacity="0.35"/>`
- Status LEDs: `<rect x="..." y="..." width="2" height="2" fill="..."/>` spaced every 3 px
- Port slots: `<rect x="..." y="..." width="3" height="2" fill="DARKEST_BG"/>` at bottom of front face

### Down Arrow (traffic flowing into server)

Tip points down; arrowhead widens from top to bottom.

```xml
<!-- Shaft -->
<rect x="CX"   y="Y0"   width="2" height="SHAFT_H" fill="ACCENT"/>
<!-- Arrowhead (tip at shaft bottom) -->
<rect x="CX-1" y="Y1"   width="4" height="1" fill="ACCENT"/>
<rect x="CX-2" y="Y1+1" width="6" height="1" fill="ACCENT"/>
<rect x="CX-3" y="Y1+2" width="8" height="1" fill="ACCENT"/>
```

### Up Arrow (upload / priority routing)

Tip points up; arrowhead widens downward from the tip.

```xml
<!-- Arrowhead (tip at top) -->
<rect x="CX"   y="TIP_Y"   width="2" height="1" fill="ACCENT"/>
<rect x="CX-1" y="TIP_Y+1" width="4" height="1" fill="ACCENT"/>
<rect x="CX-2" y="TIP_Y+2" width="6" height="1" fill="ACCENT"/>
<!-- Stem -->
<rect x="CX-1" y="TIP_Y+3" width="4" height="STEM_H" fill="ACCENT" opacity="0.75"/>
```

### Broadcast Arcs (signal / radio / 5G)

Three concentric staircase bracket pairs at opacity 0.30 / 0.60 / 0.90 (outer to inner). Each bracket is mirrored left/right around a center x. Step down one row per column step outward.

### Pixel-Art Cloud

Build from overlapping rects:

- Center peak: tall narrow rect
- Left/right bumps: shorter wider rects at `y+1`
- Main body: wide rect spanning full width at `y+2` or `y+3`
- Bottom edge: slightly narrower rect defining the flat base

### Impact Burst / Cross

Two overlapping rects forming a `+`:

```xml
<rect x="CX-2" y="CY"   width="5" height="1" fill="ACCENT" opacity="0.85"/>
<rect x="CX"   y="CY-1" width="1" height="3" fill="ACCENT" opacity="0.85"/>
```

### Atmospheric Scanlines (bottom, optional)

```xml
<rect x="4" y="28" width="24" height="1" fill="ACCENT" opacity="0.15"/>
<rect x="4" y="30" width="24" height="1" fill="ACCENT" opacity="0.10"/>
<rect x="4" y="32" width="24" height="1" fill="ACCENT" opacity="0.06"/>
```

---

## Procedure

### Step 1 — Identify the Card

1. Read the card's `id`, `type`, and `name` from its definition in `packages/game-core/src/data/`.
2. Derive the filename: `packages/web/public/cards/<id>.svg`.
3. Check whether the file already exists — if so, confirm the user wants to replace it.

### Step 2 — Choose Background Color and Accent

Using the Color Palettes table:

- `traffic-*` → `#001828` bg, cyan accent
- `action-*` → `#001505` bg, green accent
- `event-*` negative → dark red/purple bg, red or amber accent
- `event-*` positive → `#001a0a` bg, mint accent

When in doubt, match the thematic feel of the card's effect on the game.

### Step 3 — Sketch Scene Composition

All layouts share a common vertical structure in the 32×32 virtual grid:

| y range | Zone                                                      |
| ------- | --------------------------------------------------------- |
| 0–10    | Top element (cloud, arcs, arrows arriving from above)     |
| 10–22   | Middle element (main subject: server rack, router)        |
| 22–31   | Bottom atmosphere (arrows leaving, scanlines, stand/base) |

Decide on 1–3 elements:

- **Traffic cards**: server rack + upload/download arrows
- **Event cards**: the disruption element (cloud, attack arrows) + affected rack
- **Action cards**: router/rack + directional arrow showing the action

### Step 4 — Write the SVG

1. Start from the boilerplate:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" shape-rendering="crispEdges">
  <!-- Background -->
  <rect width="160" height="100" fill="BGCOLOR"/>

  <!-- Drawing area: 32×32 virtual grid, centered -->
  <g transform="translate(30,0) scale(3.125)">
    <!-- artwork here -->
  </g>
</svg>
```

2. Add elements top-to-bottom using the atoms above.
3. Group logically with XML comments (`<!-- ── Label ──── -->`).
4. Never place any element beyond x=31 or y=31 in virtual coords (clips at svg edge).

### Step 5 — Register in GameCanvas

Open `packages/web/src/components/canvas/GameCanvas.tsx` and add one entry to the `CARD_ART` record:

```ts
// ── Card art ──────────────────────────────────────────────────────────────────
/** templateId → public URL for cards that have SVG art. Extend when adding new art. */
const CARD_ART: Partial<Record<string, string>> = {
  'traffic-4k-stream': '/cards/traffic-4k-stream.svg',
  // ... existing entries ...
  '<card-id>': '/cards/<card-id>.svg',   // ← add this line
};
```

`Assets.load(Object.values(CARD_ART))` already runs at PixiJS init time, so no other code changes are needed — the texture becomes available synchronously via `Assets.get()` and `cardArtSprite()` will return a Sprite instead of `null`.

### Step 6 — Save and Verify

1. Write the file to `packages/web/public/cards/<id>.svg`.
2. Confirm the entry was added to `CARD_ART` in `GameCanvas.tsx`.
3. Open the web dev server (`yarn workspace @load/web dev`) and navigate to a card that uses this image to confirm it renders correctly at game scale.
4. Check: dark background visible, primary element clearly readable, no runaway bright colors outside the card rectangle.

---

## Quality Checklist

- [ ] `viewBox="0 0 160 100"` and `shape-rendering="crispEdges"` present
- [ ] Background `rect` covers full 160×100
- [ ] All artwork inside `<g transform="translate(30,0) scale(3.125)">`
- [ ] No coordinates exceed the 32×32 virtual grid
- [ ] Color palette matches the card type
- [ ] Isometric box (if present) has all 3 faces at correct shade ratios
- [ ] Status LEDs and port slots added to any server/router box
- [ ] File saved as `packages/web/public/cards/<card-id>.svg`
- [ ] Entry added to `CARD_ART` in `packages/web/src/components/canvas/GameCanvas.tsx`
