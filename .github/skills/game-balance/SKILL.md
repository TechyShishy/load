---
name: game-balance
description: 'Reference skill that loads the full game economy model into context: card stats, deck compositions, board structure, win/lose constants, and balancing heuristics. Use when discussing balance, reviewing card numbers, proposing a new card design, or evaluating whether a change will break the economy. This skill produces no output — it equips the agent to reason accurately about balance.'
argument-hint: "Optional focus area, e.g. 'traffic cards only' or 'action card costs'"
---

# Understanding Balancing

This skill is knowledge-only. Loading it gives the agent the rules, locations, and heuristics to reason about card balance and game-economy health — without writing any code.

**Before discussing any specific card numbers, read the authoritative source files described below.** Do not rely on memory for stats — always read the current values.

---

## Step 0 — Load the Authoritative Sources

Read these files in full before any balance discussion:

| File | What it contains |
|---|---|
| `packages/game-core/src/types.ts` | All game economy constants (`STARTING_BUDGET`, `BANKRUPT_THRESHOLD`, `MAX_SLA_FAILURES`, `MAX_ROUNDS`, `HAND_SIZE`, draw counts, `PERIOD_SLOT_COUNTS`, etc.) |
| `packages/game-core/src/deck.ts` | `FALLBACK_TRAFFIC_DECK`, `FALLBACK_EVENT_DECK`, `FALLBACK_ACTION_DECK` — canonical deck compositions with `templateId` and `count` for every card |
| `packages/game-core/src/data/traffic/` | One `*Card.ts` file per traffic card — `revenue`, `description`, any `onPickUp`/`onPlace` hooks |
| `packages/game-core/src/data/events/` | One `*Card.ts` file per event card — `label`, `description`, full `onCrisis` body |
| `packages/game-core/src/data/actions/` | One `*Card.ts` file per action card — `cost`, `allowedOnWeekend`, `validDropZones`, full `apply` body |

To list current cards without reading each file individually, run:
```sh
ls packages/game-core/src/data/traffic/
ls packages/game-core/src/data/events/
ls packages/game-core/src/data/actions/
```

To see the complete deck composition in one place:
```sh
grep -A 2 "templateId" packages/game-core/src/deck.ts
```

---

## Game Economy Constants

All constants live in `packages/game-core/src/types.ts`. Read that file for current values. The key ones to note:

- **`STARTING_BUDGET`** — player's opening budget
- **`BANKRUPT_THRESHOLD`** — instant-lose floor (negative number)
- **`MAX_SLA_FAILURES`** — SLA failures that trigger game-over
- **`MAX_ROUNDS`** — total rounds in a game (4 weeks × 7 days)
- **`HAND_SIZE`** — action cards held at any time
- **`MIN/MAX_WEEKDAY_TRAFFIC_DRAW`** and **`MIN/MAX_WEEKEND_TRAFFIC_DRAW`** — traffic draw bounds per round type
- **`WEEKDAY_EVENT_DRAW`** / **`WEEKEND_EVENT_DRAW`** — events drawn per round
- **`PERIOD_SLOT_COUNTS`** — normal slot count per period (defined in `types.ts`, used by `boardState.ts`)

**Win condition:** reach the end of `MAX_ROUNDS` with `budget >= BANKRUPT_THRESHOLD` and `slaCount < MAX_SLA_FAILURES`.

**Lose conditions:**
- `budget < BANKRUPT_THRESHOLD` → `LoseReason.Bankrupt`
- `slaCount >= MAX_SLA_FAILURES` → `LoseReason.SLAExceeded`

---

## Round Structure and Revenue Flow

Each round is one calendar day (round 1 = Monday, round 7 = Sunday, round 8 = next Monday, …). The `getDayOfWeek`, `isWeekend`, and `getDayName` helpers in `types.ts` encode this calendar.

**Revenue mechanics (read `resolveRound.ts` and `TrafficPrioritizationCard.ts` for implementation):**

1. Traffic cards placed on the board do **not** immediately earn revenue.
2. Revenue is collected only when a traffic card is **removed** from the board by an action card.
3. Removal credit flows through `pendingRevenue` on `GameContext`; `resolveRound` sweeps it into `budget` at Resolution.
4. A `revenueBoostMultiplier` on `GameContext` (normally 1.0) multiplies all removal revenue. It resets to 1.0 at the start of each Monday round.
5. Traffic cards still on the board at end-of-round are discarded without revenue.

**SLA failures:** traffic cards in **overloaded slots** at Resolution each cost 1 SLA failure. The overloaded slot is then removed from the layout.

---

## Board Structure

Read `packages/game-core/src/boardState.ts` and `PERIOD_SLOT_COUNTS` in `types.ts` for current slot counts.

The four periods are: `Morning`, `Afternoon`, `Evening`, `Overnight` (defined in `Period` enum, `types.ts`).

**Slot types** (defined in `SlotType` enum, `types.ts`):
- `Normal` — standard slot, resets each round
- `Temporary` — added for one round only
- `WeeklyTemporary` — added by capacity-expansion action cards; persists until Monday (`stripWeeklyTemporarySlotLayout` in `boardState.ts`)
- `Overloaded` — created when traffic draw exceeds available slots; triggers SLA failure on resolution

When the traffic draw for a round exceeds available slots, overflow cards become overloaded slots. Each represents a pending SLA failure unless resolved by a capacity-expanding action card before Resolution.

---

## Tracks

Three tracks hold issued event tickets: `BreakFix`, `Projects`, `Maintenance` (defined in `Track` enum, `types.ts`). Tickets persist until cleared by an action card or other mechanism. Clearing tickets is the primary function of `WorkOrderCard`.

---

## Balancing Principles

Apply these after reading the current card files and constants.

### 1 — Net budget must trend positive over a full game

The player must earn more from traffic removal than they spend on action cards, even after taking some unmitigated event penalties. Do the rough math: compute expected weekly gross revenue (mean traffic draw × mean revenue per card × 5 weekdays + weekend contribution), subtract expected weekly action card costs, and project over `MAX_ROUNDS / 7` weeks. The result should be comfortably positive.

### 2 — Traffic card `revenue` range

Cards below a certain floor feel unrewarding; cards above a certain ceiling trivialise the cost of action cards. Read the _current_ min and max `revenue` values in `packages/game-core/src/data/traffic/` to know where the floor and ceiling currently sit before proposing a new value.

Also account for `revenueBoostMultiplier`: the effective ceiling for any traffic card at boost (1.5×) is `revenue × 1.5`. Design so that even the highest-revenue card at 1.5× doesn't make non-zero-cost action cards feel free.

### 3 — Event penalties: budget-hit vs. SLA-threat

Events should fall into one of two categories, not both simultaneously:
- **Budget-hit** — deducts a dollar amount from `budget` (possibly also skips a draw)
- **SLA-threat** — spawns traffic cards or issues tickets that risk overloading the board

Combining both categories in one event with no mitigation path is unbalanced. If an event is in both categories, it must have a clear and accessible mitigation card (read `NullRouteCard.ts` for the pattern).

### 4 — Action card cost-benefit framing

Every non-zero-cost action card must have at least one realistic scenario where its benefit clearly exceeds its cost. Read the `apply` body of each existing action card in `packages/game-core/src/data/actions/` and identify the payback scenario before costing a new one.

Zero-cost action cards fundamentally change hand economics. Check the current deck for any existing zero-cost cards before proposing another — a second zero-cost card is very rarely justified.

### 5 — Deck count affects draw frequency

Deck composition is the authoritative source in `FALLBACK_TRAFFIC_DECK`, `FALLBACK_EVENT_DECK`, `FALLBACK_ACTION_DECK` in `deck.ts`. Adding copies increases draw probability proportionally to `new_count / new_total`.

General guidance for deck counts:
- Rare, game-changing card: 1–2 copies
- Situationally useful card: 3 copies
- Core card that should appear reliably: 6+ copies

Never add a card at a very high count without reason — it dilutes interesting cards.

### 6 — SLA pressure is the tension dial

Read the `onCrisis` bodies of all event cards to understand the current SLA pressure landscape. Events that spawn traffic or issue tickets create pressure; events with no effect or beneficial effects (like revenue boosts) relieve it. The ratio of pressure-relief to pressure-adding events in `FALLBACK_EVENT_DECK` should prevent the game from feeling relentless.

When adding a new pressure-adding event, consider whether a corresponding mitigation card or relief event is needed to keep the dial in balance.

### 7 — Weekend is a rest period

Weekend rounds use a smaller traffic draw range (read `MIN/MAX_WEEKEND_TRAFFIC_DRAW` in `types.ts`). Only `allowedOnWeekend = true` action cards can be played on weekends. Emergency-response cards should be weekend-allowed; optimization/expansion cards can safely be weekend-blocked.

---

## Common Balancing Questions

**Q: How do I find the strongest and weakest traffic cards?**
Read all `*Card.ts` files in `packages/game-core/src/data/traffic/` and sort by `revenue`. Cross-reference with `count` in `FALLBACK_TRAFFIC_DECK` to see frequency.

**Q: How do I assess whether a new event penalty is too large?**
Read all existing event `onCrisis` bodies. Find the current largest budget-hit and the current most disruptive SLA-threat event. A new penalty should be clearly comparable to (or smaller than) one of those existing events, or it needs a strong mitigation story.

**Q: How do I assess the total action card economy?**
Sum all `cost × count` entries in `FALLBACK_ACTION_DECK` to get the total cost mass available in one full deck cycle. Compare to total expected revenue from one deck cycle of traffic cards (sum `revenue × count` in `FALLBACK_TRAFFIC_DECK`). Revenue mass should substantially exceed cost mass.

**Q: How many copies of a new card should go in the deck?**
Follow principle 5 above, and compare against existing cards of similar power level in `deck.ts`.
