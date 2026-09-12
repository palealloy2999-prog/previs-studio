import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { newProject } from '../../src/model';

test('camera field of view is keyed, interpolated, undoable and saved without motion metadata', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const scene = newProject();
  scene.cameras[0].keyframes = [
    { time: 0, position: [0, 2, 8], target: [0, 1, 0], fov: 75 },
    { time: 10, position: [0, 2, 8], target: [0, 1, 0], fov: 25 },
  ];
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'lens.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(scene)) });
  await page.locator('.scene-list').getByRole('button', { name: /Camera 01/ }).click();
  await expect(page.locator('.subsection-title').filter({ hasText: 'CAMERA LENS' })).toBeVisible();
  const slider = page.getByRole('slider', { name: '画角スライダー' });
  await expect(slider).toHaveValue('75');
  await page.getByRole('button', { name: '標準 50°' }).click(); await expect(slider).toHaveValue('50');
  await page.keyboard.press('Control+z'); await expect(slider).toHaveValue('75');
  await page.getByRole('button', { name: 'Camera 01 キー 10.00秒', exact: true }).click(); await expect(slider).toHaveValue('25');
  await page.locator('.tracks').click({ position: { x: (await page.locator('.tracks').boundingBox())!.width / 2, y: 15 } });
  await expect(slider).toHaveValue('50');
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '保存', exact: true }).click();
  const json = JSON.parse(readFileSync((await (await downloadEvent).path())!, 'utf8'));
  expect(json.cameras[0].keyframes.map((key: { fov: number }) => key.fov)).toEqual([75, 25]);
  expect(JSON.stringify(json)).not.toContain('motion');
  await expect(page.getByText('CAMERA MOTION', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('camera tracks hard-cut, earlier starts win overlaps, and gaps render black', async ({ page }) => {
  const scene = newProject();
  scene.cameras[0].range = { start: 0, end: 6 };
  scene.cameras.push({
    id: 'camera-2', name: 'Camera 02', color: '#7db9ce', range: { start: 4, end: 8 },
    keyframes: [{ time: 4, position: [-6, 3, 5], target: [0, 1, 0], fov: 40 }],
  });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'cuts.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(scene)) });
  const tracks = page.locator('.tracks'); const box = await tracks.boundingBox();
  const scrub = async (fraction: number) => tracks.click({ position: { x: box!.width * fraction, y: 15 } });
  await scrub(.5); await expect(page.locator('.preview-heading')).toContainText('Camera 01');
  await scrub(.7); await expect(page.locator('.preview-heading')).toContainText('Camera 02');
  await scrub(.9); await expect(page.locator('.preview-heading')).toContainText('NO CAMERA'); await expect(page.locator('.preview-heading')).toContainText('BLACK');
  const pixel = await page.locator('.preview-canvas canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl'); if (!gl) return null;
    const value = new Uint8Array(4); gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value); return [...value];
  });
  expect(pixel?.slice(0, 3)).toEqual([0, 0, 0]);
  await scrub(.3); await page.getByRole('button', { name: '現在時刻にカメラを追加', exact: true }).click();
  await expect(page.locator('.scene-list .camera-row')).toHaveCount(3);
  await expect(page.locator('.preview-heading')).toContainText('Camera 03');
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '保存', exact: true }).click();
  const saved = JSON.parse(readFileSync((await (await downloadEvent).path())!, 'utf8'));
  expect(saved.cameras[0].range.end).toBe(3); expect(saved.cameras[2].range).toEqual({ start: 3, end: 10 });
});
