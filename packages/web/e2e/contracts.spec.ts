import { test, expect } from '@playwright/test';
import { clearSave } from './helpers.js';

test.describe('Contract selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearSave(page);
  });

  test('NEW GAME opens the contract panel', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'LOAD' });
    // Explicit 20s window covers the ~9s OfflineAudioContext music pre-render
    // in the LoadScreen. The global expect.timeout (10s) has only ~1s margin.
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'NEW GAME' }).click();

    await expect(page.getByText('Select Contract')).toBeVisible();
    await expect(page.getByText('LOCAL ISP')).toBeVisible();
    await expect(page.getByText('STANDARD')).toBeVisible();
  });

  test('BACK button returns to the main menu', async ({ page }) => {
    await page.getByRole('button', { name: 'NEW GAME' }).click();
    await expect(page.getByText('Select Contract')).toBeVisible();

    await page.getByRole('button', { name: '← BACK' }).click();

    await expect(page.getByRole('button', { name: 'NEW GAME' })).toBeVisible();
    // Contract panel collapses — aria-hidden is set so assistive tech skips it
    const contractPanel = page.getByText('Select Contract').locator('..');
    await expect(contractPanel).toHaveAttribute('aria-hidden', 'true');
  });

  test('selecting Standard starts the game with $500,000 budget', async ({ page }) => {
    await page.getByRole('button', { name: 'NEW GAME' }).click();
    await page.getByRole('button', { name: /^STANDARD/i }).click();

    const dialog = page.getByRole('dialog', { name: 'LOAD' });
    await expect(dialog).not.toBeVisible();

    // BudgetBar shows the initial budget
    await expect(page.getByText('$500,000')).toBeVisible({ timeout: 5_000 });
  });

  test('selecting Local ISP starts the game with $700,000 budget', async ({ page }) => {
    await page.getByRole('button', { name: 'NEW GAME' }).click();
    await page.getByRole('button', { name: /^LOCAL ISP/i }).click();

    const dialog = page.getByRole('dialog', { name: 'LOAD' });
    await expect(dialog).not.toBeVisible();

    // BudgetBar shows the Local ISP starting budget
    await expect(page.getByText('$700,000')).toBeVisible({ timeout: 5_000 });
  });

  test('Local ISP HUD shows 5 SLA dots', async ({ page }) => {
    await page.getByRole('button', { name: 'NEW GAME' }).click();
    await page.getByRole('button', { name: /^LOCAL ISP/i }).click();

    await expect(page.getByRole('dialog', { name: 'LOAD' })).not.toBeVisible();

    // SLAMeter shows "0/5" for Local ISP's slaLimit=5
    await expect(page.getByText('0/5')).toBeVisible({ timeout: 5_000 });
  });

  test('Standard contract HUD shows 3 SLA dots', async ({ page }) => {
    await page.getByRole('button', { name: 'NEW GAME' }).click();
    await page.getByRole('button', { name: /^STANDARD/i }).click();

    await expect(page.getByRole('dialog', { name: 'LOAD' })).not.toBeVisible();

    // SLAMeter shows "0/3" for Standard's slaLimit=3
    await expect(page.getByText('0/3')).toBeVisible({ timeout: 5_000 });
  });

  test('HUD shows the active contract name', async ({ page }) => {
    await page.getByRole('button', { name: 'NEW GAME' }).click();
    await page.getByRole('button', { name: /^LOCAL ISP/i }).click();

    await expect(page.getByRole('dialog', { name: 'LOAD' })).not.toBeVisible();
    await expect(page.getByText('LOCAL ISP', { exact: false }).first()).toBeVisible({ timeout: 5_000 });
  });
});
