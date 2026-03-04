import React, { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Period, type GameContext, PERIOD_SLOT_COUNTS } from '@load/game-core';

interface GameCanvasProps {
  context: GameContext;
  phase: string;
}

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

const TRAFFIC_COLOR = 0x005f8f;
const SLOT_W = 90;
const SLOT_H = 60;
const SLOT_GAP = 8;
const PERIOD_PADDING = 16;
const CARD_PADDING = 4;

export function GameCanvas({ context, phase }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const boardRef = useRef<Container | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

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

    void app.init({
      resizeTo: container,
      backgroundColor: 0x0a0e1a,
      antialias: true,
      resolution: window.devicePixelRatio ?? 1,
      autoDensity: true,
    }).then(() => {
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
      renderBoard(app, board, context);
    }).catch((err: unknown) => {
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
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render board whenever context changes
  useEffect(() => {
    const app = appRef.current;
    const board = boardRef.current;
    if (!app || !board) return;
    board.removeChildren();
    renderBoard(app, board, context);
  }, [context, phase]);

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
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    />
  );
}

/** Draw the entire board into the given container */
function renderBoard(app: Application, container: Container, ctx: GameContext): void {
  const periods = Object.values(Period) as Period[];
  const availableW = app.screen.width - 40;
  const periodW = availableW / periods.length;
  const startY = 40;

  for (let pi = 0; pi < periods.length; pi++) {
    const period = periods[pi] as Period;
    const periodX = 20 + pi * periodW;
    const slotCount = PERIOD_SLOT_COUNTS[period];

    // Period header
    const headerStyle = new TextStyle({ fill: PERIOD_ACCENT[period], fontSize: 11, fontFamily: 'Courier New' });
    const header = new Text({ text: period.toUpperCase(), style: headerStyle });
    header.x = periodX + PERIOD_PADDING;
    header.y = startY;
    container.addChild(header);

    // Slots
    const slots = ctx.timeSlots.filter((s) => s.period === period);
    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si]!;
      const slotX = periodX + PERIOD_PADDING;
      const slotY = startY + 24 + si * (SLOT_H + SLOT_GAP);

      const bg = new Graphics();
      bg.roundRect(slotX, slotY, SLOT_W, SLOT_H, 4);
      bg.fill({ color: slot.unavailable ? 0x3a0000 : PERIOD_COLORS[period], alpha: 0.9 });
      bg.stroke({ color: slot.unavailable ? 0xff375f : PERIOD_ACCENT[period], width: 1, alpha: 0.4 });
      container.addChild(bg);

      // Slot index label
      const slotLabelStyle = new TextStyle({ fill: 0x4b5563, fontSize: 9, fontFamily: 'Courier New' });
      const slotLabel = new Text({ text: `${period[0]}${si + 1}`, style: slotLabelStyle });
      slotLabel.x = slotX + 4;
      slotLabel.y = slotY + 4;
      container.addChild(slotLabel);

      // Cards in slot
      for (let ci = 0; ci < slot.cards.length; ci++) {
        const card = slot.cards[ci]!;
        const cardH = Math.floor((SLOT_H - CARD_PADDING * 2) / 3);
        const cardY = slotY + CARD_PADDING + ci * (cardH + 2);

        const cardBg = new Graphics();
        cardBg.roundRect(slotX + CARD_PADDING, cardY, SLOT_W - CARD_PADDING * 2, cardH, 2);
        cardBg.fill({ color: TRAFFIC_COLOR, alpha: 0.9 });
        container.addChild(cardBg);

        const cardStyle = new TextStyle({ fill: 0x00f5ff, fontSize: 8, fontFamily: 'Courier New', wordWrap: true, wordWrapWidth: SLOT_W - 12 });
        const cardText = new Text({ text: card.name, style: cardStyle });
        cardText.x = slotX + CARD_PADDING + 2;
        cardText.y = cardY + 2;
        container.addChild(cardText);
      }

      // Capacity indicator
      const capStyle = new TextStyle({ fill: 0x6b7280, fontSize: 8, fontFamily: 'Courier New' });
      const cap = new Text({
        text: `${slot.cards.length}/${slot.baseCapacity + slot.capacityBoost}`,
        style: capStyle,
      });
      cap.x = slotX + SLOT_W - 22;
      cap.y = slotY + SLOT_H - 12;
      container.addChild(cap);
    }
  }

  // Tracks section (below board)
  renderTracks(app, container, ctx, startY + 24 + 8 * (SLOT_H + SLOT_GAP) + 20);
}

function renderTracks(app: Application, container: Container, ctx: GameContext, yOffset: number): void {
  const trackColors: Record<string, number> = {
    BreakFix: 0xff375f,
    Projects: 0x30d158,
    Maintenance: 0xffd60a,
  };

  for (let ti = 0; ti < ctx.tracks.length; ti++) {
    const track = ctx.tracks[ti]!;
    const trackX = 20;
    const trackY = yOffset + ti * 36;
    const trackW = app.screen.width - 40;

    const bg = new Graphics();
    bg.roundRect(trackX, trackY, trackW, 28, 4);
    bg.fill({ color: 0x111827, alpha: 0.8 });
    bg.stroke({ color: trackColors[track.track] ?? 0x555555, width: 1, alpha: 0.5 });
    container.addChild(bg);

    const labelStyle = new TextStyle({
      fill: trackColors[track.track] ?? 0xffffff,
      fontSize: 10,
      fontFamily: 'Courier New',
      fontWeight: 'bold',
    });
    const label = new Text({ text: track.track.toUpperCase(), style: labelStyle });
    label.x = trackX + 8;
    label.y = trackY + 9;
    container.addChild(label);

    // Ticket indicators
    for (let ki = 0; ki < track.tickets.length; ki++) {
      const ticket = track.tickets[ki]!;
      const tickX = trackX + 100 + ki * 80;
      const tickBg = new Graphics();
      tickBg.roundRect(tickX, trackY + 4, 70, 20, 3);
      tickBg.fill({ color: 0x3b0000, alpha: 0.9 });
      tickBg.stroke({ color: trackColors[track.track] ?? 0xff0000, width: 1 });
      container.addChild(tickBg);

      const tickStyle = new TextStyle({ fill: 0xfca5a5, fontSize: 8, fontFamily: 'Courier New' });
      const tickText = new Text({ text: ticket.name, style: tickStyle });
      tickText.x = tickX + 4;
      tickText.y = trackY + 8;
      container.addChild(tickText);
    }

    if (track.tickets.length === 0) {
      const emptyStyle = new TextStyle({ fill: 0x374151, fontSize: 9, fontFamily: 'Courier New', fontStyle: 'italic' });
      const empty = new Text({ text: 'no tickets', style: emptyStyle });
      empty.x = trackX + 100;
      empty.y = trackY + 9;
      container.addChild(empty);
    }
  }
}
