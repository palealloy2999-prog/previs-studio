import { expect, it } from 'vitest';
import { createHistory, historyReducer as reduce } from '../src/history';

it('undoes and redoes edits without changing snapshots', () => {
  let h = createHistory({ value: 0 });
  h = reduce(h, { type: 'set', value: p => ({ value: p.value + 1 }) });
  h = reduce(h, { type: 'undo' }); expect(h.present.value).toBe(0);
  h = reduce(h, { type: 'redo' }); expect(h.present.value).toBe(1);
});
it('combines an entire drag and preserves redo for no-op edits', () => {
  let h = createHistory({ value: 0 });
  h = reduce(h, { type: 'begin' });
  for (let value = 1; value <= 20; value++) h = reduce(h, { type: 'set', value: { value } });
  h = reduce(h, { type: 'end' }); expect(h.past).toHaveLength(1);
  h = reduce(h, { type: 'undo' }); expect(h.present.value).toBe(0);
  h = reduce(h, { type: 'set', value: h.present }); expect(h.future).toHaveLength(1);
  h = reduce(h, { type: 'redo' }); expect(h.present.value).toBe(20);
});
it('discards redo on a new branch and bounds retained history', () => {
  let h = createHistory(0);
  h = reduce(h, { type: 'set', value: 1 }); h = reduce(h, { type: 'undo' });
  h = reduce(h, { type: 'set', value: 2 }); expect(h.future).toHaveLength(0);
  for (let value = 3; value <= 150; value++) h = reduce(h, { type: 'set', value });
  expect(h.past).toHaveLength(100);
});
it('finishes active gestures before undo and ignores a gesture returning to its starting value', () => {
  let h = createHistory(0);
  h = reduce(h, { type: 'begin' }); h = reduce(h, { type: 'set', value: 1 });
  h = reduce(h, { type: 'undo' }); expect(h.present).toBe(0);
  h = reduce(h, { type: 'begin' }); h = reduce(h, { type: 'set', value: 5 }); h = reduce(h, { type: 'set', value: 0 }); h = reduce(h, { type: 'end' });
  expect(h.past).toHaveLength(0); expect(h.future).toEqual([1]);
});
