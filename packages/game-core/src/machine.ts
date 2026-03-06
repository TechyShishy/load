import { assign, setup } from 'xstate';
import { BANKRUPT_THRESHOLD, TRAFFIC_DRAW_COUNT, HAND_SIZE, LoseReason, MAX_SLA_FAILURES, PhaseId, STARTING_BUDGET, type ActionCard, type GameContext, type Period, type Track } from './types.js';
import { buildActionDeck, buildEventDeck, buildTrafficDeck, drawN, makeRng, reshuffleDiscard, type Rng } from './deck.js';
import {
  createInitialTimeSlots,
  createInitialTracks,
  createVendorSlots,
  resetSlotsForRound,
} from './boardState.js';
import { autoFillTrafficSlots } from './autoFillTrafficSlots.js';
import { playActionCard as applyPlayActionCard, processCrisis } from './processCrisis.js';
import { checkLoseCondition, checkWinCondition, resolveRound } from './resolveRound.js';

// ─── Initial Context ──────────────────────────────────────────────────────────

export function createInitialContext(rng: Rng = Math.random): GameContext {
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
    pendingOverloadCount: 0,
    seed: crypto.randomUUID(),
  };
}

// ─── Event Types ──────────────────────────────────────────────────────────────

export type GameEvent =
  | { type: 'ADVANCE' }
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
  },
  actions: {
    performDraw: assign(({ context }) => {
      // Reset board slots for the new round
      const freshSlots = resetSlotsForRound(context.timeSlots);

      // Reshuffle if exhausted, then draw traffic cards
      const drawRng = makeRng(context.seed + '-te-' + context.round);
      const [trafficDeckInit, trafficDiscard] = reshuffleDiscard(
        context.trafficDeck,
        context.trafficDiscard,
        drawRng,
      );
      const [drawn, remainingTrafficDeck] = drawN(trafficDeckInit, TRAFFIC_DRAW_COUNT);

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

      // Auto-fill slots with a fresh sub-rng so placement is deterministic
      const fillRng = makeRng(context.seed + '-fill-' + context.round);
      const { context: filled, overloadCount } = autoFillTrafficSlots(baseCtx, drawn, fillRng);
      return { ...filled, pendingOverloadCount: overloadCount, activePhase: PhaseId.Scheduling };
    }),

    performExecution: assign(({ context }) => ({
      ...context,
      activePhase: PhaseId.Execution,
    })),

    performDrawCrisisEvent: assign(({ context }) => {
      // Draw one event from the event deck (reshuffle if exhausted)
      const eventRng = makeRng(context.seed + '-ev-' + context.round);
      const [eventDeckInit, eventDiscard] = reshuffleDiscard(
        context.eventDeck,
        context.eventDiscard,
        eventRng,
      );
      const [drawn, remainingEventDeck] = drawN(eventDeckInit, 1);
      return {
        ...context,
        eventDeck: remainingEventDeck,
        eventDiscard,
        pendingEvents: drawn,
        activePhase: PhaseId.Crisis,
      };
    }),

    performResolveCrisisEvent: assign(({ context }) => {
      const { context: updated } = processCrisis(context);
      return { ...updated };
    }),

    performResolution: assign(({ context }) => {
      // Place any SpawnTraffic-spawned cards onto the board so they are visible this round
      let resolveCtx = context;
      let spawnOverloadCount = 0;
      if (context.spawnedTrafficQueue.length > 0) {
        const spawnRng = makeRng(context.seed + '-spawn-' + context.round);
        const { context: spawned, overloadCount } = autoFillTrafficSlots(
          context,
          context.spawnedTrafficQueue,
          spawnRng,
        );
        resolveCtx = { ...spawned, spawnedTrafficQueue: [] };
        spawnOverloadCount = overloadCount;
      }
      const { context: resolved, summary } = resolveRound(
        { ...resolveCtx, pendingOverloadCount: resolveCtx.pendingOverloadCount + spawnOverloadCount },
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

      // Move Traffic cards from time slots into traffic discard
      const usedTraffic = context.timeSlots.flatMap((s) => s.cards);
      const newTrafficDiscard = [...context.trafficDiscard, ...usedTraffic];

      // Replenish hand to HAND_SIZE from action deck if < HAND_SIZE
      let actionDeck = context.actionDeck;
      let actionDiscard = newActionDiscard;
      const hand = [...context.hand]; // carry-over unplayed cards
      const deficit = HAND_SIZE - hand.length;

      if (deficit > 0) {
        const [reshuffled, emptyDiscard] = reshuffleDiscard(
          actionDeck,
          actionDiscard,
          makeRng(context.seed + '-act-' + context.round),
        );
        actionDeck = reshuffled;
        actionDiscard = emptyDiscard;
        const [drawn, remaining] = drawN(actionDeck, deficit);
        hand.push(...drawn);
        actionDeck = remaining;
      }

      return {
        ...context,
        round: context.round + 1,
        hand,
        actionDeck,
        actionDiscard,
        trafficDiscard: newTrafficDiscard,
        playedThisRound: [],
        activePhase: PhaseId.End,
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
    input ? { ...createInitialContext(), ...input } : createInitialContext(),
  states: {
    draw: {
      entry: 'performDraw',
      always: [
        { guard: 'isGameLost', target: 'gameLost', actions: 'markGameLost' },
        { target: 'scheduling' },
      ],
    },
    scheduling: {
      on: {
        PLAY_ACTION: { actions: 'applyPlayAction' },
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
        PLAY_ACTION: { actions: 'applyPlayAction' },
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
