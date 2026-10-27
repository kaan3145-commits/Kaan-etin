import { describe, expect, it } from 'vitest';
import type { Sketch } from '../model/types';
import { solveSketch } from './constraints';
import { analyzeSketch } from './faces';

function sketchFrom(points: Array<[string, number, number]>, segs: Array<[string, string]>): Sketch {
  return {
    id: 's',
    points: points.map(([id, x, z]) => ({ id, x, z })),
    segments: segs.map(([a, b], i) => ({ id: `s${i}`, a, b })),
    constraints: [],
  };
}

describe('analyzeSketch: point → line → closed contour → face', () => {
  it('turns a closed rectangle into one CCW face', () => {
    const s = sketchFrom(
      [['a', 0, 0], ['b', 600, 0], ['c', 600, 400], ['d', 0, 400]],
      [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']],
    );
    const r = analyzeSketch(s);
    expect(r.issues).toEqual([]);
    expect(r.faces).toHaveLength(1);
    expect(r.faces[0].area).toBe(240000);
    expect(r.faces[0].boundarySegments.sort()).toEqual(['s0', 's1', 's2', 's3']);
  });

  it('is independent of segment direction and finds both faces of a divided rectangle', () => {
    const s = sketchFrom(
      [['a', 0, 0], ['b', 500, 0], ['c', 1000, 0], ['d', 1000, 300], ['e', 500, 300], ['f', 0, 300]],
      [['b', 'a'], ['b', 'c'], ['d', 'c'], ['d', 'e'], ['e', 'f'], ['a', 'f'], ['b', 'e']],
    );
    const r = analyzeSketch(s);
    expect(r.faces).toHaveLength(2);
    expect(r.faces.map((f) => f.area).sort()).toEqual([150000, 150000]);
  });

  it('keeps face keys stable when coordinates change', () => {
    const s = sketchFrom(
      [['a', 0, 0], ['b', 600, 0], ['c', 600, 400], ['d', 0, 400]],
      [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']],
    );
    const k1 = analyzeSketch(s).faces[0].key;
    s.points[2].x = 900;
    expect(analyzeSketch(s).faces[0].key).toBe(k1);
  });

  it('reports open contours without producing faces', () => {
    const s = sketchFrom([['a', 0, 0], ['b', 100, 0], ['c', 100, 100]], [['a', 'b'], ['b', 'c']]);
    const r = analyzeSketch(s);
    expect(r.faces).toHaveLength(0);
    expect(r.issues.map((i) => i.code)).toContain('open-contour');
  });

  it('rejects crossing segments with a meaningful error', () => {
    const s = sketchFrom(
      [['a', 0, 0], ['b', 100, 100], ['c', 100, 0], ['d', 0, 100]],
      [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']],
    );
    const r = analyzeSketch(s);
    expect(r.faces).toHaveLength(0);
    const err = r.issues.find((i) => i.code === 'crossing-segments');
    expect(err?.severity).toBe('error');
    expect(err?.refs.sort()).toEqual(['s0', 's2']);
  });

  it('ignores dangling chains attached to a closed loop', () => {
    const s = sketchFrom(
      [['a', 0, 0], ['b', 100, 0], ['c', 100, 100], ['d', 0, 100], ['e', 200, 0]],
      [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a'], ['b', 'e']],
    );
    const r = analyzeSketch(s);
    expect(r.faces).toHaveLength(1);
    expect(r.openSegments).toEqual(['s4']);
  });

  it('flags references to missing points', () => {
    const s = sketchFrom([['a', 0, 0]], [['a', 'zz']]);
    expect(analyzeSketch(s).issues[0].code).toBe('dangling-reference');
  });
});

describe('solveSketch', () => {
  it('enforces horizontal / vertical constraints around a dragged (pinned) point', () => {
    const s = sketchFrom(
      [['a', 0, 0], ['b', 600, 0], ['c', 600, 400], ['d', 0, 400]],
      [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']],
    );
    s.constraints = [
      { id: 'h0', type: 'horizontal', segment: 's0' },
      { id: 'v1', type: 'vertical', segment: 's1' },
      { id: 'h2', type: 'horizontal', segment: 's2' },
      { id: 'v3', type: 'vertical', segment: 's3' },
      { id: 'fa', type: 'fixed', point: 'a', x: 0, z: 0 },
    ];
    s.points[2] = { id: 'c', x: 800, z: 500 }; // user dragged c
    const r = solveSketch(s, new Set(['c']));
    expect(r.converged).toBe(true);
    const p = Object.fromEntries(r.points.map((q) => [q.id, q]));
    expect(p.a).toMatchObject({ x: 0, z: 0 });
    expect(p.b).toMatchObject({ x: 800, z: 0 });
    expect(p.d).toMatchObject({ x: 0, z: 500 });
  });

  it('enforces a distance constraint', () => {
    const s = sketchFrom([['a', 0, 0], ['b', 300, 0]], [['a', 'b']]);
    s.constraints = [
      { id: 'f', type: 'fixed', point: 'a', x: 0, z: 0 },
      { id: 'd', type: 'distance', segment: 's0', value: 450 },
    ];
    const r = solveSketch(s);
    expect(r.points[1].x).toBeCloseTo(450, 6);
  });
});
