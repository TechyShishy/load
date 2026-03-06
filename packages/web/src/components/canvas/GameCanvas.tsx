import React, { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  Period,
  type GameContext,
  type TimeSlot,
  type TrackSlot,
} from '@load/game-core';
import {
  SLOT_W,
  SLOT_H,
  SLOT_GAP,
  PERIOD_PADDING,
  CARD_PADDING,
  BOARD_START_Y,
  computeTracksYOffset,
  rowsForPeriod,
} from './canvasLayout.js';
interface GameCanvasProps {
  context: GameContext;
  phase: string;
  /** Optional shared ref for the container div. Passed from App so overlay
   * components can compute slot positions without duplicating layout math. */
  containerRef?: React.RefObject<HTMLDivElement>;
}

// ── Layout constants ──────────────────────────────────────────────────────────
const PERIOD_COLORS: Record<Period, number> = {
  [Period.Morning]: 0x1a3a4a,
  [Period.Afternoon]: 0x1a3a2a,
  [Period.Evening]: 0x2a1a3a,
  [Period.Overnight]: 0x1a1a2a,
};

const PERIOD_ACCENT: Record<Period, number> = {
  [Period.Morning]: 0x00f5ff,
  [Period.Afternoon]: 0x30d158,
  [Period.Evening]: 0xbf5af2,
  [Period.Overnight]: 0x005577,
};

/** Fill colour for overload slots (period-full traffic card was placed here). */
const OVERLOAD_SLOT_COLOR = 0x3a0000;
/** Stroke accent for overload slots. */
const OVERLOAD_SLOT_ACCENT = 0xff4444;

const TRACK_COLORS: Record<string, number> = {
  BreakFix: 0xff375f,
  Projects: 0x30d158,
  Maintenance: 0xffd60a,
};

const TRAFFIC_COLOR = 0x005f8f;

// ── Stable TextStyle instances (module-level, never recreated) ────────────────
const HEADER_STYLES: Record<Period, TextStyle> = {
  [Period.Morning]: new TextStyle({ fill: 0x00f5ff, fontSize: 11, fontFamily: 'Courier New' }),
  [Period.Afternoon]: new TextStyle({ fill: 0x30d158, fontSize: 11, fontFamily: 'Courier New' }),
  [Period.Evening]: new TextStyle({ fill: 0xbf5af2, fontSize: 11, fontFamily: 'Courier New' }),
  [Period.Overnight]: new TextStyle({ fill: 0x005577, fontSize: 11, fontFamily: 'Courier New' }),
};

const SLOT_LABEL_STYLE = new TextStyle({ fill: 0x4b5563, fontSize: 9, fontFamily: 'Courier New' });
const CARD_CHIP_STYLE = new TextStyle({
  fill: 0x00f5ff,
  fontSize: 8,
  fontFamily: 'Courier New',
  wordWrap: true,
  wordWrapWidth: SLOT_W - 12,
});
const TICKET_STYLE = new TextStyle({ fill: 0xfca5a5, fontSize: 8, fontFamily: 'Courier New' });
const EMPTY_STYLE = new TextStyle({
  fill: 0x374151,
  fontSize: 9,
  fontFamily: 'Courier New',
  fontStyle: 'italic',
});
/** Per-track label styles generated once and cached. */
const TRACK_LABEL_STYLES: Record<string, TextStyle> = {};
function getTrackLabelStyle(trackName: string): TextStyle {
  if (!TRACK_LABEL_STYLES[trackName]) {
    TRACK_LABEL_STYLES[trackName] = new TextStyle({
      fill: TRACK_COLORS[trackName] ?? 0xffffff,
      fontSize: 10,
      fontFamily: 'Courier New',
      fontWeight: 'bold',
    });
  }
  return TRACK_LABEL_STYLES[trackName];
}

// ── Scene ref types ───────────────────────────────────────────────────────────
interface SlotRefs {
  bg: Graphics;
  cardContainer: Container;
  /** Pixel origin of the slot — needed to position rebuilt card chips. */
  slotX: number;
  slotY: number;
  period: Period;
}

function repaintSlotBackground(refs: SlotRefs, slot: TimeSlot): void {
  refs.bg.clear();
  refs.bg.roundRect(refs.slotX, refs.slotY, SLOT_W, SLOT_H, 4);
  if (slot.overloaded) {
    refs.bg.fill({ color: OVERLOAD_SLOT_COLOR, alpha: 0.9 });
    refs.bg.stroke({ color: OVERLOAD_SLOT_ACCENT, width: 1, alpha: 0.8 });
  } else {
    refs.bg.fill({ color: PERIOD_COLORS[refs.period], alpha: 0.9 });
    refs.bg.stroke({ color: PERIOD_ACCENT[refs.period], width: 1, alpha: 0.4 });
  }
}

interface TrackRefs {
  ticketContainer: Container;
  emptyText: Text;
  trackX: number;
  trackY: number;
}

interface SceneRefs {
  /** key: `${period}-${slotIndex}` */
  slots: Map<string, SlotRefs>;
  /** key: track.track (enum string) */
  tracks: Map<string, TrackRefs>;
}

// ── Static scene construction ─────────────────────────────────────────────────
function buildStaticScene(app: Application, board: Container, ctx: GameContext): SceneRefs {
  const refs: SceneRefs = { slots: new Map(), tracks: new Map() };

  const periods = Object.values(Period) as Period[];
  const availableW = app.screen.width - 40;
  const periodW = availableW / periods.length;

  for (let pi = 0; pi < periods.length; pi++) {
    const period = periods[pi] as Period;
    const periodX = 20 + pi * periodW;

    // Slots for this period — collected first so column height responds to temporary extra slots.
    const periodSlots = ctx.timeSlots.filter((s) => s.period === period);

    // Period column background — sized to actual slot count, including any temporary slots.
    const colBg = new Graphics();
    colBg.roundRect(
      periodX,
      BOARD_START_Y - 8,
      periodW - 8,
      32 + rowsForPeriod(periodSlots.length) * (SLOT_H + SLOT_GAP),
      8,
    );
    colBg.fill({ color: PERIOD_COLORS[period], alpha: 0.15 });
    colBg.stroke({ color: PERIOD_ACCENT[period], width: 1, alpha: 0.2 });
    board.addChild(colBg);

    // Period header — fully static.
    const header = new Text({ text: period.toUpperCase(), style: HEADER_STYLES[period] });
    header.x = periodX + PERIOD_PADDING;
    header.y = BOARD_START_Y;
    board.addChild(header);
    for (let si = 0; si < periodSlots.length; si++) {
      const slot = periodSlots[si]!;
      const slotKey = `${period}-${si}`;
      const rows = rowsForPeriod(periodSlots.length);
      const subCol = Math.floor(si / rows);
      const row = si % rows;
      const slotX = periodX + PERIOD_PADDING + subCol * (SLOT_W + SLOT_GAP);
      const slotY = BOARD_START_Y + 24 + row * (SLOT_H + SLOT_GAP);

      // Slot background.
      const bg = new Graphics();
      bg.roundRect(slotX, slotY, SLOT_W, SLOT_H, 4);
      if (slot.overloaded) {
        bg.fill({ color: OVERLOAD_SLOT_COLOR, alpha: 0.9 });
        bg.stroke({ color: OVERLOAD_SLOT_ACCENT, width: 1, alpha: 0.8 });
      } else {
        bg.fill({ color: PERIOD_COLORS[period], alpha: 0.9 });
        bg.stroke({ color: PERIOD_ACCENT[period], width: 1, alpha: 0.4 });
      }
      board.addChild(bg);

      // Slot index label — fully static (e.g., "M1").
      const slotLabel = new Text({ text: `${period[0]}${si + 1}`, style: SLOT_LABEL_STYLE });
      slotLabel.x = slotX + 4;
      slotLabel.y = slotY + 4;
      board.addChild(slotLabel);

      // Container for card chips — rebuilt by patchSlot on change.
      const cardContainer = new Container();
      board.addChild(cardContainer);

      refs.slots.set(slotKey, { bg, cardContainer, slotX, slotY, period });
      // Initial card paint.
      paintSlotCards(slot, slotX, slotY, cardContainer);
    }
  }

  // Tracks — static row backgrounds with dynamic ticket containers.
  const maxRows = Math.max(
    ...Object.values(Period).map((p) => rowsForPeriod(ctx.timeSlots.filter((s) => s.period === p).length)),
  );
  const tracksYOffset = computeTracksYOffset(maxRows);
  for (let ti = 0; ti < ctx.tracks.length; ti++) {
    const track = ctx.tracks[ti]!;
    const trackX = 20;
    const trackY = tracksYOffset + ti * 36;
    const trackW = app.screen.width - 40;
    const tColor = TRACK_COLORS[track.track] ?? 0x555555;

    // Static background.
    const bg = new Graphics();
    bg.roundRect(trackX, trackY, trackW, 28, 4);
    bg.fill({ color: 0x111827, alpha: 0.8 });
    bg.stroke({ color: tColor, width: 1, alpha: 0.5 });
    board.addChild(bg);

    // Static label.
    const label = new Text({
      text: track.track.toUpperCase(),
      style: getTrackLabelStyle(track.track),
    });
    label.x = trackX + 8;
    label.y = trackY + 9;
    board.addChild(label);

    // Dynamic ticket container — rebuilt by patchTrack on change.
    const ticketContainer = new Container();
    board.addChild(ticketContainer);

    // "no tickets" placeholder — visibility toggled by patchTrack.
    const emptyText = new Text({ text: 'no tickets', style: EMPTY_STYLE });
    emptyText.x = trackX + 100;
    emptyText.y = trackY + 9;
    emptyText.visible = track.tickets.length === 0;
    board.addChild(emptyText);

    refs.tracks.set(track.track, { ticketContainer, emptyText, trackX, trackY });
    // Initial ticket paint.
    paintTrackTickets(track, trackX, trackY, ticketContainer);
  }

  return refs;
}

// ── Dynamic paint helpers ─────────────────────────────────────────────────────
function paintSlotCards(slot: TimeSlot, slotX: number, slotY: number, container: Container): void {
  for (let ci = 0; ci < slot.cards.length; ci++) {
    const card = slot.cards[ci]!;
    const cardH = SLOT_H - CARD_PADDING * 2;
    const cardY = slotY + CARD_PADDING + ci * (cardH + 2);

    const cardBg = new Graphics();
    cardBg.roundRect(slotX + CARD_PADDING, cardY, SLOT_W - CARD_PADDING * 2, cardH, 2);
    cardBg.fill({ color: TRAFFIC_COLOR, alpha: 0.9 });
    container.addChild(cardBg);

    const cardText = new Text({ text: card.name, style: CARD_CHIP_STYLE });
    cardText.x = slotX + CARD_PADDING + 2;
    cardText.y = cardY + 2;
    container.addChild(cardText);
  }
}

function paintTrackTickets(
  track: TrackSlot,
  trackX: number,
  trackY: number,
  container: Container,
): void {
  const tColor = TRACK_COLORS[track.track] ?? 0xff0000;
  for (let ki = 0; ki < track.tickets.length; ki++) {
    const ticket = track.tickets[ki]!;
    const tickX = trackX + 100 + ki * 80;

    const tickBg = new Graphics();
    tickBg.roundRect(tickX, trackY + 4, 70, 20, 3);
    tickBg.fill({ color: 0x3b0000, alpha: 0.9 });
    tickBg.stroke({ color: tColor, width: 1 });
    container.addChild(tickBg);

    const tickText = new Text({ text: ticket.name, style: TICKET_STYLE });
    tickText.x = tickX + 4;
    tickText.y = trackY + 8;
    container.addChild(tickText);
  }
}

// ── Patch functions (called on context change) ────────────────────────────────
function patchSlot(refs: SlotRefs, oldSlot: TimeSlot, newSlot: TimeSlot): void {
  // Repaint background when overloaded flag changes (e.g. BU/DCE converts the slot).
  if (oldSlot.overloaded !== newSlot.overloaded) {
    repaintSlotBackground(refs, newSlot);
  }

  // Rebuild card chips only when the cards array has changed.
  const cardsChanged =
    oldSlot.cards.length !== newSlot.cards.length ||
    oldSlot.cards.some((c, i) => c.id !== newSlot.cards[i]?.id);

  if (cardsChanged) {
    // Explicitly destroy children to release GPU textures before removal.
    for (const child of refs.cardContainer.children) {
      child.destroy();
    }
    refs.cardContainer.removeChildren();
    paintSlotCards(newSlot, refs.slotX, refs.slotY, refs.cardContainer);
  }

}

function patchTrack(refs: TrackRefs, oldTrack: TrackSlot, newTrack: TrackSlot): void {
  const ticketsChanged =
    oldTrack.tickets.length !== newTrack.tickets.length ||
    oldTrack.tickets.some((t, i) => t.id !== newTrack.tickets[i]?.id);

  if (ticketsChanged) {
    for (const child of refs.ticketContainer.children) {
      child.destroy();
    }
    refs.ticketContainer.removeChildren();
    paintTrackTickets(newTrack, refs.trackX, refs.trackY, refs.ticketContainer);
    refs.emptyText.visible = newTrack.tickets.length === 0;
  }
}

function patchBoard(refs: SceneRefs, prevCtx: GameContext, nextCtx: GameContext): void {
  // Short-circuit if neither board-relevant array reference has changed.
  if (prevCtx.timeSlots === nextCtx.timeSlots && prevCtx.tracks === nextCtx.tracks) return;
  const periods = Object.values(Period) as Period[];
  for (const period of periods) {
    const oldPeriodSlots = prevCtx.timeSlots.filter((s) => s.period === period);
    const newPeriodSlots = nextCtx.timeSlots.filter((s) => s.period === period);
    for (let si = 0; si < newPeriodSlots.length; si++) {
      const oldSlot = oldPeriodSlots[si];
      const newSlot = newPeriodSlots[si];
      if (!oldSlot || !newSlot || (oldSlot === newSlot && oldSlot.overloaded === newSlot.overloaded)) continue;
      const slotRefs = refs.slots.get(`${period}-${si}`);
      if (slotRefs) patchSlot(slotRefs, oldSlot, newSlot);
    }
  }

  for (const newTrack of nextCtx.tracks) {
    const oldTrack = prevCtx.tracks.find((t) => t.track === newTrack.track);
    if (!oldTrack || oldTrack === newTrack) continue;
    const trackRefs = refs.tracks.get(newTrack.track);
    if (trackRefs) patchTrack(trackRefs, oldTrack, newTrack);
  }
}

// ── Accessibility helpers ─────────────────────────────────────────────────────
/**
 * Builds a plain-text description of the current board state for screen
 * readers. Updated alongside `patchBoard` so the `aria-live` region always
 * reflects the visual canvas.
 */
function buildBoardSummary(ctx: GameContext): string {
  const periods = Object.values(Period) as Period[];
  const parts: string[] = [];

  for (const period of periods) {
    const slots = ctx.timeSlots.filter((s) => s.period === period);
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      const label = `${period} slot ${i + 1}`;
      if (slot.cards.length === 0) {
        parts.push(`${label}: empty, capacity ${slot.baseCapacity}`);
      } else {
        const names = slot.cards.map((c) => c.name).join(', ');
        const slotType = slot.overloaded ? 'overload slot' : 'slot';
        parts.push(`${label} (${slotType}): ${slot.cards.length} of ${slot.baseCapacity} cards — ${names}`);
      }
    }
  }

  for (const track of ctx.tracks) {
    const count = track.tickets.length;
    const ticketDesc =
      count === 0 ? 'no open tickets' : `${count} open ticket${count === 1 ? '' : 's'}`;
    parts.push(`${track.track} track: ${ticketDesc}`);
  }

  return parts.join('. ');
}

// ── Component ─────────────────────────────────────────────────────────────────
export function GameCanvas({ context, phase: _phase, containerRef: externalContainerRef }: GameCanvasProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef ?? internalRef;
  const appRef = useRef<Application | null>(null);
  const boardRef = useRef<Container | null>(null);
  const sceneRefsRef = useRef<SceneRefs | null>(null);
  const prevContextRef = useRef<GameContext | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [boardSummary, setBoardSummary] = useState(() => buildBoardSummary(context));

  // Initialise PixiJS once.
  // Strategy: let PixiJS create its own <canvas> and append it to our div.
  // On cleanup we destroy(true) so PixiJS removes its canvas too.
  // This means React StrictMode's double-invoke always gets a fresh canvas
  // with a live WebGL context — no context-lost issues.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    const app = new Application();

    void app
      .init({
        resizeTo: container,
        backgroundColor: 0x0a0e1a,
        antialias: true,
        resolution: window.devicePixelRatio ?? 1,
        autoDensity: true,
      })
      .then(() => {
        if (cancelled) {
          app.destroy(true, { children: true });
          return;
        }
        // Append PixiJS's own canvas into our container div.
        container.appendChild(app.canvas);
        appRef.current = app;
        const board = new Container();
        app.stage.addChild(board);
        boardRef.current = board;

        const refs = buildStaticScene(app, board, context);
        sceneRefsRef.current = refs;
        prevContextRef.current = context;
      })
      .catch((err: unknown) => {
        app.destroy(true, { children: true });
        if (!cancelled) {
          setInitError(err instanceof Error ? err.message : 'PixiJS failed to initialize');
        }
      });

    return () => {
      cancelled = true;
      if (appRef.current) {
        // true = also removes the canvas element PixiJS created.
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
        boardRef.current = null;
        sceneRefsRef.current = null;
        prevContextRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Patch only what changed whenever context updates.
  // `phase` is intentionally omitted — the canvas renders board state only;
  // phase-relevant UI lives in HUD overlays.
  // When the number of time slots changes (e.g. a BoostSlotCapacity card was
  // played), the static scene must be fully rebuilt since patchBoard only
  // handles existing slot refs.
  useEffect(() => {
    const app = appRef.current;
    const prev = prevContextRef.current;
    if (!app || !prev) return;

    if (context.timeSlots.length !== prev.timeSlots.length) {
      // Slot count changed — destroy old board Container and rebuild from scratch.
      const oldBoard = boardRef.current;
      if (oldBoard) {
        oldBoard.destroy({ children: true });
      }
      const newBoard = new Container();
      app.stage.addChild(newBoard);
      boardRef.current = newBoard;
      sceneRefsRef.current = buildStaticScene(app, newBoard, context);
    } else {
      const refs = sceneRefsRef.current;
      if (refs) patchBoard(refs, prev, context);
    }
    prevContextRef.current = context;
  }, [context]);

  // Keep the accessible board summary in sync with context changes.
  // This is intentionally a separate effect so it fires on every context
  // update regardless of whether the PixiJS scene refs are ready.
  useEffect(() => {
    setBoardSummary(buildBoardSummary(context));
  }, [context]);

  if (initError) {
    return (
      // TODO-0001: replace stub with a proper recovery/retry UI
      <div className="flex h-full w-full items-center justify-center bg-red-900/80">
        <div className="text-center">
          <p className="text-lg font-bold text-red-200">Canvas failed to initialize</p>
          <p className="mt-1 font-mono text-sm text-red-400">{initError}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Visually hidden live region — mirrors board state for screen readers. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {boardSummary}
      </div>
      <div
        ref={containerRef}
        role="img"
        aria-label="Game board"
        style={{ width: '100%', height: '100%', overflow: 'hidden' }}
      />
    </>
  );
}
