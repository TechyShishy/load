# Load — Network Traffic Balancer Game

## Architecture

Yarn 4 workspaces monorepo. Four packages:

| Package           | Role                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `@load/game-core` | Pure TypeScript game engine — zero DOM dependency. All game logic lives here.                   |
| `@load/web`       | React 18 + PixiJS v8 SPA. Consumes game-core. Also the build output for Electron and Capacitor. |
| `@load/electron`  | Thin Electron v30 shell loading `../web/dist`.                                                  |
| `@load/mobile`    | Thin Capacitor v6 shell pointing `webDir` at `../web/dist`.                                     |

All packages share the same version string. When bumping the version, update `package.json` in every workspace **and** `versionName` in `packages/mobile/android/app/build.gradle`.

State machine: XState v5 `setup()` API in `packages/game-core/src/machine.ts`. Phases (XState states): `draw` → `scheduling` → `execution` → `crisis` → `resolution` → `end` → (repeat). Terminal states: `gameWon`, `gameLost`. The UI only ever sees `scheduling`, `crisis`, `gameWon`, `gameLost` — the others are transient entry-action states that transition immediately.

## Build and Test

```sh
# Install
yarn install

# Build everything (parallel)
yarn build

# Run all tests (parallel)
yarn test

# Lint / format
yarn lint
yarn format

# Web dev server (port 4201)
yarn workspace @load/web dev

# Game-core unit tests (watch)
yarn workspace @load/game-core test:watch

# Web unit tests (watch)
yarn workspace @load/web test:watch

# E2E tests (requires dev server running on :4201)
yarn workspace @load/web test:e2e
```

## Key Conventions

### TypeScript

- Strict mode + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` everywhere.
- All internal imports use `.js` extensions (native ESM): `import { foo } from './bar.js'`. Omitting `.js` breaks the build.
- Array subscripts return `T | undefined` due to `noUncheckedIndexedAccess` — always null-guard or use `!` with intent.

### XState v5

- Use the `setup({ types, guards, actions })` API. Guards and actions **must** be declared in `setup` before referencing them in state config.
- Context mutations go through `assign` only — never mutate context objects directly.

### Zod / save system

- `packages/game-core/src/schemas.ts` mirrors all types with Zod schemas. Keep them in sync when updating `types.ts`.
- `exactOptionalPropertyTypes` causes a Zod/TS incompatibility — see the cast in `packages/web/src/save.ts` as the established workaround.

### PixiJS inside React

- `Application` is created in `useEffect` with cleanup. `TextStyle` instances live at **module scope**, not inside render, to avoid per-frame allocation.

### Seeded RNG

- `seed` is stored in `GameContext`. Per-round RNGs derive from it: `seed + '-tra-' + round`. Use the existing `Rng` from `packages/game-core/src/deck.ts` for any new randomness.

### Vendor cards

- Vendor mechanics are MVP-deferred. `VendorSlot.card` is always `null`. `SpawnVendor` event subtype has `noOpMVP: true`. Track deferred work with `TODO-NNNN` comments (see existing `TODO-0003`, `TODO-0004`).

### TODO comments

- Format: `// TODO-NNNN: <description>` where `NNNN` is a zero-padded four-digit number.
- Use sequential numbering — check existing TODOs for the next available number before adding one.
- TODOs mark intentionally deferred or incomplete work, not bugs. For bugs use a regular code comment or issue.
- Never silently implement or remove a TODO without confirming the feature is complete and tested.

## Testing

### game-core (Vitest, `environment: node`)

- Explicitly import all Vitest APIs (`describe`, `it`, `expect`, `vi`) — `globals` is `false`.
- Drive the machine with `createActor(gameMachine)` → `actor.start()` → `actor.send()` → `actor.getSnapshot()`.
- Use the `safeContext()` / `makeCtx(overrides)` patterns for deterministic context setup (see existing tests).

### web unit (Vitest, `environment: jsdom`)

- Setup file: `src/__tests__/setup.ts` — imports `@testing-library/jest-dom/vitest` and `afterEach(cleanup)`.
- Use `vi.hoisted()` for mock functions (required for ESM hoisting before `vi.mock()`).
- `focus-trap-react` is aliased to a stub via `vitest.config.ts` `resolve.alias` — don't import the real library in tests.
- Wrap hook tests with a custom `AudioCtx.Provider` to inject mock audio (see `useGame.test.ts`).

### Integration (game-core, Vitest, `environment: node`)

**What belongs here:** cross-module scenarios where the full machine cycle (`resolveRound` + `processCrisis` + `boardState` + guards) must all work together. Single-function correctness belongs in unit tests instead.

**File naming:** `*.integration.test.ts` in `packages/game-core/src/__tests__/`. Do not add integration tests to existing unit test files.

**Context setup:** always start from `safeContext()` spread with targeted overrides — never copy-paste a full `makeCtx` call from a unit test. `safeContext()` uses a traffic-only deck so rounds always complete without surprise game-overs.

```ts
// Good
const ctx = { ...safeContext(), slaCount: 2, budget: 50_000 };

// Bad — constructing GameContext from scratch in an integration test
const ctx: GameContext = { budget: ..., round: ..., /* 18 more fields */ };
```

**Advancing rounds:** use a local `advanceRound` helper rather than inlining repeated `actor.send` calls:

```ts
function advanceRound(actor: ReturnType<typeof createActor>) {
  actor.send({ type: 'ADVANCE' }); // scheduling → crisis
  actor.send({ type: 'ADVANCE' }); // crisis → scheduling (next round)
}
```

**Describe naming:** prefix suites with `integration:` so failures are immediately identifiable:

```ts
describe('integration: SLA accumulates across rounds', () => { … });
```

**No mocks:** never mock any game-core module in integration tests. Import `gameMachine`, `createInitialContext`, etc. directly and let the real code run.

**Assertions:** assert on both `actor.getSnapshot().value` (the expected phase) and the relevant `context` fields (`budget`, `slaCount`, `round`, `lastRoundSummary`). Always include a phase assertion before asserting context to catch infinite-loop bugs early.

### E2E (Playwright, Chromium only)

- Dev server must be on port **4201** — matches `playwright.config.ts` `baseURL` and `webServer.url`.
- Use `clearSave(page)` before each test and `dismissContinueModal(page)` to dismiss the Start Screen.
- Use `playRound(page, opts)` to abstract the full scheduling → ADVANCE → crisis → ADVANCE loop.

## Music / Audio

The `new-music` and `new-instrument` skills live in the **rockkit** repo. Use those skills for full implementation instructions. Relevant paths in this repo:

| What | Path |
| --- | --- |
| `IAudioManager` interface | `packages/web/src/audio/AudioManager.ts` |
| `SynthAudioManager` implementation | `packages/web/src/audio/SynthAudioManager.ts` |
| Noise buffer / audio helpers | `packages/web/src/audio/sounds/utils.ts` |
| Music track modules | `packages/web/src/audio/music/` |
| Instrument demo pages | `packages/web/instrument-demos/` |
