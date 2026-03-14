import { useCallback, useEffect, useRef, useState } from 'react';
import { useMachine } from '@xstate/react';
import { gameMachine, createInitialContext, SlotType, BUILT_IN_CONTRACTS } from '@load/game-core';
import type { ActionCard, ContractDef, DeckSpec, Period, Track } from '@load/game-core';
import { clearSave, loadDeckConfig, loadGame, saveGame } from '../save.js';
import { useAudio } from '../audio/AudioContext.js';

export function useGame(contract?: ContractDef) {
  // Allow E2E tests (and dev shortcuts) to inject a deterministic seed via ?seed=
  // in the URL. When present the URL seed takes priority over any persisted save.
  const urlSeed =
    typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('seed') ?? undefined)
      : undefined;

  // Fixed-seed contracts always start fresh — their deck order is part of the
  // learning experience and must not be disrupted by a prior save or a URL seed.
  const isFixedSeed = contract?.fixedSeed !== undefined;

  // Lazy initializer: loadGame() runs once per hook mount, not at module import time.
  // This allows independent save-state control between test cases without module-cache tricks.
  // Skip loading from storage when a URL seed or a fixed-seed contract is in play.
  const [savedContext] = useState<ReturnType<typeof loadGame>>(() =>
    urlSeed || isFixedSeed ? null : loadGame(),
  );

  // Load the player's saved deck configuration. Skipped for fixed-seed contracts
  // (their deck is baked in) and URL-seed E2E paths (no persistent state).
  const [savedDeckSpec] = useState<ReadonlyArray<DeckSpec> | null>(() =>
    urlSeed || isFixedSeed ? null : loadDeckConfig(),
  );

  // Build the initial game context for all new-game paths in one place.
  // Order of priority: contract.actionDeck > savedDeckSpec > DEFAULT_ACTION_DECK
  // (priority is enforced inside createInitialContext via contract?.actionDeck ?? deckSpec).
  const [gameInput] = useState<ReturnType<typeof createInitialContext> | undefined>(() => {
    if (savedContext) return undefined;
    return createInitialContext(urlSeed, contract ?? undefined, savedDeckSpec ?? undefined);
  });

  const [snapshot, send] = useMachine(gameMachine, {
    // Resume from save when available; otherwise use the freshly-built context.
    input: savedContext ?? gameInput,
  });

  const context = snapshot.context;
  const phase = snapshot.value as string;
  const audio = useAudio();
  const prevPhaseRef = useRef(phase);
  // Skip the SLA fail sound on the initial render -- if the player continues a
  // saved game where lastRoundSummary.failedCount > 0, the effect would fire
  // immediately with no corresponding game event.
  const slaEffectMountedRef = useRef(false);

  useEffect(() => {
    // Fixed-seed contracts skip persistence: their decks are always rebuilt from the
    // seed, so a mid-run save would be loaded next time and defeat the fixed sequence.
    if (!isFixedSeed && (phase === 'scheduling' || phase === 'crisis')) {
      saveGame(snapshot.context);
    }
  }, [snapshot, phase, isFixedSeed]);

  const advance = useCallback(() => {
    audio.playAdvance();
    send({ type: 'ADVANCE' });
  }, [send, audio]);

  const drawComplete = useCallback(() => {
    send({ type: 'DRAW_COMPLETE' });
  }, [send]);

  const playAction = useCallback(
    (card: ActionCard, targetEventId?: string, targetTrafficCardId?: string, targetPeriod?: Period, targetTrack?: Track) => {
      send({
        type: 'PLAY_ACTION',
        card,
        ...(targetEventId !== undefined ? { targetEventId } : {}),
        ...(targetTrafficCardId !== undefined ? { targetTrafficCardId } : {}),
        ...(targetPeriod !== undefined ? { targetPeriod } : {}),
        ...(targetTrack !== undefined ? { targetTrack } : {}),
      });
      audio.playCardDrop();
    },
    [send, audio],
  );

  const reset = useCallback(() => {
    clearSave();
    send({ type: 'RESET' });
  }, [send]);

  // Trigger audio on win/lose — only when phase transitions, not on every render
  useEffect(() => {
    if (phase === 'gameWon') { audio.stopMusic(); audio.playWin(); }
    if (phase === 'gameLost') { audio.stopMusic(); audio.playLose(); }
  }, [phase, audio]);

  // In-game music — start the track declared on the active contract when entering
  // the scheduling phase from any non-crisis state (covers initial mount, save-resume,
  // and game reset). Skips the crisis→scheduling transition so the track doesn't
  // restart mid-loop. Contracts without a musicTrackId are silently skipped.
  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (phase === 'scheduling' && prev !== 'crisis') {
      const trackId = BUILT_IN_CONTRACTS.find(
        (c) => c.id === context.contractId,
      )?.musicTrackId;
      if (trackId !== undefined) {
        audio.startMusic(trackId);
      }
    }
    // stopMusic() is called on win/lose (above) and on return-to-menu (App.tsx).
  }, [phase, context.contractId, audio]);

  // SLA failure sound — fires when the round summary shows failures.
  // Skip on terminal phases: if the game just ended due to SLA, playLose() takes over.
  // Skip on initial mount: a continued save with failedCount > 0 must not
  // trigger the sound without a corresponding game event.
  useEffect(() => {
    if (!slaEffectMountedRef.current) {
      slaEffectMountedRef.current = true;
      return;
    }
    if (phase === 'gameWon' || phase === 'gameLost') return;
    if (context.lastRoundSummary && context.lastRoundSummary.failedCount > 0) {
      audio.playSLAFail();
    }
  }, [context.lastRoundSummary, phase, audio]);

  // Overload sound — fires once upon entering scheduling when overloaded slots exist
  useEffect(() => {
    if (prevPhaseRef.current !== phase) {
      prevPhaseRef.current = phase;
      if (phase === 'scheduling') {
        const overloaded = Object.values(context.trafficSlotPositions).filter(
          (p) => p.slotType === SlotType.Overloaded,
        ).length;
        if (overloaded > 0) audio.playOverload();
      }
    }
  }, [phase, context.trafficSlotPositions, audio]);

  return {
    context,
    phase,
    advance,
    drawComplete,
    playAction,
    reset,
    isWon: phase === 'gameWon',
    isLost: phase === 'gameLost',
    hasSave: savedContext !== null,
  };
}
