import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDownToLine, Box, Camera, Check, ChevronDown, ChevronRight, Circle, Copy, Crosshair, Diamond, FilePlus2, Folder, FolderOpen, Grid2X2, Maximize, Move3D, Pause, Play, Plus, Pyramid, Repeat2, Rotate3D, Save, SkipBack, Square, Trash2, Triangle, UserRound, X, Cylinder, Film, HelpCircle } from 'lucide-react';
import models from 'virtual:models';
import { SceneEngine } from './engine';
import SceneTree from './SceneTree';
import VisibilityClip from './VisibilityClip';
import { useProjectHistory } from './useProjectHistory';
import { Undo2, Redo2 } from 'lucide-react';
import { activeCamera, aspectRatios, calculateResolution, composeObjectPose, fpsOptions, megapixels, objectRange, type VisibilityRange, clamp, newProject, palette, parseProject, primitives, removeCameraKey, reparentObject, sampleCamera, sampleGroup, sampleObject, upsert, upsertCameraKey, type AspectRatio, type CameraKey, type Ease, type Megapixels, type ObjectKey, type Project, type SceneCamera, type SceneGroup, type SceneObject, type Vec3 } from './model';
import { t } from './i18n';

const assetNames = [t('asset.mannequin'), t('asset.box'), t('asset.sphere'), t('asset.cylinder'), t('asset.triangle'), t('asset.tetrahedron')];
const aspectLabels = {
  '1:1 square': 'aspect.square', '3:4 portrait': 'aspect.portrait34', '5:8 portrait': 'aspect.portrait58', '9:16 portrait': 'aspect.portrait916', '9:21 portrait': 'aspect.portrait921',
  '4:3 landscape': 'aspect.landscape43', '3:2 landscape': 'aspect.landscape32', '16:9 landscape': 'aspect.landscape169', '21:9 landscape': 'aspect.landscape219',
} as const satisfies Record<AspectRatio, Parameters<typeof t>[0]>;
const assetIcons = [UserRound, Box, Circle, Cylinder, Triangle, Pyramid];
const STORAGE = 'frame-previs-v1';
const MAX_VISIBLE_KEY_MARKERS = 1000;
const TRACK_DRAG = 'application/x-frame-previs-track';
type ClipboardData = { kind: 'entities'; objects: SceneObject[]; cameras: SceneCamera[]; groups: SceneGroup[] } | { kind: 'keys'; entries: { id: string; key: ObjectKey | CameraKey }[] };
const add3 = (a: Vec3, b: Vec3): Vec3 => a.map((value, i) => value + b[i]) as Vec3;
const sub3 = (a: Vec3, b: Vec3): Vec3 => a.map((value, i) => value - b[i]) as Vec3;
function reorderById<T extends { id: string }>(items: T[], draggedId: string, targetId?: string, after = false): T[] {
  const dragged = items.find(item => item.id === draggedId); if (!dragged) return items;
  const next = items.filter(item => item.id !== draggedId); if (!targetId) return [...next, dragged];
  const targetIndex = next.findIndex(item => item.id === targetId); if (targetIndex < 0) return items;
  next.splice(targetIndex + (after ? 1 : 0), 0, dragged); return next;
}
function reorderManyById<T extends { id: string }>(items: T[], draggedIds: string[], targetId?: string, after = false): T[] {
  const ids = new Set(draggedIds), dragged = items.filter(item => ids.has(item.id));
  if (!dragged.length) return items;
  const next = items.filter(item => !ids.has(item.id));
  if (!targetId) return [...next, ...dragged];
  const targetIndex = next.findIndex(item => item.id === targetId);
  if (targetIndex < 0) return items;
  next.splice(targetIndex + (after ? 1 : 0), 0, ...dragged);
  return next;
}
function reparentTimes(project: Project, ...groups: (SceneGroup | undefined)[]): number[] {
  if (!groups.some(group => group && group.keyframes.length > 1)) return [];
  const frames = Math.ceil(project.duration * project.fps);
  return Array.from({ length: frames + 1 }, (_, index) => Math.min(index / project.fps, project.duration));
}
function rotateDirectionBetween(direction: Vec3, from: Vec3, to: Vec3): Vec3 {
  const length = (v: Vec3) => Math.hypot(...v), fromLength = length(from), toLength = length(to), directionLength = length(direction);
  if (!fromLength || !toLength || !directionLength) return direction;
  const a = from.map(value => value / fromLength) as Vec3, b = to.map(value => value / toLength) as Vec3;
  let q: [number, number, number, number] = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], 1 + a[0] * b[0] + a[1] * b[1] + a[2] * b[2]];
  if (q[3] < 0.000001) q = Math.abs(a[0]) < .9 ? [0, a[2], -a[1], 0] : [-a[2], 0, a[0], 0];
  const qLength = Math.hypot(...q); q = q.map(value => value / qLength) as typeof q;
  const [x, y, z, w] = q, [vx, vy, vz] = direction, tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + y * tz - z * ty, vy + w * ty + z * tx - x * tz, vz + w * tz + x * ty - y * tx];
}
function initialProject() { try { const saved = localStorage.getItem(STORAGE); return saved ? parseProject(JSON.parse(saved)) : newProject(true); } catch { return newProject(true); } }
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
const fileName = (name: string) => name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'scene';
function visibleKeyMarkers(keys: { time: number }[], duration: number, currentTime: number, selected: boolean): { time: number }[] {
  const visible = keys.filter(k => k.time <= duration);
  if (visible.length <= MAX_VISIBLE_KEY_MARKERS) return visible;
  const stride = Math.ceil(visible.length / MAX_VISIBLE_KEY_MARKERS);
  return visible.filter((key, index) => index === 0 || index === visible.length - 1 || index % stride === 0 || selected && Math.abs(key.time - currentTime) < 0.00001);
}
function NumberField({ label, value, onChange, min = -10000, max = 10000, step = 0.1, live = false }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; live?: boolean }) {
  const [draft, setDraft] = useState(String(Math.round(value * 1000) / 1000));
  useEffect(() => setDraft(String(Math.round(value * 1000) / 1000)), [value]);
  const commit = () => { const n = Number(draft); if (draft.trim() && Number.isFinite(n)) { const next = clamp(n, min, max); if (next !== value) onChange(next); } else setDraft(String(value)); };
  return <label className="number-field"><span>{label}</span><input aria-label={label} type="number" value={draft} min={min} max={max} step={step} onChange={e => { const text = e.target.value; setDraft(text); const n = Number(text); if (live && text.trim() && Number.isFinite(n) && n >= min && n <= max && n !== value) onChange(n); }} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>;
}
function VectorFields({ label, value, onChange, live = false, min, max, step }: { label: string; value: Vec3; onChange: (value: Vec3) => void; live?: boolean; min?: number; max?: number; step?: number }) {
  return <div className="vector-block"><div className="field-heading">{label}</div><div className="vector-fields">{['X', 'Y', 'Z'].map((axis, i) => <NumberField key={axis} label={`${label} ${axis}`} value={value[i]} live={live} min={min} max={max} step={step} onChange={v => { const next = [...value] as Vec3; next[i] = v; onChange(next); }} />)}</div></div>;
}
export default function App() {
  const { project, setProject, beginGroup, endGroup, undo, redo, canUndo, canRedo } = useProjectHistory(initialProject);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => [project.objects[0]?.id ?? project.cameras[0]?.id ?? ''].filter(Boolean));
  const [selectedKey, setSelectedKey] = useState<{ id: string; time: number } | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [mode, setMode] = useState<'translate' | 'rotate'>('translate');
  const [cameraView, setCameraView] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [saved, setSaved] = useState(true);
  const [ready, setReady] = useState(false);
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  const [groupDialog, setGroupDialog] = useState<{ objectIds: string[]; name: string } | null>(null);
  const [timelineDrop, setTimelineDrop] = useState<{ id: string; after: boolean } | null>(null);
  const [assetsCollapsed, setAssetsCollapsed] = useState(false);
  const [collapsedTimelineGroups, setCollapsedTimelineGroups] = useState<Set<string>>(() => new Set());
  const host = useRef<HTMLDivElement>(null), previewHost = useRef<HTMLDivElement>(null);
  const engine = useRef<SceneEngine | null>(null), input = useRef<HTMLInputElement>(null), abort = useRef<AbortController | null>(null);
  const previewDrag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const clipboard = useRef<ClipboardData | null>(null);
  const timelineDrag = useRef('');
  const selected = selectedIds[0] ?? '';
  const setSelected = useCallback((id: string) => { setSelectedIds(id ? [id] : []); setSelectedKey(null); }, []);
  const selectEntity = useCallback((id: string, additive = false) => { setSelectedKey(null); setSelectedIds(current => { if (!additive) return [id]; const { cameras, groups } = stateRef.current.project; if (groups.some(group => group.id === id) || current.some(value => groups.some(group => group.id === value))) return [id]; const sameType = !current.length || cameras.some(c => c.id === current[0]) === cameras.some(c => c.id === id); if (!sameType) return [id]; return current.includes(id) ? current.filter(value => value !== id) : [...current, id]; }); }, []);
  const stateRef = useRef({ project, selected, selectedIds, time, playing }); stateRef.current = { project, selected, selectedIds, time, playing };
  const object = project.objects.find(o => o.id === selected);
  const camera = project.cameras.find(c => c.id === selected);
  const group = project.groups.find(g => g.id === selected);
  const cameraSelected = !!camera;
  const liveCamera = activeCamera(project, time);
  const pose = object ? sampleObject(object.keyframes, time) : null;
  const groupPose = group ? sampleGroup(group.keyframes, time) : null;
  const cameraPose = camera ? sampleCamera(camera.keyframes, time) : null;
  const liveCameraPose = liveCamera ? sampleCamera(liveCamera.keyframes, time) : null;
  const updateKey = useCallback((id: string, key: ObjectKey | CameraKey) => {
    setPlaying(false);
    setProject(p => {
      const ids = stateRef.current.selectedIds.includes(id) ? stateRef.current.selectedIds : [id], at = key.time;
      const primaryObject = p.objects.find(object => object.id === id), primaryCamera = p.cameras.find(camera => camera.id === id);
      if (primaryObject) {
        const before = sampleObject(primaryObject.keyframes, at), next = key as ObjectKey, move = sub3(next.position, before.position), turn = sub3(next.rotation, before.rotation);
        return { ...p, objects: p.objects.map(object => { if (!ids.includes(object.id)) return object; const current = sampleObject(object.keyframes, at); return { ...object, keyframes: upsert(object.keyframes, object.id === id ? next : { ...current, position: add3(current.position, move), rotation: add3(current.rotation, turn) }) }; }) };
      }
      if (primaryCamera) {
        const before = sampleCamera(primaryCamera.keyframes, at), next = key as CameraKey, move = sub3(next.position, before.position), from = sub3(before.target, before.position), to = sub3(next.target, next.position);
        return { ...p, cameras: p.cameras.map(camera => { if (!ids.includes(camera.id)) return camera; const current = sampleCamera(camera.keyframes, at); if (camera.id === id) return { ...camera, keyframes: upsertCameraKey(camera.keyframes, next) }; const position = add3(current.position, move), direction = rotateDirectionBetween(sub3(current.target, current.position), from, to); return { ...camera, keyframes: upsertCameraKey(camera.keyframes, { ...current, position, target: add3(position, direction) }) }; }) };
      }
      return p;
    });
  }, [setProject]);
  const transformGroup = useCallback((id: string, key: ObjectKey) => {
    setPlaying(false); setProject(p => ({ ...p, groups: p.groups.map(group => group.id === id ? { ...group, keyframes: upsert(group.keyframes, key) } : group) }));
  }, [setProject]);
  useEffect(() => {
    try {
      engine.current = new SceneEngine(host.current!, previewHost.current!, new Map(models.map(m => [m.asset, m.url])), { select: selectEntity, transform: updateKey, transformGroup, toggleMode: () => setMode(current => current === 'translate' ? 'rotate' : 'translate'), error: setError, beginEdit: beginGroup, endEdit: endGroup });
      setReady(true);
    } catch (e) { setError(t('error.webgl', { detail: e instanceof Error ? e.message : '' })); }
    return () => { abort.current?.abort(); engine.current?.dispose(); };
  }, [updateKey, transformGroup, beginGroup, endGroup, selectEntity]);
  useEffect(() => {
    setSelectedIds(ids => { const valid = ids.filter(id => project.objects.some(o => o.id === id) || project.cameras.some(c => c.id === id) || project.groups.some(g => g.id === id)); if (valid.length) return valid.length === ids.length ? ids : valid; const fallback = project.cameras[0]?.id ?? project.objects[0]?.id; return fallback ? [fallback] : []; });
    setTime(t => Math.min(t, project.duration));
  }, [project]);
  useEffect(() => { engine.current?.sync(project, time, selected, selectedIds, mode, cameraView); }, [project, time, selected, selectedIds, mode, cameraView, ready]);
  useEffect(() => {
    setSaved(false); const timer = setTimeout(() => { try { localStorage.setItem(STORAGE, JSON.stringify(project)); setSaved(true); } catch { setError(t('error.autosave')); } }, 400);
    return () => clearTimeout(timer);
  }, [project]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now(); const from = stateRef.current.time >= project.duration ? 0 : stateRef.current.time; let raf = 0;
    const tick = (now: number) => { const t = from + (now - start) / 1000; if (t >= project.duration && !loop) { setTime(project.duration); setPlaying(false); return; } setTime(loop ? t % project.duration : t); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, project.duration]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (progress !== null || help || e.isComposing || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLElement && e.target.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key.toLowerCase() === 'z') { e.preventDefault(); setPlaying(false); e.shiftKey ? redo() : undo(); }
        if (e.key.toLowerCase() === 'y') { e.preventDefault(); setPlaying(false); redo(); }
        if (e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); }
        if (e.key.toLowerCase() === 'v') { e.preventDefault(); pasteSelection(); }
        return;
      }
      if (e.key === 'Delete' && !e.repeat) { e.preventDefault(); selectedKey ? deleteKey() : deleteSelection(); return; }
      if (e.code === 'Space') { e.preventDefault(); setPlaying(p => !p); }
      if (e.key.toLowerCase() === 'w') setMode('translate');
      if (e.key.toLowerCase() === 'e') setMode('rotate');
      if (e.key.toLowerCase() === 'f') engine.current?.focus();
    }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  }, [progress, help, project, selected, selectedIds, selectedKey, time, undo, redo]);
  const seek = (t: number) => { setPlaying(false); setSelectedKey(null); setTime(clamp(Math.round(t * project.fps) / project.fps, 0, project.duration)); };
  const changeObject = (patch: Partial<ObjectKey>) => { if (object && pose) updateKey(object.id, { ...pose, ...patch }); };
  const changeGroup = (patch: Partial<ObjectKey>) => { if (group && groupPose) transformGroup(group.id, { ...groupPose, ...patch }); };
  const changeCamera = (patch: Partial<CameraKey>) => { if (camera && cameraPose) updateKey(camera.id, { ...cameraPose, ...patch }); };
  function changeRange(id: string, visibility: VisibilityRange) {
    setPlaying(false);
    setProject(p => ({ ...p, objects: p.objects.map(o => o.id === id ? { ...o, visibility } : o), cameras: p.cameras.map(camera => camera.id === id ? { ...camera, range: visibility } : camera) }));
  }
  function changeOutput(next: Partial<Project['output']>) {
    setPlaying(false); setProject(p => { const output = { ...p.output, ...next }; return { ...p, output, resolution: calculateResolution(output.aspectRatio, output.megapixels) }; });
  }
  function beginPreviewMove(e: ReactPointerEvent<HTMLDivElement>) {
    const card = e.currentTarget.parentElement!; previewDrag.current = { x: e.clientX, y: e.clientY, left: card.offsetLeft, top: card.offsetTop }; e.currentTarget.setPointerCapture(e.pointerId);
  }
  function movePreview(e: ReactPointerEvent<HTMLDivElement>) {
    if (!previewDrag.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const card = e.currentTarget.parentElement!, area = card.parentElement!, drag = previewDrag.current;
    setPreviewPosition({ x: clamp(drag.left + e.clientX - drag.x, 0, Math.max(0, area.clientWidth - card.offsetWidth)), y: clamp(drag.top + e.clientY - drag.y, 0, Math.max(0, area.clientHeight - card.offsetHeight)) });
  }
  function endPreviewMove(e: ReactPointerEvent<HTMLDivElement>) { previewDrag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }
  function addObject(asset: string, name: string) {
    const id = crypto.randomUUID();
    setProject(p => ({ ...p, objects: [...p.objects, { id, name: `${name} ${p.objects.filter(o => o.asset === asset).length + 1}`, asset, color: palette[p.objects.length % palette.length], scale: [1, 1, 1], uniformScale: 1, keyframes: [{ time: 0, position: [0, 0, 0], rotation: [0, 0, 0] }] }] })); setSelected(id); setPlaying(false); setNotice(t('notice.added', { name }));
  }
  function addGroup() {
    const id = crypto.randomUUID(); setProject(p => ({ ...p, groups: [...p.groups, { id, name: `Group ${String(p.groups.length + 1).padStart(2, '0')}`, objectIds: [], keyframes: [{ time: 0, position: [0, 0, 0], rotation: [0, 0, 0] }] }] })); setSelected(id); setNotice(t('notice.groupAdded'));
  }
  function addGroupFromSelection() {
    const objectIds = selectedIds.filter(id => project.objects.some(object => object.id === id));
    if (objectIds.length >= 2) createGroup(objectIds, ''); else addGroup();
  }
  function createGroup(objectIds: string[], name: string) {
    if (objectIds.length < 2) return; const id = crypto.randomUUID(), cleanName = name.trim() || `Group ${String(project.groups.length + 1).padStart(2, '0')}`;
    setProject(p => {
      const members = objectIds.map(objectId => p.objects.find(object => object.id === objectId)).filter((object): object is SceneObject => !!object);
      const worldPositions = members.map(object => { const parent = p.groups.find(group => group.objectIds.includes(object.id)), local = sampleObject(object.keyframes, stateRef.current.time); return composeObjectPose(local, parent ? sampleGroup(parent.keyframes, stateRef.current.time) : undefined).position; });
      const pivot = worldPositions.length ? worldPositions.reduce<Vec3>((sum, position) => add3(sum, position), [0, 0, 0]).map(value => value / worldPositions.length) as Vec3 : [0, 0, 0] as Vec3;
      const nextGroup: SceneGroup = { id, name: cleanName, objectIds: members.map(object => object.id), keyframes: [{ time: 0, position: pivot, rotation: [0, 0, 0] }] };
      const memberIds = new Set(nextGroup.objectIds);
      return { ...p, objects: p.objects.map(object => { const from = p.groups.find(group => group.objectIds.includes(object.id)); return memberIds.has(object.id) ? reparentObject(object, from, nextGroup, reparentTimes(p, from, nextGroup)) : object; }), groups: [...p.groups.map(group => ({ ...group, objectIds: group.objectIds.filter(objectId => !memberIds.has(objectId)) })), nextGroup] };
    }); setGroupDialog(null); setSelected(id); setNotice(t('notice.groupCreated', { count: objectIds.length }));
  }
  function moveToGroup(objectIds: string[], groupId: string) {
    setProject(p => {
      const requested = new Set(objectIds), orderedIds = p.objects.filter(object => requested.has(object.id)).map(object => object.id), to = p.groups.find(group => group.id === groupId);
      if (!orderedIds.length || !to || orderedIds.every(id => to.objectIds.includes(id))) return p;
      const movedIds = new Set(orderedIds);
      let target = to;
      if (to.keyframes.length === 1) {
        const memberIds = new Set([...to.objectIds, ...orderedIds]);
        const memberObjects = p.objects.filter(value => memberIds.has(value.id));
        const worldPositions = memberObjects.map(value => { const parent = p.groups.find(group => group.objectIds.includes(value.id)); return composeObjectPose(sampleObject(value.keyframes, stateRef.current.time), parent ? sampleGroup(parent.keyframes, stateRef.current.time) : undefined).position; });
        const pivot = worldPositions.reduce<Vec3>((sum, position) => add3(sum, position), [0, 0, 0]).map(value => value / worldPositions.length) as Vec3;
        target = { ...to, keyframes: [{ ...to.keyframes[0], position: pivot }] };
      }
      const targetMemberIds = new Set(to.objectIds);
      const targetOrder = [...to.objectIds, ...orderedIds.filter(id => !targetMemberIds.has(id))];
      return { ...p, objects: p.objects.map(value => {
        const from = p.groups.find(group => group.objectIds.includes(value.id));
        if (movedIds.has(value.id) && from?.id !== target.id) return reparentObject(value, from, target, reparentTimes(p, from, target));
        if (targetMemberIds.has(value.id) && target !== to) return reparentObject(value, to, target);
        return value;
      }), groups: p.groups.map(group => group.id === groupId ? { ...target, objectIds: targetOrder } : { ...group, objectIds: group.objectIds.filter(id => !movedIds.has(id)) }) };
    }); setNotice(t('notice.movedToFolder'));
  }
  function moveToEnd(ids: string[]) {
    setProject(p => {
      const objectIds = ids.filter(id => p.objects.some(object => object.id === id));
      if (objectIds.length) { const moved = new Set(objectIds); return { ...p, objects: reorderManyById(p.objects.map(value => { const from = p.groups.find(group => group.objectIds.includes(value.id)); return moved.has(value.id) && from ? reparentObject(value, from, undefined, reparentTimes(p, from)) : value; }), objectIds), groups: p.groups.map(group => ({ ...group, objectIds: group.objectIds.filter(objectId => !moved.has(objectId)) })) }; }
      const cameraId = ids.find(id => p.cameras.some(camera => camera.id === id));
      return cameraId ? { ...p, cameras: reorderById(p.cameras, cameraId) } : p;
    }); setNotice(t('notice.reordered'));
  }
  function reorderEntity(draggedIds: string[], targetId: string, after: boolean) {
    if (draggedIds.includes(targetId)) return;
    setProject(p => {
      const objectIds = draggedIds.filter(id => p.objects.some(object => object.id === id));
      if (objectIds.length && p.objects.some(object => object.id === targetId)) {
        const moved = new Set(objectIds), targetGroup = p.groups.find(group => group.objectIds.includes(targetId));
        const groups = p.groups.map(group => { const ids = group.objectIds.filter(id => !moved.has(id)); if (group.id !== targetGroup?.id) return { ...group, objectIds: ids }; const index = ids.indexOf(targetId); ids.splice(index + (after ? 1 : 0), 0, ...objectIds); return { ...group, objectIds: ids }; });
        const objects = p.objects.map(object => { if (!moved.has(object.id)) return object; const sourceGroup = p.groups.find(group => group.objectIds.includes(object.id)); return sourceGroup?.id !== targetGroup?.id ? reparentObject(object, sourceGroup, targetGroup, reparentTimes(p, sourceGroup, targetGroup)) : object; });
        return { ...p, objects: reorderManyById(objects, objectIds, targetId, after), groups };
      }
      const cameraId = draggedIds.find(id => p.cameras.some(camera => camera.id === id));
      if (cameraId && p.cameras.some(camera => camera.id === targetId)) return { ...p, cameras: reorderById(p.cameras, cameraId, targetId, after) };
      return p;
    });
    setNotice(t('notice.reordered'));
  }
  function beginTimelineDrag(event: ReactDragEvent<HTMLButtonElement>, id: string) { timelineDrag.current = id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(TRACK_DRAG, id); }
  function overTimelineRow(event: ReactDragEvent<HTMLButtonElement>, id: string) { if (!timelineDrag.current || timelineDrag.current === id) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setTimelineDrop({ id, after: event.clientY >= rect.top + rect.height / 2 }); }
  function dropTimelineRow(event: ReactDragEvent<HTMLButtonElement>, id: string) { const draggedId = timelineDrag.current || event.dataTransfer.getData(TRACK_DRAG); if (draggedId && draggedId !== id) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); reorderEntity([draggedId], id, event.clientY >= rect.top + rect.height / 2); } timelineDrag.current = ''; setTimelineDrop(null); }
  const timelineOrderClass = (id: string) => timelineDrop?.id === id ? timelineDrop.after ? 'reorder-after' : 'reorder-before' : '';
  function removeGroup() { if (!group) return; setProject(p => ({ ...p, objects: p.objects.map(object => group.objectIds.includes(object.id) ? reparentObject(object, group, undefined, reparentTimes(p, group)) : object), groups: p.groups.filter(value => value.id !== group.id) })); setSelected(group.objectIds[0] ?? project.objects[0]?.id ?? project.cameras[0]?.id ?? ''); setNotice(t('notice.ungrouped')); }
  function addCamera() {
    const id = crypto.randomUUID(); const start = Math.min(time, Math.max(0, project.duration - 1 / project.fps));
    const source = liveCamera ?? camera ?? project.cameras[0];
    const key = source ? sampleCamera(source.keyframes, time) : { time, position: [6, 4, 9] as Vec3, target: [0, 1, -0.5] as Vec3, fov: 50, easing: 'linear' as Ease };
    setProject(p => ({ ...p, cameras: [...p.cameras.map(c => c.range.start <= start && start < c.range.end && c.range.start < start ? { ...c, range: { ...c.range, end: start } } : c), { id, name: `Camera ${String(p.cameras.length + 1).padStart(2, '0')}`, color: palette[(p.cameras.length + 2) % palette.length], range: { start, end: p.duration }, keyframes: [{ ...key, time: start }] }] }));
    setSelected(id); setPlaying(false); setNotice(t('notice.cameraCut', { time: start.toFixed(2) }));
  }
  function duplicate() {
    if (!object) return; const copy = structuredClone(object); copy.id = crypto.randomUUID(); copy.name += ' copy'; copy.keyframes.forEach(k => k.position[0] += 1);
    setProject(p => ({ ...p, objects: [...p.objects, copy] })); setSelected(copy.id);
  }
  function remove() { if (!object) return; setProject(p => ({ ...p, objects: p.objects.filter(o => o.id !== selected), groups: p.groups.map(group => ({ ...group, objectIds: group.objectIds.filter(id => id !== selected) })) })); setSelected(project.cameras[0]?.id ?? ''); }
  function removeCamera() { if (!camera) return; const next = project.cameras.filter(c => c.id !== camera.id); setProject(p => ({ ...p, cameras: p.cameras.filter(c => c.id !== camera.id) })); setSelected(next[0]?.id ?? project.objects[0]?.id ?? ''); }
  function copySelection() {
    if (!selectedIds.length) return;
    if (selectedKey) {
      const entries = selectedIds.flatMap(id => { const keys = project.objects.find(o => o.id === id)?.keyframes ?? project.cameras.find(c => c.id === id)?.keyframes ?? project.groups.find(g => g.id === id)?.keyframes; const key = keys?.find(k => Math.abs(k.time - selectedKey.time) < .00001); return key ? [{ id, key: structuredClone(key) }] : []; });
      if (entries.length) { clipboard.current = { kind: 'keys', entries }; setNotice(t('notice.keysCopied', { count: entries.length })); return; }
    }
    const groups = project.groups.filter(group => selectedIds.includes(group.id)), groupIds = new Set(groups.map(group => group.id)), objectIds = new Set([...selectedIds, ...groups.flatMap(group => group.objectIds)]);
    const data: Extract<ClipboardData, { kind: 'entities' }> = { kind: 'entities', objects: project.objects.filter(o => objectIds.has(o.id)).map(o => { const parent = project.groups.find(group => group.objectIds.includes(o.id)); return structuredClone(parent && !groupIds.has(parent.id) ? reparentObject(o, parent, undefined, reparentTimes(project, parent)) : o); }), cameras: project.cameras.filter(c => selectedIds.includes(c.id)).map(c => structuredClone(c)), groups: groups.map(group => structuredClone(group)) };
    clipboard.current = data; setNotice(t('notice.itemsCopied', { count: data.objects.length + data.cameras.length }));
  }
  function pasteSelection() {
    const data = clipboard.current; if (!data) { setNotice(t('notice.emptyClipboard')); return; } setPlaying(false);
    if (data.kind === 'keys') {
      setProject(p => ({ ...p, objects: p.objects.map(object => { const entry = data.entries.find(item => item.id === object.id && 'rotation' in item.key && !('target' in item.key)); return entry ? { ...object, keyframes: upsert(object.keyframes, { ...(entry.key as ObjectKey), time }) } : object; }), cameras: p.cameras.map(camera => { const entry = data.entries.find(item => item.id === camera.id && 'target' in item.key); return entry ? { ...camera, keyframes: upsertCameraKey(camera.keyframes, { ...(entry.key as CameraKey), time }) } : camera; }), groups: p.groups.map(group => { const entry = data.entries.find(item => item.id === group.id && 'rotation' in item.key && !('target' in item.key)); return entry ? { ...group, keyframes: upsert(group.keyframes, { ...(entry.key as ObjectKey), time }) } : group; }) }));
      setSelectedKey({ id: selected, time }); setNotice(t('notice.keyPasted', { time: time.toFixed(2) })); return;
    }
    const memberIds = new Set(data.groups.flatMap(group => group.objectIds)), idMap = new Map(data.objects.map(object => [object.id, crypto.randomUUID()]));
    const objectCopies = data.objects.map(source => { const copy = structuredClone(source); copy.id = idMap.get(source.id)!; copy.name += ' copy'; if (!memberIds.has(source.id)) copy.keyframes.forEach(key => key.position[0] += 1); return copy; });
    const groupCopies = data.groups.map(source => { const copy = structuredClone(source); copy.id = crypto.randomUUID(); copy.name += ' copy'; copy.objectIds = copy.objectIds.map(id => idMap.get(id)!).filter(Boolean); copy.keyframes.forEach(key => key.position[0] += 1); return copy; });
    const cameraCopies = data.cameras.map(source => { const copy = structuredClone(source); copy.id = crypto.randomUUID(); copy.name += ' copy'; copy.keyframes.forEach(key => { key.position[0] += 1; key.target[0] += 1; }); return copy; });
    setProject(p => ({ ...p, objects: [...p.objects, ...objectCopies], cameras: [...p.cameras, ...cameraCopies], groups: [...p.groups, ...groupCopies] })); setSelectedIds(groupCopies.length ? groupCopies.map(g => g.id) : [...objectCopies.map(o => o.id), ...cameraCopies.map(c => c.id)]); setSelectedKey(null); setNotice(t('notice.itemsPasted', { count: objectCopies.length + cameraCopies.length }));
  }
  function deleteSelection() {
    if (!selectedIds.length) return; const objectIds = new Set(project.objects.filter(object => selectedIds.includes(object.id)).map(object => object.id)); setPlaying(false); setProject(p => { const removedGroups = p.groups.filter(group => selectedIds.includes(group.id)); return { ...p, objects: p.objects.filter(o => !objectIds.has(o.id)).map(object => { const parent = removedGroups.find(group => group.objectIds.includes(object.id)); return parent ? reparentObject(object, parent, undefined, reparentTimes(p, parent)) : object; }), cameras: p.cameras.filter(c => !selectedIds.includes(c.id)), groups: p.groups.filter(group => !selectedIds.includes(group.id)).map(group => ({ ...group, objectIds: group.objectIds.filter(id => !objectIds.has(id)) })) }; }); setSelectedIds([]); setSelectedKey(null); setNotice(t('notice.itemsDeleted', { count: selectedIds.length }));
  }
  function addKey() { if (camera && cameraPose) updateKey(camera.id, cameraPose); else if (group && groupPose) transformGroup(group.id, groupPose); else if (pose) updateKey(selected, pose); setNotice(t('notice.keyAdded', { time: time.toFixed(2) })); }
  function deleteKey() {
    const at = selectedKey?.time ?? time, entities = [...project.objects, ...project.cameras, ...project.groups], matching = entities.filter(entity => selectedIds.includes(entity.id) && entity.keyframes.some(k => Math.abs(k.time - at) < .00001)), removable = new Set(matching.filter(entity => entity.keyframes.length > 1).map(entity => entity.id)); setPlaying(false);
    if (removable.size) setProject(p => ({ ...p, objects: p.objects.map(object => removable.has(object.id) ? { ...object, keyframes: object.keyframes.filter(k => Math.abs(k.time - at) > .00001) } : object), cameras: p.cameras.map(camera => removable.has(camera.id) ? { ...camera, keyframes: removeCameraKey(camera.keyframes, at) } : camera), groups: p.groups.map(group => removable.has(group.id) ? { ...group, keyframes: group.keyframes.filter(k => Math.abs(k.time - at) > .00001) } : group) }));
    setSelectedKey(null); setNotice(removable.size ? t('notice.keysDeleted', { count: removable.size }) : matching.length ? t('notice.lastKey') : t('notice.noKey'));
  }
  async function load(file?: File) {
    if (!file) return;
    try { if (file.size > 20_000_000) throw new Error(t('error.jsonTooLarge')); const next = parseProject(JSON.parse(await file.text())); setError(''); setProject(next); setSelected(next.objects[0]?.id ?? next.cameras[0]?.id ?? ''); seek(0); setNotice(t('notice.sceneLoaded')); }
    catch (e) { setError(e instanceof Error ? e.message : t('error.jsonLoad')); }
    if (input.current) input.current.value = '';
  }
  async function exportVideo() {
    if (!engine.current) return; setPlaying(false); setError(''); setProgress(0); abort.current = new AbortController();
    try { const blob = await engine.current.exportMP4(setProgress, abort.current.signal); download(blob, `${fileName(project.name)}.mp4`); setNotice(t('notice.videoExported')); }
    catch (e) { setError(e instanceof Error ? e.message : t('error.videoExport')); }
    finally { setProgress(null); abort.current = null; }
  }
  const selectedKeys = camera?.keyframes ?? group?.keyframes ?? object?.keyframes ?? [];
  const atKey = selectedKeys.some(k => Math.abs(k.time - time) < 0.00001);
  const groupedIds = new Set(project.groups.flatMap(value => value.objectIds));
  type TimelineRow = { id: string; name: string; color: string; keys: (ObjectKey | CameraKey)[]; range?: VisibilityRange; camera: boolean; group: boolean; nested: boolean };
  const objectTrack = (value: SceneObject, nested = false): TimelineRow => ({ id: value.id, name: value.name, color: value.color, keys: value.keyframes, range: objectRange(value, project.duration), camera: false, group: false, nested });
  const timelineRows: TimelineRow[] = [
    ...project.objects.filter(value => !groupedIds.has(value.id)).map(value => objectTrack(value)),
    ...project.groups.flatMap(value => [{ id: value.id, name: value.name, color: '#d7b787', keys: value.keyframes, camera: false, group: true, nested: false }, ...(collapsedTimelineGroups.has(value.id) ? [] : value.objectIds.map(id => project.objects.find(object => object.id === id)).filter((object): object is SceneObject => !!object).map(object => objectTrack(object, true)))]),
    ...project.cameras.map(value => ({ id: value.id, name: value.name, color: value.color, keys: value.keyframes, range: value.range, camera: true, group: false, nested: false })),
  ];
  return <div className="app" onFocusCapture={e => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) beginGroup(); }} onBlur={e => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) endGroup(); }}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Film size={20} /></span>FRAME<span className="brand-sub">PREVIS STUDIO</span></div>
      <div className="history-actions"><button className="icon-button" aria-label={t('top.undo')} title={`${t('top.undo')} (Ctrl+Z)`} disabled={!canUndo || progress !== null} onClick={() => { setPlaying(false); undo(); }}><Undo2 size={16} /></button><button className="icon-button" aria-label={t('top.redo')} title={`${t('top.redo')} (Ctrl+Y / Ctrl+Shift+Z)`} disabled={!canRedo || progress !== null} onClick={() => { setPlaying(false); redo(); }}><Redo2 size={16} /></button></div>
      <div className="file-actions"><button title={t('top.newTitle')} onClick={() => { const fresh = newProject(); setProject(fresh); setSelected(fresh.cameras[0].id); seek(0); setError(''); }}><FilePlus2 size={15} />{t('top.new')}</button><button onClick={() => input.current?.click()}><FolderOpen size={15} />{t('top.open')}</button><button onClick={() => { download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${fileName(project.name)}.json`); setNotice(t('notice.jsonSaved')); }}><Save size={15} />{t('top.save')}</button><input ref={input} type="file" accept=".json,application/json" hidden onChange={e => void load(e.target.files?.[0])} /></div>
      <div className="top-spacer" /><span className="local-status"><span />{t('top.local')}</span><button className="icon-button" aria-label={t('top.help')} onClick={() => setHelp(true)}><HelpCircle size={17} /></button><button className="export-button" disabled={!ready} onClick={() => void exportVideo()}><ArrowDownToLine size={16} />{t('top.export')}</button>
    </header>
    <div className="projectbar"><div className="project-title"><span className="project-index">01</span><input aria-label={t('project.name')} value={project.name} maxLength={100} onChange={e => setProject(p => ({ ...p, name: e.target.value }))} /><span className="saved-state">{saved ? <Check size={12} /> : <Circle size={9} />}{saved ? t('project.saved') : t('project.saving')}</span></div><div className="output-settings"><label><span>{t('project.ratio')}</span><select aria-label={t('project.aspect')} value={project.output.aspectRatio} onChange={e => changeOutput({ aspectRatio: e.target.value as AspectRatio })}>{aspectRatios.map(value => <option key={value} value={value}>{t(aspectLabels[value])}</option>)}</select></label><label><span>{t('project.size')}</span><select aria-label={t('project.megapixels')} value={project.output.megapixels} onChange={e => changeOutput({ megapixels: e.target.value as Megapixels })}>{megapixels.map(value => <option key={value} value={value}>{value} MP</option>)}</select></label><div className="format-tag">{project.resolution.width} × {project.resolution.height}<span> / </span><select aria-label={t('project.frameRate')} value={project.fps} onChange={e => setProject(p => ({ ...p, fps: Number(e.target.value) }))}>{fpsOptions.map(value => <option key={value} value={value}>{value}</option>)}</select> FPS<span> / </span>{project.duration}s</div></div></div>
    <main className="workspace">
      <aside className={`sidebar ${assetsCollapsed ? 'assets-collapsed' : ''}`}>
        <SceneTree project={project} selected={selected} selectedIds={selectedIds} onSelect={selectEntity} onAddCamera={addCamera} onAddGroup={addGroupFromSelection} onMoveToGroup={moveToGroup} onMoveToEnd={moveToEnd} onReorder={reorderEntity} />
        <section className={`assets-section ${assetsCollapsed ? 'collapsed' : ''}`}><div className="section-title"><span>{t('section.assets')}</span><button className={`assets-toggle ${assetsCollapsed ? '' : 'open'}`} aria-label={assetsCollapsed ? t('assets.open') : t('assets.close')} aria-expanded={!assetsCollapsed} onClick={() => setAssetsCollapsed(value => !value)}><Plus size={14} /></button></div>{!assetsCollapsed && <><div className="asset-grid">{primitives.map((asset, i) => { const Icon = assetIcons[i]; return <button className="asset-card" key={asset} onClick={() => addObject(asset, assetNames[i])}><Icon size={20} strokeWidth={1.2} /><span>{assetNames[i]}</span><Plus className="asset-plus" size={10} /></button>; })}</div><div className="external-title">{t('assets.external')} <span>{models.length}</span></div>{models.length ? <div className="external-assets">{models.map(m => <button key={m.asset} onClick={() => addObject(m.asset, m.name)} title={m.asset}><Box size={15} /><span>{m.name}</span><Plus size={13} /></button>)}</div> : <div className="asset-empty"><FolderOpen size={20} /><p>{t('assets.addGlb')}</p><small>{t('assets.folderHint')}<br />{t('assets.autoHint')}</small></div>}</>}</section>
        <div className="sidebar-bottom"><span className="status-dot" />{t(ready ? 'status.webglReady' : 'status.webglInitializing')}<span>v1.0</span></div>
      </aside>
      <section className="viewport-pane">
        <div className="viewport-toolbar"><div className="segmented"><button className={!cameraView ? 'active' : ''} onClick={() => setCameraView(false)}><Grid2X2 size={14} />{t('viewport.editor')}</button><button className={cameraView ? 'active' : ''} onClick={() => setCameraView(true)}><Camera size={14} />{t('viewport.camera')}</button></div><div className="view-tools"><button title={`${t('viewport.focus')} (F)`} aria-label={t('viewport.focus')} onClick={() => engine.current?.focus()}><Crosshair size={16} /></button><button title={t('viewport.maximize')} aria-label={t('viewport.maximize')} onClick={() => { const el = host.current?.parentElement; if (document.fullscreenElement) void document.exitFullscreen(); else void el?.requestFullscreen().catch(() => setNotice(t('notice.fullscreenUnavailable'))); }}><Maximize size={15} /></button></div></div>
        <div className="viewport-area"><div ref={host} className="canvas-host" onContextMenu={event => { event.preventDefault(); const objectIds = selectedIds.filter(id => project.objects.some(object => object.id === id)); if (objectIds.length >= 2) setGroupDialog({ objectIds, name: `Group ${String(project.groups.length + 1).padStart(2, '0')}` }); else setNotice(t('notice.selectForGroup')); }} /><div className="viewport-label"><span className={`live-dot ${liveCamera ? '' : 'off'}`} />{cameraView ? liveCamera?.name ?? t('viewport.noCamera') : t('viewport.perspective')}<span className="world-label">{t('viewport.world')}</span></div><div className="transform-tools"><button aria-label={t('viewport.translate')} title={`${t('viewport.translate')} (W)`} className={mode === 'translate' ? 'active' : ''} onClick={() => setMode('translate')}><Move3D size={19} /></button><button aria-label={t('viewport.rotate')} title={`${t('viewport.rotate')} (E)`} className={mode === 'rotate' ? 'active' : ''} onClick={() => setMode('rotate')}><Rotate3D size={19} /></button></div><div className="camera-preview" style={previewPosition ? { left: previewPosition.x, top: previewPosition.y, right: 'auto' } : undefined}><div className="preview-heading" title={t('viewport.previewMove')} onPointerDown={beginPreviewMove} onPointerMove={movePreview} onPointerUp={endPreviewMove} onPointerCancel={endPreviewMove} onDoubleClick={() => setPreviewPosition(null)}><Camera size={12} /><span>{liveCamera?.name ?? t('viewport.noCamera')}</span><span>{liveCameraPose ? `${liveCameraPose.fov.toFixed(0)}°` : t('viewport.black')}</span></div><div ref={previewHost} className="preview-canvas" /><div className="preview-footer"><span>{t(liveCamera ? 'viewport.livePreview' : 'viewport.unassigned')}</span><span>{project.resolution.width} × {project.resolution.height}</span></div></div><div className="viewport-hint">{t('viewport.hint')}<span>·</span>{t('viewport.middleToggle')}</div><div className="axis-widget"><span>Y</span><span>Z</span><span>X</span></div></div>
      </section>
      <aside className="inspector">
        <div className="section-title"><span>{t('section.inspector')}</span>{selectedIds.length > 1 ? <span className="count">{t('inspector.selected', { count: selectedIds.length })}</span> : group ? <Folder size={14} /> : camera ? <Camera size={14} /> : <Box size={14} />}</div>
        <div className="inspector-content"><div className="inspector-name">{group ? <><Folder size={18} /><input aria-label={t('inspector.groupName')} value={group.name} onChange={e => setProject(p => ({ ...p, groups: p.groups.map(value => value.id === group.id ? { ...value, name: e.target.value } : value) }))} /></> : camera ? <><Camera size={18} style={{ color: camera.color }} /><input aria-label={t('inspector.cameraName')} value={camera.name} onChange={e => setProject(p => ({ ...p, cameras: p.cameras.map(c => c.id === camera.id ? { ...c, name: e.target.value } : c) }))} /></> : object ? <><span className="object-dot large" style={{ background: object.color }} /><input aria-label={t('inspector.objectName')} value={object.name} onChange={e => setProject(p => ({ ...p, objects: p.objects.map(o => o.id === selected ? { ...o, name: e.target.value } : o) }))} /></> : <span>{t('inspector.empty')}</span>}</div>
        {group && <><div className="object-type">{t('inspector.groupType', { count: group.objectIds.length })}</div><p className="microcopy">{t('inspector.groupHelp')}</p></>}
        {object && <><div className="object-type">{object.asset.startsWith('primitive:') ? t('inspector.primitiveObject') : object.asset}</div><div className="color-line"><span>{t('inspector.color')}</span><div className="swatches">{palette.map(c => <button key={c} aria-label={t('inspector.colorAria', { color: c })} style={{ background: c }} className={object.color === c ? 'chosen' : ''} onClick={() => setProject(p => ({ ...p, objects: p.objects.map(o => o.id === selected ? { ...o, color: c } : o) }))} />)}</div><input type="color" aria-label={t('inspector.customColor')} value={object.color} onChange={e => setProject(p => ({ ...p, objects: p.objects.map(o => o.id === selected ? { ...o, color: e.target.value } : o) }))} /></div></>}
        {object && <><div className="inspector-divider" /><div className="subsection-title">{t('section.size')}<span>{t('inspector.scaleSummary')}</span></div><VectorFields label={t('inspector.scale')} value={object.scale} live min={0.001} max={1000} step={0.1} onChange={scale => setProject(p => ({ ...p, objects: p.objects.map(o => o.id === object.id ? { ...o, scale } : o) }))} /><NumberField label={t('inspector.uniformScale')} value={object.uniformScale} live min={0.001} max={1000} step={0.1} onChange={uniformScale => setProject(p => ({ ...p, objects: p.objects.map(o => o.id === object.id ? { ...o, uniformScale } : o) }))} /><p className="microcopy">{t('inspector.scaleHelp')}</p></>}
        {(pose || groupPose || cameraPose) && <><div className="inspector-divider" /><div className="subsection-title">{t('section.transform')} <span>{time.toFixed(2)}s</span></div><VectorFields label={t('inspector.position')} value={(cameraPose ?? groupPose ?? pose)!.position} onChange={position => cameraPose ? changeCamera({ position }) : groupPose ? changeGroup({ position }) : changeObject({ position })} /><VectorFields label={t(cameraPose ? 'inspector.target' : 'inspector.rotation')} value={cameraPose ? cameraPose.target : (groupPose ?? pose)!.rotation} onChange={value => cameraPose ? changeCamera({ target: value }) : groupPose ? changeGroup({ rotation: value }) : changeObject({ rotation: value })} />{cameraPose && <NumberField label={t('inspector.fovDegrees')} min={5} max={150} step={1} value={cameraPose.fov} onChange={fov => changeCamera({ fov })} />}<div className="inspector-divider" /><div className="subsection-title">{t('section.animation')}<span className="auto-key">{t('inspector.autoKey')}</span></div><label className="select-field"><span>{t('inspector.interpolation')}</span><select aria-label={t('inspector.interpolation')} value={(cameraPose ?? groupPose ?? pose)!.easing ?? 'linear'} onChange={e => cameraPose ? changeCamera({ easing: e.target.value as Ease }) : groupPose ? changeGroup({ easing: e.target.value as Ease }) : changeObject({ easing: e.target.value as Ease })}><option value="linear">{t('inspector.easeLinear')}</option><option value="ease-in">{t('inspector.easeIn')}</option><option value="ease-out">{t('inspector.easeOut')}</option><option value="ease-in-out">{t('inspector.easeInOut')}</option></select></label><div className="key-actions"><button className="key-button" onClick={addKey}><Diamond size={13} fill={atKey ? 'currentColor' : 'none'} />{t(atKey ? 'inspector.updateKey' : 'inspector.addKey')}</button><button aria-label={t('inspector.deleteCurrentKey')} title={t('inspector.deleteCurrentKey')} disabled={!atKey || selectedKeys.length <= 1} onClick={deleteKey}><Trash2 size={14} /></button></div><p className="microcopy">{t('inspector.autoKeyHelp')}</p></>}
        {cameraPose && <><div className="inspector-divider" /><div className="subsection-title">{t('section.cameraLens')}<span>{cameraPose.fov.toFixed(0)}°</span></div><label className="fov-slider"><span>{t('inspector.fov')}</span><input aria-label={t('inspector.fovSlider')} type="range" min="5" max="120" step="1" value={cameraPose.fov} onChange={e => changeCamera({ fov: Number(e.target.value) })} /></label><div className="fov-presets"><button onClick={() => changeCamera({ fov: 75 })}>{t('inspector.wide')}</button><button onClick={() => changeCamera({ fov: 50 })}>{t('inspector.standard')}</button><button onClick={() => changeCamera({ fov: 25 })}>{t('inspector.telephoto')}</button></div><p className="microcopy">{t('inspector.fovHelp')}</p></>}
        {object && <div className="object-actions"><button onClick={duplicate}><Copy size={14} />{t('inspector.duplicate')}</button><button onClick={remove}><Trash2 size={14} />{t('common.delete')}</button></div>}
        {camera && <div className="object-actions"><button onClick={addCamera}><Plus size={14} />{t('inspector.cutNow')}</button><button onClick={removeCamera}><Trash2 size={14} />{t('inspector.deleteCamera')}</button></div>}
        {group && <div className="object-actions"><button onClick={removeGroup}><Folder size={14} />{t('inspector.ungroup')}</button></div>}
        </div>
      </aside>
    </main>
    <section className="timeline"><div className="timeline-toolbar"><div className="timeline-title"><span>{t('section.timeline')}</span><small>{t('timeline.tracks', { count: project.objects.length + project.cameras.length + project.groups.length })}</small></div><div className="transport"><button aria-label={t('timeline.first')} onClick={() => seek(0)}><SkipBack size={15} /></button><button className="play-button" aria-label={t(playing ? 'timeline.pause' : 'timeline.play')} onClick={() => setPlaying(p => !p)}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button><button aria-label={t('timeline.stop')} onClick={() => seek(0)}><Square size={12} /></button><button aria-label={t('timeline.loop')} aria-pressed={loop} className={loop ? 'loop-on' : ''} onClick={() => setLoop(p => !p)}><Repeat2 size={17} /></button><span className="timecode">{String(Math.floor(time / 60)).padStart(2, '0')}:{String(Math.floor(time % 60)).padStart(2, '0')}<b>:{String(Math.floor((time % 1) * project.fps)).padStart(2, '0')}</b></span></div><div className="duration-setting"><span>{t('timeline.duration')}</span><NumberField label={t('timeline.durationSeconds')} min={0.1} max={600} step={1} value={project.duration} onChange={duration => { setPlaying(false); setProject(p => ({ ...p, duration })); setTime(t => Math.min(t, duration)); }} /><span>{t('common.seconds')}</span></div></div>
      <div className="timeline-body"><div className="track-labels"><div className="track-label-top">{t('timeline.trackHeader')}</div>{timelineRows.map(row => <button draggable={!row.group} key={row.id} className={`${selectedIds.includes(row.id) ? 'selected' : ''} ${selected === row.id ? 'primary' : ''} ${row.group ? 'group-track-label' : ''} ${row.nested ? 'nested' : ''} ${timelineOrderClass(row.id)}`} onDragStart={event => { if (!row.group) beginTimelineDrag(event, row.id); }} onDragOver={event => { if (!row.group) overTimelineRow(event, row.id); }} onDrop={event => { if (!row.group) dropTimelineRow(event, row.id); }} onDragEnd={() => { timelineDrag.current = ''; setTimelineDrop(null); }} onClick={e => selectEntity(row.id, e.shiftKey)}>{row.group ? <><span className="timeline-disclosure" role="button" aria-label={collapsedTimelineGroups.has(row.id) ? 'Expand group track' : 'Collapse group track'} onClick={event => { event.stopPropagation(); setCollapsedTimelineGroups(current => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; }); }}>{collapsedTimelineGroups.has(row.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</span><Folder size={13} /></> : row.camera ? <Camera size={13} style={{ color: row.color }} /> : <span className="object-dot" style={{ background: row.color }} />}<span>{row.name}</span></button>)}</div><div className="tracks" onPointerDown={e => { if ((e.target as HTMLElement).closest('.keyframe,.visibility-handle')) return; e.currentTarget.setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * project.duration); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * project.duration); } }} onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}><div className="ruler">{Array.from({ length: 11 }, (_, i) => <span key={i} style={{ left: `${i * 10}%` }}>{(project.duration * i / 10).toFixed(project.duration < 10 ? 1 : 0)}s</span>)}</div>{timelineRows.map(track => <div className={`track ${selectedIds.includes(track.id) ? 'selected' : ''} ${selected === track.id ? 'primary' : ''} ${track.camera && liveCamera?.id === track.id ? 'live-camera-track' : ''} ${track.group ? 'group-track' : ''} ${track.nested ? 'nested' : ''}`} key={track.id}>{track.range && <VisibilityClip onBegin={beginGroup} onEnd={endGroup} range={track.range} duration={project.duration} fps={project.fps} color={track.color} name={track.name} onChange={range => changeRange(track.id, range)} />}<div className="track-line" style={{ background: track.color, left: `${clamp(track.keys[0].time / project.duration * 100, 0, 100)}%`, width: `${clamp((Math.min(track.keys.at(-1)!.time, project.duration) - track.keys[0].time) / project.duration * 100, 0, 100)}%` }} />{visibleKeyMarkers(track.keys, project.duration, time, selectedIds.includes(track.id)).map(k => <button key={k.time} className={`keyframe ${track.range && (k.time < track.range.start || k.time >= track.range.end) ? 'outside-range' : ''} ${selectedKey?.id === track.id && Math.abs(selectedKey.time - k.time) < 0.00001 ? 'current' : ''}`} style={{ left: `${k.time / project.duration * 100}%`, color: track.color }} aria-label={t('timeline.keyAria', { name: track.name, time: k.time.toFixed(2) })} title={t('timeline.keyTitle', { time: k.time.toFixed(2) })} onPointerDown={e => e.stopPropagation()} onClick={e => { selectEntity(track.id, e.shiftKey); setSelectedKey({ id: track.id, time: k.time }); setPlaying(false); setTime(k.time); }}><Diamond size={11} fill="currentColor" /></button>)}</div>)}<div className="playhead" style={{ left: `${time / project.duration * 100}%` }}><span /></div></div></div>
      <div className="timeline-footer"><span><Diamond size={10} />{t('timeline.footerLeft')}</span><span>{t('timeline.footerRight')}</span></div>
    </section>
    {notice && <div className="toast" role="status"><Check size={15} />{notice}</div>}
    {error && <div className="error-toast" role="alert"><span>{error}</span><button aria-label={t('common.cancel')} onClick={() => setError('')}><X size={16} /></button></div>}
    {groupDialog && <div className="modal-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) setGroupDialog(null); }}><form className="modal group-dialog" onSubmit={event => { event.preventDefault(); createGroup(groupDialog.objectIds, groupDialog.name); }}><span className="modal-eyebrow">{t('group.eyebrow')}</span><h2>{t('group.title')}</h2><p>{t('group.description', { count: groupDialog.objectIds.length })}</p><label><span>{t('inspector.groupName')}</span><input autoFocus aria-label={t('group.newName')} value={groupDialog.name} onChange={event => setGroupDialog(value => value ? { ...value, name: event.target.value } : null)} /></label><div className="dialog-actions"><button type="button" onClick={() => setGroupDialog(null)}>{t('common.cancel')}</button><button className="export-button" type="submit">{t('group.create')}</button></div></form></div>}
    {progress !== null && <div className="modal-backdrop"><div className="modal"><span className="modal-eyebrow">{t('export.eyebrow')}</span><h2>{t('export.title')}</h2><p>{project.resolution.width} × {project.resolution.height} · {project.fps} fps · H.264 / MP4</p><div className="progress-track"><div style={{ width: `${progress * 100}%` }} /></div><div className="progress-label"><span>{t('export.rendering')}</span><b>{Math.round(progress * 100)}%</b></div><button onClick={() => abort.current?.abort()}>{t('common.cancel')}</button></div></div>}
    {help && <div className="modal-backdrop"><div className="modal help-modal"><button className="modal-close" aria-label={t('help.close')} onClick={() => setHelp(false)}><X size={18} /></button><span className="modal-eyebrow">{t('help.eyebrow')}</span><h2>{t('help.title')}</h2><ol>{Array.from({ length: 8 }, (_, index) => <li key={index}>{t(`help.step${index + 1}` as Parameters<typeof t>[0])}</li>)}</ol><p>{t('help.copy')}</p><p>{t('help.camera')}</p><p>{t('help.save')}</p><p>{t('help.glb')}</p><button className="export-button" onClick={() => setHelp(false)}>{t('help.start')}</button></div></div>}
  </div>;
}
