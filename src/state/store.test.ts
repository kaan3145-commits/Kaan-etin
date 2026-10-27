import { beforeEach, describe, expect, it } from 'vitest';
import { firstFacade } from '../core/model/query';
import { setFacadeParams, setLayout } from '../core/ops/operations';
import { createWallPanelingExample } from '../core/examples/wallPaneling';
import { useStore } from './store';

const s = () => useStore.getState();
const width = () => firstFacade(s().doc).width;

describe('store: undo / redo', () => {
  beforeEach(() => s().load(createWallPanelingExample()));

  it('records each operation as one undoable step', () => {
    const id = firstFacade(s().doc).id;
    s().apply(setFacadeParams(id, { width: 4600 }), 'w1');
    s().apply(setFacadeParams(id, { width: 5000 }), 'w2');
    expect(width()).toBe(5000);
    s().undo();
    expect(width()).toBe(4600);
    s().undo();
    expect(width()).toBe(4200);
    s().undo(); // nothing left
    expect(width()).toBe(4200);
    s().redo();
    s().redo();
    expect(width()).toBe(5000);
  });

  it('a new operation clears the redo stack', () => {
    const id = firstFacade(s().doc).id;
    s().apply(setFacadeParams(id, { width: 4600 }), 'w1');
    s().undo();
    s().apply(setFacadeParams(id, { height: 3000 }), 'h');
    expect(s().future).toHaveLength(0);
    s().redo();
    expect(width()).toBe(4200);
  });

  it('rejects invalid operations without changing the document', () => {
    const before = s().doc;
    const region = firstFacade(before).regions[0];
    expect(s().apply(setLayout(region.id, { count: 0 }), 'bad')).toBe(false);
    expect(s().doc).toBe(before);
    expect(s().error).toMatch(/count/i);
    expect(s().past).toHaveLength(0);
  });

  it('live edits (drags) collapse into a single undo step', () => {
    const id = firstFacade(s().doc).id;
    s().beginLive('drag');
    for (const w of [4300, 4400, 4500]) s().applyLive(setFacadeParams(id, { width: w }));
    expect(width()).toBe(4500);
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(width()).toBe(4200);
  });
});
