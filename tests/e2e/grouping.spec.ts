import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function saveScene(page: import('@playwright/test').Page) {
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  return JSON.parse(readFileSync((await (await downloadEvent).path())!, 'utf8'));
}

test('creates a scene folder and moves objects into and out of it by drag and drop', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('.scene-list');
  await page.getByRole('button', { name: 'フォルダを追加' }).click();
  const folder = scene.locator('.scene-group').first();
  await expect(folder).toContainText('Group 01');

  await scene.getByRole('button', { name: /Character A/ }).dragTo(folder);
  await expect(folder.locator('.object-row.nested')).toContainText('Character A');
  let saved = await saveScene(page);
  expect(saved.groups[0].objectIds).toEqual(['character-a']);

  await folder.locator('.object-row.nested').dragTo(scene.getByRole('button', { name: /Character B/ }));
  await expect(folder.locator('.object-row.nested')).toHaveCount(0);
  saved = await saveScene(page);
  expect(saved.groups[0].objectIds).toEqual([]);
});

test('groups a multi-selection from the edit view context menu and Delete ungroups it', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('.scene-list');
  await scene.getByRole('button', { name: /Character A/ }).click();
  await scene.getByRole('button', { name: /Character B/ }).click({ modifiers: ['Shift'] });
  await page.locator('.canvas-host').click({ button: 'right', position: { x: 400, y: 250 } });
  await expect(page.getByRole('heading', { name: '選択オブジェクトをグループ化' })).toBeVisible();
  await page.getByRole('textbox', { name: '新しいグループ名' }).fill('Actors');
  await page.getByRole('button', { name: 'グループ化', exact: true }).click();

  const folder = scene.locator('.scene-group');
  await expect(folder).toContainText('Actors');
  await expect(folder.locator('.object-row.nested')).toHaveCount(2);
  let saved = await saveScene(page);
  expect(saved.groups[0]).toMatchObject({ name: 'Actors', objectIds: ['character-a', 'character-b'] });

  await page.keyboard.press('Delete');
  await expect(scene.locator('.scene-group')).toHaveCount(0);
  await expect(scene.getByRole('button', { name: /Character A/ })).toBeVisible();
  await expect(scene.getByRole('button', { name: /Character B/ })).toBeVisible();
  saved = await saveScene(page);
  expect(saved.groups).toEqual([]);
  expect(saved.objects).toHaveLength(3);
});
