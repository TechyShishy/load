import React, { useEffect, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Period, type GameContext, type TimeSlot, type TrackSlot } from '@load/game-core';
import { computeSlotRect, computeTrackRect } from './canvasLayout.js';

const PERIOD_ORDER: Period[] = [Period.Morning, Period.Afternoon, Period.Evening, Period.Overnight];

const TRACK_OVER_CLASS: Record<string, string> = {
  BreakFix: 'border-red-500 bg-red-900/20',
  Projects: 'border-green-500 bg-green-900/20',
  Maintenance: 'border-yellow-500 bg-yellow-900/20',
};

// ── Slot drop zone ────────────────────────────────────────────────────────────

interface SlotDropZoneProps {
  slot: TimeSlot;
  periodIndex: number;
  containerWidth: number;
}

function SlotDropZone({ slot, periodIndex, containerWidth }: SlotDropZoneProps) {
  const id = `slot-${slot.period}-${slot.index}`;
  const { isOver, setNodeRef } = useDroppable({ id, data: { type: 'slot', slot } });
  const rect = computeSlotRect(periodIndex, slot.index, containerWidth);

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        borderRadius: 4,
        pointerEvents: 'auto',
        zIndex: 1,
      }}
      className={
        isOver
          ? 'border-2 border-cyan-400 bg-cyan-900/30 ring-1 ring-cyan-400/60'
          : 'border-2 border-transparent'
      }
    />
  );
}

// ── Track drop zone ───────────────────────────────────────────────────────────

interface TrackDropZoneProps {
  track: TrackSlot;
  trackIndex: number;
  containerWidth: number;
}

function TrackDropZone({ track, trackIndex, containerWidth }: TrackDropZoneProps) {
  const id = `track-${track.track}`;
  const { isOver, setNodeRef } = useDroppable({ id, data: { type: 'track', track } });
  const rect = computeTrackRect(trackIndex, containerWidth);
  const overClass = TRACK_OVER_CLASS[track.track] ?? 'border-purple-500 bg-purple-900/20';

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        borderRadius: 4,
        pointerEvents: 'auto',
        zIndex: 1,
      }}
      className={isOver ? `border-2 ${overClass}` : 'border-2 border-transparent'}
    />
  );
}

// ── Board-wide fallback drop zone ─────────────────────────────────────────────

function BoardAreaDropZone() {
  const { isOver, setNodeRef } = useDroppable({ id: 'board-area' });

  return (
    <div
      ref={setNodeRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', zIndex: 0 }}
      className={isOver ? 'ring-1 ring-inset ring-purple-400/40 bg-purple-900/10' : ''}
    />
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export interface BoardDropZonesProps {
  context: GameContext;
  /** Ref to the canvas wrapper div — used to track container width for overlay positioning. */
  containerRef: React.RefObject<HTMLDivElement>;
}

export function BoardDropZones({ context, containerRef }: BoardDropZonesProps) {
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  if (containerWidth === 0) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      <BoardAreaDropZone />
      {context.timeSlots.map((slot) => {
        const periodIndex = PERIOD_ORDER.indexOf(slot.period);
        return (
          <SlotDropZone
            key={`slot-${slot.period}-${slot.index}`}
            slot={slot}
            periodIndex={periodIndex}
            containerWidth={containerWidth}
          />
        );
      })}
      {context.tracks.map((track, ti) => (
        <TrackDropZone
          key={`track-${track.track}`}
          track={track}
          trackIndex={ti}
          containerWidth={containerWidth}
        />
      ))}
    </div>
  );
}
