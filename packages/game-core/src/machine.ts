import { and, assign, setup } from 'xstate';
import { createActor } from 'xstate';
import {
  HAND_SIZE, LoseReason, Period, PhaseId, STARTING_BUDGET, Track,
  MAX_WEEKDAY_TRAFFIC_DRAW, MIN_WEEKDAY_TRAFFIC_DRAW,
  MAX_WEEKEND_TRAFFIC_DRAW, MIN_WEEKEND_TRAFFIC_DRAW,
  WEEKDAY_EVENT_DRAW, WEEKEND_EVENT_DRAW, BANKRUPT_THRESHOLD, MAX_SLA_FAILURES,
  type ActionCard, type Card, type DrawLog, type DrawLogTrafficEntry, type EventCard, type GameContext, type TrafficCard,
  type TrafficCardActorRegistry, type ActionCardActorRegistry, type EventCardActorRegistry,
  isWeekend, isFriday, getDayOfWeek,
} from './types.js';
import { buildActionDeck, buildEventDeck, buildTrafficDeck, drawN, makeRng, shuffle } from './deck.js';
import {
  createInitialSlotLayout,
  createVendorSlots,
  resetSlotLayout,
} from './boardState.js';
import { computeTrafficPlacements } from './autoFillTrafficSlots.js';
import { playActionCard as applyPlayActionCard, processCrisis } from './processCrisis.js';
import { checkLoseCondition, checkWinCondition, resolveRound } from './resolveRound.js';
import { getPendingEvents } from './cardPositionViews.js';
import {
  trafficCardPositionMachine, actionCardPositionMachine, eventCardPositionMachine,
} from './cardPositionMachines.js';

// ─── Initial Context ──────────────────────────────────────────────────────────

export function createInitialContext(seed?: string): GameContext {
  const resolvedSeed = seed ?? crypto.randomUUID();
  const rng = makeRng(resolvedSeed + '-init');
  const trafficCards = buildTrafficDeck(rng);
  const eventCards = buildEventDeck(rng);
  const allActionCards = buildActionDeck(rng);
  const [initialHandCards, remainingActionCards] = drawN(allActionCards, HAND_SIZE);

  // ─ card instance registry ─
  const cardInstances: Record<string, Card> = {};
  for (const c of [...trafficCards, ...eventCards, ...allActionCards]) {
    cardInstances[c.id] = c;
  }

  // ─ traffic card actors (all start inDeck) ─
  const trafficCardActors: TrafficCardActorRegistry = {};
  for (const card of trafficCards) {
    const actor = createActor(trafficCardPositionMachine, {
      input: { instanceId: card.id, templateId: card.templateId },
    });
    actor.start();
    trafficCardActors[card.id] = actor;
  }

  // ─ action card actors ─
  const actionCardActors: ActionCardActorRegistry = {};
  for (const card of remainingActionCards) {
    const actor = createActor(actionCardPositionMachine, {
      input: { instanceId: card.id, templateId: card.templateId },
    });
    actor.start();
    actionCardActors[card.id] = actor;
  }
  for (const card of initialHandCards) {
    const actor = createActor(actionCardPositionMachine, {
      input: { instanceId: card.id, templateId: card.templateId },
    });
    actor.start();
    actor.send({ type: 'DRAW' }); // inDeck → inHand
    actionCardActors[card.id] = actor;
  }

  // ─ event card actors (all start inDeck) ─
  const eventCardActors: EventCardActorRegistry = {};
  for (const card of eventCards) {
    const actor = createActor(eventCardPositionMachine, {
      input: { instanceId: card.id, templateId: card.templateId },
    });
    actor.start();
    eventCardActors[card.id] = actor;
  }

  const ticketOrders: Record<Track, string[]> = {
    [Track.BreakFix]: [],
    [Track.Projects]: [],
    [Track.Maintenance]: [],
  };

  return {
    budget: STARTING_BUDGET,
    round: 1,
    slaCount: 0,
    cardInstances,
    trafficCardActors,
    actionCardActors,
    eventCardActors,
    slotLayout: createInitialSlotLayout(),
    ticketOrders,
    ticketProgress: {},
    ticketIssuedRound: {},
    trafficDeckOrder: trafficCards.map((c) => c.id),
    trafficDiscardOrder: [],
    actionDeckOrder: remainingActionCards.map((c) => c.id),
    actionDiscardOrder: [],
    eventDeckOrder: eventCards.map((c) => c.id),
    eventDiscardOrder: [],
    handOrder: initialHandCards.map((c) => c.id),
    playedThisRoundOrder: [],
    pendingEventsOrder: [],
    spawnedQueueOrder: [],
    spawnedTrafficIds: [],
    vendorSlots: createVendorSlots(),
    mitigatedEventIds: [],
    activePhase: PhaseId.Draw,
    lastRoundSummary: null,
    loseReason: null,
    pendingRevenue: 0,
    seed: resolvedSeed,
    skipNextTrafficDraw: false,
    revenueBoostMultiplier: 1,
    slaForgivenessThisRound: 0,
    drawLog: { traffic: [], action: initialHandCards, events: [] },
  };
}

// ─── Event Types ──────────────────────────────────────────────────────────────

export type GameEvent =
  | { type: 'ADVANCE' }
  | { type: 'DRAW_COMPLETE' }
  | { type: 'PLAY_ACTION'; card: ActionCard; targetEventId?: string; targetTrafficCardId?: string; targetPeriod?: Period; targetTrack?: Track }
  | { type: 'RESET' };

// ─── Machine ──────────────────────────────────────────────────────────────────

export const gameMachine = setup({
  types: {
    context: {} as GameContext,
    events: {} as GameEvent,
    input: {} as Partial<GameContext> | undefined,
  },
  guards: {
    isGameLost: ({ context }) => checkLoseCondition(context) !== null,
    isGameWon: ({ context }) => checkWinCondition(context),
    isBankrupt: ({ context }) => context.budget < BANKRUPT_THRESHOLD,
    isSLAExceeded: ({ context }) => context.slaCount >= MAX_SLA_FAILURES,
    isWeekendRound: ({ context }) => isWeekend(context.round),
    isWeekendActionAllowed: ({ context, event }) => {
      if (!isWeekend(context.round)) return true;
      if (event.type !== 'PLAY_ACTION') return false;
      return event.card.allowedOnWeekend;
    },
    isNotCrisisOnly: ({ event }) => {
      if (event.type !== 'PLAY_ACTION') return true;
      return event.card.crisisOnly !== true;
    },
    isSavedScheduling: ({ context }) => context.activePhase === PhaseId.Scheduling,
    isSavedCrisis: ({ context }) => context.activePhase === PhaseId.Crisis,
    isActionValidForCrisisTarget: ({ context, event }) => {
      if (event.type !== 'PLAY_ACTION') return true;
      const { validForEventTemplateIds } = event.card;
      if (!validForEventTemplateIds || validForEventTemplateIds.length === 0) return true;
      const pending = getPendingEvents(context);
      const targetId =
        event.targetEventId ??
        pending.find((e) => !context.mitigatedEventIds.includes(e.id))?.id;
      if (!targetId) return false;
      const targetEvent = pending.find((e) => e.id === targetId);
      if (!targetEvent) return false;
      return validForEventTemplateIds.includes(targetEvent.templateId);
    },
  },
  actions: {
    performDraw: assign(({ context }) => {
      const freshLayout = resetSlotLayout(context.slotLayout);
      const freshMultiplier = getDayOfWeek(context.round) === 1 ? 1 : context.revenueBoostMultiplier;

      // AWS Outage carry-over: skip traffic draw this round.
      if (context.skipNextTrafficDraw) {
        return {
          ...context,
          slotLayout: freshLayout,
          playedThisRoundOrder: [],
          mitigatedEventIds: [],
          pendingEventsOrder: [],
          spawnedQueueOrder: [],
          skipNextTrafficDraw: false,
          revenueBoostMultiplier: freshMultiplier,
          activePhase: PhaseId.Scheduling,
          drawLog: {
            traffic: [],
            action: context.drawLog?.action ?? [],
            events: [],
          },
        };
      }

      // RNG position 0 is always the draw count (deterministic for same seed+round).
      const drawRng = makeRng(context.seed + '-tra-' + context.round);
      const trafficDrawCount = isWeekend(context.round)
        ? Math.floor(drawRng() * (MAX_WEEKEND_TRAFFIC_DRAW - MIN_WEEKEND_TRAFFIC_DRAW + 1)) + MIN_WEEKEND_TRAFFIC_DRAW
        : Math.floor(drawRng() * (MAX_WEEKDAY_TRAFFIC_DRAW - MIN_WEEKDAY_TRAFFIC_DRAW + 1)) + MIN_WEEKDAY_TRAFFIC_DRAW;

      // Reshuffle traffic discard if deck is exhausted.
      let trafficDeckOrder = context.trafficDeckOrder;
      let trafficDiscardOrder = context.trafficDiscardOrder;
      if (trafficDeckOrder.length === 0 && trafficDiscardOrder.length > 0) {
        for (const id of trafficDiscardOrder) {
          context.trafficCardActors[id]?.send({ type: 'RESHUFFLE' });
        }
        trafficDeckOrder = shuffle(trafficDiscardOrder, drawRng);
        trafficDiscardOrder = [];
      }

      const drawnIds = trafficDeckOrder.slice(0, trafficDrawCount);
      const remainingDeckOrder = trafficDeckOrder.slice(trafficDrawCount);

      // Compute slot placements (pure, no side effects).
      const occupiedSlots = new Set<string>();
      for (const actor of Object.values(context.trafficCardActors)) {
        if (!actor) continue;
        const snap = actor.getSnapshot();
        if (snap.value === 'onSlot') {
          const c = snap.context;
          if (c.period !== undefined && c.slotIndex !== undefined) {
            occupiedSlots.add(`${c.period}:${c.slotIndex}`);
          }
        }
      }
      const drawnCards = drawnIds.map((id) => context.cardInstances[id] as TrafficCard);
      const { placements, newSlotLayout } = computeTrafficPlacements(
        freshLayout,
        occupiedSlots,
        drawnCards,
        context.round,
      );

      // Send PLACE events to actors (side effect — actor state updated synchronously).
      for (const p of placements) {
        context.trafficCardActors[p.cardId]?.send({
          type: 'PLACE',
          period: p.period,
          slotIndex: p.slotIndex,
          slotType: p.slotType,
        });
      }

      // Build draw log.
      const trafficEntries: DrawLogTrafficEntry[] = placements.map((p) => ({
        card: context.cardInstances[p.cardId] as TrafficCard,
        period: p.period,
        slotIndex: p.slotIndex,
      }));

      return {
        ...context,
        slotLayout: newSlotLayout,
        trafficDeckOrder: remainingDeckOrder,
        trafficDiscardOrder,
        playedThisRoundOrder: [],
        mitigatedEventIds: [],
        pendingEventsOrder: [],
        spawnedQueueOrder: [],
        revenueBoostMultiplier: freshMultiplier,
        activePhase: PhaseId.Scheduling,
        drawLog: { traffic: trafficEntries, action: context.drawLog?.action ?? [], events: [] },
      };
    }),

    performDrawCrisisEvent: assign(({ context }) => {
      // Resume-from-save: events already in pendingEventsOrder.
      if (context.pendingEventsOrder.length > 0) {
        return { ...context, activePhase: PhaseId.Crisis };
      }

      const eventRng = makeRng(context.seed + '-ev-' + context.round);
      let eventDeckOrder = context.eventDeckOrder;
      let eventDiscardOrder = context.eventDiscardOrder;

      // Reshuffle if exhausted.
      if (eventDeckOrder.length === 0 && eventDiscardOrder.length > 0) {
        for (const id of eventDiscardOrder) {
          context.eventCardActors[id]?.send({ type: 'RESHUFFLE' });
        }
        eventDeckOrder = shuffle(eventDiscardOrder, eventRng);
        eventDiscardOrder = [];
      }

      const eventDrawCount = isWeekend(context.round) ? WEEKEND_EVENT_DRAW : WEEKDAY_EVENT_DRAW;
      const drawnIds = eventDeckOrder.slice(0, eventDrawCount);
      const remainingDeckOrder = eventDeckOrder.slice(eventDrawCount);

      // Send DRAW to each drawn event actor.
      for (const id of drawnIds) {
        context.eventCardActors[id]?.send({ type: 'DRAW' });
      }

      const drawnCards = drawnIds.map((id) => context.cardInstances[id] as EventCard);

      return {
        ...context,
        eventDeckOrder: remainingDeckOrder,
        eventDiscardOrder,
        pendingEventsOrder: drawnIds,
        activePhase: PhaseId.Crisis,
        drawLog: { traffic: [], action: [], events: drawnCards },
      };
    }),

    performResolveCrisisEvent: assign(({ context }) => {
      const { context: updated } = processCrisis(context);
      return { ...updated };
    }),

    performResolution: assign(({ context }) => {
      // Build the set of spawned IDs now, before the queue is cleared.
      // This includes both queue-placed spawns (e.g. Viral Spike) and
      // directly-placed spawns (e.g. DDoS cards placed during onCrisis).
      const spawnedIds = new Set(context.spawnedQueueOrder);
      const spawnCount = spawnedIds.size;

      // Place spawned traffic cards that still need a slot (cards pre-placed
      // during onCrisis — e.g. DDoS — are already in onSlot and are skipped).
      let resolveCtx = context;
      if (spawnCount > 0) {
        const needsPlacement = context.spawnedQueueOrder.filter((id) => {
          const actor = context.trafficCardActors[id];
          return !actor || actor.getSnapshot().value !== 'onSlot';
        });

        if (needsPlacement.length > 0) {
          const occupiedSlots = new Set<string>();
          for (const actor of Object.values(context.trafficCardActors)) {
            if (!actor) continue;
            const snap = actor.getSnapshot();
            if (snap.value === 'onSlot') {
              const c = snap.context;
              if (c.period !== undefined && c.slotIndex !== undefined) {
                occupiedSlots.add(`${c.period}:${c.slotIndex}`);
              }
            }
          }
          const spawnedCards = needsPlacement.map((id) => context.cardInstances[id] as TrafficCard);
          const { placements, newSlotLayout } = computeTrafficPlacements(
            context.slotLayout,
            occupiedSlots,
            spawnedCards,
            context.round,
          );
          for (const p of placements) {
            context.trafficCardActors[p.cardId]?.send({
              type: 'PLACE',
              period: p.period,
              slotIndex: p.slotIndex,
              slotType: p.slotType,
            });
          }
          resolveCtx = { ...context, slotLayout: newSlotLayout, spawnedQueueOrder: [] };
        } else {
          // All spawns were pre-placed (e.g. DDoS direct placement during crisis).
          // Clear the queue so the next round doesn't re-protect these cards.
          resolveCtx = { ...context, spawnedQueueOrder: [] };
        }
      }

      const { context: resolved, summary } = resolveRound(resolveCtx, spawnCount, spawnedIds);
      return { ...resolved, lastRoundSummary: { ...summary }, activePhase: PhaseId.Resolution };
    }),

    performEnd: assign(({ context }) => {
      const friday = isFriday(context.round);
      const actRng = makeRng(context.seed + '-act-' + context.round);

      // Move played cards to discard.
      for (const id of context.playedThisRoundOrder) {
        context.actionCardActors[id]?.send({ type: 'DISCARD' });
      }
      let actionDiscardOrder = [...context.actionDiscardOrder, ...context.playedThisRoundOrder];

      // On Friday, also discard the entire remaining hand.
      let handOrder = context.handOrder;
      if (friday) {
        for (const id of context.handOrder) {
          context.actionCardActors[id]?.send({ type: 'DISCARD' });
        }
        actionDiscardOrder = [...actionDiscardOrder, ...context.handOrder];
        handOrder = [];
      }

      const deficit = HAND_SIZE - handOrder.length;
      let actionDeckOrder = context.actionDeckOrder;
      let actionDrawn: ActionCard[] = [];

      if (deficit > 0) {
        // Reshuffle if exhausted.
        if (actionDeckOrder.length === 0 && actionDiscardOrder.length > 0) {
          for (const id of actionDiscardOrder) {
            context.actionCardActors[id]?.send({ type: 'RESHUFFLE' });
          }
          actionDeckOrder = shuffle(actionDiscardOrder, actRng);
          actionDiscardOrder = [];
        }
        const drawnIds = actionDeckOrder.slice(0, deficit);
        actionDeckOrder = actionDeckOrder.slice(deficit);
        for (const id of drawnIds) {
          context.actionCardActors[id]?.send({ type: 'DRAW' });
        }
        handOrder = [...handOrder, ...drawnIds];
        actionDrawn = drawnIds.map((id) => context.cardInstances[id] as ActionCard);
      }

      return {
        ...context,
        round: context.round + 1,
        handOrder,
        actionDeckOrder,
        actionDiscardOrder,
        playedThisRoundOrder: [],
        activePhase: PhaseId.End,
        drawLog: { traffic: [], action: actionDrawn, events: [] },
      };
    }),

    applyPlayAction: assign(({ context, event }) => {
      if (event.type !== 'PLAY_ACTION') return context;
      return applyPlayActionCard(
        context, event.card, event.targetEventId, event.targetTrafficCardId, event.targetPeriod, event.targetTrack,
      );
    }),

    markGameLost: assign(({ context }) => {
      const reason = checkLoseCondition(context);
      return {
        ...context,
        loseReason: reason === 'Bankrupt' ? LoseReason.Bankrupt : LoseReason.SLAExceeded,
        activePhase: PhaseId.GameLost,
      };
    }),

    markGameWon: assign(({ context }) => ({
      ...context,
      activePhase: PhaseId.GameWon,
    })),

    resetGame: assign(() => createInitialContext()),
  },
}).createMachine({
  id: 'load',
  initial: 'init',
  context: ({ input }) =>
    input ? { ...createInitialContext(input.seed), ...input } : createInitialContext(),
  states: {
    init: {
      always: [
        { guard: 'isSavedScheduling', target: 'scheduling' },
        { guard: 'isSavedCrisis', target: 'crisis' },
        { target: 'draw' },
      ],
    },
    draw: {
      entry: 'performDraw',
      on: {
        DRAW_COMPLETE: [
          { guard: 'isGameLost', target: 'gameLost', actions: 'markGameLost' },
          { guard: 'isWeekendRound', target: 'crisis' },
          { target: 'scheduling' },
        ],
      },
    },
    scheduling: {
      on: {
        PLAY_ACTION: { guard: 'isNotCrisisOnly', actions: 'applyPlayAction' },
        ADVANCE: { target: 'crisis' },
      },
    },
    crisis: {
      entry: 'performDrawCrisisEvent',
      on: {
        PLAY_ACTION: { guard: and(['isWeekendActionAllowed', 'isActionValidForCrisisTarget']), actions: 'applyPlayAction' },
        ADVANCE: { target: 'resolution', actions: 'performResolveCrisisEvent' },
      },
    },
    resolution: {
      entry: 'performResolution',
      always: [
        { guard: 'isBankrupt', target: 'gameLost', actions: 'markGameLost' },
        { guard: 'isSLAExceeded', target: 'gameLost', actions: 'markGameLost' },
        { guard: 'isGameWon', target: 'gameWon', actions: 'markGameWon' },
        { target: 'end' },
      ],
    },
    end: {
      entry: 'performEnd',
      always: { target: 'draw' },
    },
    gameWon: {
      on: { RESET: { target: 'draw', actions: 'resetGame' } },
    },
    gameLost: {
      on: { RESET: { target: 'draw', actions: 'resetGame' } },
    },
  },
});


