// Shared layout constants for the game board canvas.
// These values mirror buildStaticScene in GameCanvas.tsx; both must be kept in sync.

export const SLOT_W = 90;
export const SLOT_H = 60;
export const SLOT_GAP = 8;
export const PERIOD_PADDING = 16;
export const CARD_PADDING = 4;
export const BOARD_START_Y = 40;

/** Y-offset of the first track row. Derived from the tallest period column (4 slots). */
export const TRACKS_Y_OFFSET = BOARD_START_Y + 24 + 4 * (SLOT_H + SLOT_GAP) + 20;

/** Visual height of a single track row background rect. */
export const TRACK_H = 28;

/** Vertical stride between consecutive track rows (includes row height + inter-row gap). */
export const TRACK_ROW_GAP = 36;

/** Number of period columns rendered on the board. */
export const PERIOD_COUNT = 4;

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
): SlotRect {
  const availableW = containerWidth - 40;
  const periodW = availableW / PERIOD_COUNT;
  const periodX = 20 + periodIndex * periodW;
  return {
    x: periodX + PERIOD_PADDING,
    y: BOARD_START_Y + 24 + slotIndex * (SLOT_H + SLOT_GAP),
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
    h: 32 + slotCount * (SLOT_H + SLOT_GAP),
  };
}

/**
 * Compute the pixel rect of a track row given the canvas container CSS width.
 * @param trackIndex    0-based track index
 * @param containerWidth  clientWidth of the canvas container div
 */
export function computeTrackRect(trackIndex: number, containerWidth: number): SlotRect {
  return {
    x: 20,
    y: TRACKS_Y_OFFSET + trackIndex * TRACK_ROW_GAP,
    w: containerWidth - 40,
    h: TRACK_H,
  };
}
