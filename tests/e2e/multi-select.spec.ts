import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function saveScene(page: import('@playwright/test').Page) {
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  return JSON.parse(readFileSync((await (await downloadEvent).path())!, 'utf8'));
}

test('scene multi-selection applies transform deltas and copies, pastes, deletes and undoes entities', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('.scene-list');
  await scene.getByRole('button', { name: /Character A/ }).click();
  await scene.getByRole('button', { name: /Character B/ }).click({ modifiers: ['Shift'] });
  await expect(scene.locator('.object-row.selected')).toHaveCount(2); await expect(scene.locator('.object-row.primary')).toContainText('Character A');

  const x = page.getByRole('spinbutton', { name: 'Position X', exact: true }); await x.fill('1'); await x.press('Enter');
  const ry = page.getByRole('spinbutton', { name: 'Rotation ° Y', exact: true }); await ry.fill('45'); await ry.press('Enter');
  let saved = await saveScene(page);
  expect(saved.objects[0].keyframes[0].position[0]).toBe(1); expect(saved.objects[1].keyframes[0].position[0]).toBe(5);
  expect(saved.objects[0].keyframes[0].rotation[1]).toBe(45); expect(saved.objects[1].keyframes[0].rotation[1]).toBe(-35);

  await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
  await expect(scene.locator('.object-row')).toHaveCount(6); await expect(scene.locator('.object-row.selected')).toHaveCount(2);
  await page.keyboard.press('Delete'); await expect(scene.locator('.object-row')).toHaveCount(4);
  await page.keyboard.press('Control+z'); await expect(scene.locator('.object-row')).toHaveCount(6);
  saved = await saveScene(page); expect(saved.objects.filter((object: { name: string }) => object.name.endsWith(' copy'))).toHaveLength(2);
});

test('timeline multi-selection copies, pastes and deletes keys at the playhead', async ({ page }) => {
  await page.goto('/');
  const labels = page.locator('.track-labels');
  await labels.getByRole('button', { name: 'Character A', exact: true }).click();
  await labels.getByRole('button', { name: 'Character B', exact: true }).click({ modifiers: ['Shift'] });
  await expect(labels.locator('button.selected')).toHaveCount(2);

  await page.getByRole('button', { name: 'Character A key at 0.00 seconds', exact: true }).click();
  await page.getByRole('button', { name: 'Character B key at 0.00 seconds', exact: true }).click({ modifiers: ['Shift'] });
  await page.keyboard.press('Control+c');
  const tracks = page.locator('.tracks'), box = await tracks.boundingBox(); await tracks.click({ position: { x: box!.width * .2, y: 15 } });
  await page.keyboard.press('Control+v');
  await expect(page.getByRole('button', { name: 'Character A key at 2.00 seconds', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Character B key at 2.00 seconds', exact: true })).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('button', { name: 'Character A key at 2.00 seconds', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Character B key at 2.00 seconds', exact: true })).toHaveCount(0);
});
