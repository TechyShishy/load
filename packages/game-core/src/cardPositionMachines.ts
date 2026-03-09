import { assign, setup, type ActorRefFrom } from 'xstate';
import type { Period, Track } from './types.js';
import { SlotType } from './types.js';

// ─── Traffic Card Position Machine ───────────────────────────────────────────

export interface TrafficCardPositionContext {
  readonly instanceId: string;
  readonly templateId: string;
  period: Period | undefined;
  slotIndex: number | undefined;
  slotType: SlotType | undefined;
}

type TrafficCardPositionEvent =
  | { type: 'PLACE'; period: Period; slotIndex: number; slotType: SlotType }
  | { type: 'SPAWN' }
  | { type: 'REMOVE' }
  | { type: 'UPDATE_SLOT_TYPE'; slotType: SlotType }
  | { type: 'RESHUFFLE' };

export const trafficCardPositionMachine = setup({
  types: {
    context: {} as TrafficCardPositionContext,
    events: {} as TrafficCardPositionEvent,
    input: {} as { instanceId: string; templateId: string },
  },
  actions: {
    assignSlot: assign(({ event }) => {
      if (event.type !== 'PLACE') return {};
      return { period: event.period, slotIndex: event.slotIndex, slotType: event.slotType };
    }),
    clearSlot: assign(() => ({
      period: undefined,
      slotIndex: undefined,
      slotType: undefined,
    })),
    assignSlotType: assign(({ event }) => {
      if (event.type !== 'UPDATE_SLOT_TYPE') return {};
      return { slotType: event.slotType };
    }),
  },
}).createMachine({
  id: 'trafficCardPosition',
  context: ({ input }) => ({
    instanceId: input.instanceId,
    templateId: input.templateId,
    period: undefined,
    slotIndex: undefined,
    slotType: undefined,
  }),
  initial: 'inDeck',
  states: {
    inDeck: {
      on: {
        PLACE: { target: 'onSlot', actions: 'assignSlot' },
        SPAWN: { target: 'inQueue' },
      },
    },
    inQueue: {
      on: {
        PLACE: { target: 'onSlot', actions: 'assignSlot' },
      },
    },
    onSlot: {
      on: {
        REMOVE: { target: 'inDiscard', actions: 'clearSlot' },
        // No target = internal transition; context updated without re-entering state.
        UPDATE_SLOT_TYPE: { actions: 'assignSlotType' },
      },
    },
    inDiscard: {
      on: {
        RESHUFFLE: { target: 'inDeck' },
      },
    },
  },
});

export type TrafficCardActorRef = ActorRefFrom<typeof trafficCardPositionMachine>;

// ─── Action Card Position Machine ────────────────────────────────────────────

export interface ActionCardPositionContext {
  readonly instanceId: string;
  readonly templateId: string;
}

type ActionCardPositionEvent =
  | { type: 'DRAW' }
  | { type: 'PLAY' }
  | { type: 'DISCARD' }
  | { type: 'RESHUFFLE' };

export const actionCardPositionMachine = setup({
  types: {
    context: {} as ActionCardPositionContext,
    events: {} as ActionCardPositionEvent,
    input: {} as { instanceId: string; templateId: string },
  },
  actions: {},
}).createMachine({
  id: 'actionCardPosition',
  context: ({ input }) => ({
    instanceId: input.instanceId,
    templateId: input.templateId,
  }),
  initial: 'inDeck',
  states: {
    inDeck: { on: { DRAW: { target: 'inHand' } } },
    inHand: { on: { PLAY: { target: 'played' } } },
    played: { on: { DISCARD: { target: 'inDiscard' } } },
    inDiscard: { on: { RESHUFFLE: { target: 'inDeck' } } },
  },
});

export type ActionCardActorRef = ActorRefFrom<typeof actionCardPositionMachine>;

// ─── Event Card Position Machine ─────────────────────────────────────────────

export interface EventCardPositionContext {
  readonly instanceId: string;
  readonly templateId: string;
  track: Track | undefined;
}

type EventCardPositionEvent =
  | { type: 'DRAW' }
  | { type: 'ISSUE_TICKET'; track: Track }
  | { type: 'CLEAR_TICKET' }
  | { type: 'RESOLVE' }
  | { type: 'RESHUFFLE' };

export const eventCardPositionMachine = setup({
  types: {
    context: {} as EventCardPositionContext,
    events: {} as EventCardPositionEvent,
    input: {} as { instanceId: string; templateId: string },
  },
  actions: {
    assignTrack: assign(({ event }) => {
      if (event.type !== 'ISSUE_TICKET') return {};
      return { track: event.track };
    }),
    clearTrack: assign(() => ({ track: undefined })),
  },
}).createMachine({
  id: 'eventCardPosition',
  context: ({ input }) => ({
    instanceId: input.instanceId,
    templateId: input.templateId,
    track: undefined,
  }),
  initial: 'inDeck',
  states: {
    inDeck: { on: { DRAW: { target: 'pending' } } },
    pending: {
      on: {
        ISSUE_TICKET: { target: 'asTicket', actions: 'assignTrack' },
        RESOLVE: { target: 'inDiscard', actions: 'clearTrack' },
      },
    },
    asTicket: {
      on: {
        // Cleared by EmergencyMaintenance; card moves to discard and becomes available for reshuffle.
        CLEAR_TICKET: { target: 'inDiscard', actions: 'clearTrack' },
      },
    },
    inDiscard: { on: { RESHUFFLE: { target: 'inDeck' } } },
  },
});

export type EventCardActorRef = ActorRefFrom<typeof eventCardPositionMachine>;
