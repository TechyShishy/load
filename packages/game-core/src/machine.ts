import { assign, setup } from 'xstate';
import { HAND_SIZE, LoseReason, PhaseId, type ActionCard, type GameContext } from './types.js';
import { buildActionDeck, buildTrafficEventDeck, drawN, reshuffleDiscard } from './deck.js';
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

export function createInitialContext(): GameContext {
  const trafficEventDeck = buildTrafficEventDeck();
  const actionDeck = buildActionDeck();
  const [initialHand, remainingActionDeck] = drawN(actionDeck, HAND_SIZE);

  return {
    budget: 500_000,
    round: 1,
    slaCount: 0,
    hand: initialHand as ActionCard[],
    playedThisRound: [],
    timeSlots: createInitialTimeSlots(),
    tracks: createInitialTracks(),
    vendorSlots: createVendorSlots(),
    pendingEvents: [],
    mitigatedEventIds: [],
    slaProtectedCount: 0,
    activePhase: PhaseId.Draw,
    trafficEventDeck,
    trafficEventDiscard: [],
    actionDeck: remainingActionDeck,
    actionDiscard: [],
    lastRoundSummary: null,
    loseReason: null,
  };
}

// ─── Event Types ──────────────────────────────────────────────────────────────

export type GameEvent =
  | { type: 'ADVANCE' }
  | { type: 'PLAY_ACTION'; card: ActionCard; targetEventId?: string }
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
    isBankrupt: ({ context }) => context.budget < -100_000,
    isSLAExceeded: ({ context }) => context.slaCount >= 3,
  },
  actions: {
    performDraw: assign(({ context }) => {
      // Reset board slots for the new round
      const freshSlots = resetSlotsForRound(context.timeSlots);

      // Reshuffle if exhausted, then draw traffic/event cards
      let [teDeck, teDiscard] = reshuffleDiscard(
        context.trafficEventDeck,
        context.trafficEventDiscard,
      );
      const drawCount = 5; // draw 5 traffic/event cards per round
      const [drawn, remaining] = drawN(teDeck, drawCount);
      teDeck = remaining;
      teDiscard = teDiscard; // unchanged; filled during end phase

      const baseCtx: GameContext = {
        ...context,
        timeSlots: freshSlots,
        trafficEventDeck: teDeck,
        playedThisRound: [],
        mitigatedEventIds: [],
        slaProtectedCount: 0,
        activePhase: PhaseId.Scheduling,
      };

      // Auto-fill slots immediately after draw
      const { context: filled } = autoFillTrafficSlots(baseCtx, drawn);
      return { ...filled, activePhase: PhaseId.Scheduling };
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
        const [reshuffled, emptyDiscard] = reshuffleDiscard(actionDeck, actionDiscard);
        actionDeck = reshuffled;
        actionDiscard = emptyDiscard;
        const [drawn, remaining] = drawN(actionDeck, deficit);
        hand.push(...(drawn as ActionCard[]));
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
      return applyPlayActionCard(context, event.card, event.targetEventId);
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
