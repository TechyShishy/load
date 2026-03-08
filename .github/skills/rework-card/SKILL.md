---
name: rework-card
description: 'Rework an existing card (traffic, event, or action type) in the Load game. Covers reading the current implementation, designing changes, editing the TypeScript class, adjusting deck registration and counts, updating unit tests, handling save/load compatibility, and refreshing SVG art when visuals change. Use when the user asks to change, rebalance, redesign, or rename an existing card.'
argument-hint: "The templateId or name of the card to rework, plus a description of the desired change, e.g. 'rework traffic-viral-spike to also deduct budget' or 'rename action-bandwidth-upgrade to action-capacity-boost'"
---

# Rework Existing Card

Produces an updated, fully tested card: revised TypeScript fields/logic, adjusted deck registration, updated tests, and refreshed SVG art when the card's visual identity changes. Delegates SVG work to the `card-svg` skill when needed.

## When to Use

- Rebalancing a card's numbers (`revenue`, `cost`, deck count)
- Changing or extending a card's mechanical effect
- Renaming a card (`name`, `templateId`, description, or file)
- Adjusting valid drop zones or targeting rules on an action card
- Replacing a card's concept entirely while keeping its slot in the deck

## Not in Scope

- Adding a brand-new card that has no existing counterpart → use the `new-card` skill instead
- Removing a card entirely (consult the team before deleting — saves may reference the `templateId`)

## Prerequisites

Before touching any code, read these to understand the current state:

1. The card's current class file — full contents
2. `packages/game-core/src/data/<type>/index.ts` — confirm registry and deck entries
3. `packages/game-core/src/deck.ts` — confirm `DEFAULT_<TYPE>_DECK` entry and count
4. The card's existing unit test file(s): `grep -r '<templateId>' packages/game-core/src/__tests__/`
5. Any integration test that references the card: `grep -r '<templateId>\|<ClassName>' packages/game-core/src/__tests__/`

---

## Step 0 — Audit Safety (Migration Check)

Answer this question **before making any change**:

> **Is the `templateId` changing?**

| Change                      | Risk                                                           | Action                      |
| --------------------------- | -------------------------------------------------------------- | --------------------------- |
| `templateId` stays the same | Safe — saves deserialize correctly                             | Proceed                     |
| `templateId` changes        | **Breaking** — saved games with the old id fail to deserialize | See Migration section below |

### Migration: when `templateId` must change

If a `templateId` rename is unavoidable:

1. Keep the old class file in place (do not delete it).
2. Add the old `templateId` to the registry pointing to the **new** class: this lets existing saves load the old card as the new variant.
3. Mark the old class with a `// TODO-NNNN: remove <OldClass> after save migration window` comment.
4. Update `DEFAULT_<TYPE>_DECK` to reference only the new `templateId`.
5. Do **not** add the old `templateId` to the `*_CARDS` template array — it must not be added to new decks.

If feasible, avoid renaming `templateId` altogether and only change `name` and `description` (display fields — safe to change at any time).

---

## Step 1 — Design the Changes

Resolve the full set of changes before editing code. Use the table below to capture current → new values for every field that moves:

| Field                                | Current value       | New value | Notes                                                   |
| ------------------------------------ | ------------------- | --------- | ------------------------------------------------------- |
| `templateId`                         |                     |           | Only change if strictly required — see Step 0           |
| `name`                               |                     |           | Display name — safe to change freely                    |
| `description`                        |                     |           | Safe to change freely                                   |
| `revenue` / `cost`                   |                     |           | Adjust deck count if power level shifts significantly   |
| Mechanic (`onCrisis` / `apply` body) |                     |           | Document the exact behavioral delta                     |
| Deck count in `DEFAULT_*_DECK`       |                     |           | Increase for buffs, decrease for nerfs                  |
| `validDropZones`                     |                     |           | Only for action cards                                   |
| `periodZoneVariant`                  |                     |           | Only if `'period'` zone is added/removed                |
| SVG art                              | unchanged / refresh |           | Refresh when visual identity no longer matches mechanic |

For **rebalance-only** changes (numbers only, concept unchanged): skip redesigning the SVG.
For **mechanic or rename changes**: evaluate whether the current SVG still communicates the card's purpose.

---

## Step 2 — Edit the TypeScript Class File

Open and edit `packages/game-core/src/data/<type>/<ClassName>Card.ts`.

Apply only the deltas identified in Step 1. Do not restructure code that is not changing.

### Common patterns

**Changing `revenue` or `cost`** — edit the readonly field value.

**Changing an event effect** — edit `onCrisis`. Always preserve the `if (mitigated) return ctx;` guard at the top.

**Changing an action effect** — edit `apply`. Always call `commit()` first and work from the returned context.

**Adding a new parameter to `apply`** — add the parameter name (prefixed with `_` if unused) and update `validDropZones` accordingly.

**Renaming the class** — rename the file and class name together; update the export in the `index.ts` file.

Available event effect primitives (reminder):

- Spawn traffic: `{ ...ctx, spawnedTrafficQueue: [...ctx.spawnedTrafficQueue, ...newCards] }`
- Deduct budget: `{ ...ctx, budget: ctx.budget - AMOUNT }`
- Issue a track ticket: `issueTicket(ctx, Track.X, this)` from `'./helpers.js'`

Available action `validDropZones` values: `'period'`, `'slot'`, `'occupied-slot'`, `'track'`, `'board'`

---

## Step 3 — Update Registration

### 3a. If `templateId` changed — update `index.ts` and `deck.ts`

In `packages/game-core/src/data/<type>/index.ts`:

- Change the registry key from the old `templateId` to the new one (and add the old key pointing to the new class if migration support is needed — see Step 0).
- Update the `export { ... }` if the class was renamed.

In `packages/game-core/src/deck.ts`:

- Update the `templateId` in `DEFAULT_<TYPE>_DECK` to the new value.

### 3b. If only the deck count changed

In `packages/game-core/src/deck.ts`, find the `{ templateId: '<id>', count: N }` entry and change `N`.

### 3c. If the card's type did not change

No changes to imports through `packages/game-core/src/data/index.ts` are needed.

---

## Step 4 — Update Unit Tests

Locate all test files that reference this card:

```sh
grep -r '<templateId>\|<ClassName>' packages/game-core/src/__tests__/
```

For each affected test:

1. **Update field-value assertions** — if `revenue`, `cost`, or `description` changed, update the expected values.
2. **Update effect assertions** — if `onCrisis` or `apply` logic changed, update what the test expects the output context to look like.
3. **Add new branches** — if the rework introduced conditional logic that wasn't there before, add a test case for each new branch.
4. **Remove obsolete assertions** — delete tests that assert behavior the card no longer has.
5. **Rename test file or describe block** if the card was renamed significantly (optional but helpful for clarity).

Do not delete entire test files — update them in place.

Run after each edit:

```sh
yarn workspace @load/game-core test --reporter=verbose
```

---

## Step 5 — Refresh SVG Art (Conditional)

**Skip this step if** the card's visual concept is unchanged (pure rebalance with no rename or mechanic shift).

**Run this step if:**

- The `name` changed and the current SVG no longer matches
- The mechanic changed and the current art actively misrepresents the card
- The `templateId` changed (the SVG filename must match the new id)

Invoke the `card-svg` skill with the new `templateId`. It will:

- Write `packages/web/public/cards/<new-templateId>.svg`
- Add/update the entry in `CARD_ART` in `packages/web/src/components/canvas/GameCanvas.tsx`

If only the `templateId` changed (same art is fine), rename the SVG file directly:

```sh
mv packages/web/public/cards/<old-id>.svg packages/web/public/cards/<new-id>.svg
```

Then update the key in `CARD_ART` from the old `templateId` to the new one.

---

## Step 6 — Verify End-to-End

1. Run all game-core tests: `yarn workspace @load/game-core test`
2. Run web unit tests: `yarn workspace @load/web test`
3. Visually confirm in the browser.

   The dev server must be running on port 4201 (`yarn workspace @load/web dev --port 4201`).

   Use a quick Playwright check to confirm the reworked card renders and behaves correctly:

   ```sh
   yarn workspace @load/web exec playwright test --headed --grep "LOAD" e2e/game.spec.ts
   ```

   Confirm:
   - The card's new `name` and `description` appear correctly in the hand/board
   - The SVG renders without bleed (if refreshed)
   - The mechanic fires as expected (play the card through at least one round)

---

## Decision Guide

### Should I change `templateId`?

Prefer **not** changing it. Changing `templateId` is a breaking save/load change — it requires migration code and a removal TODO. Prefer changing only `name` and `description` unless the concept has shifted so drastically that the old id is misleading.

### When to adjust deck count vs. mechanic?

| Goal                                                     | Lever                              |
| -------------------------------------------------------- | ---------------------------------- |
| Card too weak / too strong without changing how it plays | Adjust `count` in `DEFAULT_*_DECK` |
| Card fundamentally feels wrong or players ignore it      | Change the mechanic in Step 2      |
| Card is strong and fun but shows up too often            | Reduce `count`                     |

### Rebalancing `revenue` on traffic cards

`revenue` range: 3_000–15_000. Typical rebalance increments: ±2_000–3_000. Check the overall deck spread — no single card should dominate the revenue distribution.

### Rebalancing `cost` on action cards

| Cost tier     | Use case                                       |
| ------------- | ---------------------------------------------- |
| 0             | Pure efficiency with no positive budget delta  |
| 10_000–20_000 | Moderate effect that recoups within 1–2 rounds |
| 25_000–40_000 | Strong effect with multi-round ROI             |
| > 40_000      | Crisis-critical mitigation                     |

---

## Checklist

- [ ] Step 0: confirmed whether `templateId` changes and applied migration if needed
- [ ] Class file updated with only the intended deltas
- [ ] `index.ts` registry and exports updated (if class renamed or `templateId` changed)
- [ ] `deck.ts` `DEFAULT_*_DECK` updated (if `templateId` or count changed)
- [ ] All prior tests still pass; updated assertions match new behavior
- [ ] New test cases added for any new conditional branches
- [ ] SVG art refreshed or renamed if card identity changed — `CARD_ART` entry updated
- [ ] All tests green: `yarn workspace @load/game-core test && yarn workspace @load/web test`
- [ ] Card visually confirmed in browser via dev server
