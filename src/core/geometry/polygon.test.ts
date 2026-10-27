import { describe, expect, it } from 'vitest';
import {
  area,
  cleanPolygon,
  isSelfIntersecting,
  signedArea,
  triangulate,
  validatePolygon,
  verticalLineIntervals,
} from './polygon';

const sq = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];
// L-shape, CCW, area = 100·50 + 50·50 = 7500
const L = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
  { x: 50, y: 50 },
  { x: 50, y: 100 },
  { x: 0, y: 100 },
];

describe('polygon', () => {
  it('computes signed area and orientation', () => {
    expect(signedArea(sq)).toBe(10000);
    expect(signedArea([...sq].reverse())).toBe(-10000);
    expect(area(L)).toBe(7500);
  });

  it('detects self-intersection (bow-tie)', () => {
    const bow = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    expect(isSelfIntersecting(bow)).toBe(true);
    expect(isSelfIntersecting(L)).toBe(false);
    expect(validatePolygon(bow)).toBe('self-intersecting');
    expect(validatePolygon([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe('too-few-vertices');
    expect(validatePolygon([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])).toBe('too-few-vertices');
  });

  it('removes duplicate and collinear vertices', () => {
    const c = cleanPolygon([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
    expect(c).toHaveLength(4);
  });

  it('triangulates a concave polygon preserving area', () => {
    for (const poly of [sq, L, [...L].reverse()]) {
      const tris = triangulate(poly);
      expect(tris).toHaveLength(poly.length - 2);
      const sum = tris.reduce((s, [a, b, c]) => s + signedArea([poly[a], poly[b], poly[c]]), 0);
      expect(sum).toBeCloseTo(area(poly), 9);
    }
  });

  it('intersects a polygon with a vertical line', () => {
    expect(verticalLineIntervals(L, 25)).toEqual([[0, 100]]);
    expect(verticalLineIntervals(L, 75)).toEqual([[0, 50]]);
    expect(verticalLineIntervals(L, 150)).toEqual([]);
  });
});
