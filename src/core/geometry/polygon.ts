import { EPS, type Vec2, cross2, dist2, eq2, sub2 } from './vec';

/** Signed area (shoelace). Positive for counter-clockwise polygons. */
export function signedArea(poly: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function area(poly: readonly Vec2[]): number {
  return Math.abs(signedArea(poly));
}

export function isCCW(poly: readonly Vec2[]): boolean {
  return signedArea(poly) > 0;
}

export function ensureCCW(poly: readonly Vec2[]): Vec2[] {
  return isCCW(poly) ? [...poly] : [...poly].reverse();
}

export function perimeter(poly: readonly Vec2[]): number {
  let p = 0;
  for (let i = 0; i < poly.length; i++) p += dist2(poly[i], poly[(i + 1) % poly.length]);
  return p;
}

/** Removes consecutive duplicates and collinear vertices. */
export function cleanPolygon(poly: readonly Vec2[], eps = EPS): Vec2[] {
  const out: Vec2[] = [];
  for (const p of poly) {
    if (out.length === 0 || !eq2(out[out.length - 1], p, eps)) out.push(p);
  }
  if (out.length > 1 && eq2(out[0], out[out.length - 1], eps)) out.pop();
  let changed = true;
  while (changed && out.length >= 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      if (Math.abs(cross2(sub2(b, a), sub2(c, b))) <= eps * Math.max(1, dist2(a, c))) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

function orient(a: Vec2, b: Vec2, c: Vec2): number {
  const v = cross2(sub2(b, a), sub2(c, a));
  return Math.abs(v) <= EPS ? 0 : v > 0 ? 1 : -1;
}

function onSegment(a: Vec2, b: Vec2, p: Vec2): boolean {
  return (
    Math.min(a.x, b.x) - EPS <= p.x &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    Math.min(a.y, b.y) - EPS <= p.y &&
    p.y <= Math.max(a.y, b.y) + EPS
  );
}

/** True when closed segments [a,b] and [c,d] share at least one point. */
export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  if (o4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

/** Detects any intersection between non-adjacent edges of a closed polygon. */
export function isSelfIntersecting(poly: readonly Vec2[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // skip adjacent edges (they share a vertex by construction)
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsIntersect(a, b, poly[j], poly[(j + 1) % n])) return true;
    }
  }
  return false;
}

export type PolygonIssue = 'too-few-vertices' | 'zero-area' | 'self-intersecting';

export function validatePolygon(poly: readonly Vec2[]): PolygonIssue | null {
  const clean = cleanPolygon(poly);
  if (clean.length < 3) return 'too-few-vertices';
  // checked before area: a symmetric bow-tie has zero net area but is a crossing, not a sliver
  if (isSelfIntersecting(clean)) return 'self-intersecting';
  if (area(clean) <= EPS) return 'zero-area';
  return null;
}

/** Even-odd point-in-polygon test (boundary counts as outside). */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Intersects a simple polygon with the vertical line x = c.
 * Returns sorted [yStart, yEnd] intervals lying inside the polygon.
 */
export function verticalLineIntervals(poly: readonly Vec2[], c: number): Array<[number, number]> {
  const ys: number[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    // half-open rule avoids double counting vertices
    if ((a.x <= c && b.x > c) || (b.x <= c && a.x > c)) {
      const t = (c - a.x) / (b.x - a.x);
      ys.push(a.y + t * (b.y - a.y));
    }
  }
  ys.sort((p, q) => p - q);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < ys.length; i += 2) {
    if (ys[i + 1] - ys[i] > EPS) out.push([ys[i], ys[i + 1]]);
  }
  return out;
}

/**
 * Ear-clipping triangulation of a simple polygon.
 * Returns index triples into the input array, wound counter-clockwise.
 */
export function triangulate(poly: readonly Vec2[]): Array<[number, number, number]> {
  const n = poly.length;
  if (n < 3) return [];
  const ccw = isCCW(poly);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(ccw ? i : n - 1 - i);
  const tris: Array<[number, number, number]> = [];

  const isEar = (i0: number, i1: number, i2: number, rest: number[]): boolean => {
    const a = poly[i0];
    const b = poly[i1];
    const c = poly[i2];
    if (cross2(sub2(b, a), sub2(c, b)) <= EPS) return false; // reflex or degenerate
    for (const k of rest) {
      if (k === i0 || k === i1 || k === i2) continue;
      const p = poly[k];
      if (
        cross2(sub2(b, a), sub2(p, a)) >= -EPS &&
        cross2(sub2(c, b), sub2(p, b)) >= -EPS &&
        cross2(sub2(a, c), sub2(p, c)) >= -EPS
      ) {
        return false;
      }
    }
    return true;
  };

  let guard = 0;
  while (idx.length > 3 && guard < n * n) {
    guard++;
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i - 1 + idx.length) % idx.length];
      const i1 = idx[i];
      const i2 = idx[(i + 1) % idx.length];
      if (isEar(i0, i1, i2, idx)) {
        tris.push([i0, i1, i2]);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) break; // degenerate input; stop rather than loop forever
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}
