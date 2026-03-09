/**
 * Accessibility tests for GameCanvas — verifies the visually-hidden
 * `aria-live` region that mirrors board state for screen readers.
 *
 * PixiJS is stubbed because JSDOM has no WebGL context.  The tests focus
 * exclusively on the accessible text layer, not the canvas rendering.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import {
  Period,
  Track,
  PhaseId,
  PERIOD_SLOT_COUNTS,
  type GameContext,
  type TimeSlot,
  type TrackSlot,
} from '@load/game-core';
import { GameCanvas } from '../GameCanvas.js';

// ── Hoist mock state so vi.mock factory can access it ─────────────────────────
const mocks = vi.hoisted(() => ({
  getFilledTimeSlots: vi.fn<[GameContext], TimeSlot[]>(),
  getTracks: vi.fn<[GameContext], TrackSlot[]>(),
}));

// ── Partially mock game-core to intercept view functions ──────────────────────
vi.mock('@load/game-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@load/game-core')>();
  return {
    ...actual,
    getFilledTimeSlots: mocks.getFilledTimeSlots,
    getTracks: mocks.getTracks,
  };
});

// ── Stub PixiJS ───────────────────────────────────────────────────────────────
// JSDOM has no WebGL, so we replace the PixiJS module with minimal no-op
// fakes that satisfy the method calls made by buildStaticScene / patchSlot.
vi.mock('pixi.js', () => {
  const noop = () => undefined;

  class FakeGraphics {
    x = 0;
    y = 0;
    roundRect() {
      return this;
    }
    fill() {
      return this;
    }
    stroke() {
      return this;
    }
    rect() {
      return this;
    }
    clear() {
      return this;
    }
    destroy = noop;
  }

  class FakeText {
    text = '';
    x = 0;
    y = 0;
    visible = true;
    anchor = { set: noop };
    constructor(_opts?: unknown) {}
    setResolution = noop;
    destroy = noop;
  }

  class FakeTextStyle {
    constructor(_opts?: unknown) {}
  }

  class FakeContainer {
    x = 0;
    y = 0;
    children: { destroy: () => void }[] = [];
    addChild = noop;
    removeChildren() {
      this.children = [];
    }
    destroy = noop;
  }

  class FakeApplication {
    canvas = document.createElement('canvas');
    screen = { width: 800, height: 600 };
    stage = new FakeContainer();
    ticker = { add: noop, remove: noop };
    renderer = { render: noop };
    init = () => Promise.resolve();
    destroy = noop;
  }

  class FakeSprite {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
    constructor(_texture?: unknown) {}
    destroy = noop;
  }

  const Assets = {
    get: () => undefined,
    load: (): Promise<Record<string, unknown>> => Promise.resolve({}),
  };

  return {
    Application: FakeApplication,
    Assets,
    Container: FakeContainer,
    Graphics: FakeGraphics,
    Sprite: FakeSprite,
    Text: FakeText,
    TextStyle: FakeTextStyle,
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeTimeSlots(overrides: Partial<TimeSlot>[] = []): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (const [period, count] of Object.entries(PERIOD_SLOT_COUNTS) as [Period, number][]) {
    for (let i = 0; i < count; i++) {
      const override = overrides.find((o) => o.period === period && o.index === i) ?? {};
      slots.push({
        period,
        index: i,
        card: null,
        ...override,
      });
    }
  }
  return slots;
}

function makeTracks(overrides: Partial<TrackSlot>[] = []): TrackSlot[] {
  return [Track.BreakFix, Track.Projects, Track.Maintenance].map((track) => ({
    track,
    tickets: [],
    ...(overrides.find((o) => o.track === track) ?? {}),
  }));
}

/** Minimal valid GameContext stub — view functions are mocked so actor state is irrelevant. */
function makeCtx(): GameContext {
  return {
    budget: 500_000,
    round: 1,
    slaCount: 0,
    cardInstances: {},
    trafficCardActors: {},
    actionCardActors: {},
    eventCardActors: {},
    slotLayout: [],
    ticketOrders: {
      [Track.BreakFix]: [],
      [Track.Projects]: [],
      [Track.Maintenance]: [],
    },
    trafficDeckOrder: [],
    trafficDiscardOrder: [],
    actionDeckOrder: [],
    actionDiscardOrder: [],
    eventDeckOrder: [],
    eventDiscardOrder: [],
    handOrder: [],
    playedThisRoundOrder: [],
    pendingEventsOrder: [],
    spawnedQueueOrder: [],
    vendorSlots: [
      { index: 0, card: null },
      { index: 1, card: null },
      { index: 2, card: null },
      { index: 3, card: null },
    ],
    mitigatedEventIds: [],
    activePhase: PhaseId.Scheduling,
    lastRoundSummary: null,
    loseReason: null,
    pendingRevenue: 0,
    seed: 'test-seed',
    skipNextTrafficDraw: false,
    revenueBoostMultiplier: 1,
    drawLog: null,
  } as unknown as GameContext; // actor maps are empty; view fns are mocked
}

function getLiveRegion(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[aria-live="polite"]');
  if (!el) throw new Error('aria-live="polite" region not found in rendered output');
  return el as HTMLElement;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('GameCanvas accessibility (aria-live board summary)', () => {
  beforeEach(() => {
    mocks.getFilledTimeSlots.mockReturnValue(makeTimeSlots());
    mocks.getTracks.mockReturnValue(makeTracks());
  });

  it('renders a visually-hidden aria-live="polite" region', () => {
    const { container } = render(<GameCanvas context={makeCtx()} phase="scheduling" />);
    const liveRegion = getLiveRegion(container);
    expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
    expect(liveRegion).toHaveClass('sr-only');
  });

  it('includes all four period names in the initial summary', () => {
    const { container } = render(<GameCanvas context={makeCtx()} phase="scheduling" />);
    const text = getLiveRegion(container).textContent ?? '';
    for (const period of Object.values(Period)) {
      expect(text).toContain(period);
    }
  });

  it('describes empty slots with capacity', () => {
    const { container } = render(<GameCanvas context={makeCtx()} phase="scheduling" />);
    const text = getLiveRegion(container).textContent ?? '';
    expect(text).toContain('Morning slot 1: empty, capacity 1');
  });


  it('lists card names when a slot has cards', () => {
    const slots = makeTimeSlots();
    // Inject a card into Evening slot 0 (robust: find by period+index, not positional offset)
    const eveningSlot0Idx = slots.findIndex((s) => s.period === Period.Evening && s.index === 0);
    slots[eveningSlot0Idx] = {
      ...slots[eveningSlot0Idx]!,
      card: {
        id: 'c1',
        templateId: 'WebSurge',
        name: 'WebSurge',
        type: 'Traffic' as never,
        revenue: 5000,
        description: '',
      },
    };
    mocks.getFilledTimeSlots.mockReturnValue(slots);
    const { container } = render(<GameCanvas context={makeCtx()} phase="scheduling" />);
    const text = getLiveRegion(container).textContent ?? '';
    expect(text).toMatch(/Evening slot 1 \(slot\): 1 of 1 cards — WebSurge/);
  });

  it('reports "no open tickets" for empty tracks', () => {
    const { container } = render(<GameCanvas context={makeCtx()} phase="scheduling" />);
    const text = getLiveRegion(container).textContent ?? '';
    expect(text).toContain('BreakFix track: no open tickets');
    expect(text).toContain('Projects track: no open tickets');
    expect(text).toContain('Maintenance track: no open tickets');
  });

  it('reports open ticket count for a track with tickets', () => {
    mocks.getTracks.mockReturnValue(
      makeTracks([
        {
          track: Track.BreakFix,
          tickets: [{ id: 't1' } as never, { id: 't2' } as never],
        },
      ]),
    );
    const { container } = render(<GameCanvas context={makeCtx()} phase="scheduling" />);
    const text = getLiveRegion(container).textContent ?? '';
    expect(text).toContain('BreakFix track: 2 open tickets');
  });

  it('uses singular "ticket" for exactly one ticket', () => {
    mocks.getTracks.mockReturnValue(
      makeTracks([{ track: Track.Maintenance, tickets: [{ id: 't1' } as never] }]),
    );
    const { container } = render(<GameCanvas context={makeCtx()} phase="scheduling" />);
    const text = getLiveRegion(container).textContent ?? '';
    expect(text).toContain('Maintenance track: 1 open ticket');
    expect(text).not.toContain('1 open tickets');
  });

  it('updates the summary when context changes', () => {
    const baseSlotsWithCard = makeTimeSlots();
    baseSlotsWithCard[0] = {
      ...baseSlotsWithCard[0]!,
      card: {
        id: 'c1',
        templateId: 'APIBlast',
        name: 'APIBlast',
        type: 'Traffic' as never,
        revenue: 4000,
        description: '',
      },
    };

    const ctx1 = makeCtx(); // no cards
    const ctx2 = makeCtx(); // will see slots with APIBlast

    const { container, rerender } = render(<GameCanvas context={ctx1} phase="scheduling" />);
    const liveRegion = getLiveRegion(container);

    expect(liveRegion.textContent).toContain('Morning slot 1: empty');
    expect(liveRegion.textContent).not.toContain('APIBlast');

    mocks.getFilledTimeSlots.mockReturnValue(baseSlotsWithCard);

    act(() => {
      rerender(<GameCanvas context={ctx2} phase="scheduling" />);
    });

    expect(liveRegion.textContent).toContain('APIBlast');
    expect(liveRegion.textContent).not.toContain('Morning slot 1: empty');
  });

});
