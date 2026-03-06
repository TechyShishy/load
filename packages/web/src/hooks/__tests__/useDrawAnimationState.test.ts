import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDrawAnimationState } from '../useDrawAnimationState.js';
import type { ActionCard, DrawLog, EventCard, TrafficCard } from '@load/game-core';
import { Period } from '@load/game-core';

function makeDrawLog(ids: string[], eventIds: string[] = [], actionIds: string[] = []): DrawLog {
  return {
    traffic: ids.map((id, i) => ({
      // Cast to TrafficCard — tests only access card.id, which is safe.
      card: { id } as unknown as TrafficCard,
      period: Period.Morning,
      slotIndex: i,
    })),
    action: actionIds.map((id) => ({ id }) as unknown as ActionCard),
    events: eventIds.map((id) => ({ id }) as unknown as EventCard),
  };
}

describe('useDrawAnimationState', () => {
  it('prefers-reduced-motion: calls onComplete immediately and arrivedCardIds stays empty', () => {
    const onComplete = vi.fn();
    const drawLog = makeDrawLog(['c1', 'c2']);

    const { result } = renderHook(() =>
      useDrawAnimationState({ drawLog, round: 2, prefersReducedMotion: true, onComplete }),
    );

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(result.current.arrivedCardIds.size).toBe(0);
    expect(result.current.allTrafficIds).toEqual(['c1', 'c2']);
  });

  it('normal mode: markArrived grows the set and onComplete fires when all cards arrive', () => {
    const onComplete = vi.fn();
    const drawLog = makeDrawLog(['c1', 'c2']);

    const { result } = renderHook(() =>
      useDrawAnimationState({ drawLog, round: 1, prefersReducedMotion: false, onComplete }),
    );

    // Not immediately completed
    expect(onComplete).not.toHaveBeenCalled();
    expect(result.current.arrivedCardIds.size).toBe(0);
    // speedMult is 1.5 on round 1
    expect(result.current.speedMult).toBe(1.5);

    // First card arrives
    act(() => { result.current.markArrived('c1'); });
    expect(result.current.arrivedCardIds.has('c1')).toBe(true);
    expect(result.current.arrivedCardIds.size).toBe(1);
    expect(onComplete).not.toHaveBeenCalled();

    // Second card arrives — all done
    act(() => { result.current.markArrived('c2'); });
    expect(result.current.arrivedCardIds.has('c2')).toBe(true);
    expect(result.current.arrivedCardIds.size).toBe(2);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('round transition: stale arrivedCardIds from previous round does not fire onComplete immediately', () => {
    // Regression test: weekday round (5 cards) → weekend round (1 card).
    // Before the fix, arrivedCardIds.size (5) >= allTrafficIds.length (1) would
    // cause an immediate spurious DRAW_COMPLETE, skipping all weekend animations.
    const onComplete = vi.fn();
    let drawLog = makeDrawLog(['a1', 'a2', 'a3', 'a4', 'a5']);

    const { result, rerender } = renderHook(
      ({ dl }: { dl: DrawLog }) =>
        useDrawAnimationState({ drawLog: dl, round: 5, prefersReducedMotion: false, onComplete }),
      { initialProps: { dl: drawLog } },
    );

    // Complete all 5 weekday cards.
    act(() => {
      result.current.markArrived('a1');
      result.current.markArrived('a2');
      result.current.markArrived('a3');
      result.current.markArrived('a4');
      result.current.markArrived('a5');
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Transition to a weekend round with only 1 different card.
    const nextDrawLog = makeDrawLog(['b1']);
    act(() => { rerender({ dl: nextDrawLog }); });

    // onComplete must NOT fire immediately — 'b1' hasn't arrived yet.
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(result.current.arrivedCardIds.size).toBe(0);

    // Only after 'b1' arrives should onComplete fire again.
    act(() => { result.current.markArrived('b1'); });
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('event-only drawLog: onComplete waits for event card animations', () => {
    const onComplete = vi.fn();
    const drawLog = makeDrawLog([], ['ev1', 'ev2']);

    const { result } = renderHook(() =>
      useDrawAnimationState({ drawLog, round: 3, prefersReducedMotion: false, onComplete }),
    );

    expect(onComplete).not.toHaveBeenCalled();
    expect(result.current.allEventIds).toEqual(['ev1', 'ev2']);
    expect(result.current.allTrafficIds).toEqual([]);

    act(() => { result.current.markArrived('ev1'); });
    expect(onComplete).not.toHaveBeenCalled();

    act(() => { result.current.markArrived('ev2'); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('mixed traffic+event drawLog: onComplete waits for all cards', () => {
    const onComplete = vi.fn();
    const drawLog = makeDrawLog(['t1'], ['ev1']);

    const { result } = renderHook(() =>
      useDrawAnimationState({ drawLog, round: 6, prefersReducedMotion: false, onComplete }),
    );

    expect(onComplete).not.toHaveBeenCalled();

    // Only traffic arrived — not enough
    act(() => { result.current.markArrived('t1'); });
    expect(onComplete).not.toHaveBeenCalled();

    // Now event arrives — all done
    act(() => { result.current.markArrived('ev1'); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('action-only drawLog: onComplete waits for all action cards', () => {
    const onComplete = vi.fn();
    const drawLog = makeDrawLog([], [], ['act1', 'act2']);

    const { result } = renderHook(() =>
      useDrawAnimationState({ drawLog, round: 4, prefersReducedMotion: false, onComplete }),
    );

    expect(onComplete).not.toHaveBeenCalled();
    expect(result.current.allActionIds).toEqual(['act1', 'act2']);
    expect(result.current.allTrafficIds).toEqual([]);
    expect(result.current.allEventIds).toEqual([]);

    act(() => { result.current.markArrived('act1'); });
    expect(onComplete).not.toHaveBeenCalled();

    act(() => { result.current.markArrived('act2'); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('mixed traffic+action drawLog: onComplete waits for all cards', () => {
    const onComplete = vi.fn();
    const drawLog = makeDrawLog(['t1'], [], ['act1']);

    const { result } = renderHook(() =>
      useDrawAnimationState({ drawLog, round: 2, prefersReducedMotion: false, onComplete }),
    );

    expect(onComplete).not.toHaveBeenCalled();

    act(() => { result.current.markArrived('t1'); });
    expect(onComplete).not.toHaveBeenCalled();

    act(() => { result.current.markArrived('act1'); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
