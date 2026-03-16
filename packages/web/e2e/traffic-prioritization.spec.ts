import { test, expect, type Page } from '@playwright/test';
import { clearSave, dismissContinueModal } from './helpers.js';

/**
 * Begin a drag at the center of the given element bounding box.
 * Uses Playwright's native mouse API (CDP) which activates dnd-kit correctly.
 * Moves 10px horizontally to exceed dnd-kit's 5px activation distance constraint.
 */
async function beginDrag(
  page: Page,
  src: { x: number; y: number; width: number; height: number },
) {
  const srcX = src.x + src.width / 2;
  const srcY = src.y + src.height / 2;
  await page.mouse.move(srcX, srcY);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.move(srcX + 10, srcY);
  await page.waitForTimeout(150);
}

/** End the current mouse drag at the given coordinates. */
async function endDrag(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  await page.mouse.up();
}

/**
 * Simulate a drag-and-drop via Playwright's native mouse API.
 * dnd-kit PointerSensor activates after the pointer moves >= 5px from the start,
 * so we move 10px first then slide to the target.
 */
async function dragFromTo(
  page: Page,
  src: { x: number; y: number; width: number; height: number },
  tgt: { x: number; y: number; width: number; height: number },
) {
  await beginDrag(page, src);
  const tgtX = tgt.x + tgt.width / 2;
  const tgtY = tgt.y + tgt.height / 2;
  await page.mouse.move(tgtX, tgtY);
  await page.waitForTimeout(50);
  await endDrag(page, tgtX, tgtY);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Traffic Prioritization – slot-only targeting', () => {
  test.beforeEach(async ({ page }) => {
    // Use a deterministic seed so Traffic Prioritization cards are always in the
    // starting hand. The seed overrides any saved game state (see useGame.ts).
    await page.goto('/?seed=e2e-traffic-prio');
    await clearSave(page);
    await dismissContinueModal(page);
    // Wait for the game to finish its draw phase and enter scheduling.
    // getByText('Schedule') resolves too early because the phase bar always
    // renders all phase labels — data-phase is the authoritative gating signal.
    await page.locator('[role="main"][data-phase="scheduling"]').waitFor({ timeout: 12_000 });
  });

  // ── Period zones absent during drag ───────────────────────────────────────
  test('period drop zones are not rendered while dragging a Traffic Prioritization card', async ({
    page,
  }) => {
    const card = page.locator('[aria-label*="Traffic Prioritization"]').first();
    // Deterministic seed guarantees the TP card is in the starting hand.
    await expect(card).toBeAttached({ timeout: 5_000 });

    const cardBox = await card.boundingBox();
    if (!cardBox) throw new Error('TP card has no bounding box');

    // Period zones must be absent before the drag starts (sanity)
    await expect(page.locator('[id^="period-"]')).toHaveCount(0);

    // Begin dragging — do not release yet
    await beginDrag(page, cardBox);

    // Period zones must still be absent (Traffic Prioritization must not activate them)
    await expect(page.locator('[id^="period-"]')).toHaveCount(0);

    // Slot zones must be present (positive: Traffic Prioritization targets slots)
    const slotLocator = page.locator('[id^="slot-"]');
    await expect(slotLocator.first()).toBeAttached({ timeout: 3_000 });
    const slotCount = await slotLocator.count();
    expect(slotCount).toBeGreaterThan(0);

    await endDrag(page, cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  });

  // ── Slot drop plays the action ─────────────────────────────────────────────
  test('dropping Traffic Prioritization on a slot plays the action', async ({ page }) => {
    const card = page.locator('[aria-label*="Traffic Prioritization"]').first();
    // Deterministic seed guarantees the TP card is in the starting hand.
    await expect(card).toBeAttached({ timeout: 5_000 });

    const cardBox = await card.boundingBox();
    if (!cardBox) throw new Error('TP card has no bounding box');

    // Slot zones only appear during drag (conditional rendering), so start the
    // drag first, then locate the slot zone once it's in the DOM.
    await beginDrag(page, cardBox);

    const firstSlot = page.locator('[id^="slot-"]').first();
    await expect(firstSlot).toBeAttached({ timeout: 3_000 });
    const slotBox = await firstSlot.boundingBox();
    if (!slotBox) {
      await endDrag(page, cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
      throw new Error('slot drop zone has no bounding box');
    }

    // Complete the drag to the slot
    await page.mouse.move(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
    await page.waitForTimeout(50);
    await endDrag(page, slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);

    // The first slot zone is now guaranteed to be occupied (empty slots have no
    // zone rendered), so the action must always succeed.
    const feedback = page.locator('.animate-pulse');
    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText('Removing traffic from slot');
  });

  // ── Only occupied slots get drop zones ────────────────────────────────────
  test('only slots containing traffic cards get drop zones during drag', async ({ page }) => {
    const card = page.locator('[aria-label*="Traffic Prioritization"]').first();
    // Deterministic seed guarantees the TP card is in the starting hand.
    await expect(card).toBeAttached({ timeout: 5_000 });

    const cardBox = await card.boundingBox();
    if (!cardBox) throw new Error('TP card has no bounding box');

    // Before the drag there must be no slot zones rendered at all
    await expect(page.locator('[id^="slot-"]')).toHaveCount(0);

    // Begin drag (do not release)
    await beginDrag(page, cardBox);

    // DRAW_COUNT=5 cards drawn across 16 initial slots (4 periods × 4 each), so at
    // most 5 slots are occupied. Filtering is working if zone count is well below 16.
    const slotLocator = page.locator('[id^="slot-"]');
    await expect(slotLocator.first()).toBeAttached({ timeout: 3_000 });
    const occupiedZoneCount = await slotLocator.count();
    expect(occupiedZoneCount).toBeLessThan(16);

    await endDrag(page, cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  });

  // ── Track area drop does nothing ──────────────────────────────────────────
  test('dropping Traffic Prioritization over a track row does nothing', async ({
    page,
  }) => {
    const card = page.locator('[aria-label*="Traffic Prioritization"]').first();
    // Deterministic seed guarantees the TP card is in the starting hand.
    await expect(card).toBeAttached({ timeout: 5_000 });

    const cardBox = await card.boundingBox();
    if (!cardBox) throw new Error('TP card has no bounding box');

    // Track zones are no longer rendered for Traffic Prioritization (its
    // validDropZones does not include 'track'), so we compute the track row
    // position from canvas layout constants and the container width.
    const canvasContainer = page.getByRole('img', { name: 'Game board' });
    await expect(canvasContainer).toBeAttached({ timeout: 3_000 });
    const containerBox = await canvasContainer.boundingBox();
    if (!containerBox) throw new Error('canvas container has no bounding box');

    // Mirror computeTrackRect(0, containerWidth) from canvasLayout.ts:
    // Tracks are now horizontal: y = PILES_ROW_Y(8), x = DECK_COLS_W(614) + 8 = 622.
    // trackW = floor((containerWidth - DECK_COLS_W(614) - 28 - 2*TRACK_COL_GAP(8)) / 3)
    // h = TRACK_H = SLOT_H(120)
    const trackY = containerBox.y + 8;
    const trackX = containerBox.x + 622;
    const trackW = Math.floor((containerBox.width - 614 - 28 - 16) / 3);
    const trackTarget = {
      x: trackX,
      y: trackY,
      width: trackW,
      height: 120,
    };

    await dragFromTo(page, cardBox, trackTarget);

    // No feedback must appear: Traffic Prioritization's validDropZones is
    // ['occupied-slot'] so track zones are never rendered and handleDragEnd
    // returns immediately without firing any action.
    const feedback = page.locator('.animate-pulse');
    await expect(feedback).not.toBeVisible();
  });
});
