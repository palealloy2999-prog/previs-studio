import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDownToLine, Box, Camera, Check, Circle, Copy, Crosshair, Diamond, FilePlus2, Folder, FolderOpen, Grid2X2, Maximize, Move3D, Pause, Play, Plus, Pyramid, Repeat2, Rotate3D, Save, SkipBack, Square, Trash2, Triangle, UserRound, X, Cylinder, Film, HelpCircle } from 'lucide-react';
import models from 'virtual:models';
import { SceneEngine } from './engine';
import SceneTree from './SceneTree';
import VisibilityClip from './VisibilityClip';
import { useProjectHistory } from './useProjectHistory';
import { Undo2, Redo2 } from 'lucide-react';
import { activeCamera, aspectRatios, calculateResolution, isObjectVisible, megapixels, objectRange, type VisibilityRange, clamp, newProject, palette, parseProject, primitives, removeCameraKey, sampleCamera, sampleObject, transformAroundCenter, upsert, upsertCameraKey, type AspectRatio, type CameraKey, type Ease, type Megapixels, type ObjectKey, type Project, type SceneCamera, type SceneObject, type Vec3 } from './model';

const assetNames = ['Mannequin', 'Box', 'Sphere', 'Cylinder', '三角形', '四面体'];
const assetIcons = [UserRound, Box, Circle, Cylinder, Triangle, Pyramid];
const STORAGE = 'frame-previs-v1';
const MAX_VISIBLE_KEY_MARKERS = 1000;
const TRACK_DRAG = 'application/x-frame-previs-track';
type ClipboardData = { kind: 'entities'; objects: SceneObject[]; cameras: SceneCamera[] } | { kind: 'keys'; entries: { id: string; key: ObjectKey | CameraKey }[] };
const add3 = (a: Vec3, b: Vec3): Vec3 => a.map((value, i) => value + b[i]) as Vec3;
const sub3 = (a: Vec3, b: Vec3): Vec3 => a.map((value, i) => value - b[i]) as Vec3;
function reorderById<T extends { id: string }>(items: T[], draggedId: string, targetId?: string, after = false): T[] {
  const dragged = items.find(item => item.id === draggedId); if (!dragged) return items;
  const next = items.filter(item => item.id !== draggedId); if (!targetId) return [...next, dragged];
  const targetIndex = next.findIndex(item => item.id === targetId); if (targetIndex < 0) return items;
  next.splice(targetIndex + (after ? 1 : 0), 0, dragged); return next;
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
  const transformGroup = useCallback((id: string, move: Vec3, turn: Vec3) => {
    setPlaying(false); setProject(p => { const group = p.groups.find(value => value.id === id); if (!group?.objectIds.length) return p; const members = group.objectIds.map(objectId => p.objects.find(object => object.id === objectId)).filter((object): object is SceneObject => !!object), poses = members.map(object => sampleObject(object.keyframes, stateRef.current.time)); if (!poses.length) return p; const transformed = transformAroundCenter(poses, move, turn), byId = new Map(members.map((object, index) => [object.id, transformed[index]])); return { ...p, objects: p.objects.map(object => { const next = byId.get(object.id); return next ? { ...object, keyframes: upsert(object.keyframes, next) } : object; }) }; });
  }, [setProject]);
  useEffect(() => {
    try {
      engine.current = new SceneEngine(host.current!, previewHost.current!, new Map(models.map(m => [m.asset, m.url])), { select: selectEntity, transform: updateKey, transformGroup, error: setError, beginEdit: beginGroup, endEdit: endGroup });
      setReady(true);
    } catch (e) { setError(`3Dビューを初期化できません。WebGL対応ブラウザをご利用ください。 ${e instanceof Error ? e.message : ''}`); }
    return () => { abort.current?.abort(); engine.current?.dispose(); };
  }, [updateKey, transformGroup, beginGroup, endGroup, selectEntity]);
  useEffect(() => {
    setSelectedIds(ids => { const valid = ids.filter(id => project.objects.some(o => o.id === id) || project.cameras.some(c => c.id === id) || project.groups.some(g => g.id === id)); if (valid.length) return valid.length === ids.length ? ids : valid; const fallback = project.cameras[0]?.id ?? project.objects[0]?.id; return fallback ? [fallback] : []; });
    setTime(t => Math.min(t, project.duration));
  }, [project]);
  useEffect(() => { engine.current?.sync(project, time, selected, selectedIds, mode, cameraView); }, [project, time, selected, selectedIds, mode, cameraView, ready]);
  useEffect(() => {
    setSaved(false); const timer = setTimeout(() => { try { localStorage.setItem(STORAGE, JSON.stringify(project)); setSaved(true); } catch { setError('ブラウザへの自動保存に失敗しました。JSONを保存してください。'); } }, 400);
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
    setProject(p => ({ ...p, objects: [...p.objects, { id, name: `${name} ${p.objects.filter(o => o.asset === asset).length + 1}`, asset, color: palette[p.objects.length % palette.length], scale: [1, 1, 1], uniformScale: 1, keyframes: [{ time: 0, position: [0, 0, 0], rotation: [0, 0, 0] }] }] })); setSelected(id); setPlaying(false); setNotice(`${name} を追加しました`);
  }
  function addGroup() {
    const id = crypto.randomUUID(); setProject(p => ({ ...p, groups: [...p.groups, { id, name: `Group ${String(p.groups.length + 1).padStart(2, '0')}`, objectIds: [] }] })); setSelected(id); setNotice('グループフォルダを追加しました');
  }
  function createGroup(objectIds: string[], name: string) {
    if (objectIds.length < 2) return; const id = crypto.randomUUID(), cleanName = name.trim() || `Group ${String(project.groups.length + 1).padStart(2, '0')}`;
    setProject(p => ({ ...p, groups: [...p.groups.map(group => ({ ...group, objectIds: group.objectIds.filter(objectId => !objectIds.includes(objectId)) })), { id, name: cleanName, objectIds }] })); setGroupDialog(null); setSelected(id); setNotice(`${objectIds.length}個のオブジェクトをグループ化しました`);
  }
  function moveToGroup(objectId: string, groupId: string) {
    setProject(p => ({ ...p, groups: p.groups.map(group => ({ ...group, objectIds: group.id === groupId ? [...group.objectIds.filter(id => id !== objectId), objectId] : group.objectIds.filter(id => id !== objectId) })) })); setNotice('オブジェクトをフォルダへ移動しました');
  }
  function moveToEnd(id: string) {
    setProject(p => p.objects.some(object => object.id === id) ? { ...p, objects: reorderById(p.objects, id), groups: p.groups.map(group => ({ ...group, objectIds: group.objectIds.filter(objectId => objectId !== id) })) } : p.cameras.some(camera => camera.id === id) ? { ...p, cameras: reorderById(p.cameras, id) } : p); setNotice('並び順を変更しました');
  }
  function reorderEntity(draggedId: string, targetId: string, after: boolean) {
    if (draggedId === targetId) return;
    setProject(p => {
      if (p.objects.some(object => object.id === draggedId) && p.objects.some(object => object.id === targetId)) {
        const targetGroup = p.groups.find(group => group.objectIds.includes(targetId));
        const groups = p.groups.map(group => { const objectIds = group.objectIds.filter(id => id !== draggedId); if (group.id !== targetGroup?.id) return { ...group, objectIds }; const index = objectIds.indexOf(targetId); objectIds.splice(index + (after ? 1 : 0), 0, draggedId); return { ...group, objectIds }; });
        return { ...p, objects: reorderById(p.objects, draggedId, targetId, after), groups };
      }
      if (p.cameras.some(camera => camera.id === draggedId) && p.cameras.some(camera => camera.id === targetId)) return { ...p, cameras: reorderById(p.cameras, draggedId, targetId, after) };
      return p;
    });
    setNotice('並び順を変更しました');
  }
  function beginTimelineDrag(event: ReactDragEvent<HTMLButtonElement>, id: string) { timelineDrag.current = id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(TRACK_DRAG, id); }
  function overTimelineRow(event: ReactDragEvent<HTMLButtonElement>, id: string) { if (!timelineDrag.current || timelineDrag.current === id) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setTimelineDrop({ id, after: event.clientY >= rect.top + rect.height / 2 }); }
  function dropTimelineRow(event: ReactDragEvent<HTMLButtonElement>, id: string) { const draggedId = timelineDrag.current || event.dataTransfer.getData(TRACK_DRAG); if (draggedId && draggedId !== id) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); reorderEntity(draggedId, id, event.clientY >= rect.top + rect.height / 2); } timelineDrag.current = ''; setTimelineDrop(null); }
  const timelineOrderClass = (id: string) => timelineDrop?.id === id ? timelineDrop.after ? 'reorder-after' : 'reorder-before' : '';
  function removeGroup() { if (!group) return; setProject(p => ({ ...p, groups: p.groups.filter(value => value.id !== group.id) })); setSelected(group.objectIds[0] ?? project.objects[0]?.id ?? project.cameras[0]?.id ?? ''); setNotice('フォルダを解除しました'); }
  function addCamera() {
    const id = crypto.randomUUID(); const start = Math.min(time, Math.max(0, project.duration - 1 / project.fps));
    const source = liveCamera ?? camera ?? project.cameras[0];
    const key = source ? sampleCamera(source.keyframes, time) : { time, position: [6, 4, 9] as Vec3, target: [0, 1, -0.5] as Vec3, fov: 50, easing: 'linear' as Ease };
    setProject(p => ({ ...p, cameras: [...p.cameras.map(c => c.range.start <= start && start < c.range.end && c.range.start < start ? { ...c, range: { ...c.range, end: start } } : c), { id, name: `Camera ${String(p.cameras.length + 1).padStart(2, '0')}`, color: palette[(p.cameras.length + 2) % palette.length], range: { start, end: p.duration }, keyframes: [{ ...key, time: start }] }] }));
    setSelected(id); setPlaying(false); setNotice(`${start.toFixed(2)} 秒から新しいカメラへカットしました`);
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
      const entries = selectedIds.flatMap(id => { const keys = project.objects.find(o => o.id === id)?.keyframes ?? project.cameras.find(c => c.id === id)?.keyframes; const key = keys?.find(k => Math.abs(k.time - selectedKey.time) < .00001); return key ? [{ id, key: structuredClone(key) }] : []; });
      if (entries.length) { clipboard.current = { kind: 'keys', entries }; setNotice(`${entries.length}個のキーをコピーしました`); return; }
    }
    const objectIds = new Set([...selectedIds, ...project.groups.filter(group => selectedIds.includes(group.id)).flatMap(group => group.objectIds)]);
    const data: Extract<ClipboardData, { kind: 'entities' }> = { kind: 'entities', objects: project.objects.filter(o => objectIds.has(o.id)).map(o => structuredClone(o)), cameras: project.cameras.filter(c => selectedIds.includes(c.id)).map(c => structuredClone(c)) };
    clipboard.current = data; setNotice(`${data.objects.length + data.cameras.length}個の項目をコピーしました`);
  }
  function pasteSelection() {
    const data = clipboard.current; if (!data) { setNotice('コピーされた項目がありません'); return; } setPlaying(false);
    if (data.kind === 'keys') {
      setProject(p => ({ ...p, objects: p.objects.map(object => { const entry = data.entries.find(item => item.id === object.id && 'rotation' in item.key); return entry ? { ...object, keyframes: upsert(object.keyframes, { ...(entry.key as ObjectKey), time }) } : object; }), cameras: p.cameras.map(camera => { const entry = data.entries.find(item => item.id === camera.id && 'target' in item.key); return entry ? { ...camera, keyframes: upsertCameraKey(camera.keyframes, { ...(entry.key as CameraKey), time }) } : camera; }) }));
      setSelectedKey({ id: selected, time }); setNotice(`${time.toFixed(2)}秒へキーを貼り付けました`); return;
    }
    const objectCopies = data.objects.map(source => { const copy = structuredClone(source); copy.id = crypto.randomUUID(); copy.name += ' copy'; copy.keyframes.forEach(key => key.position[0] += 1); return copy; });
    const cameraCopies = data.cameras.map(source => { const copy = structuredClone(source); copy.id = crypto.randomUUID(); copy.name += ' copy'; copy.keyframes.forEach(key => { key.position[0] += 1; key.target[0] += 1; }); return copy; });
    setProject(p => ({ ...p, objects: [...p.objects, ...objectCopies], cameras: [...p.cameras, ...cameraCopies] })); setSelectedIds([...objectCopies.map(o => o.id), ...cameraCopies.map(c => c.id)]); setSelectedKey(null); setNotice(`${objectCopies.length + cameraCopies.length}個の項目を貼り付けました`);
  }
  function deleteSelection() {
    if (!selectedIds.length) return; const objectIds = new Set(project.objects.filter(object => selectedIds.includes(object.id)).map(object => object.id)); setPlaying(false); setProject(p => ({ ...p, objects: p.objects.filter(o => !objectIds.has(o.id)), cameras: p.cameras.filter(c => !selectedIds.includes(c.id)), groups: p.groups.filter(group => !selectedIds.includes(group.id)).map(group => ({ ...group, objectIds: group.objectIds.filter(id => !objectIds.has(id)) })) })); setSelectedIds([]); setSelectedKey(null); setNotice(`${selectedIds.length}個の項目を削除しました`);
  }
  function addKey() { if (camera && cameraPose) updateKey(camera.id, cameraPose); else if (pose) updateKey(selected, pose); setNotice(`${time.toFixed(2)} 秒にキーフレームを登録しました`); }
  function deleteKey() {
    const at = selectedKey?.time ?? time, entities = [...project.objects, ...project.cameras], matching = entities.filter(entity => selectedIds.includes(entity.id) && entity.keyframes.some(k => Math.abs(k.time - at) < .00001)), removable = new Set(matching.filter(entity => entity.keyframes.length > 1).map(entity => entity.id)); setPlaying(false);
    if (removable.size) setProject(p => ({ ...p, objects: p.objects.map(object => removable.has(object.id) ? { ...object, keyframes: object.keyframes.filter(k => Math.abs(k.time - at) > .00001) } : object), cameras: p.cameras.map(camera => removable.has(camera.id) ? { ...camera, keyframes: removeCameraKey(camera.keyframes, at) } : camera) }));
    setSelectedKey(null); setNotice(removable.size ? `${removable.size}個のキーを削除しました` : matching.length ? '最後のキーフレームは削除できません' : 'この時刻に削除できるキーはありません');
  }
  async function load(file?: File) {
    if (!file) return;
    try { if (file.size > 20_000_000) throw new Error('JSONファイルの上限は20MBです。'); const next = parseProject(JSON.parse(await file.text())); setError(''); setProject(next); setSelected(next.objects[0]?.id ?? next.cameras[0]?.id ?? ''); seek(0); setNotice('シーンを復元しました'); }
    catch (e) { setError(e instanceof Error ? e.message : 'JSONの読み込みに失敗しました'); }
    if (input.current) input.current.value = '';
  }
  async function exportVideo() {
    if (!engine.current) return; setPlaying(false); setError(''); setProgress(0); abort.current = new AbortController();
    try { const blob = await engine.current.exportMP4(setProgress, abort.current.signal); download(blob, `${fileName(project.name)}.mp4`); setNotice('MP4を書き出しました'); }
    catch (e) { setError(e instanceof Error ? e.message : '動画の書き出しに失敗しました'); }
    finally { setProgress(null); abort.current = null; }
  }
  const selectedKeys = camera?.keyframes ?? object?.keyframes ?? [];
  const atKey = selectedKeys.some(k => Math.abs(k.time - time) < 0.00001);
  return <div className="app" onFocusCapture={e => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) beginGroup(); }} onBlur={e => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) endGroup(); }}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Film size={20} /></span>FRAME<span className="brand-sub">PREVIS STUDIO</span></div>
      <div className="history-actions"><button className="icon-button" aria-label="元に戻す" title="元に戻す (Ctrl+Z)" disabled={!canUndo || progress !== null} onClick={() => { setPlaying(false); undo(); }}><Undo2 size={16} /></button><button className="icon-button" aria-label="やり直す" title="やり直す (Ctrl+Y / Ctrl+Shift+Z)" disabled={!canRedo || progress !== null} onClick={() => { setPlaying(false); redo(); }}><Redo2 size={16} /></button></div>
      <div className="file-actions"><button title="新規シーン（現在の内容は先にJSON保存してください）" onClick={() => { const fresh = newProject(); setProject(fresh); setSelected(fresh.cameras[0].id); seek(0); setError(''); }}><FilePlus2 size={15} />新規</button><button onClick={() => input.current?.click()}><FolderOpen size={15} />開く</button><button onClick={() => { download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${fileName(project.name)}.json`); setNotice('JSONを保存しました'); }}><Save size={15} />保存</button><input ref={input} type="file" accept=".json,application/json" hidden onChange={e => void load(e.target.files?.[0])} /></div>
      <div className="top-spacer" /><span className="local-status"><span />ローカルで作業中</span><button className="icon-button" aria-label="使い方" onClick={() => setHelp(true)}><HelpCircle size={17} /></button><button className="export-button" disabled={!ready} onClick={() => void exportVideo()}><ArrowDownToLine size={16} />MP4を書き出す</button>
    </header>
    <div className="projectbar"><div className="project-title"><span className="project-index">01</span><input aria-label="シーン名" value={project.name} maxLength={100} onChange={e => setProject(p => ({ ...p, name: e.target.value }))} /><span className="saved-state">{saved ? <Check size={12} /> : <Circle size={9} />}{saved ? '自動保存済み' : '保存中'}</span></div><div className="output-settings"><label><span>比率</span><select aria-label="画面比率" value={project.output.aspectRatio} onChange={e => changeOutput({ aspectRatio: e.target.value as AspectRatio })}>{aspectRatios.map(value => <option key={value}>{value}</option>)}</select></label><label><span>サイズ</span><select aria-label="メガピクセル" value={project.output.megapixels} onChange={e => changeOutput({ megapixels: e.target.value as Megapixels })}>{megapixels.map(value => <option key={value} value={value}>{value} MP</option>)}</select></label><div className="format-tag">{project.resolution.width} × {project.resolution.height}<span> / </span>{project.fps} FPS<span> / </span>{project.duration}s</div></div></div>
    <main className="workspace">
      <aside className={`sidebar ${assetsCollapsed ? 'assets-collapsed' : ''}`}>
        <SceneTree project={project} selected={selected} selectedIds={selectedIds} onSelect={selectEntity} onAddCamera={addCamera} onAddGroup={addGroup} onMoveToGroup={moveToGroup} onMoveToEnd={moveToEnd} onReorder={reorderEntity} />
        <section className={`assets-section ${assetsCollapsed ? 'collapsed' : ''}`}><div className="section-title"><span>ASSETS</span><button className={`assets-toggle ${assetsCollapsed ? '' : 'open'}`} aria-label={assetsCollapsed ? 'アセットを開く' : 'アセットを閉じる'} aria-expanded={!assetsCollapsed} onClick={() => setAssetsCollapsed(value => !value)}><Plus size={14} /></button></div>{!assetsCollapsed && <><div className="asset-grid">{primitives.map((asset, i) => { const Icon = assetIcons[i]; return <button className="asset-card" key={asset} onClick={() => addObject(asset, assetNames[i])}><Icon size={20} strokeWidth={1.2} /><span>{assetNames[i]}</span><Plus className="asset-plus" size={10} /></button>; })}</div><div className="external-title">EXTERNAL MODELS <span>{models.length}</span></div>{models.length ? <div className="external-assets">{models.map(m => <button key={m.asset} onClick={() => addObject(m.asset, m.name)} title={m.asset}><Box size={15} /><span>{m.name}</span><Plus size={13} /></button>)}</div> : <div className="asset-empty"><FolderOpen size={20} /><p>GLBモデルを追加</p><small>assets/models/ に配置すると<br />自動でここに表示されます</small></div>}</>}</section>
        <div className="sidebar-bottom"><span className="status-dot" />{ready ? 'WebGL ready' : 'WebGL initializing…'}<span>v1.0</span></div>
      </aside>
      <section className="viewport-pane">
        <div className="viewport-toolbar"><div className="segmented"><button className={!cameraView ? 'active' : ''} onClick={() => setCameraView(false)}><Grid2X2 size={14} />編集ビュー</button><button className={cameraView ? 'active' : ''} onClick={() => setCameraView(true)}><Camera size={14} />カメラビュー</button></div><div className="view-tools"><button title="選択にフォーカス (F)" aria-label="選択にフォーカス" onClick={() => engine.current?.focus()}><Crosshair size={16} /></button><button title="ビューを最大化" aria-label="ビューを最大化" onClick={() => { const el = host.current?.parentElement; if (document.fullscreenElement) void document.exitFullscreen(); else void el?.requestFullscreen().catch(() => setNotice('この環境では全画面表示を利用できません')); }}><Maximize size={15} /></button></div></div>
        <div className="viewport-area"><div ref={host} className="canvas-host" onContextMenu={event => { event.preventDefault(); const objectIds = selectedIds.filter(id => project.objects.some(object => object.id === id)); if (objectIds.length >= 2) setGroupDialog({ objectIds, name: `Group ${String(project.groups.length + 1).padStart(2, '0')}` }); else setNotice('グループ化するオブジェクトをShift+クリックで2個以上選択してください'); }} /><div className="viewport-label"><span className={`live-dot ${liveCamera ? '' : 'off'}`} />{cameraView ? liveCamera?.name ?? 'NO CAMERA' : 'PERSPECTIVE'}<span className="world-label">WORLD</span></div><div className="transform-tools"><button aria-label="移動ツール" title="移動 (W)" className={mode === 'translate' ? 'active' : ''} onClick={() => setMode('translate')}><Move3D size={19} /></button><button aria-label="回転ツール" title="回転 (E)" className={mode === 'rotate' ? 'active' : ''} onClick={() => setMode('rotate')}><Rotate3D size={19} /></button></div><div className="camera-preview" style={previewPosition ? { left: previewPosition.x, top: previewPosition.y, right: 'auto' } : undefined}><div className="preview-heading" title="ドラッグで移動・ダブルクリックで元の位置" onPointerDown={beginPreviewMove} onPointerMove={movePreview} onPointerUp={endPreviewMove} onPointerCancel={endPreviewMove} onDoubleClick={() => setPreviewPosition(null)}><Camera size={12} /><span>{liveCamera?.name ?? 'NO CAMERA'}</span><span>{liveCameraPose ? `${liveCameraPose.fov.toFixed(0)}°` : 'BLACK'}</span></div><div ref={previewHost} className="preview-canvas" /><div className="preview-footer"><span>{liveCamera ? 'LIVE PREVIEW' : 'UNASSIGNED'}</span><span>{project.resolution.width} × {project.resolution.height}</span></div></div><div className="viewport-hint">ドラッグで視点を回転 <span>·</span> 右ドラッグで平行移動 <span>·</span> ホイールでズーム</div><div className="axis-widget"><span>Y</span><span>Z</span><span>X</span></div></div>
      </section>
      <aside className="inspector">
        <div className="section-title"><span>INSPECTOR</span>{selectedIds.length > 1 ? <span className="count">{selectedIds.length} SELECTED</span> : group ? <Folder size={14} /> : camera ? <Camera size={14} /> : <Box size={14} />}</div>
        <div className="inspector-content"><div className="inspector-name">{group ? <><Folder size={18} /><input aria-label="グループ名" value={group.name} onChange={e => setProject(p => ({ ...p, groups: p.groups.map(value => value.id === group.id ? { ...value, name: e.target.value } : value) }))} /></> : camera ? <><Camera size={18} style={{ color: camera.color }} /><input aria-label="カメラ名" value={camera.name} onChange={e => setProject(p => ({ ...p, cameras: p.cameras.map(c => c.id === camera.id ? { ...c, name: e.target.value } : c) }))} /></> : object ? <><span className="object-dot large" style={{ background: object.color }} /><input aria-label="オブジェクト名" value={object.name} onChange={e => setProject(p => ({ ...p, objects: p.objects.map(o => o.id === selected ? { ...o, name: e.target.value } : o) }))} /></> : <span>オブジェクト、カメラ、グループを選択</span>}</div>
        {group && <><div className="object-type">GROUP FOLDER · {group.objectIds.length} OBJECTS</div><p className="microcopy">グループの中心に表示されるギズモで移動・回転します。回転時はメンバーの位置と角度を中心基準で変更します。</p></>}
        {object && <><div className="object-type">{object.asset.startsWith('primitive:') ? 'PRIMITIVE OBJECT' : object.asset}</div><div className="color-line"><span>カラー</span><div className="swatches">{palette.map(c => <button key={c} aria-label={`色 ${c}`} style={{ background: c }} className={object.color === c ? 'chosen' : ''} onClick={() => setProject(p => ({ ...p, objects: p.objects.map(o => o.id === selected ? { ...o, color: c } : o) }))} />)}</div><input type="color" aria-label="カスタムカラー" value={object.color} onChange={e => setProject(p => ({ ...p, objects: p.objects.map(o => o.id === selected ? { ...o, color: e.target.value } : o) }))} /></div></>}
        {object && <><div className="inspector-divider" /><div className="subsection-title">SIZE<span>XYZ × 全体倍率</span></div><VectorFields label="スケール" value={object.scale} live min={0.001} max={1000} step={0.1} onChange={scale => setProject(p => ({ ...p, objects: p.objects.map(o => o.id === object.id ? { ...o, scale } : o) }))} /><NumberField label="全体倍率" value={object.uniformScale} live min={0.001} max={1000} step={0.1} onChange={uniformScale => setProject(p => ({ ...p, objects: p.objects.map(o => o.id === object.id ? { ...o, uniformScale } : o) }))} /><p className="microcopy">X・Y・Zで幅、高さ、厚みを個別に変更します。全体倍率は3軸を同時に拡大縮小します。</p></>}
        {object && <><div className="inspector-divider" /><div className="subsection-title">表示区間<span>{isObjectVisible(object, time, project.duration) ? '表示中' : '範囲外・非表示'}</span></div>
          <NumberField label="表示開始（秒）" value={objectRange(object, project.duration).start} min={0} max={objectRange(object, project.duration).end - 0.001} step={1 / project.fps} onChange={start => changeRange(object.id, { ...objectRange(object, project.duration), start })} />
          <NumberField label="表示終了（秒）" value={objectRange(object, project.duration).end} min={objectRange(object, project.duration).start + 0.001} max={600} step={1 / project.fps} onChange={end => changeRange(object.id, { ...objectRange(object, project.duration), end })} />
          <button className="preset-apply" onClick={() => { setPlaying(false); setProject(p => ({ ...p, objects: p.objects.map(o => o.id === object.id ? { ...o, visibility: undefined } : o) })); }}>シーン全体に戻す</button>
          <p className="microcopy">開始時刻に出現し、終了時刻に消えます。タイムラインの帯の両端でも調整できます。動きのキーは保持されます。</p></>}
        {camera && <><div className="inspector-divider" /><div className="subsection-title">カメラ使用区間<span>{liveCamera?.id === camera.id ? '出力中' : '待機中'}</span></div><NumberField label="カット開始（秒）" value={camera.range.start} min={0} max={camera.range.end - 0.001} step={1 / project.fps} onChange={start => changeRange(camera.id, { ...camera.range, start })} /><NumberField label="カット終了（秒）" value={camera.range.end} min={camera.range.start + 0.001} max={600} step={1 / project.fps} onChange={end => changeRange(camera.id, { ...camera.range, end })} /><p className="microcopy">開始時刻でこのカメラへハードカットします。重なった場合は、開始時刻が先のカメラを優先します。空白区間は黒になります。</p></>}
        {(pose || cameraPose) && <><div className="inspector-divider" /><div className="subsection-title">TRANSFORM <span>{time.toFixed(2)}s</span></div><VectorFields label="位置" value={cameraPose ? cameraPose.position : pose!.position} onChange={position => cameraPose ? changeCamera({ position }) : changeObject({ position })} /><VectorFields label={cameraPose ? '注視点' : '回転 °'} value={cameraPose ? cameraPose.target : pose!.rotation} onChange={value => cameraPose ? changeCamera({ target: value }) : changeObject({ rotation: value })} />{cameraPose && <NumberField label="FOV °" min={5} max={150} step={1} value={cameraPose.fov} onChange={fov => changeCamera({ fov })} />}<div className="inspector-divider" /><div className="subsection-title">ANIMATION<span className="auto-key">AUTO KEY</span></div><label className="select-field"><span>補間</span><select aria-label="補間" value={(cameraPose ?? pose)!.easing ?? 'linear'} onChange={e => cameraPose ? changeCamera({ easing: e.target.value as Ease }) : changeObject({ easing: e.target.value as Ease })}><option value="linear">Linear</option><option value="ease-in">Ease In</option><option value="ease-out">Ease Out</option><option value="ease-in-out">Ease In-Out</option></select></label><div className="key-actions"><button className="key-button" onClick={addKey}><Diamond size={13} fill={atKey ? 'currentColor' : 'none'} />{atKey ? 'キーフレームを更新' : 'キーフレームを追加'}</button><button aria-label="現在のキーを削除" title="現在のキーを削除" disabled={!atKey || selectedKeys.length <= 1} onClick={deleteKey}><Trash2 size={14} /></button></div><p className="microcopy">位置・回転の変更は、現在時刻のキーに自動で記録されます。</p></>}
        {cameraPose && <><div className="inspector-divider" /><div className="subsection-title">CAMERA LENS<span>{cameraPose.fov.toFixed(0)}°</span></div><label className="fov-slider"><span>画角（FOV）</span><input aria-label="画角スライダー" type="range" min="5" max="120" step="1" value={cameraPose.fov} onChange={e => changeCamera({ fov: Number(e.target.value) })} /></label><div className="fov-presets"><button onClick={() => changeCamera({ fov: 75 })}>広角 75°</button><button onClick={() => changeCamera({ fov: 50 })}>標準 50°</button><button onClick={() => changeCamera({ fov: 25 })}>望遠 25°</button></div><p className="microcopy">現在時刻のカメラキーに画角を記録します。別の時刻で画角を変えると、キー間を補間してズームします。</p></>}
        {object && <div className="object-actions"><button onClick={duplicate}><Copy size={14} />複製</button><button onClick={remove}><Trash2 size={14} />削除</button></div>}
        {camera && <div className="object-actions"><button onClick={addCamera}><Plus size={14} />現在時刻でカット</button><button onClick={removeCamera}><Trash2 size={14} />カメラ削除</button></div>}
        {group && <div className="object-actions"><button onClick={removeGroup}><Folder size={14} />グループ解除</button></div>}
        </div>
      </aside>
    </main>
    <section className="timeline"><div className="timeline-toolbar"><div className="timeline-title"><span>TIMELINE</span><small>{project.objects.length + project.cameras.length} TRACKS</small></div><div className="transport"><button aria-label="先頭に戻る" onClick={() => seek(0)}><SkipBack size={15} /></button><button className="play-button" aria-label={playing ? '一時停止' : '再生'} onClick={() => setPlaying(p => !p)}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button><button aria-label="停止" onClick={() => seek(0)}><Square size={12} /></button><button aria-label="ループ" aria-pressed={loop} className={loop ? 'loop-on' : ''} onClick={() => setLoop(p => !p)}><Repeat2 size={17} /></button><span className="timecode">{String(Math.floor(time / 60)).padStart(2, '0')}:{String(Math.floor(time % 60)).padStart(2, '0')}<b>:{String(Math.floor((time % 1) * project.fps)).padStart(2, '0')}</b></span></div><div className="duration-setting"><span>長さ</span><NumberField label="長さ（秒）" min={0.1} max={600} step={1} value={project.duration} onChange={duration => { setPlaying(false); setProject(p => ({ ...p, duration })); setTime(t => Math.min(t, duration)); }} /><span>sec</span></div></div>
      <div className="timeline-body"><div className="track-labels"><div className="track-label-top">OBJECT / CAMERA CUTS</div>{project.objects.map(o => <button draggable key={o.id} className={`${selectedIds.includes(o.id) ? 'selected' : ''} ${selected === o.id ? 'primary' : ''} ${timelineOrderClass(o.id)}`} onDragStart={event => beginTimelineDrag(event, o.id)} onDragOver={event => overTimelineRow(event, o.id)} onDrop={event => dropTimelineRow(event, o.id)} onDragEnd={() => { timelineDrag.current = ''; setTimelineDrop(null); }} onClick={e => selectEntity(o.id, e.shiftKey)}><span className="object-dot" style={{ background: o.color }} /><span>{o.name}</span></button>)}{project.cameras.map(c => <button draggable key={c.id} className={`${selectedIds.includes(c.id) ? 'selected' : ''} ${selected === c.id ? 'primary' : ''} ${timelineOrderClass(c.id)}`} onDragStart={event => beginTimelineDrag(event, c.id)} onDragOver={event => overTimelineRow(event, c.id)} onDrop={event => dropTimelineRow(event, c.id)} onDragEnd={() => { timelineDrag.current = ''; setTimelineDrop(null); }} onClick={e => selectEntity(c.id, e.shiftKey)}><Camera size={13} style={{ color: c.color }} /><span>{c.name}</span></button>)}</div><div className="tracks" onPointerDown={e => { if ((e.target as HTMLElement).closest('.keyframe,.visibility-handle')) return; e.currentTarget.setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * project.duration); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * project.duration); } }} onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}><div className="ruler">{Array.from({ length: 11 }, (_, i) => <span key={i} style={{ left: `${i * 10}%` }}>{(project.duration * i / 10).toFixed(project.duration < 10 ? 1 : 0)}s</span>)}</div>{[...project.objects.map(o => ({ id: o.id, name: o.name, color: o.color, keys: o.keyframes, range: objectRange(o, project.duration), camera: false })), ...project.cameras.map(c => ({ id: c.id, name: c.name, color: c.color, keys: c.keyframes, range: c.range, camera: true }))].map(track => <div className={`track ${selectedIds.includes(track.id) ? 'selected' : ''} ${selected === track.id ? 'primary' : ''} ${track.camera && liveCamera?.id === track.id ? 'live-camera-track' : ''}`} key={track.id}><VisibilityClip onBegin={beginGroup} onEnd={endGroup} range={track.range} duration={project.duration} fps={project.fps} color={track.color} name={track.name} onChange={range => changeRange(track.id, range)} /><div className="track-line" style={{ background: track.color, left: `${clamp(track.keys[0].time / project.duration * 100, 0, 100)}%`, width: `${clamp((Math.min(track.keys.at(-1)!.time, project.duration) - track.keys[0].time) / project.duration * 100, 0, 100)}%` }} />{visibleKeyMarkers(track.keys, project.duration, time, selectedIds.includes(track.id)).map(k => <button key={k.time} className={`keyframe ${(k.time < track.range.start || k.time >= track.range.end) ? 'outside-range' : ''} ${selectedKey?.id === track.id && Math.abs(selectedKey.time - k.time) < 0.00001 ? 'current' : ''}`} style={{ left: `${k.time / project.duration * 100}%`, color: track.color }} aria-label={`${track.name} キー ${k.time.toFixed(2)}秒`} title={`${k.time.toFixed(2)} 秒`} onPointerDown={e => e.stopPropagation()} onClick={e => { selectEntity(track.id, e.shiftKey); setSelectedKey({ id: track.id, time: k.time }); setPlaying(false); setTime(k.time); }}><Diamond size={11} fill="currentColor" /></button>)}</div>)}<div className="playhead" style={{ left: `${time / project.duration * 100}%` }}><span /></div></div></div>
      <div className="timeline-footer"><span><Diamond size={10} />Shift+クリック 複数選択 <span className="footer-separator">/</span> Ctrl+C / Ctrl+V</span><span>DEL 削除 <span className="footer-separator">/</span> SPACE 再生 <span className="footer-separator">/</span> W 移動 <span className="footer-separator">/</span> E 回転</span></div>
    </section>
    {notice && <div className="toast" role="status"><Check size={15} />{notice}</div>}
    {error && <div className="error-toast" role="alert"><span>{error}</span><button aria-label="エラーを閉じる" onClick={() => setError('')}><X size={16} /></button></div>}
    {groupDialog && <div className="modal-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) setGroupDialog(null); }}><form className="modal group-dialog" onSubmit={event => { event.preventDefault(); createGroup(groupDialog.objectIds, groupDialog.name); }}><span className="modal-eyebrow">CREATE GROUP</span><h2>選択オブジェクトをグループ化</h2><p>{groupDialog.objectIds.length}個のオブジェクトの中心を基準に、まとめて移動・回転できるフォルダを作成します。</p><label><span>グループ名</span><input autoFocus aria-label="新しいグループ名" value={groupDialog.name} onChange={event => setGroupDialog(value => value ? { ...value, name: event.target.value } : null)} /></label><div className="dialog-actions"><button type="button" onClick={() => setGroupDialog(null)}>キャンセル</button><button className="export-button" type="submit">グループ化</button></div></form></div>}
    {progress !== null && <div className="modal-backdrop"><div className="modal"><span className="modal-eyebrow">EXPORT SEQUENCE</span><h2>ショットを書き出しています</h2><p>{project.resolution.width} × {project.resolution.height} · {project.fps} fps · H.264 / MP4</p><div className="progress-track"><div style={{ width: `${progress * 100}%` }} /></div><div className="progress-label"><span>フレームをレンダリング</span><b>{Math.round(progress * 100)}%</b></div><button onClick={() => abort.current?.abort()}>キャンセル</button></div></div>}
    {help && <div className="modal-backdrop"><div className="modal help-modal"><button className="modal-close" aria-label="使い方を閉じる" onClick={() => setHelp(false)}><X size={18} /></button><span className="modal-eyebrow">FROM IDEA TO MOTION</span><h2>ショットを、かたちに。</h2><ol><li>Assetsから人型やオブジェクトを追加します。</li><li>位置・回転を数値またはギズモで調整します。</li><li>Shift+クリックで複数選択します。主選択を動かすと、他の対象も同じ差分だけ動きます。</li><li>Sceneのフォルダへドラッグして整理します。複数選択後に編集ビューを右クリックすると、中心基準で操作するグループを作成できます。</li><li>タイムラインを進めて移動すると、自動でキーが追加されます。</li><li>カメラを選び、注視点と画角（FOV）を設定します。</li><li>カット時刻へ移動して「現在時刻にカメラを追加」を押すと、カメラがハードカットで切り替わります。</li><li>再生して確認し、MP4とJSONを保存します。</li></ol><p>Ctrl+C／Ctrl+Vで選択対象または選択キーをコピー・貼り付け、Deleteで削除できます。</p><p>カメラ帯が重なる区間は開始が先のカメラを使い、カメラ帯がない区間は黒になります。</p><p>シーンはこのブラウザに自動保存されます。新規作成やJSON読み込みの前に、必要なシーンをJSON保存してください。</p><p>外部GLBは assets/models/ に配置します。モデル本体はJSONに含まれないため、別のPCでも同じファイルが必要です。</p><button className="export-button" onClick={() => setHelp(false)}>制作をはじめる</button></div></div>}
  </div>;
}
