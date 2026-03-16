import { expect, type Page } from '@playwright/test';

/**
 * Clear any persisted save so we always start from a fresh game.
 * Must be called after page.goto() so the page's localStorage is accessible.
 */
export async function clearSave(page: Page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

/**
 * If the Start Screen is showing, dismiss it by clicking NEW GAME and then
 * selecting the Standard contract. Pass `contractName` to choose a different
 * contract (matched against button text, case-insensitive).
 */
export async function dismissContinueModal(page: Page, contractName = 'STANDARD') {
  const screen = page.getByRole('dialog', { name: 'LOAD' });
  // isVisible() is an instant DOM check — it does NOT wait. Use waitFor() with
  // a 20s window so we block until the LoadScreen finishes and the StartScreen
  // appears. The LoadScreen runs an OfflineAudioContext music pre-render that
  // takes ~9s in Chrome; the 2s window that was here predated that task.
  // 20s gives ~11s of headroom on top of the pre-render time.
  const appeared = await screen
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) {
    await page.getByRole('button', { name: 'NEW GAME' }).click();
    // Contract panel slides in — click the requested contract (exact match against button accessible name prefix)
    const safePattern = contractName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await page.getByRole('button', { name: new RegExp(`^${safePattern}`, 'i') }).click();
    await expect(screen).not.toBeVisible();
  }
}
