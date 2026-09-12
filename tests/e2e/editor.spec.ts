import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { newProject } from '../../src/model';

// A self-contained, textured-free glTF 2.0 triangle exercises the real GLB loader.
const fixture = path.resolve('assets/models/e2e_test_model.glb');
function createGLB() {
  const vertices = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0]);
  const doc = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: vertices.byteLength }], bufferViews: [{ buffer: 0, byteLength: vertices.byteLength }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-0.5, 0, 0], max: [0.5, 1, 0] }] };
  const json = Buffer.from(JSON.stringify(doc)); const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20); json.copy(padded);
  const bin = Buffer.from(vertices.buffer); const glb = Buffer.alloc(12 + 8 + padded.length + 8 + bin.length);
  glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8); glb.writeUInt32LE(padded.length, 12); glb.writeUInt32LE(0x4e4f534a, 16); padded.copy(glb, 20); glb.writeUInt32LE(bin.length, 20 + padded.length); glb.writeUInt32LE(0x004e4942, 24 + padded.length); bin.copy(glb, 28 + padded.length);
  return glb;
}
test.beforeAll(() => { if (existsSync(fixture)) throw new Error('E2E fixture already exists; refusing to overwrite'); writeFileSync(fixture, createGLB()); });
test.afterAll(() => { if (existsSync(fixture)) unlinkSync(fixture); });

test('scene editing, playback, JSON round trip, GLB instances and missing assets', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('.canvas-host')).toHaveAttribute('data-webgl', 'ready');
  await expect(page.locator('canvas')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/editor-initial.png' });
  await page.getByRole('button', { name: 'Sphere', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Object name' })).toHaveValue('Sphere 1');
  const x = page.getByRole('spinbutton', { name: 'Position X', exact: true });
  await x.fill('3'); await x.press('Enter');
  await page.locator('.tracks').click({ position: { x: 300, y: 15 } });
  await x.fill('8'); await x.press('Enter');
  await expect(page.locator('.tracks .track').nth(3).locator('.keyframe')).toHaveCount(2);
  await page.getByRole('button', { name: 'Go to start' }).click(); await expect(x).toHaveValue('3');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click(); await expect(x).toHaveValue('4');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click(); await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(() => page.locator('.timecode').innerText()).not.toBe('00:00:00');
  await page.getByRole('button', { name: 'Stop', exact: true }).click(); await expect(page.locator('.timecode')).toHaveText('00:00:00');
  const glbResponse = page.waitForResponse(response => response.url().includes('e2e_test_model.glb'));
  await page.getByRole('button', { name: 'E2e Test Model', exact: true }).click();
  expect((await glbResponse).status()).toBe(200);
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await page.getByRole('button', { name: 'Color #7db9ce', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const saveEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save', exact: true }).click(); const saved = await saveEvent;
  const savedPath = await saved.path(); const json = readFileSync(savedPath!, 'utf8'); const scene = JSON.parse(json);
  expect(scene.objects.filter((o: {asset: string}) => o.asset === 'e2e_test_model.glb')).toHaveLength(2);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('.scene-list .object-row')).toHaveCount(1);
  await page.locator('input[type=file]').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(page.locator('.scene-list .object-row')).toHaveCount(scene.objects.length + 1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('frame-previs-v1') ?? 'null')?.objects.length)).toBe(scene.objects.length);
  const roundtrip = await page.evaluate(() => JSON.parse(localStorage.getItem('frame-previs-v1')!));
  expect(roundtrip.objects).toEqual(scene.objects.map((o: {keyframes: object[]}) => ({ ...o, keyframes: o.keyframes.map(k => ({ easing: 'linear', ...k })) })));
  const bad = { ...scene, version: 99 }; await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.getByRole('alert')).toContainText('version');
  expect(await page.locator('.scene-list .object-row').count()).toBe(scene.objects.length + 1);
  scene.objects[0].asset = 'missing-model.glb';
  await page.locator('input[type=file]').setInputFiles({ name: 'missing.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(scene)) });
  await expect(page.getByRole('alert')).toContainText('Missing asset: missing-model.glb');
  expect(errors).toEqual([]);
});

test('keyed camera FOV and real H.264 MP4 export', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const scene = newProject(true); scene.duration = 1;
  scene.cameras[0].range.end = 1;
  scene.cameras[0].keyframes = [
    { time: 0, position: [6, 4, 9], target: [0, 1, -0.5], fov: 75 },
    { time: 1, position: [6, 4, 9], target: [0, 1, -0.5], fov: 25 },
  ];
  await page.goto('/'); await expect(page.locator('.canvas-host')).toHaveAttribute('data-webgl', 'ready');
  await page.locator('input[type=file]').setInputFiles({ name: 'export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(scene)) });
  await page.locator('.scene-list').getByRole('button', { name: /Camera 01/ }).click();
  await expect(page.locator('.tracks .track').last().locator('.keyframe')).toHaveCount(2);
  await page.locator('.tracks .track').last().locator('.keyframe').nth(1).click();
  await expect(page.locator('.tracks .track').last().locator('.keyframe.current')).toHaveCount(1);
  await page.getByRole('button', { name: 'Go to start' }).click();
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export MP4' }).click();
  const video = await downloadEvent; const videoPath = test.info().outputPath('preview.mp4'); await video.saveAs(videoPath);
  expect(readFileSync(videoPath).length).toBeGreaterThan(10000);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', videoPath], { encoding: 'utf8' }));
  expect(probe.streams[0].codec_name).toBe('h264'); expect(probe.streams[0].width).toBe(scene.resolution.width); expect(probe.streams[0].height).toBe(scene.resolution.height); expect(probe.streams[0].nb_frames).toBe('30'); expect(probe.streams[0].r_frame_rate).toBe('30/1'); expect(Number(probe.format.duration)).toBeCloseTo(1, 1);
  execFileSync('ffmpeg', ['-v', 'error', '-i', videoPath, '-f', 'null', '-']);
  await expect(page.locator('.modal-backdrop')).toHaveCount(0); expect(errors).toEqual([]);
});

test('production build automatically includes GLB bytes and relative asset URLs', async () => {
  const outDir = test.info().outputPath('built-app');
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', outDir], { encoding: 'utf8', windowsHide: true });
  const builtAssets = path.join(outDir, 'assets'); const files = readdirSync(builtAssets);
  const glb = files.find(file => /\.glb$/i.test(file));
  expect(glb).toBeTruthy(); expect(readFileSync(path.join(builtAssets, glb!))).toEqual(readFileSync(fixture));
  const scripts = files.filter(file => file.endsWith('.js')).map(file => readFileSync(path.join(builtAssets, file), 'utf8')).join('\n');
  expect(scripts).toContain('e2e_test_model.glb'); expect(scripts).toContain(glb);
});

test('visibility trims affect preview and encoded frames and survive JSON reload', async ({ page }) => {
  const scene = newProject(); scene.duration = 3;
  scene.objects = [{ id: 'timed-box', name: 'Timed Box', asset: 'primitive:box', color: '#ff0000', scale: [1, 1, 1], uniformScale: 1, keyframes: [0, 1, 2].map(time => ({ time, position: [0, 0, 0], rotation: [0, 0, 0] })) }];
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'timed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(scene)) });
  const start = page.getByRole('spinbutton', { name: 'Visible from (sec)' });
  const end = page.getByRole('spinbutton', { name: 'Visible until (sec)' });
  await start.fill('1'); await start.press('Enter'); await end.fill('2'); await end.press('Enter');
  await expect(page.getByText('Outside range · hidden', { exact: true })).toBeVisible();
  const preview = page.locator('.preview-canvas canvas');
  const before = await preview.screenshot();
  await page.getByRole('button', { name: 'Timed Box key at 1.00 seconds', exact: true }).click();
  await expect(page.getByText('Visible', { exact: true })).toBeVisible();
  const during = await preview.screenshot(); expect(during.equals(before)).toBe(false);
  await page.getByRole('button', { name: 'Timed Box key at 2.00 seconds', exact: true }).click();
  await expect(page.getByText('Outside range · hidden', { exact: true })).toBeVisible();
  expect((await preview.screenshot()).equals(before)).toBe(true);

  // Trim with the actual pointer-captured handle, then return it using the numeric field.
  const handle = page.getByRole('button', { name: 'Timed Box visibility start' });
  const box = await handle.boundingBox(); const tracks = await page.locator('.tracks').boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + tracks!.width / 6, box!.y + box!.height / 2, { steps: 5 }); await page.mouse.up();
  await expect(start).toHaveValue('1.5');
  await start.fill('1'); await start.press('Enter');
  const saveEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save', exact: true }).click();
  const json = readFileSync((await (await saveEvent).path())!, 'utf8');
  expect(JSON.parse(json).objects[0].visibility).toEqual({ start: 1, end: 2 });
  await page.locator('input[type=file]').setInputFiles({ name: 'restored.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(start).toHaveValue('1'); await expect(end).toHaveValue('2');
  const videoEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export MP4' }).click();
  const videoPath = test.info().outputPath('visibility.mp4'); await (await videoEvent).saveAs(videoPath);
  const redPixels = (time: number) => {
    const frame = execFileSync('ffmpeg', ['-v', 'error', '-i', videoPath, '-ss', String(time), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 5_000_000 });
    expect(frame.length).toBe(scene.resolution.width * scene.resolution.height * 3);
    let count = 0; for (let i = 0; i < frame.length; i += 3) if (frame[i] > 80 && frame[i] > frame[i + 1] * 1.8 && frame[i] > frame[i + 2] * 1.8) count++;
    return count;
  };
  expect(redPixels(0)).toBe(0); expect(redPixels(1)).toBeGreaterThan(100); expect(redPixels(2)).toBe(0);
});

test('Delete, Undo and Redo preserve edits and group timeline drags', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('.canvas-host')).toHaveAttribute('data-webgl', 'ready');
  const keys = page.locator('.tracks .track').first().locator('.keyframe');
  await page.getByRole('button', { name: 'Character A key at 5.00 seconds', exact: true }).click();
  await page.keyboard.press('Delete'); await expect(keys).toHaveCount(2);
  await page.keyboard.press('Control+z'); await expect(keys).toHaveCount(3);
  await page.keyboard.press('Control+Shift+z'); await expect(keys).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(keys).toHaveCount(3);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(keys).toHaveCount(2);
  await page.keyboard.press('Control+z'); await expect(keys).toHaveCount(3);
  const name = page.getByRole('textbox', { name: 'Object name' });
  await name.fill('Rename test'); await name.press('Home'); await name.press('Delete');
  await expect(keys).toHaveCount(3); await name.press('Tab');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(name).toHaveValue('Character A');
  await page.keyboard.press('Control+y'); await expect(name).toHaveValue('ename test');
  await page.keyboard.press('Control+z');
  await page.getByRole('button', { name: 'Color #7db9ce', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled();

  // A multi-move drag must require exactly one undo.
  const handle = page.getByRole('button', { name: 'Character A visibility start' });
  const box = await handle.boundingBox(); const tracks = await page.locator('.tracks').boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + tracks!.width / 5, box!.y + box!.height / 2, { steps: 12 }); await page.mouse.up();
  const start = page.getByRole('spinbutton', { name: 'Visible from (sec)' });
  await expect(start).toHaveValue('2'); await page.keyboard.press('Control+z'); await expect(start).toHaveValue('0');
  await page.keyboard.press('Control+y'); await expect(start).toHaveValue('2');
  await page.getByRole('button', { name: 'Camera 01 key at 0.00 seconds', exact: true }).click();
  await page.keyboard.press('Delete'); await expect(page.locator('.tracks .track').last().locator('.keyframe')).toHaveCount(1);
  await expect(page.getByRole('status')).toContainText('The last keyframe cannot be deleted');
  await page.locator('.asset-grid').getByRole('button', { name: 'Box', exact: true }).click();
  await expect(page.locator('.scene-list .object-row')).toHaveCount(5);
  await page.keyboard.press('Control+z'); await expect(page.locator('.scene-list .object-row')).toHaveCount(4);
  await page.keyboard.press('Control+y'); await expect(page.locator('.scene-list .object-row')).toHaveCount(5);
  expect(errors).toEqual([]);
});
