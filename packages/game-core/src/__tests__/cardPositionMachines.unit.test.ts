import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import {
  trafficCardPositionMachine,
  actionCardPositionMachine,
  eventCardPositionMachine,
} from '../cardPositionMachines.js';
import { Period, SlotType, Track } from '../types.js';

// ─── trafficCardPositionMachine ────────────────────────────────────────────────

describe('trafficCardPositionMachine', () => {
  function makeActor() {
    const actor = createActor(trafficCardPositionMachine, {
      input: { instanceId: 'tc-1', templateId: 'traffic-iot-burst' },
    });
    actor.start();
    return actor;
  }

  it('starts in inDeck', () => {
    const actor = makeActor();
    expect(actor.getSnapshot().value).toBe('inDeck');
  });

  it('PLACE from inDeck → onSlot and sets context', () => {
    const actor = makeActor();
    actor.send({ type: 'PLACE', period: Period.Morning, slotIndex: 0, slotType: SlotType.Normal });
    expect(actor.getSnapshot().value).toBe('onSlot');
    expect(actor.getSnapshot().context.period).toBe(Period.Morning);
    expect(actor.getSnapshot().context.slotIndex).toBe(0);
    expect(actor.getSnapshot().context.slotType).toBe(SlotType.Normal);
  });

  it('SPAWN from inDeck → inQueue', () => {
    const actor = makeActor();
    actor.send({ type: 'SPAWN' });
    expect(actor.getSnapshot().value).toBe('inQueue');
  });

  it('PLACE from inQueue → onSlot', () => {
    const actor = makeActor();
    actor.send({ type: 'SPAWN' });
    actor.send({ type: 'PLACE', period: Period.Afternoon, slotIndex: 1, slotType: SlotType.Normal });
    expect(actor.getSnapshot().value).toBe('onSlot');
    expect(actor.getSnapshot().context.period).toBe(Period.Afternoon);
    expect(actor.getSnapshot().context.slotIndex).toBe(1);
  });

  it('REMOVE from onSlot → inDiscard and clears context', () => {
    const actor = makeActor();
    actor.send({ type: 'PLACE', period: Period.Morning, slotIndex: 2, slotType: SlotType.Normal });
    actor.send({ type: 'REMOVE' });
    expect(actor.getSnapshot().value).toBe('inDiscard');
    expect(actor.getSnapshot().context.period).toBeUndefined();
    expect(actor.getSnapshot().context.slotIndex).toBeUndefined();
    expect(actor.getSnapshot().context.slotType).toBeUndefined();
  });

  it('UPDATE_SLOT_TYPE is an internal transition — stays onSlot and updates slotType', () => {
    const actor = makeActor();
    actor.send({ type: 'PLACE', period: Period.Morning, slotIndex: 0, slotType: SlotType.Normal });
    actor.send({ type: 'UPDATE_SLOT_TYPE', slotType: SlotType.Temporary });
    expect(actor.getSnapshot().value).toBe('onSlot');
    expect(actor.getSnapshot().context.slotType).toBe(SlotType.Temporary);
  });

  it('RESHUFFLE from inDiscard → inDeck', () => {
    const actor = makeActor();
    actor.send({ type: 'PLACE', period: Period.Morning, slotIndex: 0, slotType: SlotType.Normal });
    actor.send({ type: 'REMOVE' });
    actor.send({ type: 'RESHUFFLE' });
    expect(actor.getSnapshot().value).toBe('inDeck');
  });

  it('ignores invalid transitions (stays put)', () => {
    const actor = makeActor();
    // REMOVE from inDeck should be ignored
    actor.send({ type: 'REMOVE' });
    expect(actor.getSnapshot().value).toBe('inDeck');
  });
});

// ─── actionCardPositionMachine ────────────────────────────────────────────────

describe('actionCardPositionMachine', () => {
  function makeActor() {
    const actor = createActor(actionCardPositionMachine, {
      input: { instanceId: 'ac-1', templateId: 'action-work-order' },
    });
    actor.start();
    return actor;
  }

  it('starts in inDeck', () => {
    expect(makeActor().getSnapshot().value).toBe('inDeck');
  });

  it('DRAW → inHand', () => {
    const actor = makeActor();
    actor.send({ type: 'DRAW' });
    expect(actor.getSnapshot().value).toBe('inHand');
  });

  it('PLAY → played', () => {
    const actor = makeActor();
    actor.send({ type: 'DRAW' });
    actor.send({ type: 'PLAY' });
    expect(actor.getSnapshot().value).toBe('played');
  });

  it('DISCARD → inDiscard', () => {
    const actor = makeActor();
    actor.send({ type: 'DRAW' });
    actor.send({ type: 'PLAY' });
    actor.send({ type: 'DISCARD' });
    expect(actor.getSnapshot().value).toBe('inDiscard');
  });

  it('RESHUFFLE → inDeck', () => {
    const actor = makeActor();
    actor.send({ type: 'DRAW' });
    actor.send({ type: 'PLAY' });
    actor.send({ type: 'DISCARD' });
    actor.send({ type: 'RESHUFFLE' });
    expect(actor.getSnapshot().value).toBe('inDeck');
  });

  it('context instanceId and templateId are set from input', () => {
    const actor = makeActor();
    expect(actor.getSnapshot().context.instanceId).toBe('ac-1');
    expect(actor.getSnapshot().context.templateId).toBe('action-work-order');
  });
});

// ─── eventCardPositionMachine ─────────────────────────────────────────────────

describe('eventCardPositionMachine', () => {
  function makeActor() {
    const actor = createActor(eventCardPositionMachine, {
      input: { instanceId: 'ev-1', templateId: 'event-ddos-attack' },
    });
    actor.start();
    return actor;
  }

  it('starts in inDeck', () => {
    expect(makeActor().getSnapshot().value).toBe('inDeck');
  });

  it('DRAW → pending', () => {
    const actor = makeActor();
    actor.send({ type: 'DRAW' });
    expect(actor.getSnapshot().value).toBe('pending');
  });

  it('ISSUE_TICKET from pending → asTicket and sets track', () => {
    const actor = makeActor();
    actor.send({ type: 'DRAW' });
    actor.send({ type: 'ISSUE_TICKET', track: Track.BreakFix });
    expect(actor.getSnapshot().value).toBe('asTicket');
    expect(actor.getSnapshot().context.track).toBe(Track.BreakFix);
  });

  it('CLEAR_TICKET from asTicket → inDiscard and clears track', () => {
    const actor = makeActor();
    actor.send({ type: 'DRAW' });
    actor.send({ type: 'ISSUE_TICKET', track: Track.Projects });
    actor.send({ type: 'CLEAR_TICKET' });
    expect(actor.getSnapshot().value).toBe('inDiscard');
    expect(actor.getSnapshot().context.track).toBeUndefined();
  });

  it('RESOLVE from pending → inDiscard (event not issued as ticket)', () => {
    const actor = makeActor();
    actor.send({ type: 'DRAW' });
    actor.send({ type: 'RESOLVE' });
    expect(actor.getSnapshot().value).toBe('inDiscard');
  });

  it('RESHUFFLE from inDiscard → inDeck', () => {
    const actor = makeActor();
    actor.send({ type: 'DRAW' });
    actor.send({ type: 'RESOLVE' });
    actor.send({ type: 'RESHUFFLE' });
    expect(actor.getSnapshot().value).toBe('inDeck');
  });

  it('track starts undefined', () => {
    const actor = makeActor();
    expect(actor.getSnapshot().context.track).toBeUndefined();
  });
});
