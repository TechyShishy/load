import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { createInitialContext, gameMachine } from '../machine.js';
import { TRAFFIC_CARDS } from '../data/traffic/index.js';
import { type TrafficCard } from '../types.js';

/**
 * Traffic-only deck — no events — so rounds complete without surprise game-overs.
 * Uses a fixed seed for deterministic RNG so fill-phase distributions are stable
 * across runs (prevents flaky failures when autoFill coincidentally triggers Overload).
 */
function safeContext() {
  const trafficDeck: TrafficCard[] = Array.from({ length: 24 }, (_, i) =>
    TRAFFIC_CARDS[i % TRAFFIC_CARDS.length]!,
  );
  return {
    ...createInitialContext(),
    trafficDeck,
    trafficDiscard: [] as TrafficCard[],
    eventDeck: [],
    eventDiscard: [],
    spawnedTrafficQueue: [] as TrafficCard[],
    seed: 'carry-over-test',
  };
}

function drawComplete(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
  actor.send({ type: 'DRAW_COMPLETE' });
}

function advanceRound(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
  actor.send({ type: 'ADVANCE' }); // scheduling → execution → crisis
  actor.send({ type: 'ADVANCE' }); // crisis → resolution → auto → end → draw
  drawComplete(actor);             // draw → scheduling
}

describe('integration: traffic cards carry over across round boundary', () => {
  it('cards placed in round 1 are still on the board at the start of round 2', () => {
    const actor = createActor(gameMachine, { input: safeContext() });
    actor.start();
    drawComplete(actor);

    expect(actor.getSnapshot().value).toBe('scheduling');
    expect(actor.getSnapshot().context.round).toBe(1);

    // Capture how many cards are on the board after the draw phase
    const round1Cards = actor
      .getSnapshot()
      .context.timeSlots.flatMap((s) => s.card ? [s.card] : []);
    expect(round1Cards.length).toBeGreaterThan(0);

    advanceRound(actor);

    const snap = actor.getSnapshot();
    expect(snap.value).toBe('scheduling');
    expect(snap.context.round).toBe(2);

    // Round-1 cards must still be present somewhere on the board.
    // (New cards from round 2's draw may have been added on top.)
    const round2Cards = snap.context.timeSlots.flatMap((s) => s.card ? [s.card] : []);
    expect(round2Cards.length).toBeGreaterThanOrEqual(round1Cards.length);

    // Verify that every card present after round 1's draw still exists in round 2.
    for (const card of round1Cards) {
      expect(round2Cards).toContainEqual(card);
    }
  });

  it('trafficDiscard does not grow when round ends (cards stay on board)', () => {
    const actor = createActor(gameMachine, { input: safeContext() });
    actor.start();
    drawComplete(actor);

    expect(actor.getSnapshot().value).toBe('scheduling');
    const discardBefore = actor.getSnapshot().context.trafficDiscard.length;

    advanceRound(actor);

    expect(actor.getSnapshot().value).toBe('scheduling');
    const discardAfter = actor.getSnapshot().context.trafficDiscard.length;

    expect(discardAfter).toBe(discardBefore);
  });
});
