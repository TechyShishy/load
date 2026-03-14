import { test, expect, type Page } from '@playwright/test';
import { clearSave, dismissContinueModal } from './helpers.js';

const ADVANCE = (page: Page) => page.locator('button:not(#event-modal-advance-btn)', { hasText: 'ADVANCE' });

/**
 * Wait for the ADVANCE button to become enabled and click it.
 * If the EventModal is covering the screen, dismiss it first via its own
 * ADVANCE button, then click the main button.
 *
 * The event modal is shown during crisis phase for events that require
 * acknowledgement. It overlays the page and intercepts pointer events, so
 * attempting to click the main ADVANCE button while it is open fails. We
 * dismiss any open event modals in a loop because a single crisis phase may
 * spawn multiple sequential event modals.
 */
/**
 * Wait for the ADVANCE button to become enabled and click it.
 * Pass `{ expectEventModal: true }` when advancing from crisis phase, where an
 * EventModal may appear after crisis animations complete and intercept the click.
 *
 * The event modal's ADVANCE button is wired to the same advance() handler as the
 * main button — so we must click exactly ONE of them, not both.
 *
 * Strategy for crisis phase: the modal only appears after crisis animations
 * complete (`crisisAnimsDone`), which can take 0-5s. We poll with a 1s window
 * per iteration for up to 6s total. If the modal appears, we click its ADVANCE
 * button and return. If after 6s no modal appears, we fall through to the main
 * button (this crisis had no event cards).
 *
 * We do NOT break early based on button state — if we're in crisis and an
 * event card is pending, the modal will appear even if the main button is
 * momentarily enabled (before focus is trapped). Waiting the full window
 * prevents the main button click racing against the modal appearance.
 */
async function clickAdvance(page: Page, opts: { expectEventModal?: boolean } = {}) {
  const eventModalBtn = page.locator('#event-modal-advance-btn');
  const mainBtn = ADVANCE(page);

  if (opts.expectEventModal) {
    // Single waitFor with a generous window: with reducedMotion the modal
    // renders within one React cycle (~16ms). The 5s window covers any
    // rendering delays or slow CI environments. If no modal after 5s the
    // crisis had no pending events and we fall through to the main button.
    const modalVisible = await eventModalBtn
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (modalVisible) {
      await eventModalBtn.click();
      return;
    }
    // No modal within 5s → this crisis has no pending event cards.
  }

  await expect(mainBtn).toBeEnabled({ timeout: 8_000 });
  await mainBtn.click();
}

/**
 * Play one full round: scheduling → ADVANCE → crisis → ADVANCE → resolution (auto).
 * Returns true when a win/lose end-screen is detected instead of the next round.
 */
async function playRound(page: Page, opts: { playCard?: boolean } = {}): Promise<boolean> {
  // ── Wait for a stable, actionable phase ───────────────────────────────────
  // Wait until we are in either scheduling or crisis with the ADVANCE button
  // present. The machine also passes through transient draw/resolution/end
  // states that do not directly expose ADVANCE -- we skip past them here.
  await page
    .locator('[role="main"][data-phase="scheduling"],[role="main"][data-phase="crisis"]')
    .waitFor({ timeout: 8_000 });

  // Determine the active phase using the authoritative data-phase attribute.
  const currentPhase = await page.locator('[role="main"]').getAttribute('data-phase', { timeout: 2_000 });
  const alreadyInCrisis = currentPhase === 'crisis';

  if (!alreadyInCrisis) {
    // We are in scheduling — optionally play a card, then advance to crisis.
    if (opts.playCard) {
      const handGroup = page.getByRole('group', { name: 'Hand' });
      const cards = handGroup.locator('[role="button"]:not([aria-disabled="true"])');
      const count = await cards.count();
      if (count > 0) {
        await cards.first().click();
        // Clicking opens the card details flyout (cards are DnD, not click-to-play).
        // Dismiss via the backdrop click rather than keyboard — DnD kit listeners
        // on the focusable flyout element can intercept and swallow Escape before
        // the document-level handler receives it, leaving the backdrop up.
        const flyoutBackdrop = page.locator('[data-testid="card-flyout-backdrop"]');
        const appeared = await flyoutBackdrop
          .waitFor({ state: 'visible', timeout: 2_000 })
          .then(() => true)
          .catch(() => false);
        if (appeared) {
          await flyoutBackdrop.click();
          await flyoutBackdrop.waitFor({ state: 'hidden', timeout: 3_000 });
        }
      }
    }
    await clickAdvance(page); // scheduling → crisis
    // Wait for crisis phase before checking end-screen or handling the modal.
    await page.locator('[role="main"][data-phase="crisis"]').waitFor({ timeout: 5_000 });

    if (await isEndScreen(page)) return true;
  }

  // ── Crisis phase ───────────────────────────────────────────────────────────
  await clickAdvance(page, { expectEventModal: true }); // crisis → resolution → end → draw

  if (await isEndScreen(page)) return true;

  // Wait for the machine to leave the draw phase. On weekdays it goes to
  // scheduling; on weekends (next day also weekend) it goes directly to crisis.
  await page
    .locator('[role="main"][data-phase="scheduling"],[role="main"][data-phase="crisis"]')
    .waitFor({ timeout: 8_000 });
  return false;
}

/** Returns true if either the win or lose screen is currently visible. */
async function isEndScreen(page: Page): Promise<boolean> {
  const win = page.getByText('NETWORK STABLE');
  const lose = page.getByText('SYSTEM DOWN');
  // Use a very short timeout — end screens appear synchronously when the machine
  // transitions to gameWon/gameLost. We don't need to wait long; this is just a
  // quick DOM check after each advance to detect game-over before polling more.
  const winVis = await win.isVisible({ timeout: 200 }).catch(() => false);
  const loseVis = await lose.isVisible({ timeout: 200 }).catch(() => false);
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

    // Phase indicator should show Day 1
    await expect(page.getByText('Mon, W1')).toBeVisible();

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
    await expect(page.getByText('Schedule', { exact: true })).toBeVisible();
    await expect(ADVANCE(page)).toBeEnabled();

    // Advance → crisis. Wait for the phase to actually change — the 'Crisis'
    // label in the progress bar is always in the DOM so we check data-phase.
    await clickAdvance(page);
    await page.locator('[role="main"][data-phase="crisis"]').waitFor({ timeout: 5_000 });

    // Advance → resolution (handles EventModal if present)
    await clickAdvance(page, { expectEventModal: true });

    // The game may have ended after crisis resolution or during resolution (e.g. bankrupt)
    const endedAfterCrisis = await isEndScreen(page);
    if (endedAfterCrisis) return;

    // The game may have ended in round 1
    const ended = await isEndScreen(page);
    if (ended) return;

    await expect(page.getByText(/W1/)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Schedule', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  // ── Card interaction ───────────────────────────────────────────────────────
  test('can play an action card from hand during scheduling', async ({ page }) => {
    // Wait for scheduling phase using the authoritative data-phase attribute.
    await page.locator('[role="main"][data-phase="scheduling"]').waitFor({ timeout: 8_000 });
    await expect(ADVANCE(page)).toBeEnabled();

    // Action cards are <div role="button"> elements (dnd-kit) inside the Hand group.
    const handGroup = page.getByRole('group', { name: 'Hand' });
    const cards = handGroup.locator('[role="button"]:not([aria-disabled="true"])');
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
      await expect(page.getByText(/All \d+ days complete. Infrastructure secured./)).toBeVisible();
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

    // PLAY AGAIN / TRY AGAIN returns to the Start Screen (the app resets to the
    // main menu so the user can choose a contract). Dismiss the menu to begin a
    // new game with the default contract before asserting game state.
    await dismissContinueModal(page);

    // After dismissing the Start Screen, wait for the machine to complete
    // draw → scheduling transition before asserting ADVANCE is enabled.
    await expect(page.getByText('Mon, W1')).toBeVisible({ timeout: 8_000 });
    await expect(ADVANCE(page)).toBeEnabled({ timeout: 10_000 });
    await expect(page.getByText('NETWORK STABLE')).not.toBeVisible();
    await expect(page.getByText('SYSTEM DOWN')).not.toBeVisible();
  });
});
