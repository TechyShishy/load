import { test, expect, type Page } from '@playwright/test';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function clearSave(page: Page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function dismissContinueModal(page: Page) {
  const screen = page.getByRole('dialog', { name: 'LOAD' });
  if (await screen.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByRole('button', { name: 'NEW GAME' }).click();
    await expect(screen).not.toBeVisible();
  }
}

/**
 * Begin a drag on the element at the given coordinates by dispatching
 * native PointerEvents. Returns the pointerId used so the drag can be
 * continued or ended.
 *
 * dnd-kit's PointerSensor uses setPointerCapture, which doesn't work
 * correctly with Playwright's CDP-dispatched mouse events. Dispatching
 * PointerEvents via page.evaluate bypasses this issue.
 */
async function beginDrag(
  page: Page,
  src: { x: number; y: number; width: number; height: number },
) {
  const srcX = src.x + src.width / 2;
  const srcY = src.y + src.height / 2;

  await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) throw new Error('no element at point for pointerdown');
      // pointerdown on the element (React's synthetic handler catches this)
      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: x, clientY: y,
          bubbles: true, cancelable: true,
          pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1,
        }),
      );
    },
    { x: srcX, y: srcY },
  );

  // Small delay for React to process the event
  await page.waitForTimeout(50);

  // Move 10px to activate dnd-kit's distance constraint (5px)
  await page.evaluate(
    ({ x, y }) => {
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: x + 10, clientY: y,
          bubbles: true, cancelable: true,
          pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1,
        }),
      );
    },
    { x: srcX, y: srcY },
  );

  await page.waitForTimeout(150);
}

/** End the current pointer drag at the given coordinates. */
async function endDrag(page: Page, x: number, y: number) {
  await page.evaluate(
    ({ x, y }) => {
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX: x, clientY: y,
          bubbles: true, cancelable: true,
          pointerId: 1, pointerType: 'mouse', button: 0, buttons: 0,
        }),
      );
    },
    { x, y },
  );
}

/**
 * Simulate a drag-and-drop via synthetic PointerEvents.
 * DnD Kit's PointerSensor activates after the pointer moves at least 5px,
 * so we move 10px first to guarantee activation before sliding to the target.
 */
async function dragFromTo(
  page: Page,
  src: { x: number; y: number; width: number; height: number },
  tgt: { x: number; y: number; width: number; height: number },
) {
  await beginDrag(page, src);

  const tgtX = tgt.x + tgt.width / 2;
  const tgtY = tgt.y + tgt.height / 2;

  // Move to target
  await page.evaluate(
    ({ x, y }) => {
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: x, clientY: y,
          bubbles: true, cancelable: true,
          pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1,
        }),
      );
    },
    { x: tgtX, y: tgtY },
  );

  await page.waitForTimeout(50);
  await endDrag(page, tgtX, tgtY);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Traffic Prioritization – slot-only targeting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearSave(page);
    await dismissContinueModal(page);
    await expect(page.getByText('Schedule', { exact: true })).toBeVisible({ timeout: 8_000 });
  });

  // ── Period zones absent during drag ───────────────────────────────────────
  test('period drop zones are not rendered while dragging a Traffic Prioritization card', async ({
    page,
  }) => {
    const card = page.locator('[aria-label*="Traffic Prioritization"]').first();
    if ((await card.count()) === 0) {
      test.skip();
      return;
    }

    const cardBox = await card.boundingBox();
    if (!cardBox) {
      test.skip();
      return;
    }

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
    if ((await card.count()) === 0) {
      test.skip();
      return;
    }

    const cardBox = await card.boundingBox();
    if (!cardBox) {
      test.skip();
      return;
    }

    // Slot zones only appear during drag (conditional rendering), so start the
    // drag first, then locate the slot zone once it's in the DOM.
    await beginDrag(page, cardBox);

    const firstSlot = page.locator('[id^="slot-"]').first();
    await expect(firstSlot).toBeAttached({ timeout: 3_000 });
    const slotBox = await firstSlot.boundingBox();
    if (!slotBox) {
      await endDrag(page, cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
      test.skip();
      return;
    }

    // Complete the drag to the slot
    await page.evaluate(
      ({ x, y }) => {
        document.dispatchEvent(
          new PointerEvent('pointermove', {
            clientX: x, clientY: y,
            bubbles: true, cancelable: true,
            pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1,
          }),
        );
      },
      { x: slotBox.x + slotBox.width / 2, y: slotBox.y + slotBox.height / 2 },
    );
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
    if ((await card.count()) === 0) {
      test.skip();
      return;
    }

    const cardBox = await card.boundingBox();
    if (!cardBox) {
      test.skip();
      return;
    }

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
    if ((await card.count()) === 0) {
      test.skip();
      return;
    }

    const cardBox = await card.boundingBox();
    if (!cardBox) {
      test.skip();
      return;
    }

    // Track zones are no longer rendered for Traffic Prioritization (its
    // validDropZones does not include 'track'), so we compute the track row
    // position from canvas layout constants and the container width.
    const canvasContainer = page.getByRole('img', { name: 'Game board' });
    if ((await canvasContainer.count()) === 0) {
      test.skip();
      return;
    }
    const containerBox = await canvasContainer.boundingBox();
    if (!containerBox) {
      test.skip();
      return;
    }

    // Mirror computeTrackRect(0, containerWidth, 4) from canvasLayout.ts:
    // y = BOARD_START_Y(40) + 24 + 4*(SLOT_H(60)+SLOT_GAP(8)) + 20 + 0*TRACK_ROW_GAP(36) = 356
    // x = 20, w = containerWidth - 40, h = TRACK_H(28)
    const trackY = containerBox.y + 40 + 24 + 4 * (60 + 8) + 20;
    const trackX = containerBox.x + 20;
    const trackTarget = {
      x: trackX,
      y: trackY,
      width: containerBox.width - 40,
      height: 28,
    };

    await dragFromTo(page, cardBox, trackTarget);

    // No feedback must appear: Traffic Prioritization's validDropZones is
    // ['occupied-slot'] so track zones are never rendered and handleDragEnd
    // returns immediately without firing any action.
    const feedback = page.locator('.animate-pulse');
    await expect(feedback).not.toBeVisible();
  });
});
