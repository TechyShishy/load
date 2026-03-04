import { useCallback, useEffect } from 'react';
import { useMachine } from '@xstate/react';
import { gameMachine } from '@load/game-core';
import type { ActionCard } from '@load/game-core';
import { clearSave, loadGame, saveGame } from '../save.js';
import { AudioManager } from '../audio/AudioManager.js';

// Load saved context once at module level (useMachine only reads input on mount)
const savedContext = loadGame();

export function useGame() {
  const [snapshot, send] = useMachine(gameMachine, {
    input: savedContext ?? undefined,
  });

  const context = snapshot.context;
  const phase = snapshot.value as string;

  useEffect(() => {
    if (phase === 'scheduling' || phase === 'crisis') {
      saveGame(snapshot.context);
    }
  }, [snapshot, phase]);

  const advance = useCallback(() => {
    send({ type: 'ADVANCE' });
  }, [send]);

  const playAction = useCallback(
    (card: ActionCard, targetEventId?: string) => {
      send({
      type: 'PLAY_ACTION',
      card,
      ...(targetEventId !== undefined ? { targetEventId } : {}),
    });
      AudioManager.getInstance().playCardDrop();
    },
    [send],
  );

  const reset = useCallback(() => {
    clearSave();
    send({ type: 'RESET' });
  }, [send]);

  // Trigger audio on win/lose — only when phase transitions, not on every render
  useEffect(() => {
    const audio = AudioManager.getInstance();
    if (phase === 'gameWon') audio.playWin();
    if (phase === 'gameLost') audio.playLose();
  }, [phase]);

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
