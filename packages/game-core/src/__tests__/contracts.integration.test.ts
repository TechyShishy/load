import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { gameMachine, createInitialContext } from '../machine.js';
import { LOCAL_ISP_CONTRACT } from '../data/contracts/index.js';
import { MAX_SLA_FAILURES } from '../types.js';
import { safeContext } from './testHelpers.js';

function advanceRound(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
  actor.send({ type: 'ADVANCE' }); // scheduling → crisis
  actor.send({ type: 'ADVANCE' }); // crisis → resolution → auto → end → draw
}

describe('integration: slaLimit from contract controls game-over threshold', () => {
  it(`game is still running after 1 SLA failure with slaLimit=${MAX_SLA_FAILURES} (standard)`, () => {
    const ctx = { ...safeContext(), slaCount: 1, slaLimit: MAX_SLA_FAILURES };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('scheduling');
  });

  it('game is lost immediately when slaCount === slaLimit (slaLimit=1)', () => {
    const ctx = { ...safeContext(), slaCount: 1, slaLimit: 1 };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('gameLost');
  });

  it('game with slaLimit=5 is not lost with 4 SLA failures, but is lost with 5', () => {
    // slaCount=4, slaLimit=5 → still running (one more failure allowed)
    const ctx = { ...safeContext(), slaCount: 4, slaLimit: 5 };
    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('scheduling');

    // slaCount=5, slaLimit=5 → guard fires at next draw, game over
    const actor2 = createActor(gameMachine, {
      input: { ...safeContext(), slaCount: 5, slaLimit: 5 },
    });
    actor2.start();
    actor2.send({ type: 'DRAW_COMPLETE' });
    expect(actor2.getSnapshot().value).toBe('gameLost');
  });
});

describe('integration: LOCAL_ISP_CONTRACT full-cycle round', () => {
  function makeActor() {
    // Build a full context from LOCAL_ISP_CONTRACT, then clear the event deck
    // so no crisis events fire (mirroring safeContext pattern)
    const ctx = createInitialContext('local-isp-int-test', LOCAL_ISP_CONTRACT);
    return createActor(gameMachine, { input: { ...ctx, eventDeckOrder: [] } });
  }

  it('starts with budget=$700k and slaLimit=5 when using LOCAL_ISP_CONTRACT', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('scheduling');
    expect(actor.getSnapshot().context.budget).toBe(700_000);
    expect(actor.getSnapshot().context.slaLimit).toBe(5);
    expect(actor.getSnapshot().context.contractId).toBe('local-isp');
  });

  it('completes round 1 without game-over using LOCAL_ISP_CONTRACT', () => {
    const actor = makeActor();
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('scheduling');

    advanceRound(actor);
    actor.send({ type: 'DRAW_COMPLETE' });

    expect(actor.getSnapshot().value).toBe('scheduling');
    expect(actor.getSnapshot().context.round).toBe(2);
  });
});
