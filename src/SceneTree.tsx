import { useState, type DragEvent } from 'react';
import { Camera, ChevronDown, ChevronRight, Folder, FolderPlus, Plus } from 'lucide-react';
import type { Project } from './model';
import { t } from './i18n';

const OBJECT_DRAG = 'application/x-frame-previs-object';
const CAMERA_DRAG = 'application/x-frame-previs-camera';
type DropPosition = { id: string; after: boolean } | null;

export default function SceneTree({ project, selected, selectedIds, onSelect, onAddCamera, onAddGroup, onMoveToGroup, onMoveToEnd, onReorder }: {
  project: Project;
  selected: string;
  selectedIds: string[];
  onSelect: (id: string, additive: boolean) => void;
  onAddCamera: () => void;
  onAddGroup: () => void;
  onMoveToGroup: (objectIds: string[], groupId: string) => void;
  onMoveToEnd: (ids: string[]) => void;
  onReorder: (draggedIds: string[], targetId: string, after: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>(null);
  const grouped = new Set(project.groups.flatMap(group => group.objectIds));
  const objectDragIds = (event: DragEvent) => { const data = event.dataTransfer.getData(OBJECT_DRAG); if (!data) return []; try { const ids = JSON.parse(data); return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []; } catch { return [data]; } };
  const dragIds = (event: DragEvent) => { const objectIds = objectDragIds(event); if (objectIds.length) return objectIds; const cameraId = event.dataTransfer.getData(CAMERA_DRAG); return cameraId ? [cameraId] : []; };
  const hasType = (event: DragEvent, type: string) => Array.from(event.dataTransfer.types).includes(type);
  const hasEntity = (event: DragEvent) => hasType(event, OBJECT_DRAG) || hasType(event, CAMERA_DRAG);
  const clearDrop = () => { setDropTarget(null); setDropPosition(null); };
  const rowDropHandlers = (targetId: string) => ({
    onDragOver: (event: DragEvent<HTMLButtonElement>) => { if (!hasEntity(event)) return; event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setDropPosition({ id: targetId, after: event.clientY >= rect.top + rect.height / 2 }); setDropTarget(null); },
    onDrop: (event: DragEvent<HTMLButtonElement>) => { const ids = dragIds(event); if (ids.length && !ids.includes(targetId)) { event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); onReorder(ids, targetId, event.clientY >= rect.top + rect.height / 2); } clearDrop(); },
  });
  const rowClass = (id: string) => dropPosition?.id === id ? dropPosition.after ? 'reorder-after' : 'reorder-before' : '';
  const objectRow = (object: Project['objects'][number], nested = false) => <button draggable onDragStart={event => { const selectedObjects = selectedIds.filter(id => project.objects.some(value => value.id === id)), ids = selectedObjects.length > 1 && selectedObjects.includes(object.id) ? selectedObjects : [object.id]; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(OBJECT_DRAG, JSON.stringify(ids)); }} onDragEnd={clearDrop} {...rowDropHandlers(object.id)} className={`object-row ${nested ? 'nested' : ''} ${selectedIds.includes(object.id) ? 'selected' : ''} ${selected === object.id ? 'primary' : ''} ${rowClass(object.id)}`} key={object.id} onClick={event => onSelect(object.id, event.shiftKey)}><span className="object-dot" style={{ background: object.color }} /><span>{object.name}</span><small>{object.keyframes.length} ◆</small></button>;
  return <section className="scene-section">
    <div className="section-title"><span>{t('section.scene')}</span><div className="scene-title-actions"><span className="count">{project.objects.length + project.cameras.length + project.groups.length}</span><button aria-label={t('scene.addFolder')} title={t('scene.addFolderTitle')} onClick={onAddGroup}><FolderPlus size={15} /></button><button aria-label={t('scene.addCamera')} title={t('scene.addCameraNow')} onClick={onAddCamera}><Camera size={13} /><Plus size={10} /></button></div></div>
    <div className={`scene-list ${dropTarget === 'root' ? 'drop-root' : ''}`} onDragOver={event => { if (hasEntity(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget('root'); setDropPosition(null); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) clearDrop(); }} onDrop={event => { const ids = dragIds(event); if (ids.length) { event.preventDefault(); onMoveToEnd(ids); } clearDrop(); }}>
      {project.objects.filter(object => !grouped.has(object.id)).map(object => objectRow(object))}
      {project.groups.map(group => <div className={`scene-group ${selected === group.id ? 'primary' : ''} ${dropTarget === group.id ? 'drop-group' : ''}`} key={group.id} onDragOver={event => { if (hasType(event, OBJECT_DRAG)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; setDropTarget(group.id); setDropPosition(null); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) clearDrop(); }} onDrop={event => { const ids = objectDragIds(event); if (ids.length) { event.preventDefault(); event.stopPropagation(); onMoveToGroup(ids, group.id); setCollapsed(value => { const next = new Set(value); next.delete(group.id); return next; }); } clearDrop(); }}>
        <div className="group-heading"><button aria-label={t(collapsed.has(group.id) ? 'scene.expand' : 'scene.collapse', { name: group.name })} onClick={() => setCollapsed(value => { const next = new Set(value); next.has(group.id) ? next.delete(group.id) : next.add(group.id); return next; })}>{collapsed.has(group.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button><button className={`group-select ${selected === group.id ? 'selected primary' : ''}`} onClick={event => onSelect(group.id, event.shiftKey)}><Folder size={15} /><span>{group.name}</span><small>{group.objectIds.length}</small></button></div>
        {!collapsed.has(group.id) && <div className="group-children">{group.objectIds.map(id => project.objects.find(object => object.id === id)).filter(Boolean).map(object => objectRow(object!, true))}</div>}
      </div>)}
      {project.cameras.map(camera => <button draggable onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(CAMERA_DRAG, camera.id); }} onDragEnd={clearDrop} {...rowDropHandlers(camera.id)} className={`object-row camera-row ${selectedIds.includes(camera.id) ? 'selected' : ''} ${selected === camera.id ? 'primary' : ''} ${rowClass(camera.id)}`} key={camera.id} onClick={event => onSelect(camera.id, event.shiftKey)}><Camera size={15} style={{ color: camera.color }} /><span>{camera.name}</span><small>{camera.keyframes.length} ◆</small></button>)}
      <button className="add-camera" onClick={onAddCamera}><Plus size={13} />{t('scene.addCameraNow')}</button>
    </div>
  </section>;
}
