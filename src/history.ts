export type History<T> = { present: T; past: T[]; future: T[]; group: { before: T } | null };
export type HistoryAction<T> = { type: 'set'; value: T | ((current: T) => T) } | { type: 'begin' | 'end' | 'undo' | 'redo' };
// Project updates are immutable. Reference equality keeps history checks O(1),
// which matters when a scene contains thousands of animation keys.
const same = <T>(a: T, b: T) => a === b;
export const createHistory = <T>(present: T): History<T> => ({ present, past: [], future: [], group: null });
function finish<T>(state: History<T>): History<T> {
  if (!state.group) return state;
  const { before } = state.group;
  return same(before, state.present) ? { ...state, group: null } : { ...state, past: [...state.past, before].slice(-100), future: [], group: null };
}
export function historyReducer<T>(state: History<T>, action: HistoryAction<T>): History<T> {
  if (action.type === 'begin') return state.group ? state : { ...state, group: { before: state.present } };
  if (action.type === 'end') return finish(state);
  if (action.type === 'set') {
    const next = typeof action.value === 'function' ? (action.value as (p: T) => T)(state.present) : action.value;
    if (same(next, state.present)) return state;
    return state.group ? { ...state, present: next } : { present: next, past: [...state.past, state.present].slice(-100), future: [], group: null };
  }
  state = finish(state);
  if (action.type === 'undo' && state.past.length) return { present: state.past.at(-1)!, past: state.past.slice(0, -1), future: [state.present, ...state.future], group: null };
  if (action.type === 'redo' && state.future.length) return { present: state.future[0], past: [...state.past, state.present].slice(-100), future: state.future.slice(1), group: null };
  return state;
}
