import { describe, expect, it } from 'vitest';
import { activeCamera, calculateResolution, composeObjectPose, createMotionPath, isObjectVisible, objectRange, newProject, removeCameraKey, reparentObject, sampleGroup, sampleObject, sampleCamera, upsert, upsertObjectKey, upsertCameraKey, parseProject, type ObjectKey, type SceneGroup } from '../src/model';
describe('scene and animation contract', () => {
  it('uses 24 fps by default and accepts only the output frame-rate presets', () => {
    const scene = newProject();
    expect(scene.fps).toBe(24);
    for (const fps of [17, 24, 30]) expect(parseProject({ ...scene, fps }).fps).toBe(fps);
    for (const fps of [16, 23.976, 60]) expect(() => parseProject({ ...scene, fps })).toThrow();
  });
  it('shows objects only in their half-open visibility interval, preserving keys', () => {
    const object = newProject(true).objects[0];
    expect(objectRange(object, 10)).toEqual({ start: 0, end: 10 });
    const keys = structuredClone(object.keyframes);
    object.visibility = { start: 2, end: 5 };
    expect([1.99, 2, 4.99, 5, 6].map(t => isObjectVisible(object, t, 10))).toEqual([false, true, true, false, false]);
    expect(object.keyframes).toEqual(keys);
  });
  it('round trips visibility and rejects invalid or reversed ranges', () => {
    const scene = newProject(true);
    scene.objects[0].visibility = { start: 2, end: 5 };
    const restored = parseProject(JSON.parse(JSON.stringify(scene)));
    expect(restored.objects[0].visibility).toEqual({ start: 2, end: 5 });
    expect(restored.objects[1].visibility).toBeUndefined();
    for (const visibility of [{ start: 5, end: 2 }, { start: 2, end: 2 }, { start: -1, end: 5 }, { start: 0, end: '5' }]) {
      expect(() => parseProject({ ...scene, objects: [{ ...scene.objects[0], visibility }] })).toThrow();
    }
  });
  it('interpolates positions and degree rotations, holding endpoints', () => {
    const keys = newProject(true).objects[0].keyframes;
    expect(sampleObject(keys, 2.5).position).toEqual([-1, 0, 0]);
    expect(sampleObject(keys, 2.5).rotation).toEqual([0, 42.5, 0]);
    expect(sampleObject(keys, 99).position).toEqual([1, 0, -1]);
  });
  it('evaluates editable motion paths and barrel roll without creating intermediate keys', () => {
    const start: ObjectKey = { time: 0, position: [0, 0, 0], rotation: [0, 0, 0] }, end: ObjectKey = { time: 4, position: [0, 0, 8], rotation: [0, 0, 0] };
    const arc = createMotionPath(start, end, 'arc'), arcKeys = [{ ...start, motion: arc }, end];
    expect(arc.controlPoints[0][1]).toBeGreaterThan(0);
    expect(sampleObject(arcKeys, 0).position).toEqual(start.position);
    expect(sampleObject(arcKeys, 2).position[1]).toBeGreaterThan(0);
    const barrelKeys = [{ ...start, motion: createMotionPath(start, end, 'barrel-roll') }, end];
    expect(sampleObject(barrelKeys, 2).rotation[2]).toBeCloseTo(180);
    expect(barrelKeys).toHaveLength(2);
  });
  it('round trips motion paths, rejects malformed paths, and preserves them when updating a key', () => {
    const scene = newProject(true), start = scene.objects[0].keyframes[0], end = scene.objects[0].keyframes[1];
    start.motion = createMotionPath(start, end, 'bezier');
    const restored = parseProject(JSON.parse(JSON.stringify(scene)));
    expect(restored.objects[0].keyframes[0].motion).toEqual(start.motion);
    expect(upsertObjectKey(restored.objects[0].keyframes, { ...start, position: [3, 2, 1], motion: undefined })[0].motion).toEqual(start.motion);
    const malformed = JSON.parse(JSON.stringify(scene)); malformed.objects[0].keyframes[0].motion.controlPoints = [[0, 0, 0]];
    expect(() => parseProject(malformed)).toThrow();
  });
  it('inserts sorted keys and replaces the same time', () => {
    expect(upsert([{ time: 2, v: 1 }, { time: 3, v: 2 }], { time: 2, v: 3 })).toEqual([{ time: 2, v: 3 }, { time: 3, v: 2 }]);
  });
  it('uses the selected key outgoing easing at exact boundaries', () => {
    const keys = newProject(true).objects[0].keyframes;
    keys[0].easing = 'ease-in'; keys[1].easing = 'ease-out';
    expect(sampleObject(keys, 5).easing).toBe('ease-out');
    expect(sampleObject(keys, 2.5).position[0]).toBe(-1.5);
  });
  it('round trips all scene fields and refuses malformed imports', () => {
    const scene = parseProject(newProject(true));
    expect(parseProject(JSON.parse(JSON.stringify(scene)))).toEqual(scene);
    expect(() => parseProject({ ...scene, version: 2 })).toThrow();
    expect(() => parseProject({ ...scene, objects: [{ ...scene.objects[0], keyframes: [] }] })).toThrow();
    expect(() => parseProject({ ...scene, objects: [{ ...scene.objects[0], asset: '../escape.glb' }] })).toThrow();
  });
  it('interpolates keyed camera field of view and preserves it in JSON', () => {
    const scene = newProject();
    scene.cameras[0].keyframes = [
      { time: 0, position: [0, 2, 8], target: [0, 1, 0], fov: 75 },
      { time: 4, position: [0, 2, 8], target: [0, 1, 0], fov: 25 },
    ];
    expect(sampleCamera(scene.cameras[0].keyframes, 2).fov).toBe(50);
    expect(parseProject(JSON.parse(JSON.stringify(scene))).cameras[0].keyframes).toEqual(scene.cameras[0].keyframes.map(key => ({ ...key, easing: 'linear' })));
    const split = upsertCameraKey(scene.cameras[0].keyframes, { ...sampleCamera(scene.cameras[0].keyframes, 2), time: 2 });
    expect(split).toHaveLength(3); expect(split[1].fov).toBe(50);
    expect(removeCameraKey(split, 2)).toHaveLength(2);
  });
  it('hard-cuts between cameras, prioritizes the earlier start, and leaves gaps unassigned', () => {
    const scene = newProject(); const first = scene.cameras[0]; first.range = { start: 0, end: 6 };
    scene.cameras.push({ ...structuredClone(first), id: 'camera-2', name: 'Camera 02', range: { start: 4, end: 8 } });
    expect(activeCamera(scene, 3)?.id).toBe('camera-1');
    expect(activeCamera(scene, 5)?.id).toBe('camera-1');
    expect(activeCamera(scene, 6)?.id).toBe('camera-2');
    expect(activeCamera(scene, 9)).toBeNull();
  });
  it('migrates legacy single-camera JSON to a full-duration camera track', () => {
    const current = newProject(); const legacy = { ...current, cameras: undefined, camera: { fov: 50, keyframes: current.cameras[0].keyframes } };
    const restored = parseProject(JSON.parse(JSON.stringify(legacy)));
    expect(restored.cameras).toHaveLength(1); expect(restored.cameras[0].range).toEqual({ start: 0, end: 10 });
  });
  it('calculates even output dimensions from aspect ratio and megapixels', () => {
    expect(calculateResolution('1:1 square', '1.0')).toEqual({ width: 1024, height: 1024 });
    const portrait = calculateResolution('9:16 portrait', '0.8');
    expect(portrait.width % 2).toBe(0); expect(portrait.height % 2).toBe(0); expect(portrait.height).toBeGreaterThan(portrait.width);
  });
  it('adds default scale and output controls when loading an older project', () => {
    const scene = newProject(true); const legacy = JSON.parse(JSON.stringify(scene)); delete legacy.output; delete legacy.groups; delete legacy.objects[0].scale; delete legacy.objects[0].uniformScale;
    const restored = parseProject(legacy);
    expect(restored.objects[0].scale).toEqual([1, 1, 1]); expect(restored.objects[0].uniformScale).toBe(1); expect(restored.output.aspectRatio).toBe('16:9 landscape'); expect(restored.groups).toEqual([]);
  });
  it('round trips groups and rejects duplicate membership', () => {
    const scene = newProject(true); scene.groups = [{ id: 'group-1', name: 'Cast', objectIds: ['character-a', 'character-b'], keyframes: [{ time: 0, position: [0, 0, 0], rotation: [0, 0, 0], easing: 'linear' }] }];
    expect(parseProject(JSON.parse(JSON.stringify(scene))).groups).toEqual(scene.groups);
    expect(() => parseProject({ ...scene, groups: [...scene.groups, { id: 'group-2', name: 'Duplicate', objectIds: ['character-a'] }] })).toThrow();
  });
  it('keeps grouped children rigid during parent rotation and preserves world poses when ungrouping', () => {
    const group: SceneGroup = { id: 'group-1', name: 'Pair', objectIds: ['a', 'b'], keyframes: [
      { time: 0, position: [0, 0, 0], rotation: [0, 0, 0] },
      { time: 10, position: [0, 0, 0], rotation: [0, 180, 0] },
    ] };
    const objects = [
      { id: 'a', name: 'A', asset: 'primitive:box', color: '#ffffff', scale: [1, 1, 1] as [number, number, number], uniformScale: 1, keyframes: [{ time: 0, position: [-2, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }] },
      { id: 'b', name: 'B', asset: 'primitive:box', color: '#ffffff', scale: [1, 1, 1] as [number, number, number], uniformScale: 1, keyframes: [{ time: 0, position: [2, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }] },
    ];
    const parent = sampleGroup(group.keyframes, 5), world = objects.map(object => composeObjectPose(sampleObject(object.keyframes, 5), parent));
    expect(Math.hypot(...world[0].position.map((value, index) => value - world[1].position[index]))).toBeCloseTo(4);
    expect(world[0].position[0]).toBeCloseTo(0); expect(Math.abs(world[0].position[2])).toBeCloseTo(2);
    const baked = objects.map(object => reparentObject(object, group, undefined, [5]));
    for (let index = 0; index < baked.length; index++) {
      const bakedPosition = composeObjectPose(sampleObject(baked[index].keyframes, 5)).position;
      bakedPosition.forEach((value, axis) => expect(value).toBeCloseTo(world[index].position[axis]));
    }
  });
  it('migrates legacy folder groups to parent tracks without changing world positions', () => {
    const legacy = newProject(true) as unknown as { groups: { id: string; name: string; objectIds: string[] }[]; objects: ReturnType<typeof newProject>['objects'] };
    const before = legacy.objects.slice(0, 2).map(object => sampleObject(object.keyframes, 0).position);
    legacy.groups = [{ id: 'legacy-group', name: 'Legacy', objectIds: legacy.objects.slice(0, 2).map(object => object.id) }];
    const migrated = parseProject(legacy), parent = sampleGroup(migrated.groups[0].keyframes, 0);
    const after = migrated.objects.slice(0, 2).map(object => composeObjectPose(sampleObject(object.keyframes, 0), parent).position);
    expect(after).toEqual(before); expect(migrated.groups[0].keyframes).toHaveLength(1);
  });
});
