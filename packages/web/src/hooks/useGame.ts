import { useCallback } from 'react';
import { useMachine } from '@xstate/react';
import { gameMachine } from '@load/game-core';
import { clearSave, loadGame, saveGame } from '@load/game-core';
import type { ActionCard } from '@load/game-core';
import { AudioManager } from '../audio/AudioManager.js';

/**
 * Central game hook. Wraps the XState machine and wires audio + auto-save.
 */
export function useGame() {
  const savedContext = loadGame();

  const [snapshot, send] = useMachine(gameMachine, {
    input: savedContext ?? undefined,
  });

  const context = snapshot.context;
  const phase = snapshot.value as string;

  const advance = useCallback(() => {
    send({ type: 'ADVANCE' });
    // Auto-save after End phase transition (detected by round increment)
    const newSnap = snapshot; // captured before re-render
    if (newSnap.context.activePhase === 'End') {
      saveGame(newSnap.context);
    }
  }, [send, snapshot]);

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

  // Trigger audio on win/lose
  const audio = AudioManager.getInstance();
  if (phase === 'gameWon') audio.playWin();
  if (phase === 'gameLost') audio.playLose();

  return {
    context,
    phase,
    advance,
    playAction,
    reset,
    isWon: phase === 'gameWon',
    isLost: phase === 'gameLost',
  };
}
