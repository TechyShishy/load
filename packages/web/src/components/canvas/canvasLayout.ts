// Shared layout constants for the game board canvas.
// These values mirror buildStaticScene in GameCanvas.tsx; both must be kept in sync.

export const SLOT_W = 90;
export const SLOT_H = 60;
export const SLOT_GAP = 8;
export const PERIOD_PADDING = 16;
export const CARD_PADDING = 4;

/** Top Y of the deck piles row (distance from canvas top edge). */
export const PILES_ROW_Y = 8;
/** Height of the label text area below each pile card ("DRAW" / "DISCARD"). */
export const PILE_LABEL_H = 14;
/** Gap between the draw pile and discard pile within the same deck group. */
export const PILE_INTRA_GROUP_GAP = 10;
/** Total vertical area reserved for the deck piles row (piles + labels + gap to board). */
export const PILES_AREA_H = PILES_ROW_Y + SLOT_H + PILE_LABEL_H + 16;
export const BOARD_START_Y = PILES_AREA_H;

/**
 * Y-offset of the first track row, derived from the tallest period column.
 * @param maxSlotCount  the maximum number of slots in any single period
 */
export function computeTracksYOffset(maxSlotCount: number): number {
  return BOARD_START_Y + 24 + maxSlotCount * (SLOT_H + SLOT_GAP) + 20;
}

/** @deprecated Use computeTracksYOffset(maxSlotCount) for a dynamic board. Kept for back-compat. */
export const TRACKS_Y_OFFSET = computeTracksYOffset(4);

/** Visual height of a single track row background rect. */
export const TRACK_H = 28;

/** Vertical stride between consecutive track rows (includes row height + inter-row gap). */
export const TRACK_ROW_GAP = 36;

/** Number of period columns rendered on the board. */
export const PERIOD_COUNT = 4;

/** Number of sub-columns within a period before growing row count. */
export const MAX_SUB_COLS = 3;

/**
 * Number of slot rows for a period given its current slot count.
 * Always MAX_SUB_COLS sub-columns; rows grow as ceil(slotCount / MAX_SUB_COLS), minimum 4.
 */
export function rowsForPeriod(slotCount: number): number {
  return Math.max(4, Math.ceil(slotCount / MAX_SUB_COLS));
}

export interface SlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Compute the pixel rect of a time slot given the canvas container CSS width.
 * @param periodIndex  0=Morning, 1=Afternoon, 2=Evening, 3=Overnight
 * @param slotIndex    0-based index within the period
 * @param containerWidth  clientWidth of the canvas container div
 */
export function computeSlotRect(
  periodIndex: number,
  slotIndex: number,
  containerWidth: number,
  periodSlotCount = 4,
): SlotRect {
  const rows = rowsForPeriod(periodSlotCount);
  const availableW = containerWidth - 40;
  const periodW = availableW / PERIOD_COUNT;
  const periodX = 20 + periodIndex * periodW;
  const subCol = Math.floor(slotIndex / rows);
  const row = slotIndex % rows;
  return {
    x: periodX + PERIOD_PADDING + subCol * (SLOT_W + SLOT_GAP),
    y: BOARD_START_Y + 24 + row * (SLOT_H + SLOT_GAP),
    w: SLOT_W,
    h: SLOT_H,
  };
}

/**
 * Compute the pixel rect of an entire period column (header + all slots).
 * Matches the colBg roundRect dimensions in buildStaticScene.
 * @param periodIndex  0=Morning, 1=Afternoon, 2=Evening, 3=Overnight
 * @param slotCount    number of slots currently in this period (may increase with temporary slots)
 * @param containerWidth  clientWidth of the canvas container div
 */
export function computePeriodRect(
  periodIndex: number,
  slotCount: number,
  containerWidth: number,
): SlotRect {
  const availableW = containerWidth - 40;
  const periodW = availableW / PERIOD_COUNT;
  const periodX = 20 + periodIndex * periodW;
  return {
    x: periodX,
    y: BOARD_START_Y - 8,
    w: periodW - 8,
    h: 32 + rowsForPeriod(slotCount) * (SLOT_H + SLOT_GAP),
  };
}

/**
 * Compute the pixel rect of a track row given the canvas container CSS width.
 * @param trackIndex    0-based track index
 * @param containerWidth  clientWidth of the canvas container div
 * @param maxSlotCount  maximum slot count across all periods (default 4)
 */
export function computeTrackRect(trackIndex: number, containerWidth: number, maxSlotCount = 4): SlotRect {
  return {
    x: 20,
    y: computeTracksYOffset(maxSlotCount) + trackIndex * TRACK_ROW_GAP,
    w: containerWidth - 40,
    h: TRACK_H,
  };
}

/**
 * Compute the pixel rect of a deck pile sprite, matching the geometry in buildDeckPileScene.
 * @param deckIndex   0=traffic, 1=event, 2=action
 * @param pileType    'draw' | 'discard'
 * @param containerWidth  clientWidth of the canvas container div
 */
export function computeDeckPileRect(
  deckIndex: number,
  pileType: 'draw' | 'discard',
  containerWidth: number,
): SlotRect {
  const availableW = containerWidth - 40;
  const groupW = SLOT_W * 2 + PILE_INTRA_GROUP_GAP;
  const interGroupGap = Math.max(8, (availableW - groupW * 3) / 2);
  const groupX = 20 + deckIndex * (groupW + interGroupGap);
  const x = pileType === 'draw' ? groupX : groupX + SLOT_W + PILE_INTRA_GROUP_GAP;
  return { x, y: PILES_ROW_Y, w: SLOT_W, h: SLOT_H };
}
