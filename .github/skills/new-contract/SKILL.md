---
name: new-contract
description: 'Design and implement a complete new contract for the Load game. Covers premise/flavor, central mechanical twist, exclusive new card designs, deck composition with existing cards for balance, a contract-exclusive reward card, ContractDef registration, unit tests, SVG art, and optionally a new music track. Use when the user asks for a new contract scenario with a fresh mechanic.'
argument-hint: "A contract concept, e.g. 'government NOC with maintenance windows' or 'startup CDN with surge pricing'"
---

# New Contract

Produces a fully working, tested, and playable contract: one or more new card implementations exclusive to the contract, a `ContractDef` registered in `data/contracts/index.ts`, unit tests for every new card, SVG art per card, and optionally a new music track. Delegates card implementation to the `new-card` skill, art to `card-svg`, and music to `new-music`.

## When to Use

- User asks to add a new named contract / scenario
- A new central mechanic is needed that doesn't fit existing cards
- Expanding the contract roster with a distinct difficulty tier or flavor

## What This Skill Produces

| Deliverable | Notes |
|---|---|
| `ContractDef` in `data/contracts/index.ts` | Registered in `BUILT_IN_CONTRACTS` |
| 1–3 exclusive new cards | The mechanic lives here; delegate each to the `new-card` skill |
| Updated card registries | All new cards registered for save/load |
| `schemas.ts` update | If new `GameContext` fields are added for the mechanic |
| Unit tests | One test file per new card, plus integration tests for the mechanic |
| SVG art | One SVG per new card; delegate to the `card-svg` skill |
| Music track (optional) | If a new `musicTrackId` is needed; delegate to the `new-music` skill |

---

## Phase 1 — Design Interview

Before touching any code, resolve **every** field in the design table below.
Use `vscode_askQuestions` to gather answers not already in the conversation.

### Required design decisions

| Decision | Question to ask | Guidance |
|---|---|---|
| **Premise** | What is the setting / operator flavor? | Informs card flavor text and music mood |
| **Central mechanic** | What is the one mechanical twist that makes this contract distinct? | Must be expressible in 1 sentence; must not duplicate existing card effects |
| **Exclusive cards** | What new cards carry the mechanic? Which type (traffic / event / action)? | Typically 1–2 event cards + 0–1 new traffic card + 0–1 reward action card |
| **Existing cards** | Which existing cards are reused for balance? | Select from the known catalogue; these are the "steady state" of the deck |
| **Reward card** | What does the player earn for completing or surviving this contract? | Must address the exclusive mechanic — mitigate it, exploit it, or extend it |
| **Reward delivery** | When is the reward card given — next run? Start of this run? Mid-game unlock? | Default: next-run injection (added to `unlockedCards` on `gameWon`) |
| **Difficulty** | Budget, SLA limit, and relative position to existing contracts | See difficulty calibration below |
| **Music** | Existing `musicTrackId` or new track? | If new: capture mood description for the `new-music` skill |

### Difficulty calibration

Read `packages/game-core/src/types.ts` for `STARTING_BUDGET` and `MAX_SLA_FAILURES`; read existing contracts in `data/contracts/index.ts` for reference points.

| Tier | Budget (approx.) | SLA limit (approx.) | Notes |
|---|---|---|---|
| Tutorial | ≥ $700,000 | 5 | Fixed seed; no viral spawns in deck |
| Standard | $500,000 | 3 | Current benchmark (`STANDARD_CONTRACT`) |
| Hard | $350,000–$450,000 | 2–3 | Include heavier event mix |
| Expert | < $350,000 | 2 | All high-pressure events; minimal False Alarms |

### Deck composition principles

Load `packages/game-core/src/deck.ts` and `data/contracts/index.ts` before specifying any counts.

**Traffic deck (target ~21 cards):**
- Existing traffic types provide the stable revenue floor
- New exclusive traffic types provide the mechanical pressure
- A 21-card deck cycles ≈ 4–5× across 28 rounds (90–110 total traffic appearances with typical draw rates)

**Event deck (target 10–16 cards):**
- New event cards (the contract mechanic): 2–4 copies — enough to appear 1–2× per week
- False Alarms: 4–7 for standard difficulty; 0–3 for hard/expert
- Existing events for texture: AWS Outage, 5G Activation, Tier-1 Peering as applicable
- Remove events whose mechanic would overshadow the new one (e.g., don't stack DDoS and Maintenance windows as co-equal pressures)

**Action deck:**
- Default: no `actionDeck` override — uses `FALLBACK_ACTION_DECK`
- Override only when the default includes cards that are useless or mechanically broken with the new contract's events
- When overriding, always preserve `action-work-order` and `action-traffic-prioritization`

---

## Phase 2 — New Card Design

For each exclusive new card, follow the `new-card` skill. Additional guidelines specific to contract-exclusive cards:

### Exclusive traffic cards
- Traffic cards deliver continuous pressure — they recur every time the deck cycles and shape every routing decision the player makes. They are the right home for the mechanic when the challenge is "this type of traffic is inherently dangerous to carry."
- Pair higher revenue with a meaningful mechanical downside (e.g., double SLA penalty on overload, restricted periods, spawns on pickup)
- Use 2–3 copies in the traffic deck — rare enough to feel notable, common enough to shape strategy
- Register in `TRAFFIC_CARD_REGISTRY` and `TRAFFIC_CARDS` but **not** in `FALLBACK_TRAFFIC_DECK`

### Exclusive event cards
- Event cards deliver scheduled pressure — they fire during crisis on a known cadence and give the player a window to respond. They are the right home for the mechanic when the challenge is "something bad will happen unless you act."
- If the mechanic requires new `GameContext` fields (e.g., a flag set in `onCrisis` that `resolveRound` reads later), add the field to `types.ts`, mirror in `schemas.ts` with `.optional().default(…)` for save compatibility, default in `machine.ts` `createInitialContext()`, and default in `testHelpers.ts` `safeContext()`. Name the field after the mechanic, not the concept.
- Prefer using an existing `Track` (e.g., `Track.Maintenance`) before proposing a new track value
- Register in `EVENT_CARD_REGISTRY` and `EVENT_CARDS` but **not** in `FALLBACK_EVENT_DECK`

### Exclusive action card (reward)
- Answer the question: "what would make this contract's mechanic survivable with skill?"
- Cost: typically $15,000–$45,000 — expensive enough to require planning, cheap enough to use reactively; calibrate to the severity of the mechanic it counters
- `allowedOnWeekend: true` for any card that mitigates crisis-spawned pressure
- Register in `ACTION_CARD_REGISTRY` and `ACTION_CARDS` but **not** in `FALLBACK_ACTION_DECK`

### Reward delivery mechanism

The `rewardDeck` / `unlockedCards` delivery system is tracked in [issue #26](https://github.com/TechyShishy/load/issues/26) and must be implemented before any contract's reward card can be wired up. The implementation sequence in Phase 3 notes this dependency.

---

## Phase 3 — Implementation Sequence

Implement in this exact order to avoid circular imports and missing type definitions:

1. **`GameContext` fields** — `types.ts` → `schemas.ts` → `machine.ts` `createInitialContext()` → `testHelpers.ts` `safeContext()`
2. **New card classes** — delegate each to `new-card` skill (class file, registry, unit tests, SVG art)
3. **`resolveRound.ts` changes** — any mechanic that fires on a specific day or during resolution (e.g., Friday sweep)
4. **Reward delivery system** — if not yet implemented, complete [issue #26](https://github.com/TechyShishy/load/issues/26) first before wiring the reward card
5. **Contract definition** — `data/contracts/index.ts`: new `const`, append to `BUILT_IN_CONTRACTS`
6. **Integration test** — `__tests__/<contract-slug>.integration.test.ts`, describe prefix `integration: <ContractName> mechanic`
7. **Music** — delegate to `new-music` with mood description; add returned `musicTrackId` to `ContractDef`

---

## Phase 4 — ContractDef Template

```ts
export const MY_CONTRACT: ContractDef = {
  id: 'my-contract-slug',        // kebab-case, globally unique, never change after first release
  name: 'Human-Readable Name',
  description: 'One-sentence operator-voice description. What is the situation and what does the player face.',
  musicTrackId: 'myTrackId',     // omit if reusing an existing track
  // fixedSeed: 'my-contract-v1', // only for tutorial-tier fixed runs; bump suffix if deck changes
  trafficDeck: [
    { templateId: 'traffic-exclusive-card', count: 3 },
    { templateId: 'traffic-4k-stream',      count: 6 },
    { templateId: 'traffic-iot-burst',      count: 5 },
    // ...
  ],
  eventDeck: [
    { templateId: 'event-exclusive-mechanic', count: 3 },
    { templateId: 'event-false-alarm',        count: 4 },
    // ...
  ],
  // actionDeck: [...],  // only if FALLBACK_ACTION_DECK is incompatible with this contract
  rewardDeck: [
    { templateId: 'action-exclusive-reward', count: 1 },
  ],
  startingBudget: 500_000,  // TUNABLE — see difficulty calibration table in Phase 1
  slaLimit: 3,              // TUNABLE — see difficulty calibration table in Phase 1
};

// Append to BUILT_IN_CONTRACTS — order determines UI display order
export const BUILT_IN_CONTRACTS: ContractDef[] = [
  LOCAL_ISP_CONTRACT,
  STANDARD_CONTRACT,
  MY_CONTRACT,
];
```

---

## Phase 5 — Validation

```sh
# Type-check game-core
yarn workspace @load/game-core tsc --noEmit

# Run all game-core tests (includes unit + integration)
yarn workspace @load/game-core test

# Exclusive cards must NOT appear in FALLBACK_* decks
grep 'event-scheduled-maintenance\|traffic-classified-comms\|action-emergency-cab-override' \
  packages/game-core/src/deck.ts   # should return nothing

# Confirm all registries
grep 'noc-change-window' packages/game-core/src/data/contracts/index.ts
grep 'traffic-classified-comms\|event-scheduled-maintenance\|action-emergency-cab-override' \
  packages/game-core/src/data/traffic/index.ts \
  packages/game-core/src/data/events/index.ts \
  packages/game-core/src/data/actions/index.ts
```

---

## Phase 6 — Balance Review

Load the `game-balance` skill, then verify:

- The exclusive event fires ≈ 1–2× per week at the chosen deck count — not so rare the mechanic never surfaces, not so frequent it crowds out every round
- Any exclusive traffic card's revenue is proportionate to its mechanical downside — if the card's own mechanics (e.g. double SLA penalty, restricted periods, spawn-on-pickup) create extra risk, it should pay 30–50% more than a baseline card of comparable draw frequency; the premium comes from the mechanic, not from being contract-exclusive
- The reward card's cost is recouped within 1–2 clean uses — a card that costs more than it saves will never see play
- The contract is losable without the mechanic knowledge: a player who ignores the new mechanic entirely should fall behind by week 3, but a player who engages it should be able to finish

---

## Completion Checklist

- [ ] All design fields resolved (premise, mechanic, decks, reward delivery, difficulty, music)
- [ ] `types.ts` updated for any new `GameContext` fields and any new base-class properties
- [ ] `schemas.ts` updated to mirror every new field
- [ ] `machine.ts` `createInitialContext()` updated for new fields
- [ ] `testHelpers.ts` `safeContext()` updated for new fields
- [ ] `resolveRound.ts` updated for any resolution-phase mechanic hooks
- [ ] Reward delivery system (`unlockedCards`) implemented if this is the first reward card
- [ ] All exclusive card class files created and registered
- [ ] `ContractDef` exported and appended to `BUILT_IN_CONTRACTS`
- [ ] Integration test covering the full mechanic cycle
- [ ] SVG art for every new card
- [ ] Music track created (or existing track ID confirmed)
- [ ] `tsc --noEmit` clean
- [ ] All tests green
- [ ] Balance review passed
