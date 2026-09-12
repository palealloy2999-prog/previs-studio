import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function saveScene(page: import('@playwright/test').Page) {
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  return JSON.parse(readFileSync((await (await downloadEvent).path())!, 'utf8'));
}

test('expands the Scene area and keeps Scene and timeline object order synchronized', async ({ page }) => {
  await page.goto('/');
  const sceneSection = page.locator('.scene-section'), assetsSection = page.locator('.assets-section');
  expect((await sceneSection.boundingBox())!.height).toBeGreaterThan((await assetsSection.boundingBox())!.height);

  const scene = page.locator('.scene-list');
  const characterA = scene.getByRole('button', { name: /Character A/ }), characterB = scene.getByRole('button', { name: /Character B/ });
  const target = await characterB.boundingBox();
  await characterA.dragTo(characterB, { targetPosition: { x: target!.width / 2, y: target!.height - 2 } });
  await expect(scene.locator(':scope > .object-row').nth(0)).toContainText('Character B');
  await expect(scene.locator(':scope > .object-row').nth(1)).toContainText('Character A');
  await expect(page.locator('.track-labels button').nth(0)).toContainText('Character B');
  await expect(page.locator('.track-labels button').nth(1)).toContainText('Character A');

  const labels = page.locator('.track-labels'), box = labels.getByRole('button', { name: 'Box', exact: true });
  const first = labels.getByRole('button', { name: 'Character B', exact: true }), firstBox = await first.boundingBox();
  await box.dragTo(first, { targetPosition: { x: firstBox!.width / 2, y: 2 } });
  await expect(labels.locator('button').nth(0)).toContainText('Box');
  await expect(scene.locator(':scope > .object-row').nth(0)).toContainText('Box');
  const saved = await saveScene(page);
  expect(saved.objects.map((object: { name: string }) => object.name)).toEqual(['Box', 'Character B', 'Character A']);
});

test('reorders objects inside a Scene folder', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('.scene-list');
  await scene.getByRole('button', { name: /Character A/ }).click();
  await scene.getByRole('button', { name: /Character B/ }).click({ modifiers: ['Shift'] });
  await page.locator('.canvas-host').click({ button: 'right', position: { x: 400, y: 250 } });
  await page.getByRole('button', { name: 'Create group', exact: true }).click();
  const members = scene.locator('.group-children .object-row'), second = await members.nth(1).boundingBox();
  await members.nth(0).dragTo(members.nth(1), { targetPosition: { x: second!.width / 2, y: second!.height - 2 } });
  await expect(members.nth(0)).toContainText('Character B'); await expect(members.nth(1)).toContainText('Character A');
  const saved = await saveScene(page);
  expect(saved.groups[0].objectIds).toEqual(['character-b', 'character-a']);
});

test('keeps the timeline ruler fixed while tracks scroll vertically', async ({ page }) => {
  await page.goto('/');
  const addBox = page.locator('.asset-grid').getByRole('button', { name: 'Box', exact: true });
  for (let index = 0; index < 10; index++) await addBox.click();
  const body = page.locator('.timeline-body'), ruler = page.locator('.ruler'), header = page.locator('.track-label-top'), playheadMarker = page.locator('.playhead > span');
  const rulerTop = (await ruler.boundingBox())!.y, headerTop = (await header.boundingBox())!.y, playheadTop = (await playheadMarker.boundingBox())!.y;
  expect(Number(await page.locator('.playhead').evaluate(element => getComputedStyle(element).zIndex))).toBeGreaterThan(Number(await ruler.evaluate(element => getComputedStyle(element).zIndex)));
  await expect(ruler).toHaveCSS('user-select', 'none');
  const gutterCovers = await ruler.evaluate(element => ({
    left: getComputedStyle(element, '::before').width,
    right: getComputedStyle(element, '::after').width,
    leftBackground: getComputedStyle(element, '::before').backgroundColor,
    rightBackground: getComputedStyle(element, '::after').backgroundColor,
  }));
  expect(gutterCovers).toEqual({ left: '15px', right: '26px', leftBackground: 'rgb(23, 28, 31)', rightBackground: 'rgb(23, 28, 31)' });
  await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect.poll(async () => (await body.evaluate(element => element.scrollTop))).toBeGreaterThan(0);
  await expect.poll(async () => (await ruler.boundingBox())!.y).toBeCloseTo(rulerTop, 0);
  await expect.poll(async () => (await header.boundingBox())!.y).toBeCloseTo(headerTop, 0);
  await expect.poll(async () => (await playheadMarker.boundingBox())!.y).toBeCloseTo(playheadTop, 0);
});
