import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { calculateResolution } from '../../src/model';

test('scales assets per axis and uniformly, moves the live preview, and selects output format', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('.canvas-host')).toHaveAttribute('data-webgl', 'ready');

  const preview = page.locator('.camera-preview'); const beforePreview = await preview.boundingBox();
  const heading = page.locator('.preview-heading'); const handle = await heading.boundingBox();
  await page.mouse.move(handle!.x + 30, handle!.y + handle!.height / 2); await page.mouse.down();
  await page.mouse.move(handle!.x - 120, handle!.y + 80, { steps: 5 }); await page.mouse.up();
  const movedPreview = await preview.boundingBox();
  expect(Math.abs(movedPreview!.x - beforePreview!.x) + Math.abs(movedPreview!.y - beforePreview!.y)).toBeGreaterThan(40);
  await heading.dblclick(); await expect.poll(async () => (await preview.boundingBox())!.x).toBeCloseTo(beforePreview!.x, 0);

  const rendered = page.locator('.preview-canvas canvas'); const beforeScale = await rendered.screenshot();
  await page.getByRole('spinbutton', { name: 'スケール X' }).fill('2');
  await expect.poll(async () => (await rendered.screenshot()).equals(beforeScale)).toBe(false);
  await page.getByRole('spinbutton', { name: 'スケール Y' }).fill('3'); await page.getByRole('spinbutton', { name: 'スケール Y' }).press('Enter');
  await page.getByRole('spinbutton', { name: 'スケール Z' }).fill('4'); await page.getByRole('spinbutton', { name: 'スケール Z' }).press('Enter');
  await page.getByRole('spinbutton', { name: '全体倍率' }).fill('1.5'); await page.getByRole('spinbutton', { name: '全体倍率' }).press('Enter');

  await page.getByRole('combobox', { name: '画面比率' }).selectOption('9:16 portrait');
  await page.getByRole('combobox', { name: 'メガピクセル' }).selectOption('0.4');
  const resolution = calculateResolution('9:16 portrait', '0.4');
  await expect(page.locator('.format-tag')).toContainText(`${resolution.width} × ${resolution.height}`);

  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '保存', exact: true }).click();
  const saved = JSON.parse(readFileSync((await (await downloadEvent).path())!, 'utf8'));
  expect(saved.objects[0].scale).toEqual([2, 3, 4]); expect(saved.objects[0].uniformScale).toBe(1.5);
  expect(saved.output).toEqual({ aspectRatio: '9:16 portrait', megapixels: '0.4' }); expect(saved.resolution).toEqual(resolution);
  expect(errors).toEqual([]);
});

test('shows compact assets in three columns and creates triangle and tetrahedron primitives', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const cards = page.locator('.asset-grid .asset-card');
  await expect(cards).toHaveCount(6);
  const first = await cards.nth(0).boundingBox(), second = await cards.nth(1).boundingBox(), third = await cards.nth(2).boundingBox(), fourth = await cards.nth(3).boundingBox();
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(2); expect(Math.abs(first!.y - third!.y)).toBeLessThan(2); expect(fourth!.y).toBeGreaterThan(first!.y + first!.height / 2);

  await page.getByRole('button', { name: '三角形', exact: true }).click();
  await page.getByRole('button', { name: '四面体', exact: true }).click();
  await expect(page.locator('.scene-list').getByRole('button', { name: /三角形 1/ })).toBeVisible();
  await expect(page.locator('.scene-list').getByRole('button', { name: /四面体 1/ })).toBeVisible();
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '保存', exact: true }).click();
  const saved = JSON.parse(readFileSync((await (await downloadEvent).path())!, 'utf8'));
  expect(saved.objects.slice(-2).map((object: { asset: string }) => object.asset)).toEqual(['primitive:triangle', 'primitive:tetrahedron']);
  expect(errors).toEqual([]);
});

test('collapses Assets from its title control and gives the freed height to Scene', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('.scene-section'), before = await scene.boundingBox();
  await page.getByRole('button', { name: 'アセットを閉じる' }).click();
  await expect(page.locator('.asset-grid')).toHaveCount(0);
  await expect(page.locator('.assets-section')).toHaveClass(/collapsed/);
  const expandedScene = await scene.boundingBox();
  expect(expandedScene!.height).toBeGreaterThan(before!.height + 100);
  await page.getByRole('button', { name: 'アセットを開く' }).click();
  await expect(page.locator('.asset-grid .asset-card')).toHaveCount(6);
  await expect.poll(async () => (await scene.boundingBox())!.height).toBeCloseTo(before!.height, 0);
});
