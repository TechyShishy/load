import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrawLog } from '@load/game-core';

export interface DrawAnimationState {
  /** IDs of traffic cards that have visually "arrived" at their slot. */
  arrivedCardIds: ReadonlySet<string>;
  /** Mark a card as arrived — called when its fly-in animation completes. */
  markArrived: (id: string) => void;
  /** All traffic card IDs in the current draw log, in draw order. */
  allTrafficIds: readonly string[];
  /** All event card IDs in the current draw log, in draw order. */
  allEventIds: readonly string[];
  /** All action card IDs in the current draw log, in draw order. */
  allActionIds: readonly string[];
  /** Speed multiplier: 1.5× on the very first round, 1× otherwise. */
  speedMult: number;
}

interface UseDrawAnimationStateOptions {
  drawLog: DrawLog | null;
  round: number;
  prefersReducedMotion: boolean;
  onComplete: () => void;
}

export function useDrawAnimationState({
  drawLog,
  round,
  prefersReducedMotion,
  onComplete,
}: UseDrawAnimationStateOptions): DrawAnimationState {
  const [arrivedCardIds, setArrivedCardIds] = useState<ReadonlySet<string>>(new Set());
  // Keep onComplete stable so effects don't re-fire when the callback identity changes.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  // Guard against calling onComplete twice for the same drawLog.
  const completedRef = useRef(false);

  const allTrafficIds = useMemo(
    () => drawLog?.traffic.map((e) => e.card.id) ?? [],
    [drawLog],
  );

  const allEventIds = useMemo(
    () => drawLog?.events.map((e) => e.id) ?? [],
    [drawLog],
  );

  const allActionIds = useMemo(
    () => drawLog?.action.map((c) => c.id) ?? [],
    [drawLog],
  );

  /** All animated card IDs (traffic + events + actions) that must arrive before onComplete fires. */
  const allAnimatedIds = useMemo(
    () => [...allTrafficIds, ...allEventIds, ...allActionIds],
    [allTrafficIds, allEventIds, allActionIds],
  );

  // When drawLog changes: reset per-draw state and skip immediately when appropriate.
  useEffect(() => {
    completedRef.current = false;
    setArrivedCardIds(new Set());
    if (drawLog === null) return;
    if (prefersReducedMotion || allAnimatedIds.length === 0) {
      completedRef.current = true;
      onCompleteRef.current();
    }
  }, [drawLog, prefersReducedMotion, allAnimatedIds]);

  // Once all cards have individually arrived, fire onComplete.
  // Use identity-based check (.every) rather than size comparison so that stale
  // arrivedCardIds from a previous round (which may have equal or greater size)
  // never cause an immediate spurious DRAW_COMPLETE on round transition.
  useEffect(() => {
    if (completedRef.current) return;
    if (allAnimatedIds.length > 0 && allAnimatedIds.every((id) => arrivedCardIds.has(id))) {
      completedRef.current = true;
      onCompleteRef.current();
    }
  }, [arrivedCardIds, allAnimatedIds]);

  const markArrived = useCallback((id: string) => {
    setArrivedCardIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  return { arrivedCardIds, markArrived, allTrafficIds, allEventIds, allActionIds, speedMult: round === 1 ? 1.5 : 1 };
}
