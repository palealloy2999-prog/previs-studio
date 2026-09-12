import { useRef, useState } from 'react';
import { clamp, type VisibilityRange } from './model';
import { t } from './i18n';

export default function VisibilityClip({ range, duration, fps, color, name, onChange, onBegin, onEnd }: {
  range: VisibilityRange; duration: number; fps: number; color: string; name: string;
  onChange: (range: VisibilityRange) => void;
  onBegin: () => void; onEnd: () => void;
}) {
  const drag = useRef<{ x: number; width: number; range: VisibilityRange } | null>(null);
  const [draggingEdge, setDraggingEdge] = useState<'start' | 'end' | null>(null);
  const left = clamp(range.start / duration * 100, 0, 100);
  const right = clamp(range.end / duration * 100, 0, 100);
  if (right <= left) return null;
  return <div className={`visibility-clip ${draggingEdge ? 'dragging' : ''}`} aria-label={t('visibility.range', { name })} title={t('visibility.title', { start: range.start.toFixed(2), end: range.end.toFixed(2) })}
    style={{ left: `${left}%`, width: `${right - left}%`, color }}>
    {draggingEdge && <span className={`visibility-tooltip ${draggingEdge}`} role="tooltip">
      {t(draggingEdge === 'start' ? 'visibility.startValue' : 'visibility.endValue', { time: range[draggingEdge].toFixed(2) })}
    </span>}
    {(['start', 'end'] as const).map(edge => <button key={edge} className={`visibility-handle ${edge}`}
      aria-label={t(edge === 'start' ? 'visibility.dragStart' : 'visibility.dragEnd', { name })}
      onPointerDown={e => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        onBegin();
        setDraggingEdge(edge);
        e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, width: e.currentTarget.closest('.tracks')!.getBoundingClientRect().width, range: { ...range } };
      }}
      onPointerMove={e => {
        if (!drag.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        e.stopPropagation();
        const initial = drag.current;
        const value = Math.round((initial.range[edge] + (e.clientX - initial.x) / initial.width * duration) * fps) / fps;
        const next = { ...initial.range, [edge]: edge === 'start' ? clamp(value, 0, initial.range.end - 0.001) : clamp(value, initial.range.start + 0.001, duration) };
        onChange(next);
      }}
      onPointerUp={e => { e.stopPropagation(); drag.current = null; setDraggingEdge(null); onEnd(); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => { drag.current = null; setDraggingEdge(null); onEnd(); }}
      onLostPointerCapture={() => { drag.current = null; setDraggingEdge(null); onEnd(); }}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault(); const value = range[edge] + (e.key === 'ArrowLeft' ? -1 : 1) / fps;
        onChange({ ...range, [edge]: edge === 'start' ? clamp(value, 0, range.end - 0.001) : clamp(value, range.start + 0.001, duration) });
      }} />)}
  </div>;
}
