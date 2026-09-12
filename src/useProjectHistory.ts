import { useCallback, useReducer } from 'react';
import { createHistory, historyReducer } from './history';
import type { Project } from './model';

export function useProjectHistory(initial: () => Project) {
  const [state, dispatch] = useReducer(historyReducer<Project>, undefined, () => createHistory(initial()));
  const setProject = useCallback((value: Project | ((p: Project) => Project)) => dispatch({ type: 'set', value }), []);
  const beginGroup = useCallback(() => dispatch({ type: 'begin' }), []);
  const endGroup = useCallback(() => dispatch({ type: 'end' }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const groupChanged = !!state.group && state.group.before !== state.present;
  return { project: state.present, setProject, beginGroup, endGroup, undo, redo,
    canUndo: state.past.length > 0 || groupChanged, canRedo: state.future.length > 0 && !groupChanged };
}
