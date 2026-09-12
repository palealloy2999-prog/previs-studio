import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function saveScene(page: import('@playwright/test').Page) {
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  return JSON.parse(readFileSync((await (await downloadEvent).path())!, 'utf8'));
}

test('creates a scene folder and moves objects into and out of it by drag and drop', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('.scene-list');
  await page.getByRole('button', { name: 'Add folder' }).click();
  const folder = scene.locator('.scene-group').first();
  await expect(folder).toContainText('Group 01');

  await scene.getByRole('button', { name: /Character A/ }).dragTo(folder);
  await expect(folder.locator('.object-row.nested')).toContainText('Character A');
  let saved = await saveScene(page);
  expect(saved.groups[0].objectIds).toEqual(['character-a']);
  expect(saved.groups[0].keyframes[0].position).toEqual([-2, 0, 0]);
  expect(saved.objects.find((object: { id: string }) => object.id === 'character-a').keyframes[0].position).toEqual([0, 0, 0]);

  await folder.locator('.object-row.nested').dragTo(scene.getByRole('button', { name: /Character B/ }));
  await expect(folder.locator('.object-row.nested')).toHaveCount(0);
  saved = await saveScene(page);
  expect(saved.groups[0].objectIds).toEqual([]);
  expect(saved.objects.find((object: { id: string }) => object.id === 'character-a').keyframes[0].position).toEqual([-2, 0, 0]);
});

test('folder button immediately groups the selected objects', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('.scene-list');
  await scene.getByRole('button', { name: /Character A/ }).click();
  await scene.getByRole('button', { name: /Character B/ }).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Add folder' }).click();

  const folder = scene.locator('.scene-group');
  await expect(folder).toContainText('Group 01');
  await expect(folder.locator('.object-row.nested')).toHaveCount(2);
  const saved = await saveScene(page);
  expect(saved.groups[0]).toMatchObject({ objectIds: ['character-a', 'character-b'] });
  expect(saved.groups[0].keyframes).toHaveLength(1);
});

test('dragging one selected object moves the whole selection into and out of a folder', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('.scene-list');
  await page.getByRole('button', { name: 'Add folder' }).click();
  const folder = scene.locator('.scene-group');

  await scene.getByRole('button', { name: /Character A/ }).click();
  await scene.getByRole('button', { name: /Character B/ }).click({ modifiers: ['Shift'] });
  await scene.getByRole('button', { name: /Character A/ }).dragTo(folder);
  await expect(folder.locator('.object-row.nested')).toHaveCount(2);
  let saved = await saveScene(page);
  expect(saved.groups[0].objectIds).toEqual(['character-a', 'character-b']);

  await folder.getByRole('button', { name: /Character A/ }).dragTo(scene.getByRole('button', { name: /^Box/ }));
  await expect(folder.locator('.object-row.nested')).toHaveCount(0);
  saved = await saveScene(page);
  expect(saved.groups[0].objectIds).toEqual([]);
  expect(saved.objects.find((object: { id: string }) => object.id === 'character-a').keyframes[0].position).toEqual([-2, 0, 0]);
  expect(saved.objects.find((object: { id: string }) => object.id === 'character-b').keyframes[0].position).toEqual([2, 0, -1]);
});

test('groups a multi-selection from the edit view context menu and Delete ungroups it', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('.scene-list');
  await scene.getByRole('button', { name: /Character A/ }).click();
  await scene.getByRole('button', { name: /Character B/ }).click({ modifiers: ['Shift'] });
  await page.locator('.canvas-host').click({ button: 'right', position: { x: 400, y: 250 } });
  await expect(page.getByRole('heading', { name: 'Group selected objects' })).toBeVisible();
  await page.getByRole('textbox', { name: 'New group name' }).fill('Actors');
  await page.getByRole('button', { name: 'Create group', exact: true }).click();

  const folder = scene.locator('.scene-group');
  await expect(folder).toContainText('Actors');
  await expect(folder.locator('.object-row.nested')).toHaveCount(2);
  await expect(page.locator('.track-labels .group-track-label')).toContainText('Actors');
  await expect(page.locator('.track.nested')).toHaveCount(2);
  let saved = await saveScene(page);
  expect(saved.groups[0]).toMatchObject({ name: 'Actors', objectIds: ['character-a', 'character-b'] });
  expect(saved.groups[0].keyframes).toHaveLength(1);

  const tracks = page.locator('.tracks'), bounds = await tracks.boundingBox();
  await tracks.click({ position: { x: bounds!.width / 2, y: 10 } });
  await page.getByLabel('Position X').fill('1');
  await page.getByLabel('Position X').press('Enter');
  await expect(page.locator('.group-track .keyframe')).toHaveCount(2);
  saved = await saveScene(page);
  expect(saved.groups[0].keyframes).toHaveLength(2);
  expect(saved.objects.find((object: { id: string }) => object.id === 'character-a').keyframes).toHaveLength(3);
  expect(saved.objects.find((object: { id: string }) => object.id === 'character-b').keyframes).toHaveLength(2);

  await page.keyboard.press('Delete');
  await expect(scene.locator('.scene-group')).toHaveCount(0);
  await expect(scene.getByRole('button', { name: /Character A/ })).toBeVisible();
  await expect(scene.getByRole('button', { name: /Character B/ })).toBeVisible();
  saved = await saveScene(page);
  expect(saved.groups).toEqual([]);
  expect(saved.objects).toHaveLength(3);
});
