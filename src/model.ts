export type Vec3 = [number, number, number];
export type Ease = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
export type ObjectKey = { time: number; position: Vec3; rotation: Vec3; easing?: Ease };
export type CameraKey = { time: number; position: Vec3; target: Vec3; fov: number; easing?: Ease };
export type VisibilityRange = { start: number; end: number };
export type SceneObject = { id: string; name: string; asset: string; color: string; keyframes: ObjectKey[]; scale: Vec3; uniformScale: number; visibility?: VisibilityRange };
export type SceneCamera = { id: string; name: string; color: string; keyframes: CameraKey[]; range: VisibilityRange };
export type SceneGroup = { id: string; name: string; objectIds: string[] };
export const objectRange = (object: SceneObject, duration: number): VisibilityRange => object.visibility ?? { start: 0, end: duration };
export function isObjectVisible(object: SceneObject, time: number, duration: number): boolean {
  const { start, end } = objectRange(object, duration);
  return time >= start && time < end;
}
export const aspectRatios = ['1:1 square', '3:4 portrait', '5:8 portrait', '9:16 portrait', '9:21 portrait', '4:3 landscape', '3:2 landscape', '16:9 landscape', '21:9 landscape'] as const;
export const megapixels = ['0.2', '0.4', '0.6', '0.8', '1.0'] as const;
export type AspectRatio = typeof aspectRatios[number];
export type Megapixels = typeof megapixels[number];
export type Project = { version: 1; name: string; duration: number; fps: number; resolution: { width: number; height: number }; output: { aspectRatio: AspectRatio; megapixels: Megapixels }; objects: SceneObject[]; cameras: SceneCamera[]; groups: SceneGroup[] };
export const primitives = ['primitive:mannequin', 'primitive:box', 'primitive:sphere', 'primitive:cylinder', 'primitive:triangle', 'primitive:tetrahedron'];
export const palette = ['#eaa36b', '#7db9ce', '#a6c88a', '#d99cba', '#d8cb83', '#b0a1d8'];
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => a.map((v, i) => lerp(v, b[i], t)) as Vec3;
export function transformAroundCenter(poses: ObjectKey[], move: Vec3, turn: Vec3): ObjectKey[] {
  if (!poses.length) return [];
  const add = (a: Vec3, b: Vec3): Vec3 => a.map((value, i) => value + b[i]) as Vec3;
  const center = poses.reduce<Vec3>((sum, pose) => add(sum, pose.position), [0, 0, 0]).map(value => value / poses.length) as Vec3;
  const [rx, ry, rz] = turn.map(value => value * Math.PI / 180), cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const rotate = ([x, y, z]: Vec3): Vec3 => { const x1 = x, y1 = y * cx - z * sx, z1 = y * sx + z * cx, x2 = x1 * cy + z1 * sy, y2 = y1, z2 = -x1 * sy + z1 * cy; return [x2 * cz - y2 * sz, x2 * sz + y2 * cz, z2]; };
  return poses.map(pose => ({ ...pose, position: add(add(center, rotate(pose.position.map((value, i) => value - center[i]) as Vec3)), move), rotation: add(pose.rotation, turn) }));
}
function ratioParts(value: string): [number, number] { const match = /^(\d+):(\d+)/.exec(value); return match ? [Number(match[1]), Number(match[2])] : [1, 1]; }
function roundHalfEven(value: number): number { const lower = Math.floor(value), fraction = value - lower; if (fraction < .5) return lower; if (fraction > .5) return lower + 1; return lower % 2 === 0 ? lower : lower + 1; }
export function calculateResolution(aspectRatio: AspectRatio, megapixelValue: Megapixels): { width: number; height: number } {
  const [wRatio, hRatio] = ratioParts(aspectRatio), total = Number(megapixelValue) * 1024 * 1024, scale = Math.sqrt(total / (wRatio * hRatio));
  return { width: roundHalfEven(wRatio * scale / 2) * 2, height: roundHalfEven(hRatio * scale / 2) * 2 };
}
function inferOutput(width: number, height: number): Project['output'] {
  const ratio = width / height;
  const aspectRatio = aspectRatios.reduce((best, value) => { const [w, h] = ratioParts(value); const [bw, bh] = ratioParts(best); return Math.abs(w / h - ratio) < Math.abs(bw / bh - ratio) ? value : best; });
  const mp = width * height / (1024 * 1024);
  const megapixelValue = megapixels.reduce((best, value) => Math.abs(Number(value) - mp) < Math.abs(Number(best) - mp) ? value : best);
  return { aspectRatio, megapixels: megapixelValue };
}
export const ease = (t: number, e: Ease = 'linear') => e === 'ease-in' ? t * t : e === 'ease-out' ? 1 - (1 - t) ** 2 : e === 'ease-in-out' ? t * t * (3 - 2 * t) : t;
function interval<T extends { time: number; easing?: Ease }>(keys: T[], time: number): [T, T, number] {
  if (time <= keys[0].time) return [keys[0], keys[0], 0];
  for (let i = 1; i < keys.length; i++) if (time < keys[i].time) return [keys[i - 1], keys[i], ease((time - keys[i - 1].time) / (keys[i].time - keys[i - 1].time), keys[i - 1].easing)];
  return [keys[keys.length - 1], keys[keys.length - 1], 0];
}
export function sampleObject(keys: ObjectKey[], time: number): ObjectKey {
  const [a, b, t] = interval(keys, time);
  return { time, position: mix3(a.position, b.position, t), rotation: mix3(a.rotation, b.rotation, t), easing: a.easing ?? 'linear' };
}
export function sampleCamera(keys: CameraKey[], time: number): CameraKey {
  const [a, b, t] = interval(keys, time);
  return { time, position: mix3(a.position, b.position, t), target: mix3(a.target, b.target, t), fov: lerp(a.fov, b.fov, t), easing: a.easing ?? 'linear' };
}
export function upsert<T extends { time: number }>(keys: T[], key: T): T[] {
  return [...keys.filter(k => Math.abs(k.time - key.time) > 0.00001), structuredClone(key)].sort((a, b) => a.time - b.time);
}
export function upsertCameraKey(keys: CameraKey[], key: CameraKey): CameraKey[] {
  return upsert(keys, key);
}
export function removeCameraKey(keys: CameraKey[], time: number): CameraKey[] {
  return keys.filter(key => Math.abs(key.time - time) > 0.00001);
}
export function activeCamera(project: Project, time: number): SceneCamera | null {
  let winner: SceneCamera | null = null;
  for (const camera of project.cameras) {
    if (time < camera.range.start || time >= camera.range.end) continue;
    if (!winner || camera.range.start < winner.range.start) winner = camera;
  }
  return winner;
}
export function newProject(demo = false): Project {
  const first: ObjectKey = { time: 0, position: [-2, 0, 0], rotation: [0, 25, 0] };
  const output = { aspectRatio: '16:9 landscape' as const, megapixels: '0.8' as const };
  return { version: 1, name: demo ? 'First encounter' : 'Untitled scene', duration: 10, fps: 30, resolution: calculateResolution(output.aspectRatio, output.megapixels), output, objects: demo ? [
    { id: 'character-a', name: 'Character A', asset: primitives[0], color: palette[0], scale: [1, 1, 1], uniformScale: 1, keyframes: [first, { ...first, time: 5, position: [0, 0, 0], rotation: [0, 60, 0] }, { ...first, time: 10, position: [1, 0, -1], rotation: [0, 90, 0] }] },
    { id: 'character-b', name: 'Character B', asset: primitives[0], color: palette[1], scale: [1, 1, 1], uniformScale: 1, keyframes: [{ time: 0, position: [2, 0, -1], rotation: [0, -55, 0] }, { time: 10, position: [2, 0, -1], rotation: [0, -55, 0] }] },
    { id: 'box-a', name: 'Box', asset: primitives[1], color: palette[2], scale: [1, 1, 1], uniformScale: 1, keyframes: [{ time: 0, position: [-2.5, 0, -3], rotation: [0, 15, 0] }] },
  ] : [], cameras: [{ id: 'camera-1', name: 'Camera 01', color: '#b6c797', range: { start: 0, end: 10 }, keyframes: [{ time: 0, position: [6, 4, 9], target: [0, 1, -0.5], fov: 50 }] }], groups: [] };
}

export function parseProject(raw: unknown): Project {
  const fail = (message: string): never => { throw new Error(`JSONを読み込めません: ${message}`); };
  const record = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) return fail('オブジェクト形式が不正です。'); return v as Record<string, unknown>; };
  const number = (v: unknown, min = -1e6, max = 1e6): number => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return fail('数値が範囲外です。'); return v; };
  const vector = (v: unknown): Vec3 => { if (!Array.isArray(v) || v.length !== 3) return fail('XYZは3要素の配列が必要です。'); return v.map(x => number(x)) as Vec3; };
  const str = (v: unknown): string => typeof v === 'string' && v.length > 0 && v.length <= 500 ? v : fail('文字列が不正です。');
  const p = record(raw);
  if (p.version !== 1) fail('対応するversionは1です。');
  const duration = number(p.duration, 0.1, 600);
  const fps = number(p.fps, 1, 60);
  if (!Number.isInteger(fps)) fail('FPSは整数にしてください。');
  const res = record(p.resolution);
  const width = number(res.width, 16, 3840), height = number(res.height, 16, 2160);
  if (width % 2 || height % 2) fail('解像度は偶数にしてください。');
  const keys = (v: unknown, camera: boolean): (ObjectKey | CameraKey)[] => {
    if (!Array.isArray(v) || !v.length || v.length > 20000) return fail('キーフレームが必要です（上限20,000）。');
    const result = v.map(value => { const k = record(value); const time = number(k.time, 0, 600); const position = vector(k.position); const easing = k.easing ?? 'linear';
      if (!['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(easing as string)) fail('補間方式が不正です。');
      if (!camera) return { time, position, rotation: vector(k.rotation), easing: easing as Ease };
      return { time, position, target: vector(k.target), fov: number(k.fov, 5, 150), easing: easing as Ease };
    }).sort((a, b) => a.time - b.time);
    if (result.some((k, i) => i && Math.abs(k.time - result[i - 1].time) < 0.00001)) fail('同じ時刻のキーが重複しています。');
    return result;
  };
  if (!Array.isArray(p.objects) || p.objects.length > 500) return fail('objects配列が不正です（上限500）。');
  const objects = p.objects.map(value => { const o = record(value); const asset = str(o.asset); const color = str(o.color);
    if (!primitives.includes(asset) && (!/\.glb$/i.test(asset) || asset.startsWith('/') || asset.includes('..') || asset.includes(':') || asset.includes('\\'))) fail('GLB相対パスが不正です。');
    if (!/^#[0-9a-f]{6}$/i.test(color)) fail('色は#RRGGBBで指定してください。');
    let visibility: VisibilityRange | undefined;
    if (o.visibility !== undefined) {
      const range = record(o.visibility);
      visibility = { start: number(range.start, 0, 600), end: number(range.end, 0, 600) };
      if (visibility.end <= visibility.start) fail('表示終了は表示開始より後にしてください。');
    }
    const scale = o.scale === undefined ? [1, 1, 1] as Vec3 : vector(o.scale);
    if (scale.some(value => value <= 0 || value > 1000)) fail('スケールは0より大きく1000以下にしてください。');
    const uniformScale = o.uniformScale === undefined ? 1 : number(o.uniformScale, 0.001, 1000);
    return { id: str(o.id), name: str(o.name), asset, color, scale, uniformScale, keyframes: keys(o.keyframes, false) as ObjectKey[], ...(visibility ? { visibility } : {}) };
  });
  if (new Set(objects.map(o => o.id)).size !== objects.length) fail('オブジェクトIDが重複しています。');
  const cameraValues = Array.isArray(p.cameras) ? p.cameras : p.camera !== undefined ? [{ id: 'camera-1', name: 'Camera 01', color: '#b6c797', range: { start: 0, end: duration }, keyframes: record(p.camera).keyframes }] : [];
  if (cameraValues.length > 50) fail('カメラは50台までです。');
  const cameras = cameraValues.map((value, index) => {
    const c = record(value); const rangeValue = c.range === undefined ? { start: 0, end: duration } : record(c.range);
    const range = { start: number(rangeValue.start, 0, 600), end: number(rangeValue.end, 0, 600) };
    if (range.end <= range.start) fail('カメラの終了は開始より後にしてください。');
    return { id: str(c.id), name: str(c.name), color: typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : palette[(index + 2) % palette.length], range, keyframes: keys(c.keyframes, true) as CameraKey[] };
  });
  const ids = [...objects.map(o => o.id), ...cameras.map(c => c.id)];
  if (new Set(ids).size !== ids.length) fail('オブジェクトまたはカメラのIDが重複しています。');
  const rawGroups = p.groups === undefined ? [] : p.groups;
  if (!Array.isArray(rawGroups) || rawGroups.length > 100) fail('groups配列が不正です（上限100）。');
  const groupValues = rawGroups as unknown[];
  const assigned = new Set<string>();
  const groups = groupValues.map(value => {
    const g = record(value), rawObjectIds = g.objectIds;
    if (!Array.isArray(rawObjectIds)) fail('グループのobjectIdsが不正です。');
    const objectIds = (rawObjectIds as unknown[]).map(str);
    if (new Set(objectIds).size !== objectIds.length || objectIds.some(id => !objects.some(o => o.id === id) || assigned.has(id))) fail('グループ内のオブジェクトIDが不正または重複しています。');
    objectIds.forEach(id => assigned.add(id));
    return { id: str(g.id), name: str(g.name), objectIds };
  });
  if (new Set([...ids, ...groups.map(g => g.id)]).size !== ids.length + groups.length) fail('グループIDが重複しています。');
  const outputValue = p.output === undefined ? inferOutput(width, height) : record(p.output);
  const aspectRatio = aspectRatios.includes(outputValue.aspectRatio as AspectRatio) ? outputValue.aspectRatio as AspectRatio : fail('出力比率が不正です。');
  const megapixelValue = megapixels.includes(outputValue.megapixels as Megapixels) ? outputValue.megapixels as Megapixels : fail('出力サイズが不正です。');
  return { version: 1, name: typeof p.name === 'string' ? p.name.slice(0, 100) : 'Imported scene', duration, fps, resolution: { width, height }, output: { aspectRatio, megapixels: megapixelValue }, objects, cameras, groups };
}
