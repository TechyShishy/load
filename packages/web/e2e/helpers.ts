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
  if (await screen.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByRole('button', { name: 'NEW GAME' }).click();
    // Contract panel slides in — click the requested contract (exact match against button accessible name prefix)
    const safePattern = contractName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await page.getByRole('button', { name: new RegExp(`^${safePattern}`, 'i') }).click();
    await expect(screen).not.toBeVisible();
  }
}
