import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { createInitialContext, gameMachine } from '../machine.js';
import { AWSOutageCard } from '../data/events/index.js';
import { getFilledTimeSlots } from '../cardPositionViews.js';
import { safeContext } from './testHelpers.js';

function advanceRound(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
  actor.send({ type: 'ADVANCE' }); // scheduling → crisis
  actor.send({ type: 'ADVANCE' }); // crisis → resolution
  actor.send({ type: 'ADVANCE' }); // resolution → end → draw (performDraw fires)
}

// ─── AWSOutageCard — unit tests ───────────────────────────────────────────────

describe('AWSOutageCard — fields', () => {
  it('has the expected templateId', () => {
    const card = new AWSOutageCard();
    expect(card.templateId).toBe('event-aws-outage');
  });

  it('label is INFRASTRUCTURE LOSS', () => {
    const card = new AWSOutageCard();
    expect(card.label).toBe('INFRASTRUCTURE LOSS');
  });
});

describe('AWSOutageCard — onCrisis unmitigated', () => {
  it('deducts $25,000 from budget', () => {
    const card = new AWSOutageCard();
    const ctx = { ...createInitialContext(), budget: 500_000 };
    const result = card.onCrisis(ctx, false);
    expect(result.budget).toBe(475_000);
  });

  it('sets skipNextTrafficDraw to true', () => {
    const card = new AWSOutageCard();
    const ctx = createInitialContext();
    const result = card.onCrisis(ctx, false);
    expect(result.skipNextTrafficDraw).toBe(true);
  });

  it('does not spawn traffic cards', () => {
    const card = new AWSOutageCard();
    const ctx = createInitialContext();
    const result = card.onCrisis(ctx, false);
    expect(result.spawnedQueueOrder).toHaveLength(0);
  });
});

describe('AWSOutageCard — onCrisis mitigated', () => {
  it('does not deduct budget when mitigated', () => {
    const card = new AWSOutageCard();
    const ctx = { ...createInitialContext(), budget: 500_000 };
    const result = card.onCrisis(ctx, true);
    expect(result.budget).toBe(500_000);
  });

  it('does not set skipNextTrafficDraw when mitigated', () => {
    const card = new AWSOutageCard();
    const ctx = createInitialContext();
    const result = card.onCrisis(ctx, true);
    expect(result.skipNextTrafficDraw).toBe(false);
  });
});

describe('AWSOutageCard — integration: skipped draw round', () => {
  it('skipNextTrafficDraw flag clears after the following draw phase', () => {
    const actor = createActor(gameMachine, {
      input: {
        ...safeContext('aws-test-seed'),
        skipNextTrafficDraw: true,
      },
    });
    actor.start();
    // Starting in draw phase — the draw fires immediately on start
    actor.send({ type: 'DRAW_COMPLETE' });
    expect(actor.getSnapshot().context.skipNextTrafficDraw).toBe(false);
  });

  it('board has no traffic cards on the skipped round', () => {
    const actor = createActor(gameMachine, {
      input: {
        ...safeContext('aws-test-seed'),
        skipNextTrafficDraw: true,
      },
    });
    actor.start();
    actor.send({ type: 'DRAW_COMPLETE' });
    const filledSlots = getFilledTimeSlots(actor.getSnapshot().context).filter((s) => s.card !== null);
    expect(filledSlots).toHaveLength(0);
  });

  it('normal draw populates slots the round after the skip', () => {
    const actor = createActor(gameMachine, {
      input: {
        ...safeContext('aws-test-seed'),
        skipNextTrafficDraw: true,
      },
    });
    actor.start();
    // Round 1: skip fires in performDraw — leave draw state, advance through the round
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → scheduling (round 1, no traffic)
    advanceRound(actor);                   // scheduling → crisis → resolution → end → draw (round 2, performDraw fires normally)
    // Round 2: normal draw
    actor.send({ type: 'DRAW_COMPLETE' }); // draw → scheduling (round 2)
    const filledSlots = getFilledTimeSlots(actor.getSnapshot().context).filter((s) => s.card !== null);
    expect(filledSlots.length).toBeGreaterThan(0);
  });
});
