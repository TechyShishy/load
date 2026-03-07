import React, { useEffect, useRef, useState } from 'react';
import { Application, Assets, Container, Graphics, Mesh, MeshGeometry, RenderTexture, Sprite, type Texture, Text, Ticker, TextStyle } from 'pixi.js';
import {
  Period,
  type DrawLog,
  type ActionCard,
  type EventCard,
  type GameContext,
  type TimeSlot,
  type TrackSlot,
  type TrafficCard,
} from '@load/game-core';
import {
  SLOT_W,
  SLOT_H,
  SLOT_GAP,
  PERIOD_PADDING,
  CARD_PADDING,
  BOARD_START_Y,
  PILES_ROW_Y,
  PILE_INTRA_GROUP_GAP,
  computeDeckPileRect,
  computeSlotRect,
  computeTracksYOffset,
  rowsForPeriod,
} from './canvasLayout.js';
interface GameCanvasProps {
  context: GameContext;
  phase: string;
  /** Optional shared ref for the container div. Passed from App so overlay
   * components can compute slot positions without duplicating layout math. */
  containerRef?: React.RefObject<HTMLDivElement>;
  /** The draw log from the current context — triggers card fly-in animations. */
  drawLog?: DrawLog | null;
  /** Card IDs currently mid-animation (not yet arrived at their destination slot). */
  suppressedCardIds?: ReadonlySet<string>;
  /** Called by the ticker when a card's fly-in animation reaches its slot. */
  onCardArrived?: (id: string) => void;
  /** CSS clientWidth of the canvas container element, for layout math. */
  containerWidth?: number;
  /** Animation speed multiplier — 1.5× on round 1, 1× otherwise. */
  speedMult?: number;
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
const EVENT_COLOR = 0x5c0015;

// ── Deck pile types and colors ────────────────────────────────────────────────
type DeckType = 'traffic' | 'event' | 'action';
type PileType = 'draw' | 'discard';
const PILE_COLORS: Record<DeckType, { bg: number; accent: number }> = {
  traffic: { bg: 0x003a5c, accent: 0x005f8f },
  event:   { bg: 0x5c0015, accent: 0xff375f },
  action:  { bg: 0x013a05, accent: 0x30d158 },
};

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
const PILE_NAME_STYLE = new TextStyle({
  fill: 0xffffff,
  fontSize: 9,
  fontFamily: 'Courier New',
  fontWeight: 'bold',
});
const PILE_LABEL_STYLE = new TextStyle({
  fill: 0x6b7280,
  fontSize: 8,
  fontFamily: 'Courier New',
});
// ── Card art ──────────────────────────────────────────────────────────────────
/** templateId → public URL for cards that have SVG art. Extend when adding new art. */
const CARD_ART: Partial<Record<string, string>> = {
  'traffic-4k-stream': '/cards/traffic-4k-stream.svg',
  'traffic-cloud-backup': '/cards/traffic-cloud-backup.svg',
  'traffic-ddos': '/cards/traffic-ddos.svg',
  'traffic-iot-burst': '/cards/traffic-iot-burst.svg',
  'action-traffic-prioritization': '/cards/action-traffic-prioritization.svg',
  'action-security-patch': '/cards/action-security-patch.svg',
  'event-ddos-attack': '/cards/event-ddos-attack.svg',
  'event-aws-outage': '/cards/event-aws-outage.svg',
  'event-5g-activation': '/cards/event-5g-activation.svg',
  'action-stream-compression': '/cards/action-stream-compression.svg',
  'action-bandwidth-upgrade': '/cards/action-bandwidth-upgrade.svg',
  'action-datacenter-expansion': '/cards/action-datacenter-expansion.svg',
  'action-emergency-maintenance': '/cards/action-emergency-maintenance.svg',
};

/**
 * Returns a sized Sprite using a pre-loaded card art texture, or null if the
 * card has no art (or the asset wasn't loaded yet).
 */
function cardArtSprite(templateId: string, x: number, y: number, w: number, h: number): Sprite | null {
  const url = CARD_ART[templateId];
  if (!url) return null;
  const texture = Assets.get<Texture>(url);
  if (!texture) return null;
  const sprite = new Sprite(texture);
  sprite.x = x;
  sprite.y = y;
  sprite.width = w;
  sprite.height = h;
  return sprite;
}

// ── Draw-phase card animation ─────────────────────────────────────────────────
const FLY_MS = 180;
const FLIP_MS = 280;
const HOLD_MS = 180;

interface CardAnimJob {
  cardId: string;
  mesh: Mesh;
  geo: MeshGeometry;
  srcCx: number; srcCy: number;
  dstCx: number; dstCy: number;
  w: number; h: number;
  elapsed: number;
  totalMs: number;
  frontTex: RenderTexture;
  backTex: RenderTexture;
}

/**
 * Update a MeshGeometry's vertex positions and UVs for a perspective card flip.
 * @param geo   geometry to mutate in-place
 * @param cx    centre-X of the card in canvas pixels
 * @param cy    centre-Y of the card in canvas pixels
 * @param W     card width in pixels
 * @param H     card height in pixels
 * @param angle flip angle in radians (0 = face-on, π/2 = edge-on, π = flipped)
 * @param focal focal-length for perspective foreshortening (default 600)
 */
export function updateFlipVertices(
  geo: MeshGeometry,
  cx: number, cy: number,
  W: number, H: number,
  angle: number,
  focal = 600,
): void {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const half = W / 2;
  const lx = cx + (-half * cosA) * focal / (focal - half * sinA);
  const rx = cx + (half * cosA) * focal / (focal + half * sinA);
  const topY = cy - H / 2;
  const botY = cy + H / 2;
  // Mirror U coordinate when past the half-turn (back face becomes visible)
  const u0 = cosA >= 0 ? 0 : 1;
  const u1 = cosA >= 0 ? 1 : 0;
  geo.positions = new Float32Array([lx, topY, rx, topY, rx, botY, lx, botY]);
  geo.uvs = new Float32Array([u0, 0, u1, 0, u1, 1, u0, 1]);
}

function createCardFrontTexture(app: Application, card: TrafficCard): RenderTexture {
  const rt = RenderTexture.create({ width: SLOT_W, height: SLOT_H });
  const g = new Graphics();
  g.roundRect(CARD_PADDING, CARD_PADDING, SLOT_W - CARD_PADDING * 2, SLOT_H - CARD_PADDING * 2, 2);
  g.fill({ color: TRAFFIC_COLOR, alpha: 0.9 });
  const artImgW = SLOT_W - CARD_PADDING * 2;
  const artImgH = SLOT_H / 2 - CARD_PADDING - 1;
  const art = cardArtSprite(card.templateId, CARD_PADDING, CARD_PADDING, artImgW, artImgH);
  const imgZone = art ?? (() => {
    const z = new Graphics();
    z.roundRect(CARD_PADDING, CARD_PADDING, artImgW, artImgH, 2);
    z.fill({ color: 0x00f5ff, alpha: 0.1 });
    z.stroke({ color: 0x00f5ff, width: 1, alpha: 0.35 });
    return z;
  })();
  const label = new Text({ text: card.name, style: CARD_CHIP_STYLE });
  label.x = CARD_PADDING + 2;
  label.y = SLOT_H / 2 + CARD_PADDING + 2;
  const c = new Container();
  c.addChild(g);
  c.addChild(imgZone);
  c.addChild(label);
  app.renderer.render({ container: c, target: rt });
  c.destroy({ children: true });
  return rt;
}

function createCardBackTexture(app: Application, color = TRAFFIC_COLOR, accent = 0x00f5ff): RenderTexture {
  const rt = RenderTexture.create({ width: SLOT_W, height: SLOT_H });
  const g = new Graphics();
  g.roundRect(0, 0, SLOT_W, SLOT_H, 4);
  g.fill({ color, alpha: 0.5 });
  g.stroke({ color: accent, width: 1, alpha: 0.4 });
  app.renderer.render({ container: g, target: rt });
  g.destroy();
  return rt;
}

function createEventCardFrontTexture(app: Application, card: EventCard): RenderTexture {
  const rt = RenderTexture.create({ width: SLOT_W, height: SLOT_H });
  const g = new Graphics();
  g.roundRect(CARD_PADDING, CARD_PADDING, SLOT_W - CARD_PADDING * 2, SLOT_H - CARD_PADDING * 2, 2);
  g.fill({ color: EVENT_COLOR, alpha: 0.9 });
  const artImgW = SLOT_W - CARD_PADDING * 2;
  const artImgH = SLOT_H / 2 - CARD_PADDING - 1;
  const art = cardArtSprite(card.templateId, CARD_PADDING, CARD_PADDING, artImgW, artImgH);
  const imgZone = art ?? (() => {
    const z = new Graphics();
    z.roundRect(CARD_PADDING, CARD_PADDING, artImgW, artImgH, 2);
    z.fill({ color: 0xff375f, alpha: 0.1 });
    z.stroke({ color: 0xff375f, width: 1, alpha: 0.35 });
    return z;
  })();
  const label = new Text({ text: card.name, style: new TextStyle({ fill: 0xff375f, fontSize: 8, fontFamily: 'Courier New', wordWrap: true, wordWrapWidth: SLOT_W - 12 }) });
  label.x = CARD_PADDING + 2;
  label.y = SLOT_H / 2 + CARD_PADDING + 2;
  const c = new Container();
  c.addChild(g);
  c.addChild(imgZone);
  c.addChild(label);
  app.renderer.render({ container: c, target: rt });
  c.destroy({ children: true });
  return rt;
}

function createActionCardFrontTexture(app: Application, card: ActionCard): RenderTexture {
  const rt = RenderTexture.create({ width: SLOT_W, height: SLOT_H });
  const g = new Graphics();
  g.roundRect(CARD_PADDING, CARD_PADDING, SLOT_W - CARD_PADDING * 2, SLOT_H - CARD_PADDING * 2, 2);
  g.fill({ color: PILE_COLORS.action.bg, alpha: 0.9 });
  const artImgW = SLOT_W - CARD_PADDING * 2;
  const artImgH = SLOT_H / 2 - CARD_PADDING - 1;
  const art = cardArtSprite(card.templateId, CARD_PADDING, CARD_PADDING, artImgW, artImgH);
  const imgZone = art ?? (() => {
    const z = new Graphics();
    z.roundRect(CARD_PADDING, CARD_PADDING, artImgW, artImgH, 2);
    z.fill({ color: PILE_COLORS.action.accent, alpha: 0.1 });
    z.stroke({ color: PILE_COLORS.action.accent, width: 1, alpha: 0.35 });
    return z;
  })();
  const label = new Text({ text: card.name, style: new TextStyle({ fill: PILE_COLORS.action.accent, fontSize: 8, fontFamily: 'Courier New', wordWrap: true, wordWrapWidth: SLOT_W - 12 }) });
  label.x = CARD_PADDING + 2;
  label.y = SLOT_H / 2 + CARD_PADDING + 2;
  const c = new Container();
  c.addChild(g);
  c.addChild(imgZone);
  c.addChild(label);
  app.renderer.render({ container: c, target: rt });
  c.destroy({ children: true });
  return rt;
}

/** Per-track label styles generated once and cached. */
const TRACK_LABEL_STYLES: Record<string, TextStyle> = {};

/**
 * Spawn Mesh fly-in/flip animation jobs for a draw log.
 * Safe to call any time after the PixiJS app and animLayer are ready.
 * Flushes any stale jobs first so a rapid re-draw never double-animates.
 */
function spawnDrawAnimations(
  app: Application,
  animLayer: Container,
  animJobs: CardAnimJob[],
  log: DrawLog,
  ctx: GameContext,
  cw: number,
  spd: number,
): void {
  // Flush any jobs from a previous draw that haven't completed yet.
  const stale = animJobs.splice(0);
  for (const job of stale) {
    animLayer.removeChild(job.mesh);
    job.mesh.destroy();
    job.frontTex.destroy();
    job.backTex.destroy();
  }

  const totalMs = (FLY_MS + FLIP_MS + HOLD_MS) / spd;
  const periods = Object.values(Period) as Period[];
  const srcRect = computeDeckPileRect(0, 'draw', cw);
  const srcCx = srcRect.x + srcRect.w / 2;
  const srcCy = srcRect.y + srcRect.h / 2;

  log.traffic.forEach((entry, idx) => {
    const periodIndex = periods.indexOf(entry.period);
    if (periodIndex < 0) return;

    const periodSlots = ctx.timeSlots.filter((s) => s.period === entry.period);
    const dstRect = computeSlotRect(periodIndex, entry.slotIndex, cw, periodSlots.length);
    const dstCx = dstRect.x + dstRect.w / 2;
    const dstCy = dstRect.y + dstRect.h / 2;

    const frontTex = createCardFrontTexture(app, entry.card);
    const backTex = createCardBackTexture(app);
    const geo = new MeshGeometry({
      positions: new Float32Array([
        srcCx - SLOT_W / 2, srcCy - SLOT_H / 2,
        srcCx + SLOT_W / 2, srcCy - SLOT_H / 2,
        srcCx + SLOT_W / 2, srcCy + SLOT_H / 2,
        srcCx - SLOT_W / 2, srcCy + SLOT_H / 2,
      ]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const mesh = new Mesh({ geometry: geo, texture: backTex });
    mesh.visible = false; // hidden until its stagger delay expires
    animLayer.addChild(mesh);

    animJobs.push({
      cardId: entry.card.id,
      mesh, geo,
      srcCx, srcCy,
      dstCx, dstCy,
      w: SLOT_W, h: SLOT_H,
      elapsed: -(idx * (FLY_MS + FLIP_MS) / spd),
      totalMs,
      frontTex, backTex,
    });
  });

  // Event card fly-ins — from event deck pile to discard pile.
  if (log.events.length > 0) {
    const evSrcRect = computeDeckPileRect(1, 'draw', cw);
    const evSrcCx = evSrcRect.x + evSrcRect.w / 2;
    const evSrcCy = evSrcRect.y + evSrcRect.h / 2;
    const evDstRect = computeDeckPileRect(1, 'discard', cw);
    const evDstCx = evDstRect.x + evDstRect.w / 2;
    const evDstCy = evDstRect.y + evDstRect.h / 2;
    const stagger = log.traffic.length; // offset event stagger past traffic cards

    log.events.forEach((card, idx) => {
      const frontTex = createEventCardFrontTexture(app, card);
      const backTex = createCardBackTexture(app, EVENT_COLOR, 0xff375f);
      const geo = new MeshGeometry({
        positions: new Float32Array([
          evSrcCx - SLOT_W / 2, evSrcCy - SLOT_H / 2,
          evSrcCx + SLOT_W / 2, evSrcCy - SLOT_H / 2,
          evSrcCx + SLOT_W / 2, evSrcCy + SLOT_H / 2,
          evSrcCx - SLOT_W / 2, evSrcCy + SLOT_H / 2,
        ]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      });
      const mesh = new Mesh({ geometry: geo, texture: backTex });
      mesh.visible = false;
      animLayer.addChild(mesh);

      animJobs.push({
        cardId: card.id,
        mesh, geo,
        srcCx: evSrcCx, srcCy: evSrcCy,
        dstCx: evDstCx, dstCy: evDstCy,
        w: SLOT_W, h: SLOT_H,
        elapsed: -((stagger + idx) * (FLY_MS + FLIP_MS) / spd),
        totalMs,
        frontTex, backTex,
      });
    });
  }

  // Action card fly-ins — from action deck pile to bottom edge of canvas.
  if (log.action.length > 0) {
    const actSrcRect = computeDeckPileRect(2, 'draw', cw);
    const actSrcCx = actSrcRect.x + actSrcRect.w / 2;
    const actSrcCy = actSrcRect.y + actSrcRect.h / 2;
    const actDstCx = cw / 2;
    const actDstCy = app.screen.height - SLOT_H / 2;
    const stagger = log.traffic.length + log.events.length;

    log.action.forEach((card, idx) => {
      const frontTex = createActionCardFrontTexture(app, card);
      const backTex = createCardBackTexture(app, PILE_COLORS.action.bg, PILE_COLORS.action.accent);
      const geo = new MeshGeometry({
        positions: new Float32Array([
          actSrcCx - SLOT_W / 2, actSrcCy - SLOT_H / 2,
          actSrcCx + SLOT_W / 2, actSrcCy - SLOT_H / 2,
          actSrcCx + SLOT_W / 2, actSrcCy + SLOT_H / 2,
          actSrcCx - SLOT_W / 2, actSrcCy + SLOT_H / 2,
        ]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      });
      const mesh = new Mesh({ geometry: geo, texture: backTex });
      mesh.visible = false;
      animLayer.addChild(mesh);

      animJobs.push({
        cardId: card.id,
        mesh, geo,
        srcCx: actSrcCx, srcCy: actSrcCy,
        dstCx: actDstCx, dstCy: actDstCy,
        w: SLOT_W, h: SLOT_H,
        elapsed: -((stagger + idx) * (FLY_MS + FLIP_MS) / spd),
        totalMs,
        frontTex, backTex,
      });
    });
  }
}
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

interface DeckPileRefs {
  container: Container;
  pileX: number;
  pileY: number;
  deckType: DeckType;
  pileType: PileType;
}

interface SceneRefs {
  /** key: `${period}-${slotIndex}` */
  slots: Map<string, SlotRefs>;
  /** key: track.track (enum string) */
  tracks: Map<string, TrackRefs>;
  /** key: `${deckType}-${pileType}` e.g. 'traffic-draw' */
  piles: Map<string, DeckPileRefs>;
}

// ── Static scene construction ─────────────────────────────────────────────────
function buildStaticScene(app: Application, board: Container, ctx: GameContext): SceneRefs {
  const piles = buildDeckPiles(app, board, ctx);
  const refs: SceneRefs = { slots: new Map(), tracks: new Map(), piles };

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
function paintSlotCards(
  slot: TimeSlot, slotX: number, slotY: number, container: Container,
  suppressedCardIds?: ReadonlySet<string>,
): void {
  let vi = 0;
  for (let ci = 0; ci < slot.cards.length; ci++) {
    const card = slot.cards[ci]!;
    if (suppressedCardIds?.has(card.id)) continue;
    const cardH = SLOT_H - CARD_PADDING * 2;
    const cardY = slotY + CARD_PADDING + vi * (cardH + 2);
    vi++;

    const cardBg = new Graphics();
    cardBg.roundRect(slotX + CARD_PADDING, cardY, SLOT_W - CARD_PADDING * 2, cardH, 2);
    cardBg.fill({ color: TRAFFIC_COLOR, alpha: 0.9 });
    container.addChild(cardBg);

    const artImgW = SLOT_W - CARD_PADDING * 2;
    const artImgH = SLOT_H / 2 - CARD_PADDING;
    const art = cardArtSprite(card.templateId, slotX + CARD_PADDING, cardY, artImgW, artImgH);
    if (art) {
      container.addChild(art);
    } else {
      const imgZone = new Graphics();
      imgZone.roundRect(slotX + CARD_PADDING, cardY, artImgW, artImgH, 2);
      imgZone.fill({ color: 0x00f5ff, alpha: 0.1 });
      imgZone.stroke({ color: 0x00f5ff, width: 1, alpha: 0.35 });
      container.addChild(imgZone);
    }

    const cardText = new Text({ text: card.name, style: CARD_CHIP_STYLE });
    cardText.x = slotX + CARD_PADDING + 2;
    cardText.y = cardY + SLOT_H / 2;
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

// ── Deck pile painters ───────────────────────────────────────────────────────
function paintPile(
  container: Container,
  pileX: number,
  pileY: number,
  bgColor: number,
  accentColor: number,
  deckLabel: string,
  pileType: PileType,
  count: number,
  topCardName?: string,
  topCardTemplateId?: string,
): void {
  const layers = Math.min(5, Math.ceil(count / 10));

  // Shadow stack layers — drawn deepest-first so the top card renders last.
  for (let li = layers - 1; li >= 1; li--) {
    const offset = li * 2;
    const shadow = new Graphics();
    shadow.roundRect(pileX + offset, pileY + offset, SLOT_W, SLOT_H, 4);
    shadow.fill({ color: bgColor, alpha: 0.2 });
    shadow.stroke({ color: accentColor, width: 1, alpha: 0.2 });
    container.addChild(shadow);
  }

  const topRect = new Graphics();
  topRect.roundRect(pileX, pileY, SLOT_W, SLOT_H, 4);

  if (layers === 0) {
    // Empty pile — ghost outline only.
    topRect.fill({ color: accentColor, alpha: 0.05 });
    topRect.stroke({ color: accentColor, width: 1, alpha: 0.25 });
    container.addChild(topRect);
    return;
  }

  if (pileType === 'discard' && topCardName !== undefined) {
    // Discard face — chip style matching slot cards.
    topRect.fill({ color: TRAFFIC_COLOR, alpha: 0.9 });
    topRect.stroke({ color: accentColor, width: 1 });
    container.addChild(topRect);
    const artImgW = SLOT_W - CARD_PADDING * 2;
    const artImgH = SLOT_H / 2 - CARD_PADDING - 1;
    const art = topCardTemplateId ? cardArtSprite(topCardTemplateId, pileX + CARD_PADDING, pileY + CARD_PADDING, artImgW, artImgH) : null;
    if (art) {
      container.addChild(art);
    } else {
      const imgZone = new Graphics();
      imgZone.roundRect(pileX + CARD_PADDING, pileY + CARD_PADDING, artImgW, artImgH, 2);
      imgZone.fill({ color: accentColor, alpha: 0.1 });
      imgZone.stroke({ color: accentColor, width: 1, alpha: 0.35 });
      container.addChild(imgZone);
    }
    const nameText = new Text({ text: topCardName, style: CARD_CHIP_STYLE });
    nameText.x = pileX + CARD_PADDING + 2;
    nameText.y = pileY + SLOT_H / 2 + CARD_PADDING + 2;
    container.addChild(nameText);
  } else {
    // Draw pile back — colored fill, inner decorative border, deck name.
    topRect.fill({ color: bgColor, alpha: 0.95 });
    topRect.stroke({ color: accentColor, width: 1 });
    container.addChild(topRect);
    const inner = new Graphics();
    inner.roundRect(pileX + 4, pileY + 4, SLOT_W - 8, SLOT_H - 8, 2);
    inner.stroke({ color: accentColor, width: 1, alpha: 0.5 });
    container.addChild(inner);
    const nameText = new Text({ text: deckLabel, style: PILE_NAME_STYLE });
    nameText.anchor.set(0.5, 0.5);
    nameText.x = pileX + SLOT_W / 2;
    nameText.y = pileY + SLOT_H / 2;
    container.addChild(nameText);
  }
}

function buildDeckPiles(
  app: Application,
  board: Container,
  ctx: GameContext,
): Map<string, DeckPileRefs> {
  const piles: Map<string, DeckPileRefs> = new Map();
  const availableW = app.screen.width - 40;
  const groupW = SLOT_W * 2 + PILE_INTRA_GROUP_GAP;
  const interGroupGap = Math.max(8, (availableW - groupW * 3) / 2);

  const DECK_LABELS: Record<DeckType, string> = {
    traffic: 'TRAFFIC',
    event: 'EVENT',
    action: 'ACTION',
  };

  const deckDefs: Array<{ key: DeckType; drawCount: number; discardCount: number; topDiscardName: string | undefined; topDiscardTemplateId: string | undefined }> = [
    {
      key: 'traffic',
      drawCount: ctx.trafficDeck.length,
      discardCount: ctx.trafficDiscard.length,
      topDiscardName: ctx.trafficDiscard.at(-1)?.name,
      topDiscardTemplateId: ctx.trafficDiscard.at(-1)?.templateId,
    },
    {
      key: 'event',
      drawCount: ctx.eventDeck.length,
      discardCount: ctx.eventDiscard.length,
      topDiscardName: ctx.eventDiscard.at(-1)?.name,
      topDiscardTemplateId: ctx.eventDiscard.at(-1)?.templateId,
    },
    {
      key: 'action',
      drawCount: ctx.actionDeck.length,
      discardCount: ctx.actionDiscard.length,
      topDiscardName: ctx.actionDiscard.at(-1)?.name,
      topDiscardTemplateId: ctx.actionDiscard.at(-1)?.templateId,
    },
  ];

  for (let di = 0; di < deckDefs.length; di++) {
    const def = deckDefs[di]!;
    const groupX = 20 + di * (groupW + interGroupGap);
    const colors = PILE_COLORS[def.key];
    const deckLabel = DECK_LABELS[def.key];

    // Draw pile.
    const drawContainer = new Container();
    const drawX = groupX;
    const drawY = PILES_ROW_Y;
    paintPile(drawContainer, drawX, drawY, colors.bg, colors.accent, deckLabel, 'draw', def.drawCount);
    board.addChild(drawContainer);
    const drawLabel = new Text({ text: 'DRAW', style: PILE_LABEL_STYLE });
    drawLabel.x = drawX;
    drawLabel.y = PILES_ROW_Y + SLOT_H + 2;
    board.addChild(drawLabel);
    piles.set(`${def.key}-draw`, {
      container: drawContainer,
      pileX: drawX,
      pileY: drawY,
      deckType: def.key,
      pileType: 'draw',
    });

    // Discard pile.
    const discardContainer = new Container();
    const discardX = groupX + SLOT_W + PILE_INTRA_GROUP_GAP;
    const discardY = PILES_ROW_Y;
    paintPile(discardContainer, discardX, discardY, colors.bg, colors.accent, deckLabel, 'discard', def.discardCount, def.topDiscardName, def.topDiscardTemplateId);
    board.addChild(discardContainer);
    const discardLabel = new Text({ text: 'DISCARD', style: PILE_LABEL_STYLE });
    discardLabel.x = discardX;
    discardLabel.y = PILES_ROW_Y + SLOT_H + 2;
    board.addChild(discardLabel);
    piles.set(`${def.key}-discard`, {
      container: discardContainer,
      pileX: discardX,
      pileY: discardY,
      deckType: def.key,
      pileType: 'discard',
    });
  }

  return piles;
}

// ── Patch functions (called on context change) ────────────────────────────────
function patchSlot(
  refs: SlotRefs, oldSlot: TimeSlot, newSlot: TimeSlot,
  suppressedCardIds?: ReadonlySet<string>,
): void {
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
    paintSlotCards(newSlot, refs.slotX, refs.slotY, refs.cardContainer, suppressedCardIds);
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

function patchPile(pile: DeckPileRefs, prevCtx: GameContext, nextCtx: GameContext): void {
  const getInfo = (ctx: GameContext) => {
    if (pile.deckType === 'traffic') {
      const arr = pile.pileType === 'draw' ? ctx.trafficDeck : ctx.trafficDiscard;
      const top = arr.at(-1);
      return { count: arr.length, topName: top?.name, topTemplateId: top?.templateId };
    } else if (pile.deckType === 'event') {
      const arr = pile.pileType === 'draw' ? ctx.eventDeck : ctx.eventDiscard;
      const top = arr.at(-1);
      return { count: arr.length, topName: top?.name, topTemplateId: top?.templateId };
    } else {
      const arr = pile.pileType === 'draw' ? ctx.actionDeck : ctx.actionDiscard;
      const top = arr.at(-1);
      return { count: arr.length, topName: top?.name, topTemplateId: top?.templateId };
    }
  };
  const prev = getInfo(prevCtx);
  const next = getInfo(nextCtx);
  if (prev.count === next.count && prev.topName === next.topName && prev.topTemplateId === next.topTemplateId) return;
  const colors = PILE_COLORS[pile.deckType];
  const deckLabel = pile.deckType.toUpperCase();
  for (const child of pile.container.children) {
    child.destroy();
  }
  pile.container.removeChildren();
  paintPile(
    pile.container,
    pile.pileX,
    pile.pileY,
    colors.bg,
    colors.accent,
    deckLabel,
    pile.pileType,
    next.count,
    next.topName,
    next.topTemplateId,
  );
}

function patchPiles(refs: SceneRefs, prevCtx: GameContext, nextCtx: GameContext): void {
  for (const pile of refs.piles.values()) {
    patchPile(pile, prevCtx, nextCtx);
  }
}

function patchBoard(
  refs: SceneRefs, prevCtx: GameContext, nextCtx: GameContext,
  suppressedCardIds?: ReadonlySet<string>,
): void {
  const decksChanged =
    prevCtx.trafficDeck !== nextCtx.trafficDeck ||
    prevCtx.trafficDiscard !== nextCtx.trafficDiscard ||
    prevCtx.eventDeck !== nextCtx.eventDeck ||
    prevCtx.eventDiscard !== nextCtx.eventDiscard ||
    prevCtx.actionDeck !== nextCtx.actionDeck ||
    prevCtx.actionDiscard !== nextCtx.actionDiscard;

  // Short-circuit if nothing board-relevant has changed.
  if (prevCtx.timeSlots === nextCtx.timeSlots && prevCtx.tracks === nextCtx.tracks && !decksChanged) return;

  const periods = Object.values(Period) as Period[];
  for (const period of periods) {
    const oldPeriodSlots = prevCtx.timeSlots.filter((s) => s.period === period);
    const newPeriodSlots = nextCtx.timeSlots.filter((s) => s.period === period);
    for (let si = 0; si < newPeriodSlots.length; si++) {
      const oldSlot = oldPeriodSlots[si];
      const newSlot = newPeriodSlots[si];
      if (!oldSlot || !newSlot || (oldSlot === newSlot && oldSlot.overloaded === newSlot.overloaded)) continue;
      const slotRefs = refs.slots.get(`${period}-${si}`);
      if (slotRefs) patchSlot(slotRefs, oldSlot, newSlot, suppressedCardIds);
    }
  }

  for (const newTrack of nextCtx.tracks) {
    const oldTrack = prevCtx.tracks.find((t) => t.track === newTrack.track);
    if (!oldTrack || oldTrack === newTrack) continue;
    const trackRefs = refs.tracks.get(newTrack.track);
    if (trackRefs) patchTrack(trackRefs, oldTrack, newTrack);
  }

  if (decksChanged) {
    patchPiles(refs, prevCtx, nextCtx);
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

  // Deck pile counts and top discard card.
  const deckPileDescs: [string, number, string | undefined][] = [
    ['Traffic draw', ctx.trafficDeck.length, undefined],
    ['Traffic discard', ctx.trafficDiscard.length, ctx.trafficDiscard.at(-1)?.name],
    ['Event draw', ctx.eventDeck.length, undefined],
    ['Event discard', ctx.eventDiscard.length, ctx.eventDiscard.at(-1)?.name],
    ['Action draw', ctx.actionDeck.length, undefined],
    ['Action discard', ctx.actionDiscard.length, ctx.actionDiscard.at(-1)?.name],
  ];
  for (const [label, count, topName] of deckPileDescs) {
    if (count === 0) {
      parts.push(`${label}: empty`);
    } else if (topName !== undefined) {
      parts.push(`${label}: ${count} cards, top: ${topName}`);
    } else {
      parts.push(`${label}: ${count} cards`);
    }
  }

  return parts.join('. ');
}

// ── Component ─────────────────────────────────────────────────────────────────
export function GameCanvas({
  context,
  phase: _phase,
  containerRef: externalContainerRef,
  drawLog,
  suppressedCardIds,
  onCardArrived,
  containerWidth: containerWidthProp,
  speedMult,
}: GameCanvasProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef ?? internalRef;
  const appRef = useRef<Application | null>(null);
  const boardRef = useRef<Container | null>(null);
  const sceneRefsRef = useRef<SceneRefs | null>(null);
  const prevContextRef = useRef<GameContext | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [boardSummary, setBoardSummary] = useState(() => buildBoardSummary(context));

  // Animation refs — updated every render, safe to read from effects and ticker.
  const animLayerRef = useRef<Container | null>(null);
  const animJobsRef = useRef<CardAnimJob[]>([]);
  const suppressedCardIdsRef = useRef<ReadonlySet<string>>(new Set());
  const onCardArrivedRef = useRef<((id: string) => void) | undefined>(undefined);
  const contextRef = useRef<GameContext>(context);
  // Mirror props that the init .then() needs to read after async app startup.
  const drawLogRef = useRef<DrawLog | null | undefined>(undefined);
  const speedMultRef = useRef<number>(speedMult ?? 1);
  suppressedCardIdsRef.current = suppressedCardIds ?? new Set();
  onCardArrivedRef.current = onCardArrived;
  contextRef.current = context;
  drawLogRef.current = drawLog;
  speedMultRef.current = speedMult ?? 1;

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
      .then(async () => {
        if (cancelled) {
          app.destroy(true, { children: true });
          return;
        }
        // Preload card art assets so texture creation functions can access them
        // synchronously via Assets.get(). Silently skip on failure (no art = placeholder).
        await (Assets.load(Object.values(CARD_ART).filter((u): u is string => !!u)) as Promise<unknown>)
          .catch(() => { /* no card art = graceful placeholder fallback */ });
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

        // Animation layer sits above the board so flying cards render on top.
        const animLayer = new Container();
        app.stage.addChild(animLayer);
        animLayerRef.current = animLayer;

        // If a drawLog arrived before PixiJS was ready (e.g. round 1 on first mount),
        // spawn its animations now that the app and animLayer are both initialised.
        const pendingDl = drawLogRef.current;
        if (pendingDl?.traffic.length || pendingDl?.events.length || pendingDl?.action.length) {
          spawnDrawAnimations(
            app, animLayer, animJobsRef.current,
            pendingDl, contextRef.current,
            app.screen.width, speedMultRef.current,
          );
        }

        // Ticker drives card fly-in animations each frame.
        // TODO-0008: skip all pending animations immediately when the user clicks the canvas.
        const tickFn = (ticker: Ticker) => {
          const jobs = animJobsRef.current;
          const layer = animLayerRef.current;
          if (!layer || jobs.length === 0) return;
          const dt = ticker.deltaMS;
          for (let i = jobs.length - 1; i >= 0; i--) {
            const job = jobs[i]!;
            job.elapsed += dt;
            if (job.elapsed < 0) continue; // still in stagger delay
            job.mesh.visible = true;
            const t = Math.min(1, job.elapsed / job.totalMs);
            const cx = job.srcCx + (job.dstCx - job.srcCx) * t;
            const cy = job.srcCy + (job.dstCy - job.srcCy) * t;
            const angle = t * Math.PI;
            if (angle >= Math.PI / 2 && job.mesh.texture !== job.frontTex) {
              job.mesh.texture = job.frontTex;
            }
            updateFlipVertices(job.geo, cx, cy, job.w, job.h, angle);
            if (t >= 1) {
              layer.removeChild(job.mesh);
              job.mesh.destroy();
              job.frontTex.destroy();
              job.backTex.destroy();
              jobs.splice(i, 1);
              onCardArrivedRef.current?.(job.cardId);
            }
          }
        };
        app.ticker.add(tickFn);
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
        animLayerRef.current = null;
        animJobsRef.current = [];
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
      app.stage.addChildAt(newBoard, 0); // keep animLayer on top
      boardRef.current = newBoard;
      sceneRefsRef.current = buildStaticScene(app, newBoard, context);
    } else {
      const refs = sceneRefsRef.current;
      if (refs) patchBoard(refs, prev, context, suppressedCardIdsRef.current);
    }
    prevContextRef.current = context;
  }, [context]);

  // Spawn card fly-in animations when a new draw log is received.
  // Note: on the very first render PixiJS may not be ready yet; the init
  // .then() callback handles that case by reading drawLogRef directly.
  useEffect(() => {
    const app = appRef.current;
    const animLayer = animLayerRef.current;
    if (!app || !animLayer || (!drawLog?.traffic.length && !drawLog?.events.length && !drawLog?.action.length)) return;
    spawnDrawAnimations(
      app, animLayer, animJobsRef.current,
      drawLog, contextRef.current,
      containerWidthProp ?? app.screen.width,
      speedMult ?? 1,
    );
  }, [drawLog]); // eslint-disable-line react-hooks/exhaustive-deps

  // Repaint slot card chips whenever the suppressed-card set changes.
  // This drives the progressive board reveal as cards arrive at their slots.
  useEffect(() => {
    const refs = sceneRefsRef.current;
    if (!refs) return;
    const ctx = contextRef.current;
    const suppressed = suppressedCardIds ?? (new Set() as ReadonlySet<string>);
    const periods = Object.values(Period) as Period[];
    for (const period of periods) {
      const periodSlots = ctx.timeSlots.filter((s) => s.period === period);
      for (let si = 0; si < periodSlots.length; si++) {
        const slot = periodSlots[si]!;
        const slotRefs = refs.slots.get(`${period}-${si}`);
        if (!slotRefs) continue;
        for (const child of slotRefs.cardContainer.children) {
          child.destroy();
        }
        slotRefs.cardContainer.removeChildren();
        paintSlotCards(slot, slotRefs.slotX, slotRefs.slotY, slotRefs.cardContainer, suppressed);
      }
    }
  }, [suppressedCardIds]); // eslint-disable-line react-hooks/exhaustive-deps

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
