import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { gameMachine } from '../machine.js';
import { safeContext } from './testHelpers.js';

function drawComplete(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
  actor.send({ type: 'DRAW_COMPLETE' });
}

function advanceRound(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
  actor.send({ type: 'ADVANCE' }); // scheduling → crisis
  actor.send({ type: 'ADVANCE' }); // crisis → resolution → … → draw
  drawComplete(actor);             // draw → scheduling
}

describe('integration: roundHistory accumulates across rounds', () => {
  it('starts empty and gains one entry per completed round', () => {
    const actor = createActor(gameMachine, { input: safeContext('round-history-test') });
    actor.start();
    drawComplete(actor);

    expect(actor.getSnapshot().value).toBe('scheduling');
    expect(actor.getSnapshot().context.roundHistory).toHaveLength(0);

    advanceRound(actor);

    const snap1 = actor.getSnapshot();
    expect(snap1.value).toBe('scheduling');
    expect(snap1.context.round).toBe(2);
    expect(snap1.context.roundHistory).toHaveLength(1);
    expect(snap1.context.roundHistory[0]?.round).toBe(1);

    advanceRound(actor);

    const snap2 = actor.getSnapshot();
    expect(snap2.context.round).toBe(3);
    expect(snap2.context.roundHistory).toHaveLength(2);
    expect(snap2.context.roundHistory[1]?.round).toBe(2);
  });

  it('roundHistory entries contain valid budget deltas', () => {
    const actor = createActor(gameMachine, { input: safeContext('round-history-delta-test') });
    actor.start();
    drawComplete(actor);

    advanceRound(actor);

    const { roundHistory } = actor.getSnapshot().context;
    expect(roundHistory).toHaveLength(1);
    // budgetDelta is a finite number (no NaN / undefined)
    expect(Number.isFinite(roundHistory[0]!.budgetDelta)).toBe(true);
  });

  it('lastRoundSummary always matches the most recent roundHistory entry', () => {
    const actor = createActor(gameMachine, { input: safeContext('round-history-sync-test') });
    actor.start();
    drawComplete(actor);

    advanceRound(actor);
    advanceRound(actor);

    const { roundHistory, lastRoundSummary } = actor.getSnapshot().context;
    expect(roundHistory.length).toBeGreaterThanOrEqual(1);
    expect(lastRoundSummary).toEqual(roundHistory[roundHistory.length - 1]);
  });
});
