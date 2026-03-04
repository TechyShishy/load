import { test, expect, type Page } from '@playwright/test';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Clear any persisted save so we always start from a fresh game.
 * Must be called after page.goto() so the page's localStorage is accessible.
 */
async function clearSave(page: Page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

/**
 * If the "Resume Session" modal is showing, dismiss it by clicking NEW GAME.
 */
async function dismissContinueModal(page: Page) {
  const modal = page.getByText('RESUME SESSION');
  if (await modal.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByRole('button', { name: 'NEW GAME' }).click();
    await expect(modal).not.toBeVisible();
  }
}

const ADVANCE = (page: Page) => page.getByRole('button', { name: 'ADVANCE →' });

/**
 * Wait for the ADVANCE button to become enabled and click it.
 * Accounts for the short XState transition time between phases.
 */
async function clickAdvance(page: Page) {
  await expect(ADVANCE(page)).toBeEnabled({ timeout: 8_000 });
  await ADVANCE(page).click();
}

/**
 * Play one full round: scheduling (optional card) → ADVANCE → crisis → ADVANCE.
 * Returns true when a win/lose end-screen is detected instead of the next round.
 */
async function playRound(page: Page, opts: { playCard?: boolean } = {}): Promise<boolean> {
  // ── Scheduling phase ──────────────────────────────────────────────────────
  await expect(ADVANCE(page)).toBeEnabled({ timeout: 8_000 });

  if (opts.playCard) {
    // Action cards are <button> elements with a 'title' attribute (the card description).
    // They are only enabled during scheduling / crisis phases.
    const cards = page.locator('button[title]').filter({ hasNot: page.locator('[disabled]') });
    const count = await cards.count();
    if (count > 0) {
      await cards.first().click();
      // Wait a tick for state to update before continuing
      await page.waitForTimeout(100);
    }
  }

  await clickAdvance(page); // scheduling → execution → crisis (auto-transition)

  // ── Check for end screen after execution/crisis entry ────────────────────
  const endVisible = await isEndScreen(page);
  if (endVisible) return true;

  // ── Crisis phase ──────────────────────────────────────────────────────────
  await expect(ADVANCE(page)).toBeEnabled({ timeout: 8_000 });
  await clickAdvance(page); // crisis → resolution → end → draw (next round)

  // ── Check for end screen after resolution ────────────────────────────────
  return isEndScreen(page);
}

/** Returns true if either the win or lose screen is currently visible. */
async function isEndScreen(page: Page): Promise<boolean> {
  const win = page.getByText('NETWORK STABLE');
  const lose = page.getByText('SYSTEM DOWN');
  const winVis = await win.isVisible({ timeout: 1_000 }).catch(() => false);
  const loseVis = await lose.isVisible({ timeout: 1_000 }).catch(() => false);
  return winVis || loseVis;
}

/**
 * Click the restart button on whichever end-screen is showing.
 * Win screen → "PLAY AGAIN", Lose screen → "TRY AGAIN".
 */
async function clickPlayAgain(page: Page) {
  const playAgain = page.getByRole('button', { name: 'PLAY AGAIN' });
  const tryAgain = page.getByRole('button', { name: 'TRY AGAIN' });
  const playVisible = await playAgain.isVisible({ timeout: 2_000 }).catch(() => false);
  if (playVisible) {
    await playAgain.click();
  } else {
    await expect(tryAgain).toBeVisible({ timeout: 5_000 });
    await tryAgain.click();
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('LOAD – Network Traffic Balancer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearSave(page);
    await dismissContinueModal(page);
  });

  // ── Smoke test ─────────────────────────────────────────────────────────────
  test('renders the game HUD on a fresh load', async ({ page }) => {
    // App title
    await expect(page.getByText('LOAD').first()).toBeVisible();

    // Phase indicator should show Round 1
    await expect(page.getByText('R1')).toBeVisible();

    // ADVANCE button present (enabled in scheduling phase)
    await expect(ADVANCE(page)).toBeVisible();
    await expect(ADVANCE(page)).toBeEnabled();

    // Hand zone should be rendered (may have cards or "No cards" message)
    const handArea = page.locator('.overflow-x-auto').last();
    await expect(handArea).toBeVisible();

    // No end-screens on a fresh start
    await expect(page.getByText('NETWORK STABLE')).not.toBeVisible();
    await expect(page.getByText('SYSTEM DOWN')).not.toBeVisible();
  });

  // ── Phase progression ──────────────────────────────────────────────────────
  test('cycles through all phases in round 1', async ({ page }) => {
    // We should be in scheduling at the start
    await expect(page.getByText('Schedule')).toBeVisible();
    await expect(ADVANCE(page)).toBeEnabled();

    // Advance → execution (instant) → crisis
    await clickAdvance(page);
    await expect(page.getByText('Crisis')).toBeVisible({ timeout: 5_000 });

    // ADVANCE should be enabled again in crisis
    await expect(ADVANCE(page)).toBeEnabled({ timeout: 5_000 });

    // Advance → resolution (instant) → end (instant) → draw → scheduling in round 2
    // OR → gameLost/gameWon if the round triggered a loss condition
    await clickAdvance(page);

    // The game may have ended in round 1 (e.g. bankrupt from crisis costs)
    const ended = await isEndScreen(page);
    if (ended) {
      // Acceptable: end-screen is a valid outcome after one round
      return;
    }

    await expect(page.getByText('R2')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Schedule')).toBeVisible({ timeout: 5_000 });
  });

  // ── Card interaction ───────────────────────────────────────────────────────
  test('can play an action card from hand during scheduling', async ({ page }) => {
    await expect(ADVANCE(page)).toBeEnabled({ timeout: 5_000 });

    // Look for enabled action card buttons (have a "title" = card description)
    const cards = page.locator('button[title]').filter({ hasNot: page.locator('[disabled]') });
    const count = await cards.count();

    if (count === 0) {
      test.skip(); // No usable cards this session; skip gracefully
      return;
    }

    const firstCardName = await cards.first().locator('span').first().textContent();

    // Playing the card should not crash the app
    await cards.first().click();
    await page.waitForTimeout(200);

    // The ADVANCE button should still be functional after playing a card
    await expect(ADVANCE(page)).toBeVisible();

    // The UI title should still be intact
    await expect(page.getByText('LOAD').first()).toBeVisible();

    // Card may still be in the list (if play did not consume it) or
    // the hand may have changed — just assert the page is stable
    console.log(`Played card: ${firstCardName}`);
  });

  // ── Full game playthrough ──────────────────────────────────────────────────
  test('plays through the entire game and reaches a win or lose screen', async ({ page }) => {
    // The game runs for up to 12 rounds. We give a generous upper bound of 15
    // to account for early loss scenarios.
    const MAX_ROUNDS = 15;
    let roundsPlayed = 0;
    let gameEnded = false;

    for (let i = 0; i < MAX_ROUNDS; i++) {
      // Play every other card to exercise both card-playing and skipping
      const ended = await playRound(page, { playCard: i % 2 === 0 });
      roundsPlayed++;

      if (ended) {
        gameEnded = true;
        break;
      }

      // Safety: if we somehow went past 12 rounds without an end screen
      // the next draw phase will auto-transition to scheduling anyway
    }

    expect(gameEnded, `Game did not reach a win or lose screen after ${roundsPlayed} rounds`).toBe(
      true,
    );

    // Exactly one end-screen should be visible
    const winScreen = page.getByText('NETWORK STABLE');
    const loseScreen = page.getByText('SYSTEM DOWN');
    const winVisible = await winScreen.isVisible().catch(() => false);
    const loseVisible = await loseScreen.isVisible().catch(() => false);

    expect(winVisible || loseVisible, 'Expected win OR lose screen to be visible').toBe(true);
    expect(
      winVisible && loseVisible,
      'Both win and lose screens should NOT be visible simultaneously',
    ).toBe(false);

    if (winVisible) {
      // Win screen stats
      await expect(page.getByText('All 12 rounds complete. Infrastructure secured.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'PLAY AGAIN' })).toBeVisible();
      console.log('Game result: WIN ✓');
    } else {
      // Lose screen — button is labelled "TRY AGAIN" (not "PLAY AGAIN")
      const reason = await page.getByText(/(Budget exceeded|SLA violations)/).textContent();
      await expect(page.getByRole('button', { name: 'TRY AGAIN' })).toBeVisible();
      console.log(`Game result: LOSE – ${reason}`);
    }
  });

  // ── Restart ────────────────────────────────────────────────────────────────
  test('PLAY AGAIN resets the game to round 1', async ({ page }) => {
    // Play rounds until a win or lose screen appears (same pattern as the
    // full-playthrough test). This guarantees we always exercise the restart
    // path rather than bailing out early when the game hasn't ended yet.
    const MAX_ROUNDS = 15;
    let gameEnded = false;

    for (let i = 0; i < MAX_ROUNDS; i++) {
      const ended = await playRound(page, { playCard: i % 2 === 0 });
      if (ended) {
        gameEnded = true;
        break;
      }
    }

    expect(gameEnded, `Game did not reach a win or lose screen after ${MAX_ROUNDS} rounds`).toBe(
      true,
    );

    // Trigger restart from end screen — win → "PLAY AGAIN", lose → "TRY AGAIN"
    await clickPlayAgain(page);

    // After clicking PLAY AGAIN/TRY AGAIN, wait for the machine to complete
    // draw → scheduling transition before asserting ADVANCE is enabled.
    await expect(page.getByText('R1')).toBeVisible({ timeout: 5_000 });
    await expect(ADVANCE(page)).toBeEnabled({ timeout: 10_000 });
    await expect(page.getByText('NETWORK STABLE')).not.toBeVisible();
    await expect(page.getByText('SYSTEM DOWN')).not.toBeVisible();
  });
});
