import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function saveScene(page: import('@playwright/test').Page) {
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  return JSON.parse(readFileSync((await (await downloadEvent).path())!, 'utf8'));
}

test('applies and edits a barrel-roll path between two keys without baking intermediate keys', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('.canvas-host');
  await page.getByLabel('Motion preset').selectOption('barrel-roll');

  await expect(canvas).toHaveAttribute('data-motion-path', 'barrel-roll');
  await expect(canvas).toHaveAttribute('data-motion-handles', '2');
  await expect(page.locator('.motion-clip')).toHaveCount(1);
  await expect(page.locator('.motion-clip')).toContainText('Barrel roll');

  await page.getByLabel('Control point 1 Y').fill('2');
  await page.getByLabel('Control point 1 Y').press('Enter');
  const tracks = page.locator('.tracks'), bounds = await tracks.boundingBox();
  await tracks.click({ position: { x: bounds!.width * .25, y: 44 } });
  await expect(page.getByLabel('Rotation ° Z')).toHaveValue('180');

  const saved = await saveScene(page), object = saved.objects.find((value: { id: string }) => value.id === 'character-a');
  expect(object.keyframes).toHaveLength(3);
  expect(object.keyframes[0].motion).toEqual({ preset: 'barrel-roll', controlPoints: [[-1.3333333333333335, 2, 0], [-0.6666666666666667, 0, 0]], orientToPath: true, roll: 360 });

  await page.getByLabel('Motion preset').selectOption('none');
  await expect(canvas).toHaveAttribute('data-motion-path', 'off');
  await expect(page.locator('.motion-clip')).toHaveCount(0);
});

test('stores a flight path on a group parent while leaving member keys independent', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('.scene-list');
  await scene.getByRole('button', { name: /Character A/ }).click();
  await scene.getByRole('button', { name: /Character B/ }).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Add folder' }).click();

  const tracks = page.locator('.tracks'), bounds = await tracks.boundingBox();
  await tracks.click({ position: { x: bounds!.width * .5, y: 10 } });
  await page.getByLabel('Position X').fill('1');
  await page.getByLabel('Position X').press('Enter');
  await page.getByLabel('Group 01 key at 0.00 seconds').click();
  await page.getByLabel('Motion preset').selectOption('barrel-roll');

  await expect(page.locator('.canvas-host')).toHaveAttribute('data-motion-path', 'barrel-roll');
  await expect(page.locator('.group-track .motion-clip')).toHaveCount(1);
  const saved = await saveScene(page);
  expect(saved.groups[0].keyframes).toHaveLength(2);
  expect(saved.groups[0].keyframes[0].motion).toMatchObject({ preset: 'barrel-roll', roll: 360 });
  expect(saved.objects.find((value: { id: string }) => value.id === 'character-a').keyframes).toHaveLength(3);
  expect(saved.objects.find((value: { id: string }) => value.id === 'character-b').keyframes).toHaveLength(2);
});
