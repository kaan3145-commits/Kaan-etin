import { describe, expect, it } from 'vitest';
import { adaptiveGridStep, snapPoint } from './snap';

const settings = { grid: true, endpoint: true, axis: true };

describe('snapPoint', () => {
  it('prefers endpoints within the pick radius', () => {
    const r = snapPoint({ x: 104, y: 3 }, { pxPerMm: 1, targets: [{ p: { x: 100, y: 0 }, pointId: 'a' }], anchors: [], gridStep: 50, settings });
    expect(r).toEqual({ p: { x: 100, y: 0 }, kind: 'endpoint', pointId: 'a' });
  });

  it('aligns to anchor axes, then snaps the free coordinate to the grid', () => {
    const r = snapPoint({ x: 503, y: 247 }, { pxPerMm: 1, targets: [], anchors: [{ x: 500, y: 0 }], gridStep: 10, settings });
    expect(r.kind).toBe('axis');
    expect(r.p).toEqual({ x: 500, y: 250 });
  });

  it('falls back to the grid, or to raw coordinates when snapping is off', () => {
    expect(snapPoint({ x: 123, y: 456 }, { pxPerMm: 1, targets: [], anchors: [], gridStep: 50, settings }).p).toEqual({ x: 100, y: 450 });
    const off = { grid: false, endpoint: false, axis: false };
    expect(snapPoint({ x: 123.4, y: 456 }, { pxPerMm: 1, targets: [], anchors: [], gridStep: 50, settings: off })).toEqual({ p: { x: 123.4, y: 456 }, kind: 'none' });
  });

  it('chooses a readable grid step for the zoom level', () => {
    expect(adaptiveGridStep(0.15)).toBe(100);
    expect(adaptiveGridStep(2)).toBe(5);
  });
});
