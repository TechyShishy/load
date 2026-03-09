import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { gameMachine } from '../machine.js';
import { getFilledTimeSlots } from '../cardPositionViews.js';
import { safeContext } from './testHelpers.js';

function drawComplete(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
  actor.send({ type: 'DRAW_COMPLETE' });
}

function advanceRound(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
  actor.send({ type: 'ADVANCE' }); // scheduling → crisis
  actor.send({ type: 'ADVANCE' }); // crisis → resolution → auto → end → draw
  drawComplete(actor);             // draw → scheduling
}

describe('integration: traffic cards carry over across round boundary', () => {
  it('cards placed in round 1 are still on the board at the start of round 2', () => {
    const actor = createActor(gameMachine, { input: safeContext('carry-over-test') });
    actor.start();
    drawComplete(actor);

    expect(actor.getSnapshot().value).toBe('scheduling');
    expect(actor.getSnapshot().context.round).toBe(1);

    // Capture how many cards are on the board after the draw phase
    const round1Cards = getFilledTimeSlots(actor.getSnapshot().context).flatMap((s) => s.card ? [s.card] : []);
    expect(round1Cards.length).toBeGreaterThan(0);

    advanceRound(actor);

    const snap = actor.getSnapshot();
    expect(snap.value).toBe('scheduling');
    expect(snap.context.round).toBe(2);

    // Round-1 cards must still be present somewhere on the board.
    const round2Cards = getFilledTimeSlots(snap.context).flatMap((s) => s.card ? [s.card] : []);
    expect(round2Cards.length).toBeGreaterThanOrEqual(round1Cards.length);

    // Verify that every card present after round 1's draw still exists in round 2.
    for (const card of round1Cards) {
      expect(round2Cards).toContainEqual(card);
    }
  });

  it('trafficDiscardOrder does not grow when round ends (cards stay on board)', () => {
    const actor = createActor(gameMachine, { input: safeContext('carry-over-test') });
    actor.start();
    drawComplete(actor);

    expect(actor.getSnapshot().value).toBe('scheduling');
    const discardBefore = actor.getSnapshot().context.trafficDiscardOrder.length;

    advanceRound(actor);

    expect(actor.getSnapshot().value).toBe('scheduling');
    const discardAfter = actor.getSnapshot().context.trafficDiscardOrder.length;

    expect(discardAfter).toBe(discardBefore);
  });
});

