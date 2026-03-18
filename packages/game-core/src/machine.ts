import { and, assign, enqueueActions, setup } from 'xstate';
import { ACTION_CARD_REGISTRY, BUILT_IN_CONTRACTS } from './data/index.js';
import {
  CardType, HAND_SIZE, LoseReason, Period, PhaseId, STARTING_BUDGET, Track,
  MAX_WEEKDAY_TRAFFIC_DRAW, MIN_WEEKDAY_TRAFFIC_DRAW,
  MAX_WEEKEND_TRAFFIC_DRAW, MIN_WEEKEND_TRAFFIC_DRAW,
  WEEKDAY_EVENT_DRAW, WEEKEND_EVENT_DRAW, BANKRUPT_THRESHOLD, MAX_SLA_FAILURES,
  type ActionCard, type Card, type ContractDef, type DeckSpec, type DrawLogTrafficEntry, type EventCard, type GameContext, type TrafficCard, type VendorCard,
  isWeekend, isFriday, getDayOfWeek,
} from './types.js';
import { buildActionDeck, buildEventDeck, buildTrafficDeck, buildVendorDeck, drawN, makeRng, shuffle } from './deck.js';
import {
  createInitialSlotLayout,
  createVendorSlots,
  resetSlotLayout,
} from './boardState.js';
import { computeTrafficPlacements } from './autoFillTrafficSlots.js';
import { playActionCard as applyPlayActionCard, playVendorCard as applyPlayVendorCard, processCrisis } from './processCrisis.js';
import { checkLoseCondition, checkWinCondition, resolveRound } from './resolveRound.js';
import { getPendingEvents } from './cardPositionViews.js';


// ─── Initial Context ──────────────────────────────────────────────────────────

export function createInitialContext(seed?: string, contract?: ContractDef, deckSpec?: ReadonlyArray<DeckSpec>): GameContext {
  // Fixed-seed contracts always use their declared seed, regardless of what the
  // caller passed. createInitialContext(seed, contract) — if fixedSeed is set on
  // the contract, the seed arg is ignored.
  const resolvedSeed = contract?.fixedSeed ?? seed ?? crypto.randomUUID();
  const rng = makeRng(resolvedSeed + '-init');
  const trafficCards = buildTrafficDeck(rng, contract?.trafficDeck);
  const eventCards = buildEventDeck(rng, contract?.eventDeck);

  // Split the player's combined deck spec into action-only entries before
  // calling buildActionDeck, which crashes on unknown templateIds. The same
  // full spec is passed to buildVendorDeck, which skips non-vendor entries.
  // Note: if all entries in deckSpec are vendor templateIds, actionDeckSpec
  // will be [] and buildActionDeck will warn + silently fall back to
  // FALLBACK_ACTION_DECK. The deck builder's MIN_DECK_SIZE validation prevents
  // this in normal gameplay.
  const actionDeckSpec = deckSpec?.filter((e) => ACTION_CARD_REGISTRY.has(e.templateId));
  const allActionCards = buildActionDeck(rng, contract?.actionDeck ?? actionDeckSpec);

  // Option A: vendor cards are shuffled into the single combined draw pile
  // alongside action cards. actionDeckOrder therefore holds IDs of both types.
  // Card rendering detects the type at draw time and renders accordingly.
  // This requires zero changes to the draw machinery — handOrder already
  // accepts both ActionCard and VendorCard instance IDs.
  // Note: when contract.actionDeck is set the contract controls the full deck;
  // vendor cards from the player's deckSpec are intentionally excluded.
  const vendorCards = contract?.actionDeck ? [] : buildVendorDeck(rng, deckSpec);
  const allDrawCards = shuffle([...allActionCards, ...vendorCards], rng);
  const [initialHandCards, remainingCards] = drawN(allDrawCards, HAND_SIZE);

  // ─ card instance registry ─
  const cardInstances: Record<string, Card> = {};
  for (const c of [...trafficCards, ...eventCards, ...allActionCards, ...vendorCards]) {
    cardInstances[c.id] = c;
  }

  const initialActionCards = initialHandCards.filter((c): c is ActionCard => c.type === CardType.Action);

  const ticketOrders: Record<Track, string[]> = {
    [Track.BreakFix]: [],
    [Track.Projects]: [],
    [Track.Maintenance]: [],
  };

  return {
    budget: contract?.startingBudget ?? STARTING_BUDGET,
    round: 1,
    slaCount: 0,
    contractId: contract?.id ?? 'standard',
    slaLimit: contract?.slaLimit ?? MAX_SLA_FAILURES,
    cardInstances,
    trafficSlotPositions: {},
    slotLayout: createInitialSlotLayout(),
    ticketOrders,
    ticketProgress: {},
    ticketIssuedRound: {},
    trafficDeckOrder: trafficCards.map((c) => c.id),
    trafficDiscardOrder: [],
    actionDeckOrder: remainingCards.map((c) => c.id),
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
    roundHistory: [],
    loseReason: null,
    pendingLedger: [],
    seed: resolvedSeed,
    skipNextTrafficDraw: false,
    revenueBoostMultiplier: 1,
    slaForgivenessThisRound: 0,
    drawLog: { traffic: [], action: initialActionCards, events: [] },
  };
}

// ─── Event Types ──────────────────────────────────────────────────────────────

export type GameEvent =
  | { type: 'ADVANCE' }
  | { type: 'DRAW_COMPLETE' }
  | { type: 'PLAY_ACTION'; card: ActionCard; targetEventId?: string; targetTrafficCardId?: string; targetPeriod?: Period; targetTrack?: Track }
  | { type: 'PLAY_VENDOR'; card: VendorCard; slotIndex: number }
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
    isSLAExceeded: ({ context }) => context.slaCount >= context.slaLimit,
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
    isVendorSlotEmpty: ({ context, event }) => {
      if (event.type !== 'PLAY_VENDOR') return false;
      return context.vendorSlots[event.slotIndex]?.card === null;
    },
    isVendorCardInHand: ({ context, event }) => {
      if (event.type !== 'PLAY_VENDOR') return false;
      return context.handOrder.includes(event.card.id);
    },
    canAffordVendor: ({ context, event }) => {
      if (event.type !== 'PLAY_VENDOR') return false;
      return context.budget >= event.card.cost;
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
        pending.find(
          (e) =>
            !context.mitigatedEventIds.includes(e.id) &&
            validForEventTemplateIds.includes(e.templateId),
        )?.id;
      if (!targetId) return false;
      const targetEvent = pending.find((e) => e.id === targetId);
      if (!targetEvent) return false;
      return validForEventTemplateIds.includes(targetEvent.templateId);
    },
  },
  actions: {
    performDraw: enqueueActions(({ context, enqueue }) => {
      const freshLayout = resetSlotLayout(context.slotLayout);
      const freshMultiplier = getDayOfWeek(context.round) === 1 ? 1 : context.revenueBoostMultiplier;

      // AWS Outage carry-over: skip traffic draw this round.
      if (context.skipNextTrafficDraw) {
        enqueue.assign({
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
        });
        return;
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
        trafficDeckOrder = shuffle(trafficDiscardOrder, drawRng);
        trafficDiscardOrder = [];
      }

      const drawnIds = trafficDeckOrder.slice(0, trafficDrawCount);
      const remainingDeckOrder = trafficDeckOrder.slice(trafficDrawCount);

      // Compute slot placements (pure, no side effects).
      const occupiedSlots = new Set<string>(
        Object.values(context.trafficSlotPositions).map((pos) => `${pos.period}:${pos.slotIndex}`),
      );
      const drawnCards = drawnIds.map((id) => context.cardInstances[id] as TrafficCard);
      const { placements, newSlotLayout } = computeTrafficPlacements(
        freshLayout,
        occupiedSlots,
        drawnCards,
        context.round,
      );

      const newTrafficSlotPositions = { ...context.trafficSlotPositions };
      for (const p of placements) {
        newTrafficSlotPositions[p.cardId] = { period: p.period, slotIndex: p.slotIndex, slotType: p.slotType };
      }

      // Build draw log.
      const trafficEntries: DrawLogTrafficEntry[] = placements.map((p) => ({
        card: context.cardInstances[p.cardId] as TrafficCard,
        period: p.period,
        slotIndex: p.slotIndex,
      }));

      enqueue.assign({
        slotLayout: newSlotLayout,
        trafficDeckOrder: remainingDeckOrder,
        trafficDiscardOrder,
        trafficSlotPositions: newTrafficSlotPositions,
        playedThisRoundOrder: [],
        mitigatedEventIds: [],
        pendingEventsOrder: [],
        spawnedQueueOrder: [],
        revenueBoostMultiplier: freshMultiplier,
        activePhase: PhaseId.Scheduling,
        drawLog: { traffic: trafficEntries, action: context.drawLog?.action ?? [], events: [] },
      });
    }),

    performDrawCrisisEvent: enqueueActions(({ context, enqueue }) => {
      // Resume-from-save: events already in pendingEventsOrder.
      if (context.pendingEventsOrder.length > 0) {
        enqueue.assign({ activePhase: PhaseId.Crisis });
        return;
      }

      const eventRng = makeRng(context.seed + '-ev-' + context.round);
      let eventDeckOrder = context.eventDeckOrder;
      let eventDiscardOrder = context.eventDiscardOrder;

      // Reshuffle if exhausted.
      if (eventDeckOrder.length === 0 && eventDiscardOrder.length > 0) {
        eventDeckOrder = shuffle(eventDiscardOrder, eventRng);
        eventDiscardOrder = [];
      }

      const eventDrawCount = isWeekend(context.round) ? WEEKEND_EVENT_DRAW : WEEKDAY_EVENT_DRAW;
      const drawnIds = eventDeckOrder.slice(0, eventDrawCount);
      const remainingDeckOrder = eventDeckOrder.slice(eventDrawCount);

      const drawnCards = drawnIds.map((id) => context.cardInstances[id] as EventCard);

      enqueue.assign({
        eventDeckOrder: remainingDeckOrder,
        eventDiscardOrder,
        pendingEventsOrder: drawnIds,
        activePhase: PhaseId.Crisis,
        drawLog: { traffic: [], action: [], events: drawnCards },
      });
    }),

    performResolveCrisisEvent: assign(({ context }) => {
      const { context: updated } = processCrisis(context);
      return { ...updated };
    }),

    performResolution: enqueueActions(({ context, enqueue }) => {
      // Build the set of spawned IDs now, before the queue is cleared.
      // This includes both queue-placed spawns (e.g. Viral Spike) and
      // directly-placed spawns (e.g. DDoS cards placed during onCrisis).
      const spawnedIds = new Set(context.spawnedQueueOrder);
      const spawnCount = spawnedIds.size;

      // Place spawned traffic cards that still need a slot (cards pre-placed
      // during onCrisis — e.g. DDoS — are already in onSlot and are skipped).
      let resolveCtx = context;
      if (spawnCount > 0) {
        const needsPlacement = context.spawnedQueueOrder.filter(
          (id) => !(id in context.trafficSlotPositions),
        );

        if (needsPlacement.length > 0) {
          const occupiedSlots = new Set<string>(
            Object.values(context.trafficSlotPositions).map((pos) => `${pos.period}:${pos.slotIndex}`),
          );
          const spawnedCards = needsPlacement.map((id) => context.cardInstances[id] as TrafficCard);
          const { placements, newSlotLayout } = computeTrafficPlacements(
            context.slotLayout,
            occupiedSlots,
            spawnedCards,
            context.round,
          );
          const newTrafficSlotPositions = { ...context.trafficSlotPositions };
          for (const p of placements) {
            newTrafficSlotPositions[p.cardId] = { period: p.period, slotIndex: p.slotIndex, slotType: p.slotType };
          }
          resolveCtx = { ...context, slotLayout: newSlotLayout, trafficSlotPositions: newTrafficSlotPositions, spawnedQueueOrder: [] };
        } else {
          // All spawns were pre-placed (e.g. DDoS direct placement during crisis).
          // Clear the queue so the next round doesn't re-protect these cards.
          resolveCtx = { ...context, spawnedQueueOrder: [] };
        }
      }

      const { context: resolved, summary } = resolveRound(resolveCtx, spawnCount, spawnedIds);
      enqueue.assign({ ...resolved, lastRoundSummary: { ...summary }, roundHistory: [...resolved.roundHistory, { ...summary }], activePhase: PhaseId.Resolution });
    }),

    performEnd: enqueueActions(({ context, enqueue }) => {
      const friday = isFriday(context.round);
      const actRng = makeRng(context.seed + '-act-' + context.round);

      // Move played cards to discard.
      let actionDiscardOrder = [...context.actionDiscardOrder, ...context.playedThisRoundOrder];

      // On Friday, also discard the entire remaining hand.
      let handOrder = context.handOrder;
      if (friday) {
        actionDiscardOrder = [...actionDiscardOrder, ...context.handOrder];
        handOrder = [];
      }

      const deficit = HAND_SIZE - handOrder.length;
      let actionDeckOrder = context.actionDeckOrder;
      let actionDrawn: ActionCard[] = [];

      if (deficit > 0) {
        // Reshuffle if exhausted.
        if (actionDeckOrder.length === 0 && actionDiscardOrder.length > 0) {
          actionDeckOrder = shuffle(actionDiscardOrder, actRng);
          actionDiscardOrder = [];
        }
        const drawnIds = actionDeckOrder.slice(0, deficit);
        actionDeckOrder = actionDeckOrder.slice(deficit);
        handOrder = [...handOrder, ...drawnIds];
        actionDrawn = drawnIds
          .map((id) => context.cardInstances[id])
          .filter((c): c is ActionCard => c !== undefined && c.type === CardType.Action);
      }

      enqueue.assign({
        round: context.round + 1,
        handOrder,
        actionDeckOrder,
        actionDiscardOrder,
        playedThisRoundOrder: [],
        activePhase: PhaseId.End,
        drawLog: { traffic: [], action: actionDrawn, events: [] },
      });
    }),

    applyPlayAction: assign(({ context, event }) => {
      if (event.type !== 'PLAY_ACTION') return context;
      return applyPlayActionCard(
        context, event.card, event.targetEventId, event.targetTrafficCardId, event.targetPeriod, event.targetTrack,
      );
    }),

    applyPlayVendor: assign(({ context, event }) => {
      if (event.type !== 'PLAY_VENDOR') return context;
      return applyPlayVendorCard(context, event.card, event.slotIndex);
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

    resetGame: assign(({ context }) => {
      // Re-look up the contract by id so the reset preserves the contract's
      // fixed seed, custom action deck, and other spec fields.
      // TODO-0017 (#37): resetGame loses any custom deckSpec the player configured via
      // the Deck Builder when the contract has no baked-in actionDeck. Store
      // deckSpec in GameContext and thread it through here once RESET is wired
      // to a UI "Play Again" element.
      const contract = BUILT_IN_CONTRACTS.find((c) => c.id === context.contractId);
      return createInitialContext(undefined, contract);
    }),
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
        PLAY_VENDOR: { guard: and(['isVendorSlotEmpty', 'isVendorCardInHand', 'canAffordVendor']), actions: 'applyPlayVendor' },
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


