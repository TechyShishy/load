/**
 * Integration test: DDoS spawned traffic cards appear on the board after the
 * full transient chain (crisis → resolution → end → draw).
 * Covers the scenario where DDoS attack spawns cards that must survive
 * performResolution's resolveRound and be visible in getFilledTimeSlots.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { gameMachine } from '../machine.js';
import { getFilledTimeSlots } from '../cardPositionViews.js';
import { DDoSAttackCard } from '../data/events/DDoSAttackCard.js';
import { DDoSTrafficCard } from '../data/traffic/DDoSTrafficCard.js';
import { FourKStreamCard } from '../data/traffic/FourKStreamCard.js';
import { Period, PhaseId, SlotType } from '../types.js';
import { safeContext, ctxWithPendingEvents, ctxWithCardOnSlot } from './testHelpers.js';

describe('integration: DDoS spawn visibility', () => {
  it('all non-discarded DDoS cards appear in getFilledTimeSlots after crisis resolution', () => {
    // Deterministic setup: start in crisis with a DDoS event already pending.
    const base = safeContext('ddos-vis', { activePhase: PhaseId.Crisis });
    const ctx = ctxWithPendingEvents([new DDoSAttackCard('ddos-vis-event')], base);

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('crisis');

    // Advance past crisis → resolution → end → draw (all transient).
    actor.send({ type: 'ADVANCE' });
    const drawSnap = actor.getSnapshot();
    expect(drawSnap.value).toBe('draw');

    // Count DDoS actors on-slot. The board is empty at crisis start (safeContext
    // skips the initial draw), so all 4 spawned cards (one per period) land on
    // normal slots — none should be discarded via overload resolution.
    let ddosOnSlot = 0;
    for (const [id, a] of Object.entries(drawSnap.context.trafficCardActors)) {
      if (!a) continue;
      const inst = drawSnap.context.cardInstances[id];
      if (!(inst instanceof DDoSTrafficCard)) continue;
      if (a.getSnapshot().value === 'onSlot') ddosOnSlot++;
    }
    expect(ddosOnSlot).toBe(4);
    expect(drawSnap.context.round).toBe(2);

    // Every on-slot DDoS card must appear in getFilledTimeSlots.
    const filledSlots = getFilledTimeSlots(drawSnap.context);
    const ddosVisible = filledSlots.filter(s => s.card instanceof DDoSTrafficCard);
    expect(ddosVisible).toHaveLength(4);

    // DDoS cards should NOT appear in drawLog (they are spawned, not drawn).
    const drawLogIds = new Set(drawSnap.context.drawLog?.traffic.map(t => t.card.id) ?? []);
    expect(ddosVisible.every(s => !drawLogIds.has(s.card!.id))).toBe(true);

    // Complete draw animation → scheduling; DDoS cards still visible.
    actor.send({ type: 'DRAW_COMPLETE' });
    const schedSnap = actor.getSnapshot();
    expect(schedSnap.value).toBe('scheduling');

    const schedDDoS = getFilledTimeSlots(schedSnap.context).filter(
      s => s.card instanceof DDoSTrafficCard,
    );
    expect(schedDDoS).toHaveLength(4);
  });

  it('DDoS cards that overflow into overload slots are NOT silently discarded', () => {
    // Fill all Morning slots so the DDoS card targeting Morning must overflow.
    // DDoSAttackCard places one card per period; with Morning full, that one
    // card creates an overload while the other three land on normal slots.
    let base = safeContext('ddos-overflow', { activePhase: PhaseId.Crisis });
    for (let i = 0; i < 4; i++) {
      base = ctxWithCardOnSlot(
        new FourKStreamCard(`fill-morning-${i}`),
        Period.Morning,
        i,
        base,
      );
    }
    const ctx = ctxWithPendingEvents([new DDoSAttackCard('ddos-overflow-event')], base);

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('crisis');

    // Advance: crisis → resolution → end → draw.
    actor.send({ type: 'ADVANCE' });
    const drawSnap = actor.getSnapshot();
    expect(drawSnap.value).toBe('draw');

    // Count DDoS cards by state.
    let ddosOnSlot = 0;
    let ddosInDiscard = 0;
    for (const [id, a] of Object.entries(drawSnap.context.trafficCardActors)) {
      if (!a) continue;
      if (!(drawSnap.context.cardInstances[id] instanceof DDoSTrafficCard)) continue;
      const state = a.getSnapshot().value;
      if (state === 'onSlot') ddosOnSlot++;
      if (state === 'inDiscard') ddosInDiscard++;
    }

    // All 4 DDoS cards must survive — none should be silently discarded by
    // resolveRound just because they overflowed during performResolution.
    // The overloaded Morning card is spawnedIds-protected: it stays on the board
    // for one scheduling turn so the player can react.
    expect(ddosOnSlot).toBe(4);
    expect(ddosInDiscard).toBe(0);

    // All visible in getFilledTimeSlots.
    const ddosVisible = getFilledTimeSlots(drawSnap.context).filter(
      s => s.card instanceof DDoSTrafficCard,
    );
    expect(ddosVisible).toHaveLength(4);

    // Exactly one DDoS card is in an overloaded slot (the one targeting Morning).
    const ddosOverloaded = ddosVisible.filter(s => s.overloaded);
    expect(ddosOverloaded).toHaveLength(1);

    // The overloaded card was NOT swept this round (spawnedIds protection).
    expect(drawSnap.context.slaCount).toBe(0);
  });

  it('spawned overload DDoS cards are swept on the NEXT resolution if not cleared', () => {
    // Fill all 4 Morning slots so the DDoS card targeting Morning overflows
    // (creating an overloaded slot protected by spawnedIds for one turn).
    // If the player does NOT clear it, resolveRound in round 2 sweeps it as SLA.
    let base = safeContext('ddos-sweep', { activePhase: PhaseId.Crisis });
    for (let i = 0; i < 4; i++) {
      base = ctxWithCardOnSlot(
        new FourKStreamCard(`fill-morning-${i}`),
        Period.Morning,
        i,
        base,
      );
    }
    const ctx = ctxWithPendingEvents([new DDoSAttackCard('ddos-sweep-event')], base);

    const actor = createActor(gameMachine, { input: ctx });
    actor.start();
    expect(actor.getSnapshot().value).toBe('crisis');

    // Round 1: crisis → resolution → end → draw.
    actor.send({ type: 'ADVANCE' });
    actor.send({ type: 'DRAW_COMPLETE' });

    // Now in scheduling. Don't clear the overloaded DDoS card.
    const schedSnap = actor.getSnapshot();
    expect(schedSnap.value).toBe('scheduling');
    const ddosBefore = getFilledTimeSlots(schedSnap.context).filter(
      s => s.card instanceof DDoSTrafficCard && s.overloaded,
    );
    expect(ddosBefore).toHaveLength(1);
    expect(schedSnap.context.slaCount).toBe(0);

    // Round 2: scheduling → crisis → resolution → end → draw.
    actor.send({ type: 'ADVANCE' }); // → crisis
    actor.send({ type: 'ADVANCE' }); // → resolution → end → draw

    const drawSnap2 = actor.getSnapshot();
    // The overloaded DDoS card should now be swept as an SLA failure.
    expect(drawSnap2.context.slaCount).toBeGreaterThanOrEqual(1);
  });
});
