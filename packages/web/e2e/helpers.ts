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
 * If the Start Screen is showing, dismiss it by clicking NEW GAME.
 */
export async function dismissContinueModal(page: Page) {
  const screen = page.getByRole('dialog', { name: 'LOAD' });
  if (await screen.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByRole('button', { name: 'NEW GAME' }).click();
    await expect(screen).not.toBeVisible();
  }
}
