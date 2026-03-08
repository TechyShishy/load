import { and, assign, setup } from 'xstate';
import { BANKRUPT_THRESHOLD, MIN_WEEKDAY_TRAFFIC_DRAW, MAX_WEEKDAY_TRAFFIC_DRAW, MIN_WEEKEND_TRAFFIC_DRAW, MAX_WEEKEND_TRAFFIC_DRAW, WEEKDAY_EVENT_DRAW, WEEKEND_EVENT_DRAW, HAND_SIZE, LoseReason, MAX_SLA_FAILURES, Period, PhaseId, STARTING_BUDGET, type ActionCard, type DrawLog, type GameContext, type Track, isWeekend, isFriday, getDayOfWeek } from './types.js';
import { buildActionDeck, buildEventDeck, buildTrafficDeck, drawN, makeRng, reshuffleDiscard } from './deck.js';
import {
  createInitialTimeSlots,
  createInitialTracks,
  createVendorSlots,
  resetSlotsForRound,
  stripWeeklyTemporarySlots,
} from './boardState.js';
import { autoFillTrafficSlots } from './autoFillTrafficSlots.js';
import { playActionCard as applyPlayActionCard, processCrisis } from './processCrisis.js';
import { checkLoseCondition, checkWinCondition, resolveRound } from './resolveRound.js';

// ─── Initial Context ──────────────────────────────────────────────────────────

export function createInitialContext(seed?: string): GameContext {
  const resolvedSeed = seed ?? crypto.randomUUID();
  const rng = makeRng(resolvedSeed + '-init');
  const trafficDeck = buildTrafficDeck(rng);
  const eventDeck = buildEventDeck(rng);
  const actionDeck = buildActionDeck(rng);
  const [initialHand, remainingActionDeck] = drawN(actionDeck, HAND_SIZE);

  return {
    budget: STARTING_BUDGET,
    round: 1,
    slaCount: 0,
    hand: initialHand,
    playedThisRound: [],
    timeSlots: createInitialTimeSlots(),
    tracks: createInitialTracks(),
    vendorSlots: createVendorSlots(),
    pendingEvents: [],
    mitigatedEventIds: [],
    activePhase: PhaseId.Draw,
    trafficDeck,
    trafficDiscard: [],
    eventDeck,
    eventDiscard: [],
    spawnedTrafficQueue: [],
    actionDeck: remainingActionDeck,
    actionDiscard: [],
    lastRoundSummary: null,
    loseReason: null,
    pendingRevenue: 0,
    seed: resolvedSeed,
    skipNextTrafficDraw: false,
    drawLog: { traffic: [], action: initialHand, events: [] },
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
    isActionValidForCrisisTarget: ({ context, event }) => {
      if (event.type !== 'PLAY_ACTION') return true;
      const { validForEventTemplateIds } = event.card;
      if (!validForEventTemplateIds || validForEventTemplateIds.length === 0) return true;
      const targetId =
        event.targetEventId ??
        context.pendingEvents.find((e) => !context.mitigatedEventIds.includes(e.id))?.id;
      if (!targetId) return false;
      const targetEvent = context.pendingEvents.find((e) => e.id === targetId);
      if (!targetEvent) return false;
      return (validForEventTemplateIds as readonly string[]).includes(targetEvent.templateId);
    },
  },
  actions: {
    performDraw: assign(({ context }) => {
      // Reset board slots for the new round
      const afterReset = resetSlotsForRound(context.timeSlots);
      const freshSlots = getDayOfWeek(context.round) === 1
        ? stripWeeklyTemporarySlots(afterReset)
        : afterReset;

      // AWS Outage carry-over: skip traffic draw this round
      if (context.skipNextTrafficDraw) {
        return {
          ...context,
          timeSlots: freshSlots,
          playedThisRound: [],
          mitigatedEventIds: [],
          pendingEvents: [],
          spawnedTrafficQueue: [],
          skipNextTrafficDraw: false,
          activePhase: PhaseId.Scheduling,
          drawLog: { traffic: [], action: context.drawLog?.action ?? [], events: [] },
        };
      }

      // Reshuffle if exhausted, then draw traffic cards
      // trafficDrawCount is computed first so it always consumes RNG position 0,
      // making the count deterministic for the same (seed, round) regardless of deck exhaustion state.
      const drawRng = makeRng(context.seed + '-tra-' + context.round);
      const trafficDrawCount = isWeekend(context.round)
        ? Math.floor(drawRng() * (MAX_WEEKEND_TRAFFIC_DRAW - MIN_WEEKEND_TRAFFIC_DRAW + 1)) + MIN_WEEKEND_TRAFFIC_DRAW
        : Math.floor(drawRng() * (MAX_WEEKDAY_TRAFFIC_DRAW - MIN_WEEKDAY_TRAFFIC_DRAW + 1)) + MIN_WEEKDAY_TRAFFIC_DRAW;
      const [trafficDeckInit, trafficDiscard] = reshuffleDiscard(
        context.trafficDeck,
        context.trafficDiscard,
        drawRng,
      );
      const [drawn, remainingTrafficDeck] = drawN(trafficDeckInit, trafficDrawCount);

      const baseCtx: GameContext = {
        ...context,
        timeSlots: freshSlots,
        trafficDeck: remainingTrafficDeck,
        trafficDiscard,
        playedThisRound: [],
        mitigatedEventIds: [],
        pendingEvents: [],
        spawnedTrafficQueue: [],
        activePhase: PhaseId.Scheduling,
      };

      // Auto-fill slots using round-robin period assignment
      const { context: filled } = autoFillTrafficSlots(baseCtx, drawn);

      // Build draw log: record which period/slot each drawn card landed in
      const trafficEntries: DrawLog['traffic'] = drawn.map(card => {
        const slot = filled.timeSlots.find(s => s.card?.id === card.id);
        return { card, period: slot?.period ?? Period.Morning, slotIndex: slot?.index ?? 0 };
      });

      return {
        ...filled,
        activePhase: PhaseId.Scheduling,
        drawLog: { traffic: trafficEntries, action: context.drawLog?.action ?? [], events: [] },
      };
    }),

    performExecution: assign(({ context }) => ({
      ...context,
      activePhase: PhaseId.Execution,
    })),

    performDrawCrisisEvent: assign(({ context }) => {
      // Draw event card(s) from the event deck (reshuffle if exhausted)
      const eventRng = makeRng(context.seed + '-ev-' + context.round);
      const [eventDeckInit, eventDiscard] = reshuffleDiscard(
        context.eventDeck,
        context.eventDiscard,
        eventRng,
      );
      const eventDrawCount = isWeekend(context.round) ? WEEKEND_EVENT_DRAW : WEEKDAY_EVENT_DRAW;
      const [drawn, remainingEventDeck] = drawN(eventDeckInit, eventDrawCount);
      return {
        ...context,
        eventDeck: remainingEventDeck,
        eventDiscard,
        pendingEvents: drawn,
        activePhase: PhaseId.Crisis,
        drawLog: { traffic: [], action: [], events: drawn },
      };
    }),

    performResolveCrisisEvent: assign(({ context }) => {
      const { context: updated } = processCrisis(context);
      return { ...updated };
    }),

    performResolution: assign(({ context }) => {
      // Place any SpawnTraffic-spawned cards onto the board so they are visible this round
      let resolveCtx = context;
      if (context.spawnedTrafficQueue.length > 0) {
        const { context: spawned } = autoFillTrafficSlots(
          context,
          context.spawnedTrafficQueue,
        );
        resolveCtx = { ...spawned, spawnedTrafficQueue: [] };
      }
      const { context: resolved, summary } = resolveRound(
        resolveCtx,
        context.spawnedTrafficQueue.length,
      );
      return {
        ...resolved,
        lastRoundSummary: { ...summary },
        activePhase: PhaseId.Resolution,
      };
    }),

    performEnd: assign(({ context }) => {
      // Return played Action cards to discard; unplayed cards carry over
      const newActionDiscard = [...context.actionDiscard, ...context.playedThisRound];

      // On Friday, discard entire hand before replenishing (fresh start for the new week)
      const friday = isFriday(context.round);
      let actionDeck = context.actionDeck;
      let actionDiscard = friday
        ? [...newActionDiscard, ...context.hand]
        : newActionDiscard;
      const hand: ActionCard[] = friday ? [] : [...context.hand];
      const deficit = HAND_SIZE - hand.length;

      let actionDrawn: ActionCard[] = [];
      if (deficit > 0) {
        const [reshuffled, emptyDiscard] = reshuffleDiscard(
          actionDeck,
          actionDiscard,
          makeRng(context.seed + '-act-' + context.round),
        );
        actionDeck = reshuffled;
        actionDiscard = emptyDiscard;
        const [drawn, remaining] = drawN(actionDeck, deficit);
        actionDrawn = drawn;
        hand.push(...drawn);
        actionDeck = remaining;
      }

      return {
        ...context,
        round: context.round + 1,
        hand,
        actionDeck,
        actionDiscard,
        trafficDiscard: context.trafficDiscard,
        playedThisRound: [],
        activePhase: PhaseId.End,
        drawLog: { traffic: [], action: actionDrawn, events: [] },
      };
    }),

    applyPlayAction: assign(({ context, event }) => {
      if (event.type !== 'PLAY_ACTION') return context;
      return applyPlayActionCard(context, event.card, event.targetEventId, event.targetTrafficCardId, event.targetPeriod, event.targetTrack);
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
  initial: 'draw',
  context: ({ input }) =>
    input ? { ...createInitialContext(input.seed), ...input } : createInitialContext(),
  states: {
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
        ADVANCE: { target: 'execution' },
      },
    },
    execution: {
      entry: 'performExecution',
      always: { target: 'crisis' },
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
      ],
      on: {
        ADVANCE: { target: 'end' },
      },
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
