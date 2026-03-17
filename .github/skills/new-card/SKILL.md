---
name: new-card
description: 'Add a complete new card (traffic, event, or action type) to the Load game. Covers design, TypeScript class implementation, deck registration, Zod schema alignment, unit tests, and SVG art. Use when the user asks to create a new card with a name, type, description, and effect.'
argument-hint: "Card type and concept, e.g. 'traffic card for VPN tunnels' or 'action card that discards one event'"
---

# New Card Creation

Produces a fully working, tested, and rendered card: TypeScript class, deck registration, unit tests, and SVG art. Delegates the SVG step to the `card-svg` skill.

## When to Use

- User asks to add a new traffic card, event card, or action card
- A card concept exists but no code/art is in the repo yet
- Extending the game with a new mechanic that lives on a card

## Prerequisites

Read these files before starting — they define the authoritative types and patterns:
- `packages/game-core/src/types.ts` — `TrafficCard`, `EventCard`, `ActionCard` base classes and `GameContext`
- `packages/game-core/src/deck.ts` — `FALLBACK_TRAFFIC_DECK`, `FALLBACK_EVENT_DECK`, `FALLBACK_ACTION_DECK`
- `packages/game-core/src/data/<type>/index.ts` — card registries and `*_CARDS` arrays
- An existing card of the same type (pick the most similar one)

---

## Step 1 — Design the Card

Before writing any code, resolve all five design fields:

| Field | Traffic | Event | Action |
|---|---|---|---|
| `templateId` | `traffic-<kebab-name>` | `event-<kebab-name>` | `action-<kebab-name>` |
| `name` | Human-readable, noun phrase | Human-readable, noun phrase | Human-readable, verb phrase |
| `description` | What the traffic is / bandwidth flavor | What the incident does and when it fires | What the player does and the mechanical outcome |
| Effect | `revenue` | `onCrisis()` body: spawns traffic, deducts budget, or issues a ticket | `apply()` body and valid drop zones |
| Deck composition | How many copies go in `FALLBACK_TRAFFIC_DECK` | How many copies in `FALLBACK_EVENT_DECK` | How many copies in `FALLBACK_ACTION_DECK` + cost |

**`templateId` format rules:**
- Prefix matches card type: `traffic-`, `event-`, `action-`
- Use kebab-case, no spaces, no uppercase
- Must be globally unique — grep the repo before settling on one: `grep -r "templateId" packages/game-core/src/data/`

### Traffic card mechanics reference

`revenue` is the dollar amount earned when the card resolves successfully.
Reasonable range: `revenue` 3_000–15_000.

### Event card mechanics reference

`onCrisis(ctx, mitigated)` fires during the Crisis phase. Always guard `if (mitigated) return ctx;`.

Available effect primitives:
- Spawn traffic: `{ ...ctx, spawnedTrafficQueue: [...ctx.spawnedTrafficQueue, ...newCards] }`
- Deduct budget: `{ ...ctx, budget: ctx.budget - AMOUNT }`
- Issue a track ticket: import and call `issueTicket(ctx, Track.X, this)` from `../events/helpers.js`
- Combine: chain multiple effects

`label` is the crisis banner text shown in the UI. Conventions: `'TRAFFIC SPIKE'` for spawn effects, `'ISSUE TICKET'` for track effects, `'OUTAGE'` for budget-deduct effects.

### Action card mechanics reference

`apply(ctx, commit, targetEventId?, targetTrafficCardId?, targetPeriod?, targetTrack?): GameContext`

- Call `commit()` first to deduct `cost` and update `hand`/`playedThisRound`. Work from the returned context.
- Only parameters relevant to `validDropZones` will be populated at runtime.
- `validDropZones` controls what the card can be dropped on. Options: `'period'`, `'slot'`, `'occupied-slot'`, `'track'`, `'board'`
- `periodZoneVariant: 'add' | 'remove'` — must be set for any card with `'period'` in `validDropZones`; controls whether the UI renders an add or remove affordance
- `crisisOnly?: true` — set if the card is only playable during the Crisis phase
- `validForEventTemplateIds?: readonly string[]` — restrict card to specific event templateIds (used with `crisisOnly`)
- `allowedOnWeekend` — set `false` for most operational cards; use `true` for emergency/mitigation cards

---

## Step 2 — Create the TypeScript Class File

File path: `packages/game-core/src/data/<type>/<ClassName>Card.ts`

### Traffic card template

```ts
import { TrafficCard } from '../../types.js';

export class <Name>Card extends TrafficCard {
  readonly templateId = '<traffic-kebab-name>';
  readonly name = '<Human Name>';
  readonly revenue = <N>;
  readonly description = '<Flavor description.>';

  constructor(public readonly id: string = '<traffic-kebab-name>') {
    super();
  }
}
```

### Event card template

```ts
import { EventCard, type GameContext } from '../../types.js';

export class <Name>Card extends EventCard {
  readonly templateId = '<event-kebab-name>';
  readonly name = '<Human Name>';
  readonly label = '<BANNER TEXT>';
  readonly description = '<What happened and why it matters.>';

  constructor(public readonly id: string = '<event-kebab-name>') {
    super();
  }

  onCrisis(ctx: GameContext, mitigated: boolean): GameContext {
    if (mitigated) return ctx;
    // apply effect
    return ctx;
  }
}
```

### Action card template

```ts
import { ActionCard, type GameContext } from '../../types.js';

export class <Name>Card extends ActionCard {
  readonly templateId = '<action-kebab-name>';
  readonly name = '<Human Name>';
  readonly cost = <N>;
  readonly description = '<What the player does and the effect.>';
  readonly allowedOnWeekend = <boolean>;
  readonly validDropZones = [<'period'|'slot'|'occupied-slot'|'track'|'board'>] as const;
  override readonly invalidZoneFeedback = '<Hint shown when dropped in a wrong zone.>';
  // Set if valid drop zone is 'period':
  // override readonly periodZoneVariant = 'add' | 'remove' as const;

  constructor(public readonly id: string = '<action-kebab-name>') {
    super();
  }

  apply(
    _ctx: GameContext,
    commit: () => GameContext,
    _targetEventId?: string,
    _targetTrafficCardId?: string,
    _targetPeriod?: Period,
    _targetTrack?: Track,
  ): GameContext {
    let context = commit();
    // implement effect
    return context;
  }
}
```

**Critical imports:** always use `.js` extension on relative imports — this is native ESM:
```ts
import { Period, Track } from '../../types.js';
```

---

## Step 3 — Register the Card

Open `packages/game-core/src/data/<type>/index.ts` and add three things:

### 3a. Named export

```ts
export { <Name>Card } from './<Name>Card.js';
```

### 3b. Registry entry

```ts
export const <TYPE>_CARD_REGISTRY = new Map([
  // ... existing entries ...
  ['<templateId>', <Name>Card],
]);
```

### 3c. Templates array / deck composition

For **traffic and event** cards — add to the `*_CARDS` array:
```ts
export const TRAFFIC_CARDS: TrafficCard[] = [
  // ... existing ...
  new <Name>Card(),
];
```

Then open `packages/game-core/src/deck.ts` and add an entry to `DEFAULT_<TYPE>_DECK`:
```ts
export const FALLBACK_TRAFFIC_DECK = [
  // ... existing ...
  { templateId: '<templateId>', count: <N> },
];
```

For **action** cards — add to **both** `ACTION_CARDS` and `FALLBACK_ACTION_DECK` in the same way.

**Spawned-only traffic cards** (cards created by events, never drawn): register in `TRAFFIC_CARD_REGISTRY` for save/load, but do **not** add to `TRAFFIC_CARDS` or `FALLBACK_TRAFFIC_DECK`.

---

## Step 4 — Write Unit Tests

File path: `packages/game-core/src/__tests__/<kebab-name>.unit.test.ts`

For action cards, use `playActionCard` from `processCrisis.ts`. For event cards, call `onCrisis` directly. Traffic cards have no callable hook — test their field values directly.

```ts
import { describe, expect, it } from 'vitest';
import { PhaseId, type GameContext } from '../types.js';
import { createInitialTimeSlots, createInitialTracks, createVendorSlots } from '../boardState.js';
import { ACTION_CARDS } from '../data/actions/index.js'; // adjust import for type

// Build a minimal deterministic context
function makeCtx(overrides: Partial<GameContext> = {}): GameContext {
  return {
    budget: 500_000,
    round: 1,
    slaCount: 0,
    hand: [],
    playedThisRound: [],
    timeSlots: createInitialTimeSlots(),
    tracks: createInitialTracks(),
    vendorSlots: createVendorSlots(),
    pendingEvents: [],
    mitigatedEventIds: [],
    activePhase: PhaseId.Scheduling,
    trafficDeck: [],
    trafficDiscard: [],
    eventDeck: [],
    eventDiscard: [],
    spawnedTrafficQueue: [],
    actionDeck: [],
    actionDiscard: [],
    lastRoundSummary: null,
    loseReason: null,
    pendingRevenue: 0,
    seed: 'test-seed',
    drawLog: null,
    ...overrides,
  };
}
```

Minimum test cases:
- **All card types:** Card is registered and findable in its `*_CARDS` / registry
- **Traffic:** `revenue` matches spec
- **Event:** `onCrisis` with `mitigated=false` applies the expected effect; `onCrisis` with `mitigated=true` returns context unchanged
- **Action:** Cost deducted; card removed from hand; card added to `playedThisRound`; the specific mechanic effect (one test per distinct branch)

Run the tests with:
```sh
yarn workspace @load/game-core test --reporter=verbose
```

---

## Step 5 — Create the SVG Art

Invoke the `card-svg` skill with `'<templateId>'` to generate the pixel-art illustration and register it in `GameCanvas.tsx`.

The SVG skill handles:
- Writing `packages/web/public/cards/<templateId>.svg`
- Adding the entry to `CARD_ART` in `packages/web/src/components/canvas/GameCanvas.tsx`

---

## Step 6 — Write Flavor Text

Invoke the `flavor-text` skill with `'<templateId>'` to generate and apply a punchy quip to the card's `flavorText` field.

---

## Step 7 — Verify End-to-End

1. Run all game-core tests: `yarn workspace @load/game-core test`
2. Run web unit tests: `yarn workspace @load/web test`
3. Confirm the card appears in the game and its SVG renders correctly using Playwright.

   The dev server must be running on port 4201 (`yarn workspace @load/web dev --port 4201`).
   Then run a one-off Playwright script to navigate to the scheduling screen, take a screenshot, and inspect it:

   ```sh
   yarn workspace @load/web exec playwright test --headed --grep "LOAD" e2e/game.spec.ts
   ```

   Or write a targeted inline script using the Playwright Node API:

   ```ts
   // verify-card.ts  (run once with: npx tsx verify-card.ts)
   import { chromium } from '@playwright/test';

   const browser = await chromium.launch();
   const page = await browser.newPage({ baseURL: 'http://localhost:4201' });
   await page.goto('/');
   await page.evaluate(() => localStorage.clear());
   await page.reload();
   // Dismiss start screen
   const dialog = page.getByRole('dialog', { name: 'LOAD' });
   if (await dialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
     await page.getByRole('button', { name: 'NEW GAME' }).click();
   }
   // Wait for scheduling phase and take screenshot
   await page.locator('[role="main"][data-phase="scheduling"]').waitFor({ timeout: 15_000 });
   await page.screenshot({ path: 'card-verify.png', fullPage: true });
   await browser.close();
   console.log('Screenshot saved to card-verify.png');
   ```

   Open `card-verify.png` and confirm:
   - The new card's name and SVG art appear in the hand or on the board
   - The SVG is crisp with no bleed beyond the card boundary
   - Color palette matches the card type (dark bg + type-appropriate accent)

---

## Decision Guide

### Which base class?

| The card… | Use |
|---|---|
| Occupies a time slot and earns revenue when resolved | `TrafficCard` |
| Arrives as a crisis event and fires once per round | `EventCard` |
| Is held in the player's hand and played intentionally | `ActionCard` |

### Which drop zones for an action card?

| Effect target | `validDropZones` | Notes |
|---|---|---|
| A specific period column | `['period']` | Also set `periodZoneVariant` |
| A specific populated slot | `['occupied-slot']` | Use when targeting a traffic card |
| A specific empty slot | `['slot']` | Rare; use when placement matters |
| A track row | `['track']` | For ticket-clearing effects |
| No drag target (global / crisis-only) | `[]` | UI triggers a dedicated crisis button instead |
| Multiple targets | Combine, e.g. `['slot', 'occupied-slot']` | |

### Action card cost guidelines

| Cost | Use case |
|---|---|
| 0 | Pure tactical efficiency tool with no net-positive budget effect |
| 10_000–20_000 | Moderate benefit that recoups its cost within 1–2 rounds |
| 25_000–40_000 | Strong effect with multi-round ROI |
| > 40_000 | Crisis-critical mitigation where failure is expensive |

---

## Checklist

- [ ] `templateId` follows the `<type>-<kebab-name>` format and is unique in the codebase
- [ ] Class file uses `.js` extension on all relative imports
- [ ] Card exported from `packages/game-core/src/data/<type>/index.ts`
- [ ] Card registered in `<TYPE>_CARD_REGISTRY` (required for save/load deserialization)
- [ ] Added to `*_CARDS` array (unless spawned-only) so it enters the deck builder
- [ ] Entry added to `DEFAULT_<TYPE>_DECK` in `deck.ts` with a count
- [ ] Unit test file created at `packages/game-core/src/__tests__/<kebab-name>.unit.test.ts`
- [ ] All tests pass: `yarn workspace @load/game-core test`
- [ ] SVG art created via `card-svg` skill and registered in `CARD_ART`
- [ ] Flavor text written via `flavor-text` skill and `flavorText` field present in class
- [ ] Card visually confirmed in browser via dev server
