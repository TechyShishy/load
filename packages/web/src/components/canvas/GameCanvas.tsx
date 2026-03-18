import React, { useEffect, useRef, useState } from 'react';
import { Application, Assets, Container, Graphics, Mesh, MeshGeometry, RenderTexture, Sprite, type Texture, Text, Ticker, TextStyle } from 'pixi.js';
import { updateFlipVertices } from './flipGeometry.js';
import { CARD_ART } from '../../cardArt.js';
import {
  Period,
  getFilledTimeSlots,
  getTracks,
  getTrafficDeck,
  getTrafficDiscard,
  getEventDeck,
  getEventDiscard,
  getActionDeck,
  getActionDiscard,
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
  STACK_STRIDE,
  PERIOD_PADDING,
  CARD_PADDING,
  BOARD_START_Y,
  BOARD_COLUMN_COUNT,
  TRACK_H,
  TICKET_STRIDE,
  GEAR_SLOT_H,
  GEAR_HEADER_H,
  computeDeckPileRect,
  computeSlotRect,
  computeTrackRect,
  rowsForPeriod,
  subColsForPeriod,
  MAX_SUB_COLS,
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
  /** When true, card fly-in animations are suppressed (respects prefers-reduced-motion). */
  reducedMotion?: boolean;
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

const GEAR_BLOCK_COLOR = 0x1a1a1a;
const GEAR_BLOCK_ACCENT = 0x888888;

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
const GEAR_HEADER_STYLE = new TextStyle({ fill: 0x888888, fontSize: 11, fontFamily: 'Courier New' });
const GEAR_SLOT_NAME_STYLE = new TextStyle({ fill: 0xf59e0b, fontSize: 9, fontFamily: 'Courier New', fontWeight: 'bold' });
const GEAR_SLOT_DESC_STYLE = new TextStyle({ fill: 0x6b7280, fontSize: 8, fontFamily: 'Courier New' });
const GEAR_SLOT_EMPTY_STYLE = new TextStyle({ fill: 0x2d3748, fontSize: 9, fontFamily: 'Courier New', fontStyle: 'italic' });

const SLOT_LABEL_STYLE = new TextStyle({ fill: 0x4b5563, fontSize: 9, fontFamily: 'Courier New' });
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

// ── Card title layout ─────────────────────────────────────────────────────────
/** Height in px of the title strip that sits above the art image. */
const CARD_TITLE_ZONE_H = 14;
/** Maximum font size in px for card title (≈ 10pt). */
const CARD_TITLE_MAX_FONT = 10;
/** Available width for the title text (card inner width – small horizontal inset). */
const CARD_TITLE_MAX_W = SLOT_W - CARD_PADDING * 2 - 4;
/** Height reserved for the flavor text zone when a card has flavorText. */
const FLAVOR_ZONE_H = 14;
/** Minimum font size in px for description text step-down. */
const DESC_FONT_MIN = 4;
/** Minimum font size in px for flavor text step-down. */
const FLAVOR_FONT_MIN = 3;

const CARD_COST_STYLE = new TextStyle({
  fill: 0xfbbf24,
  fontSize: 6,
  fontFamily: 'Courier New',
});

/**
 * Returns a single-line Text object that fits within CARD_TITLE_MAX_W px.
 * Starts at CARD_TITLE_MAX_FONT and steps down by 0.5 px until it fits or
 * reaches 5 px.
 */
function fitCardTitle(name: string, fill: number): Text {
  let fontSize = CARD_TITLE_MAX_FONT;
  let t = new Text({ text: name, style: new TextStyle({ fill, fontSize, fontFamily: 'Courier New' }) });
  while (t.width > CARD_TITLE_MAX_W && fontSize > 5) {
    fontSize -= 0.5;
    t.destroy();
    t = new Text({ text: name, style: new TextStyle({ fill, fontSize, fontFamily: 'Courier New' }) });
  }
  return t;
}

/**
 * Creates a sized description Text node (grey, word-wrapped) and adds it to container.
 * Steps font down from 6 px until the text fits within maxH, minimum 4 px.
 * No-ops when maxH ≤ 0.
 */
function fitDescText(
  text: string,
  x: number,
  y: number,
  maxH: number,
  container: Container,
): void {
  if (maxH <= 0) return;
  const innerW = SLOT_W - CARD_PADDING * 2;
  let fontSize = 6;
  let t = new Text({ text, style: new TextStyle({ fill: 0x9ca3af, fontSize, fontFamily: 'Courier New', wordWrap: true, wordWrapWidth: innerW - 2 }) });
  while (t.height > maxH && fontSize > DESC_FONT_MIN) {
    fontSize -= 0.5;
    t.destroy();
    t = new Text({ text, style: new TextStyle({ fill: 0x9ca3af, fontSize, fontFamily: 'Courier New', wordWrap: true, wordWrapWidth: innerW - 2 }) });
  }
  t.x = x;
  t.y = y;
  container.addChild(t);
}

/**
 * Creates a sized flavor Text node (grey italic, word-wrapped) and adds it to
 * container. Attempts to step font down from 5 px until the text fits within
 * FLAVOR_ZONE_H; stops at FLAVOR_FONT_MIN px regardless.
 */
function fitFlavorText(
  text: string,
  x: number,
  y: number,
  container: Container,
): void {
  const innerW = SLOT_W - CARD_PADDING * 2;
  let fontSize = 5;
  let t = new Text({ text, style: new TextStyle({ fill: 0x6b7280, fontSize, fontFamily: 'Courier New', fontStyle: 'italic', wordWrap: true, wordWrapWidth: innerW - 2 }) });
  while (t.height > FLAVOR_ZONE_H && fontSize > FLAVOR_FONT_MIN) {
    fontSize -= 0.5;
    t.destroy();
    t = new Text({ text, style: new TextStyle({ fill: 0x6b7280, fontSize, fontFamily: 'Courier New', fontStyle: 'italic', wordWrap: true, wordWrapWidth: innerW - 2 }) });
  }
  t.x = x;
  t.y = y;
  container.addChild(t);
}

/**
 * Truncates `text` so it fits within `maxW` pixels when rendered with `style`.
 * Appends "…" when truncation is necessary.
 * Creates and immediately destroys temporary Text objects for measurement only.
 */
function truncateSingleLine(text: string, style: TextStyle, maxW: number): string {
  let probe = new Text({ text, style });
  if (probe.width <= maxW) { probe.destroy(); return text; }
  probe.destroy();
  let s = text;
  while (s.length > 0) {
    s = s.slice(0, -1);
    probe = new Text({ text: s + '…', style });
    if (probe.width <= maxW) { probe.destroy(); return s + '…'; }
    probe.destroy();
  }
  return '…';
}

// ── Card art ──────────────────────────────────────────────────────────────────
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

function createCardFrontTexture(app: Application, card: TrafficCard): RenderTexture {
  const rt = RenderTexture.create({ width: SLOT_W, height: SLOT_H });
  const g = new Graphics();
  g.roundRect(CARD_PADDING, CARD_PADDING, SLOT_W - CARD_PADDING * 2, SLOT_H - CARD_PADDING * 2, 2);
  g.fill({ color: TRAFFIC_COLOR, alpha: 0.9 });
  const artY = CARD_PADDING + CARD_TITLE_ZONE_H;
  const artImgW = SLOT_W - CARD_PADDING * 2;
  const artImgH = SLOT_H / 2 - CARD_PADDING - 1;
  const art = cardArtSprite(card.templateId, CARD_PADDING, artY, artImgW, artImgH);
  const imgZone = art ?? (() => {
    const z = new Graphics();
    z.roundRect(CARD_PADDING, artY, artImgW, artImgH, 2);
    z.fill({ color: 0x00f5ff, alpha: 0.1 });
    z.stroke({ color: 0x00f5ff, width: 1, alpha: 0.35 });
    return z;
  })();
  const label = fitCardTitle(card.name, 0x00f5ff);
  label.x = CARD_PADDING + 2;
  label.y = CARD_PADDING + 2;
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
  const artY = CARD_PADDING + CARD_TITLE_ZONE_H;
  const artImgW = SLOT_W - CARD_PADDING * 2;
  const artImgH = SLOT_H / 2 - CARD_PADDING - 1;
  const art = cardArtSprite(card.templateId, CARD_PADDING, artY, artImgW, artImgH);
  const imgZone = art ?? (() => {
    const z = new Graphics();
    z.roundRect(CARD_PADDING, artY, artImgW, artImgH, 2);
    z.fill({ color: 0xff375f, alpha: 0.1 });
    z.stroke({ color: 0xff375f, width: 1, alpha: 0.35 });
    return z;
  })();
  const label = fitCardTitle(card.name, 0xff375f);
  label.x = CARD_PADDING + 2;
  label.y = CARD_PADDING + 2;
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
  const artY = CARD_PADDING + CARD_TITLE_ZONE_H;
  const artImgW = SLOT_W - CARD_PADDING * 2;
  const artImgH = SLOT_H / 2 - CARD_PADDING - 1;
  const art = cardArtSprite(card.templateId, CARD_PADDING, artY, artImgW, artImgH);
  const imgZone = art ?? (() => {
    const z = new Graphics();
    z.roundRect(CARD_PADDING, artY, artImgW, artImgH, 2);
    z.fill({ color: PILE_COLORS.action.accent, alpha: 0.1 });
    z.stroke({ color: PILE_COLORS.action.accent, width: 1, alpha: 0.35 });
    return z;
  })();
  const label = fitCardTitle(card.name, PILE_COLORS.action.accent);
  label.x = CARD_PADDING + 2;
  label.y = CARD_PADDING + 2;
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
  const timeSlots = getFilledTimeSlots(ctx);

  log.traffic.forEach((entry, idx) => {
    const periodIndex = periods.indexOf(entry.period);
    if (periodIndex < 0) return;

    const periodSlots = timeSlots.filter((s) => s.period === entry.period);
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
function buildStaticScene(app: Application, board: Container, ctx: GameContext, suppressedCardIds?: ReadonlySet<string>): SceneRefs {
  const piles = buildDeckPiles(app, board, ctx);
  const refs: SceneRefs = { slots: new Map(), tracks: new Map(), piles };

  const periodCols = Object.values(Period) as Period[];
  const availableW = app.screen.width - 40;
  const colW = availableW / BOARD_COLUMN_COUNT;
  const timeSlots = getFilledTimeSlots(ctx);
  const tracks = getTracks(ctx);

  for (let pi = 0; pi < periodCols.length; pi++) {
    const period = periodCols[pi] as Period;
    const periodX = 20 + pi * colW;

    // Slots for this period — collected first so column height responds to temporary extra slots.
    const periodSlots = timeSlots.filter((s) => s.period === period);

    // Period column background — sized to actual slot count, including any temporary slots.
    // Width is capped at the equal-share max but shrinks to fit the actual sub-column count (min 3).
    const rows = rowsForPeriod(periodSlots.length);
    const numSubCols = Math.max(MAX_SUB_COLS, subColsForPeriod(periodSlots.length));
    const interleaved = subColsForPeriod(periodSlots.length) >= 3;
    // Cols overlap horizontally in interleaved mode; effective width = numSubCols-1 sub-cols.
    // +STACK_STRIDE/2 bottom buffer accommodates the half-row vertical shift of odd sub-cols.
    const tightW = PERIOD_PADDING + (numSubCols - 1) * (SLOT_W + SLOT_GAP) - SLOT_GAP + PERIOD_PADDING;
    const colBg = new Graphics();
    colBg.roundRect(
      periodX,
      BOARD_START_Y - 8,
      Math.min(colW - 8, tightW),
      32 + (rows - 1) * STACK_STRIDE + SLOT_H + STACK_STRIDE / 2,
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
    {
      // rows and interleaved are hoisted above the colBg draw.
      // In interleaved mode draw col 0 and col 2 before col 1 each row so that
      // the vertically-shifted col-1 cards layer on top of their neighbours.
      const drawOrder: number[] = [];
      if (interleaved) {
        for (let r = 0; r < rows; r++) {
          for (const sc of [0, 2, 1]) {
            const idx = sc * rows + r;
            if (idx < periodSlots.length) drawOrder.push(idx);
          }
        }
      } else {
        for (let si = 0; si < periodSlots.length; si++) drawOrder.push(si);
      }
      for (const si of drawOrder) {
        const slot = periodSlots[si]!;
        const slotKey = `${period}-${si}`;
        const subCol = Math.floor(si / rows);
        const row = si % rows;
        const xDelta = interleaved ? -subCol * ((SLOT_W + SLOT_GAP) / 2) : 0;
        const yDelta = interleaved && subCol % 2 === 1 ? STACK_STRIDE / 2 : 0;
        const slotX = periodX + PERIOD_PADDING + subCol * (SLOT_W + SLOT_GAP) + xDelta;
        const slotY = BOARD_START_Y + 24 + row * STACK_STRIDE + yDelta;

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
        paintSlotCards(slot, slotX, slotY, cardContainer, suppressedCardIds);
      }
    } // end interleave block
  }

  // ── Gear block — vendor slot panel ────────────────────────────────────────
  {
    const gearX = 20 + periodCols.length * colW;
    const slotW = colW - 8;
    const gearBg = new Graphics();
    gearBg.roundRect(
      gearX,
      BOARD_START_Y - 8,
      slotW,
      32 + 3 * STACK_STRIDE + SLOT_H + STACK_STRIDE / 2,
      8,
    );
    gearBg.fill({ color: GEAR_BLOCK_COLOR, alpha: 0.15 });
    gearBg.stroke({ color: GEAR_BLOCK_ACCENT, width: 1, alpha: 0.2 });
    board.addChild(gearBg);

    const gearHeader = new Text({ text: 'GEAR', style: GEAR_HEADER_STYLE });
    gearHeader.x = gearX + PERIOD_PADDING;
    gearHeader.y = BOARD_START_Y;
    board.addChild(gearHeader);

    const slotInnerW = slotW - PERIOD_PADDING * 2;
    for (let si = 0; si < ctx.vendorSlots.length; si++) {
      const slot = ctx.vendorSlots[si]!;
      const slotY = BOARD_START_Y + GEAR_HEADER_H + si * GEAR_SLOT_H;

      // Slot cell background.
      const cellBg = new Graphics();
      cellBg.roundRect(gearX + 4, slotY + 2, slotW - 8, GEAR_SLOT_H - 4, 4);
      if (slot.card !== null) {
        cellBg.fill({ color: 0x2a1e08, alpha: 0.8 });
        cellBg.stroke({ color: 0xf59e0b, width: 1, alpha: 0.4 });
      } else {
        cellBg.fill({ color: 0x111827, alpha: 0.3 });
        cellBg.stroke({ color: 0x374151, width: 1, alpha: 0.2 });
      }
      board.addChild(cellBg);

      if (slot.card !== null) {
        const card = slot.card;
        const nameText = new Text({ text: card.name, style: GEAR_SLOT_NAME_STYLE });
        nameText.x = gearX + PERIOD_PADDING;
        nameText.y = slotY + 8;
        board.addChild(nameText);

        const descStr = truncateSingleLine(card.description, GEAR_SLOT_DESC_STYLE, slotInnerW);
        const descText = new Text({ text: descStr, style: GEAR_SLOT_DESC_STYLE });
        descText.x = gearX + PERIOD_PADDING;
        descText.y = slotY + 22;
        board.addChild(descText);
      } else {
        const emptyLabel = new Text({ text: `SLOT ${si}`, style: GEAR_SLOT_EMPTY_STYLE });
        emptyLabel.x = gearX + PERIOD_PADDING;
        emptyLabel.y = slotY + Math.floor(GEAR_SLOT_H / 2) - 6;
        board.addChild(emptyLabel);
      }
    }
  }

  // Tracks — static row backgrounds with dynamic ticket containers.
  // Rendered to the right of the deck cluster in the same top band as the piles.
  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti]!;
    const { x: trackX, y: trackY, w: trackW } = computeTrackRect(ti, app.screen.width);
    const tColor = TRACK_COLORS[track.track] ?? 0x555555;

    // Static background.
    const bg = new Graphics();
    bg.roundRect(trackX, trackY, trackW, TRACK_H, 4);
    bg.fill({ color: 0x111827, alpha: 0.8 });
    bg.stroke({ color: tColor, width: 1, alpha: 0.5 });
    board.addChild(bg);

    // Static label — sits below the track (mirrors the DRAW/DISCARD pile labels).
    const label = new Text({
      text: track.track.toUpperCase(),
      style: getTrackLabelStyle(track.track),
    });
    label.anchor.set(0.5, 0);
    label.x = trackX + Math.floor(trackW / 2);
    label.y = trackY + TRACK_H + 2;
    board.addChild(label);

    // Dynamic ticket container — rebuilt by patchTrack on change.
    const ticketContainer = new Container();
    board.addChild(ticketContainer);

    // "no tickets" placeholder — visibility toggled by patchTrack.
    const emptyText = new Text({ text: 'no tickets', style: EMPTY_STYLE });
    emptyText.x = trackX + 8;
    emptyText.y = trackY + Math.floor(TRACK_H / 2) - 5;
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
  if (slot.card === null) return;
  const card = slot.card;
  if (suppressedCardIds?.has(card.id)) return;
  const cardH = SLOT_H - CARD_PADDING * 2;
  const cardY = slotY + CARD_PADDING;

  const cardBg = new Graphics();
  cardBg.roundRect(slotX + CARD_PADDING, cardY, SLOT_W - CARD_PADDING * 2, cardH, 2);
  cardBg.fill({ color: TRAFFIC_COLOR, alpha: 0.9 });
  container.addChild(cardBg);

  const artImgW = SLOT_W - CARD_PADDING * 2;
  const artImgH = SLOT_H / 2 - CARD_PADDING;
  const artY = cardY + CARD_TITLE_ZONE_H;
  const art = cardArtSprite(card.templateId, slotX + CARD_PADDING, artY, artImgW, artImgH);
  if (art) {
    container.addChild(art);
  } else {
    const imgZone = new Graphics();
    imgZone.roundRect(slotX + CARD_PADDING, artY, artImgW, artImgH, 2);
    imgZone.fill({ color: 0x00f5ff, alpha: 0.1 });
    imgZone.stroke({ color: 0x00f5ff, width: 1, alpha: 0.35 });
    container.addChild(imgZone);
  }

  const cardText = fitCardTitle(card.name, 0x00f5ff);
  cardText.x = slotX + CARD_PADDING + 2;
  cardText.y = cardY + 2;
  container.addChild(cardText);

  // Pricing row pinned to bottom of card: revenue (yellow).
  const revenueText = new Text({ text: `$${card.revenue.toLocaleString()}`, style: CARD_COST_STYLE });
  const pricingRowH = revenueText.height;
  const pricingY = cardY + cardH - CARD_PADDING - pricingRowH;
  revenueText.x = slotX + CARD_PADDING + 1;
  revenueText.y = pricingY;
  container.addChild(revenueText);

  // Description text below the art image, leaving room for the flavor/pricing rows.
  const descY = artY + artImgH + CARD_PADDING;
  const flavorH = card.flavorText ? FLAVOR_ZONE_H : 0;
  const descMaxH = pricingY - descY - (flavorH > 0 ? flavorH + CARD_PADDING : CARD_PADDING);
  fitDescText(card.description, slotX + CARD_PADDING + 1, descY, descMaxH, container);
  if (card.flavorText) {
    const flavorY = pricingY - CARD_PADDING - flavorH;
    fitFlavorText(card.flavorText, slotX + CARD_PADDING + 1, flavorY, container);
  }
}

function paintTrackTickets(
  track: TrackSlot,
  trackX: number,
  trackY: number,
  container: Container,
): void {
  const tColor = TRACK_COLORS[track.track] ?? 0xff0000;
  // Paint back-to-front so card 0 (leftmost) renders on top in PixiJS child order.
  for (let ki = track.tickets.length - 1; ki >= 0; ki--) {
    const ticket = track.tickets[ki]!;
    const tickX = trackX + ki * TICKET_STRIDE;
    const cardH = TRACK_H - CARD_PADDING * 2;
    const cardY = trackY + CARD_PADDING;

    // Background — event card colour with track accent border.
    const tickBg = new Graphics();
    tickBg.roundRect(tickX + CARD_PADDING, cardY, SLOT_W - CARD_PADDING * 2, cardH, 3);
    tickBg.fill({ color: EVENT_COLOR, alpha: 0.9 });
    tickBg.stroke({ color: tColor, width: 1 });
    container.addChild(tickBg);

    // Art image (or placeholder).
    const artImgW = SLOT_W - CARD_PADDING * 2;
    const artImgH = Math.floor(TRACK_H / 2) - CARD_PADDING;
    const artY = cardY + CARD_TITLE_ZONE_H;
    const art = cardArtSprite(ticket.templateId, tickX + CARD_PADDING, artY, artImgW, artImgH);
    if (art) {
      container.addChild(art);
    } else {
      const imgZone = new Graphics();
      imgZone.roundRect(tickX + CARD_PADDING, artY, artImgW, artImgH, 2);
      imgZone.fill({ color: tColor, alpha: 0.1 });
      imgZone.stroke({ color: tColor, width: 1, alpha: 0.35 });
      container.addChild(imgZone);
    }

    // Title.
    const titleText = fitCardTitle(ticket.name, tColor);
    titleText.x = tickX + CARD_PADDING + 2;
    titleText.y = cardY + 2;
    container.addChild(titleText);

    // Description + optional flavor, anchored above card bottom.
    const descY = artY + artImgH + CARD_PADDING;
    const flavorH = ticket.flavorText ? FLAVOR_ZONE_H : 0;
    const bottomY = cardY + cardH - CARD_PADDING;
    const descMaxH = bottomY - descY - (flavorH > 0 ? flavorH + CARD_PADDING : CARD_PADDING);
    fitDescText(ticket.description, tickX + CARD_PADDING + 1, descY, descMaxH, container);
    if (ticket.flavorText) {
      fitFlavorText(ticket.flavorText, tickX + CARD_PADDING + 1, bottomY - flavorH, container);
    }
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
  topDiscardDescription?: string,
  topDiscardCost?: number,
  topCardTitleColor?: number,
  topDiscardFlavorText?: string,
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
    const artY = pileY + CARD_PADDING + CARD_TITLE_ZONE_H;
    const art = topCardTemplateId ? cardArtSprite(topCardTemplateId, pileX + CARD_PADDING, artY, artImgW, artImgH) : null;
    if (art) {
      container.addChild(art);
    } else {
      const imgZone = new Graphics();
      imgZone.roundRect(pileX + CARD_PADDING, artY, artImgW, artImgH, 2);
      imgZone.fill({ color: accentColor, alpha: 0.1 });
      imgZone.stroke({ color: accentColor, width: 1, alpha: 0.35 });
      container.addChild(imgZone);
    }
    const nameText = fitCardTitle(topCardName, topCardTitleColor ?? accentColor);
    nameText.x = pileX + CARD_PADDING + 2;
    nameText.y = pileY + CARD_PADDING + 2;
    container.addChild(nameText);
    // Cost text is created first so its height informs how much vertical space
    // remains for the description text below the art zone.
    const costText = topDiscardCost !== undefined
      ? new Text({ text: '$' + topDiscardCost.toLocaleString(), style: CARD_COST_STYLE })
      : null;
    if (costText !== null) {
      costText.x = pileX + CARD_PADDING + 1;
      costText.y = pileY + SLOT_H - CARD_PADDING - costText.height;
      container.addChild(costText);
    }
    if (topDiscardDescription !== undefined) {
      const descY = artY + artImgH + CARD_PADDING;
      const costBase = pileY + SLOT_H - CARD_PADDING - (costText !== null ? costText.height + CARD_PADDING : 0);
      const flavorH = topDiscardFlavorText ? FLAVOR_ZONE_H : 0;
      const descMaxH = costBase - descY - (flavorH > 0 ? flavorH + CARD_PADDING : CARD_PADDING);
      fitDescText(topDiscardDescription, pileX + CARD_PADDING + 1, descY, descMaxH, container);
      if (topDiscardFlavorText) {
        const flavorY = costBase - flavorH;
        fitFlavorText(topDiscardFlavorText, pileX + CARD_PADDING + 1, flavorY, container);
      }
    }
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

  const DECK_LABELS: Record<DeckType, string> = {
    traffic: 'TRAFFIC',
    event: 'EVENT',
    action: 'ACTION',
  };

  const trafficDeck = getTrafficDeck(ctx);
  const trafficDiscard = getTrafficDiscard(ctx);
  const eventDeck = getEventDeck(ctx);
  const eventDiscard = getEventDiscard(ctx);
  const actionDeck = getActionDeck(ctx);
  const actionDiscard = getActionDiscard(ctx);
  const deckDefs: Array<{ key: DeckType; drawCount: number; discardCount: number; topDiscardName: string | undefined; topDiscardTemplateId: string | undefined; topDiscardDescription?: string | undefined; topDiscardCost?: number | undefined; topDiscardFlavorText?: string | undefined }> = [
    {
      key: 'traffic',
      drawCount: trafficDeck.length,
      discardCount: trafficDiscard.length,
      topDiscardName: trafficDiscard.at(-1)?.name,
      topDiscardTemplateId: trafficDiscard.at(-1)?.templateId,
      topDiscardDescription: trafficDiscard.at(-1)?.description,
      topDiscardCost: trafficDiscard.at(-1)?.revenue,
      topDiscardFlavorText: trafficDiscard.at(-1)?.flavorText,
    },
    {
      key: 'event',
      drawCount: eventDeck.length,
      discardCount: eventDiscard.length,
      topDiscardName: eventDiscard.at(-1)?.name,
      topDiscardTemplateId: eventDiscard.at(-1)?.templateId,
      topDiscardDescription: eventDiscard.at(-1)?.description,
      topDiscardFlavorText: eventDiscard.at(-1)?.flavorText,
    },
    {
      key: 'action',
      drawCount: actionDeck.length,
      discardCount: actionDiscard.length,
      topDiscardName: actionDiscard.at(-1)?.name,
      topDiscardTemplateId: actionDiscard.at(-1)?.templateId,
      topDiscardDescription: actionDiscard.at(-1)?.description,
      topDiscardCost: actionDiscard.at(-1)?.cost,
      topDiscardFlavorText: actionDiscard.at(-1)?.flavorText,
    },
  ];

  for (let di = 0; di < deckDefs.length; di++) {
    const def = deckDefs[di]!;
    const colors = PILE_COLORS[def.key];
    const deckLabel = DECK_LABELS[def.key];

    // Draw pile.
    const drawContainer = new Container();
    const drawRect = computeDeckPileRect(di, 'draw', app.screen.width);
    paintPile(drawContainer, drawRect.x, drawRect.y, colors.bg, colors.accent, deckLabel, 'draw', def.drawCount);
    board.addChild(drawContainer);
    const drawLabel = new Text({ text: 'DRAW', style: PILE_LABEL_STYLE });
    drawLabel.x = drawRect.x;
    drawLabel.y = drawRect.y + SLOT_H + 2;
    board.addChild(drawLabel);
    piles.set(`${def.key}-draw`, {
      container: drawContainer,
      pileX: drawRect.x,
      pileY: drawRect.y,
      deckType: def.key,
      pileType: 'draw',
    });

    // Discard pile.
    const discardContainer = new Container();
    const discardRect = computeDeckPileRect(di, 'discard', app.screen.width);
    paintPile(discardContainer, discardRect.x, discardRect.y, colors.bg, colors.accent, deckLabel, 'discard', def.discardCount, def.topDiscardName, def.topDiscardTemplateId, def.topDiscardDescription, def.topDiscardCost, def.key === 'traffic' ? 0x00f5ff : undefined, def.topDiscardFlavorText);
    board.addChild(discardContainer);
    const discardLabel = new Text({ text: 'DISCARD', style: PILE_LABEL_STYLE });
    discardLabel.x = discardRect.x;
    discardLabel.y = discardRect.y + SLOT_H + 2;
    board.addChild(discardLabel);
    piles.set(`${def.key}-discard`, {
      container: discardContainer,
      pileX: discardRect.x,
      pileY: discardRect.y,
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

  // Rebuild card chips only when the card has changed.
  const cardsChanged = oldSlot.card?.id !== newSlot.card?.id;

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
      const arr = pile.pileType === 'draw' ? getTrafficDeck(ctx) : getTrafficDiscard(ctx);
      const top = arr.at(-1);
      const topDesc = top?.description;
      return { count: arr.length, topName: top?.name, topTemplateId: top?.templateId, topDesc, topCost: top?.revenue, topFlavorText: top?.flavorText };
    } else if (pile.deckType === 'event') {
      const arr = pile.pileType === 'draw' ? getEventDeck(ctx) : getEventDiscard(ctx);
      const top = arr.at(-1);
      return { count: arr.length, topName: top?.name, topTemplateId: top?.templateId, topDesc: top?.description, topCost: undefined as number | undefined, topFlavorText: top?.flavorText };
    } else {
      const arr = pile.pileType === 'draw' ? getActionDeck(ctx) : getActionDiscard(ctx);
      const top = arr.at(-1);
      return { count: arr.length, topName: top?.name, topTemplateId: top?.templateId, topDesc: top?.description, topCost: top?.cost, topFlavorText: top?.flavorText };
    }
  };
  const prev = getInfo(prevCtx);
  const next = getInfo(nextCtx);
  if (prev.count === next.count && prev.topName === next.topName && prev.topTemplateId === next.topTemplateId && prev.topDesc === next.topDesc && prev.topCost === next.topCost && prev.topFlavorText === next.topFlavorText) return;
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
    next.topDesc,
    next.topCost,
    pile.deckType === 'traffic' ? 0x00f5ff : undefined,
    next.topFlavorText,
  );
}

function patchPiles(refs: SceneRefs, prevCtx: GameContext, nextCtx: GameContext): void {
  for (const pile of refs.piles.values()) {
    patchPile(pile, prevCtx, nextCtx);
  }
}

function patchBoard(
  refs: SceneRefs,
  prevSlots: TimeSlot[],
  prevTracks: TrackSlot[],
  prevCtx: GameContext,
  nextCtx: GameContext,
  suppressedCardIds?: ReadonlySet<string>,
): void {
  const decksChanged =
    prevCtx.trafficDeckOrder !== nextCtx.trafficDeckOrder ||
    prevCtx.trafficDiscardOrder !== nextCtx.trafficDiscardOrder ||
    prevCtx.eventDeckOrder !== nextCtx.eventDeckOrder ||
    prevCtx.eventDiscardOrder !== nextCtx.eventDiscardOrder ||
    prevCtx.actionDeckOrder !== nextCtx.actionDeckOrder ||
    prevCtx.actionDiscardOrder !== nextCtx.actionDiscardOrder;

  const nextTimeSlots = getFilledTimeSlots(nextCtx);
  const nextTracks = getTracks(nextCtx);

  const periods = Object.values(Period) as Period[];
  for (const period of periods) {
    const oldPeriodSlots = prevSlots.filter((s) => s.period === period);
    const newPeriodSlots = nextTimeSlots.filter((s) => s.period === period);
    for (let si = 0; si < newPeriodSlots.length; si++) {
      const oldSlot = oldPeriodSlots[si];
      const newSlot = newPeriodSlots[si];
      // patchBoard is only called when per-period slot counts are unchanged,
      // so slot counts per period match; guard covers any edge case.
      if (!oldSlot || !newSlot) continue;
      const slotRefs = refs.slots.get(`${period}-${si}`);
      if (slotRefs) patchSlot(slotRefs, oldSlot, newSlot, suppressedCardIds);
    }
  }

  for (const newTrack of nextTracks) {
    const oldTrack = prevTracks.find((t) => t.track === newTrack.track);
    if (!oldTrack) continue;
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
  const timeSlots = getFilledTimeSlots(ctx);
  const tracks = getTracks(ctx);
  const trafficDeck = getTrafficDeck(ctx);
  const trafficDiscard = getTrafficDiscard(ctx);
  const eventDeck = getEventDeck(ctx);
  const eventDiscard = getEventDiscard(ctx);
  const actionDeck = getActionDeck(ctx);
  const actionDiscard = getActionDiscard(ctx);

  for (const period of periods) {
    const slots = timeSlots.filter((s) => s.period === period);
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      const label = `${period} slot ${i + 1}`;
      if (slot.card === null) {
        parts.push(`${label}: empty, capacity 1`);
      } else {
        const card = slot.card;
        const slotType = slot.overloaded ? 'overload slot' : 'slot';
        parts.push(`${label} (${slotType}): 1 of 1 cards — ${card.name}`);
      }
    }
  }

  for (const track of tracks) {
    const count = track.tickets.length;
    const ticketDesc =
      count === 0 ? 'no open tickets' : `${count} open ticket${count === 1 ? '' : 's'}`;
    parts.push(`${track.track} track: ${ticketDesc}`);
  }

  // Gear slot summary.
  for (let i = 0; i < ctx.vendorSlots.length; i++) {
    const slot = ctx.vendorSlots[i]!;
    if (slot.card !== null) {
      parts.push(`Gear slot ${i}: ${slot.card.name}`);
    } else {
      parts.push(`Gear slot ${i}: empty`);
    }
  }

  // Deck pile counts and top discard card.
  const deckPileDescs: [string, number, string | undefined][] = [
    ['Traffic draw', trafficDeck.length, undefined],
    ['Traffic discard', trafficDiscard.length, trafficDiscard.at(-1)?.name],
    ['Event draw', eventDeck.length, undefined],
    ['Event discard', eventDiscard.length, eventDiscard.at(-1)?.name],
    ['Action draw', actionDeck.length, undefined],
    ['Action discard', actionDiscard.length, actionDiscard.at(-1)?.name],
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
  reducedMotion,
}: GameCanvasProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef ?? internalRef;
  const appRef = useRef<Application | null>(null);
  const boardRef = useRef<Container | null>(null);
  const sceneRefsRef = useRef<SceneRefs | null>(null);
  const prevContextRef = useRef<GameContext | null>(null);
  // Stores the slot/track state as it was when last painted. Cannot use
  // prevContextRef for this because traffic card actors are mutated in-place
  // (via actor.send()) before patchBoard runs, making getFilledTimeSlots on
  // the old context return the already-updated state.
  const prevSlotsRef = useRef<TimeSlot[]>([]);
  const prevTracksRef = useRef<TrackSlot[]>([]);
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
  const reducedMotionRef = useRef<boolean>(reducedMotion ?? false);
  suppressedCardIdsRef.current = suppressedCardIds ?? new Set();
  onCardArrivedRef.current = onCardArrived;
  contextRef.current = context;
  drawLogRef.current = drawLog;
  speedMultRef.current = speedMult ?? 1;
  reducedMotionRef.current = reducedMotion ?? false;

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

        const refs = buildStaticScene(app, board, context, suppressedCardIdsRef.current);
        sceneRefsRef.current = refs;
        prevContextRef.current = context;
        prevSlotsRef.current = getFilledTimeSlots(context);
        prevTracksRef.current = getTracks(context);

        // Animation layer sits above the board so flying cards render on top.
        const animLayer = new Container();
        app.stage.addChild(animLayer);
        animLayerRef.current = animLayer;

        // If a drawLog arrived before PixiJS was ready (e.g. round 1 on first mount),
        // spawn its animations now that the app and animLayer are both initialised.
        const pendingDl = drawLogRef.current;
        if (!reducedMotionRef.current && (pendingDl?.traffic.length || pendingDl?.events.length || pendingDl?.action.length)) {
          spawnDrawAnimations(
            app, animLayer, animJobsRef.current,
            pendingDl, contextRef.current,
            app.screen.width, speedMultRef.current,
          );
        }

        // Ticker drives card fly-in animations each frame.
        // TODO-0008 (#28): skip all pending animations immediately when the user clicks the canvas.
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
  // When any period's slot count changes (e.g. a BoostSlotCapacity card was
  // played, or an overload slot was added/removed), the static scene must be
  // fully rebuilt since patchBoard can only update existing slot refs.
  // Comparing total layout length is insufficient: one period can gain an
  // overload slot in the same React-batched render that another loses one
  // (resolveRound strips old overloads; performDraw creates new ones), keeping
  // the total equal while leaving individual period ref-maps stale.
  useEffect(() => {
    const app = appRef.current;
    const prev = prevContextRef.current;
    if (!app || !prev) return;

    const slotLayoutChanged = Object.values(Period).some(
      (p) =>
        context.slotLayout.filter((s) => s.period === p).length !==
        prev.slotLayout.filter((s) => s.period === p).length,
    );
    // A vendor card played into a gear slot also requires a full rebuild because
    // buildStaticScene renders the gear panel statically from ctx.vendorSlots.
    const vendorSlotsChanged = context.vendorSlots.some(
      (v, i) => v.card !== prev.vendorSlots[i]?.card,
    );

    if (slotLayoutChanged || vendorSlotsChanged) {
      // Per-period slot count changed — destroy old board Container and rebuild from scratch.
      const oldBoard = boardRef.current;
      if (oldBoard) {
        oldBoard.destroy({ children: true });
      }
      const newBoard = new Container();
      app.stage.addChildAt(newBoard, 0); // keep animLayer on top
      boardRef.current = newBoard;
      sceneRefsRef.current = buildStaticScene(app, newBoard, context, suppressedCardIdsRef.current);
    } else {
      const refs = sceneRefsRef.current;
      if (refs) patchBoard(refs, prevSlotsRef.current, prevTracksRef.current, prev, context, suppressedCardIdsRef.current);
    }
    prevSlotsRef.current = getFilledTimeSlots(context);
    prevTracksRef.current = getTracks(context);
    prevContextRef.current = context;
  }, [context]);

  // Spawn card fly-in animations when a new draw log is received.
  // Note: on the very first render PixiJS may not be ready yet; the init
  // .then() callback handles that case by reading drawLogRef directly.
  // TODO-0021: if reducedMotion flips false→true mid-flight, in-flight jobs
  // continue to completion and onCardArrived still fires. useDrawAnimationState
  // handles this correctly (machine still advances), but a brief animation flash
  // is visible during the round where the setting was toggled.
  useEffect(() => {
    const app = appRef.current;
    const animLayer = animLayerRef.current;
    if (reducedMotion) return;
    if (!app || !animLayer || (!drawLog?.traffic.length && !drawLog?.events.length && !drawLog?.action.length)) return;
    spawnDrawAnimations(
      app, animLayer, animJobsRef.current,
      drawLog, contextRef.current,
      containerWidthProp ?? app.screen.width,
      speedMult ?? 1,
    );
  }, [drawLog, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Repaint slot card chips whenever the suppressed-card set changes.
  // This drives the progressive board reveal as cards arrive at their slots.
  useEffect(() => {
    const refs = sceneRefsRef.current;
    if (!refs) return;
    const ctx = contextRef.current;
    const suppressed = suppressedCardIds ?? (new Set() as ReadonlySet<string>);
    const periods = Object.values(Period) as Period[];
    const ctxTimeSlots = getFilledTimeSlots(ctx);
    for (const period of periods) {
      const periodSlots = ctxTimeSlots.filter((s) => s.period === period);
      for (let si = 0; si < periodSlots.length; si++) {
        const slot = periodSlots[si]!;
        const slotRefs = refs.slots.get(`${period}-${si}`);
        // slotRefs can be undefined if suppressed-card repaint races ahead of
        // the [context] effect that rebuilds refs (strict double-invoke in dev);
        // in production this guard is defensive — the [context] effect always
        // fires first (it's declared earlier) and populates refs before this runs.
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
      // TODO-0001 (#33): replace stub with a proper recovery/retry UI
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
