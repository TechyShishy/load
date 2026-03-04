import { useCallback, useEffect, useState } from 'react';
import { useMachine } from '@xstate/react';
import { gameMachine } from '@load/game-core';
import type { ActionCard, Period, Track } from '@load/game-core';
import { clearSave, loadGame, saveGame } from '../save.js';
import { useAudio } from '../audio/AudioContext.js';

export function useGame() {
  // Lazy initializer: loadGame() runs once per hook mount, not at module import time.
  // This allows independent save-state control between test cases without module-cache tricks.
  const [savedContext] = useState<ReturnType<typeof loadGame>>(() => loadGame());

  const [snapshot, send] = useMachine(gameMachine, {
    input: savedContext ?? undefined,
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
    playAction,
    reset,
    isWon: phase === 'gameWon',
    isLost: phase === 'gameLost',
    hasSave: savedContext !== null,
  };
}
