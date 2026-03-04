import { assign, setup } from 'xstate';
import { BANKRUPT_THRESHOLD, DRAW_COUNT, HAND_SIZE, LoseReason, MAX_SLA_FAILURES, PhaseId, STARTING_BUDGET, type ActionCard, type GameContext } from './types.js';
import { buildActionDeck, buildTrafficEventDeck, drawN, makeRng, reshuffleDiscard, type Rng } from './deck.js';
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
  const trafficEventDeck = buildTrafficEventDeck(rng);
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
    trafficEventDeck,
    trafficEventDiscard: [],
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
  | { type: 'PLAY_ACTION'; card: ActionCard; targetEventId?: string; targetTrafficCardId?: string }
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

      // Reshuffle if exhausted, then draw traffic/event cards
      const [teDeckInit, teDiscard] = reshuffleDiscard(
        context.trafficEventDeck,
        context.trafficEventDiscard,
        makeRng(context.seed + '-te-' + context.round),
      );
      let teDeck = teDeckInit;
      const [drawn, remaining] = drawN(teDeck, DRAW_COUNT);
      teDeck = remaining;

      const baseCtx: GameContext = {
        ...context,
        timeSlots: freshSlots,
        trafficEventDeck: teDeck,
        trafficEventDiscard: teDiscard,
        playedThisRound: [],
        mitigatedEventIds: [],
            activePhase: PhaseId.Scheduling,
      };

      // Auto-fill slots immediately after draw
      const { context: filled, overloadCount } = autoFillTrafficSlots(baseCtx, drawn);
      return { ...filled, pendingOverloadCount: overloadCount, activePhase: PhaseId.Scheduling };
    }),

    performExecution: assign(({ context }) => ({
      ...context,
      activePhase: PhaseId.Execution,
    })),

    performCrisis: assign(({ context }) => {
      const { context: updated } = processCrisis(context);
      return { ...updated, activePhase: PhaseId.Crisis };
    }),

    performResolution: assign(({ context }) => {
      const { context: resolved, summary } = resolveRound(context);
      return {
        ...resolved,
        lastRoundSummary: { ...summary },
        activePhase: PhaseId.Resolution,
      };
    }),

    performEnd: assign(({ context }) => {
      // Return played Action cards to discard; unplayed cards carry over
      const newActionDiscard = [...context.actionDiscard, ...context.playedThisRound];

      // Move Traffic/Event cards from time slots into TE discard
      const usedTraffic = context.timeSlots.flatMap((s) => s.cards);
      const newTeDiscard = [...context.trafficEventDiscard, ...usedTraffic];

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
        trafficEventDiscard: newTeDiscard,
        playedThisRound: [],
        activePhase: PhaseId.End,
      };
    }),

    applyPlayAction: assign(({ context, event }) => {
      if (event.type !== 'PLAY_ACTION') return context;
      return applyPlayActionCard(context, event.card, event.targetEventId, event.targetTrafficCardId);
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
      entry: 'performCrisis',
      on: {
        PLAY_ACTION: { actions: 'applyPlayAction' },
        ADVANCE: { target: 'resolution' },
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
