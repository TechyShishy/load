import { useCallback, useEffect, useState } from 'react';
import { useMachine } from '@xstate/react';
import { gameMachine, createInitialContext } from '@load/game-core';
import type { ActionCard, ContractDef, Period, Track } from '@load/game-core';
import { clearSave, loadGame, saveGame } from '../save.js';
import { useAudio } from '../audio/AudioContext.js';

export function useGame(contract?: ContractDef) {
  // Allow E2E tests (and dev shortcuts) to inject a deterministic seed via ?seed=
  // in the URL. When present the URL seed takes priority over any persisted save.
  const urlSeed =
    typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('seed') ?? undefined)
      : undefined;

  // Lazy initializer: loadGame() runs once per hook mount, not at module import time.
  // This allows independent save-state control between test cases without module-cache tricks.
  // Skip loading from storage when a URL seed is provided — the seed is the source of truth.
  const [savedContext] = useState<ReturnType<typeof loadGame>>(() =>
    urlSeed ? null : loadGame(),
  );

  // When a contract is provided and there is no existing save, build the full initial
  // context from the contract spec once at mount time so the deck composition is applied.
  const [contractInput] = useState<ReturnType<typeof createInitialContext> | undefined>(() =>
    !savedContext && !urlSeed && contract ? createInitialContext(undefined, contract) : undefined,
  );

  const [snapshot, send] = useMachine(gameMachine, {
    input: savedContext ?? (urlSeed ? { seed: urlSeed } : contractInput),
  });

  const context = snapshot.context;
  const phase = snapshot.value as string;
  const audio = useAudio();

  useEffect(() => {
    if (phase === 'scheduling' || phase === 'crisis') {
      saveGame(snapshot.context);
    }
  }, [snapshot, phase]);

  const advance = useCallback(() => {
    send({ type: 'ADVANCE' });
  }, [send]);

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
    if (phase === 'gameWon') audio.playWin();
    if (phase === 'gameLost') audio.playLose();
  }, [phase, audio]);

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
