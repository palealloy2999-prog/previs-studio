import { expect, test } from '@playwright/test';

test.describe('English browser locale', () => {
  test.use({ locale: 'en-US' });

  test('shows the English interface and help', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Shape the shot.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start creating' })).toBeVisible();
  });
});

test('keeps the Japanese-locale editor in English and localizes help', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ショットを、かたちに。' })).toBeVisible();
  await page.getByRole('button', { name: '制作をはじめる' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByRole('alert')).toContainText('JSONを読み込めません');
});
