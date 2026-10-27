import { cleanPolygon, isSelfIntersecting, pointInPolygon, segmentsIntersect, signedArea } from '../geometry/polygon';
import { EPS, type Vec2, eq2 } from '../geometry/vec';
import { hashString } from '../model/ids';
import type { Id, Sketch } from '../model/types';

export interface SketchFace {
  /** Deterministic key derived from the boundary segment IDs (stable across edits of coordinates). */
  key: string;
  /** Counter-clockwise boundary polygon in façade-local (x → X, y → Z) coordinates. */
  polygon: Vec2[];
  pointIds: Id[];
  boundarySegments: Id[];
  area: number;
}

export interface SketchIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  /** Sketch elements involved. */
  refs: Id[];
}

export interface SketchAnalysis {
  faces: SketchFace[];
  issues: SketchIssue[];
  /** Segments that do not belong to any closed contour. */
  openSegments: Id[];
}

interface HalfEdge {
  from: Id;
  to: Id;
  seg: Id;
  angle: number;
}

/**
 * Converts a sketch graph (points + segments) into planar faces.
 *
 * Algorithm: validate segments (no zero-length, no crossings), prune dangling
 * chains, then trace every bounded face of the planar graph by walking half-edges
 * and always turning to the next edge clockwise from the incoming direction.
 * Bounded faces come out counter-clockwise (positive area); the unbounded outer
 * face comes out clockwise and is discarded.
 */
export function analyzeSketch(sketch: Sketch): SketchAnalysis {
  const issues: SketchIssue[] = [];
  const pts = new Map<Id, Vec2>();
  for (const p of sketch.points) pts.set(p.id, { x: p.x, y: p.z });

  // 1. Segment validation and de-duplication
  const segs: Array<{ id: Id; a: Id; b: Id }> = [];
  const seenPairs = new Set<string>();
  for (const s of sketch.segments) {
    const a = pts.get(s.a);
    const b = pts.get(s.b);
    if (!a || !b) {
      issues.push({ severity: 'error', code: 'dangling-reference', message: `Segment ${s.id} references a missing point.`, refs: [s.id] });
      continue;
    }
    if (s.a === s.b || eq2(a, b)) {
      issues.push({ severity: 'warning', code: 'zero-length', message: 'Zero-length segment ignored.', refs: [s.id] });
      continue;
    }
    const pair = s.a < s.b ? `${s.a}|${s.b}` : `${s.b}|${s.a}`;
    if (seenPairs.has(pair)) {
      issues.push({ severity: 'warning', code: 'duplicate-segment', message: 'Duplicate segment ignored.', refs: [s.id] });
      continue;
    }
    seenPairs.add(pair);
    segs.push(s);
  }

  // 2. Crossing detection (segments that touch anywhere except a shared endpoint)
  const crossing = new Set<Id>();
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i];
      const t = segs[j];
      const shared = [s.a, s.b].filter((id) => id === t.a || id === t.b);
      const a = pts.get(s.a)!;
      const b = pts.get(s.b)!;
      const c = pts.get(t.a)!;
      const d = pts.get(t.b)!;
      if (shared.length === 0) {
        if (segmentsIntersect(a, b, c, d)) {
          crossing.add(s.id).add(t.id);
        }
      } else if (shared.length === 1) {
        // Adjacent segments may only meet at the shared point: reject overlaps (collinear fold-back).
        const sh = pts.get(shared[0])!;
        const other1 = eq2(a, sh) ? b : a;
        const other2 = eq2(c, sh) ? d : c;
        const u = { x: other1.x - sh.x, y: other1.y - sh.y };
        const v = { x: other2.x - sh.x, y: other2.y - sh.y };
        const cross = u.x * v.y - u.y * v.x;
        const dot = u.x * v.x + u.y * v.y;
        if (Math.abs(cross) <= EPS * Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) && dot > 0) {
          crossing.add(s.id).add(t.id);
        }
      }
    }
  }
  if (crossing.size > 0) {
    issues.push({
      severity: 'error',
      code: 'crossing-segments',
      message: 'Segments cross or overlap without a shared point. Split them at the intersection.',
      refs: [...crossing],
    });
  }
  const usable = segs.filter((s) => !crossing.has(s.id));

  // 3. Prune dangling chains (vertices with degree 1)
  const alive = new Set(usable.map((s) => s.id));
  let pruned = true;
  while (pruned) {
    pruned = false;
    const degree = new Map<Id, number>();
    for (const s of usable) {
      if (!alive.has(s.id)) continue;
      degree.set(s.a, (degree.get(s.a) ?? 0) + 1);
      degree.set(s.b, (degree.get(s.b) ?? 0) + 1);
    }
    for (const s of usable) {
      if (alive.has(s.id) && ((degree.get(s.a) ?? 0) < 2 || (degree.get(s.b) ?? 0) < 2)) {
        alive.delete(s.id);
        pruned = true;
      }
    }
  }
  const openSegments = segs.filter((s) => !alive.has(s.id) && !crossing.has(s.id)).map((s) => s.id);
  if (openSegments.length > 0) {
    issues.push({
      severity: 'warning',
      code: 'open-contour',
      message: `${openSegments.length} segment(s) are not part of a closed contour.`,
      refs: openSegments,
    });
  }

  // 4. Build half-edge adjacency sorted by angle
  const out = new Map<Id, HalfEdge[]>();
  const push = (from: Id, to: Id, seg: Id) => {
    const a = pts.get(from)!;
    const b = pts.get(to)!;
    const he: HalfEdge = { from, to, seg, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    const list = out.get(from) ?? [];
    list.push(he);
    out.set(from, list);
  };
  for (const s of usable) {
    if (!alive.has(s.id)) continue;
    push(s.a, s.b, s.id);
    push(s.b, s.a, s.id);
  }
  for (const list of out.values()) list.sort((p, q) => p.angle - q.angle);

  // 5. Trace faces
  const visited = new Set<string>();
  const heKey = (h: HalfEdge) => `${h.from}>${h.to}`;
  const faces: SketchFace[] = [];
  for (const list of out.values()) {
    for (const start of list) {
      if (visited.has(heKey(start))) continue;
      const loop: HalfEdge[] = [];
      let h = start;
      let guard = 0;
      while (!visited.has(heKey(h)) && guard++ < 100000) {
        visited.add(heKey(h));
        loop.push(h);
        const candidates = out.get(h.to)!;
        // index of the reverse half-edge (h.to -> h.from)
        const rev = candidates.findIndex((c) => c.to === h.from && c.seg === h.seg);
        // next edge clockwise from the reverse direction = previous in CCW-sorted order
        h = candidates[(rev - 1 + candidates.length) % candidates.length];
      }
      const poly = loop.map((e) => pts.get(e.from)!);
      const a = signedArea(poly);
      if (a <= EPS) continue; // outer (clockwise) face or degenerate
      const boundarySegments = loop.map((e) => e.seg);
      const key = 'f' + hashString([...boundarySegments].sort().join(','));
      const polygon = cleanPolygon(poly);
      if (polygon.length < 3 || isSelfIntersecting(polygon)) {
        issues.push({ severity: 'error', code: 'invalid-contour', message: 'Closed contour is degenerate or self-intersecting.', refs: boundarySegments });
        continue;
      }
      faces.push({
        key,
        polygon,
        pointIds: loop.map((e) => e.from),
        boundarySegments,
        area: a,
      });
    }
  }

  // 6. Nested contours (holes are not supported in v1: they would be extruded as overlapping solids)
  for (const f of faces) {
    for (const g of faces) {
      if (f === g) continue;
      const shares = f.pointIds.some((id) => g.pointIds.includes(id));
      if (!shares && f.polygon.every((p) => pointInPolygon(p, g.polygon))) {
        issues.push({
          severity: 'warning',
          code: 'nested-contour',
          message: 'A contour lies inside another. Holes/voids are not supported yet; both are extruded as solids.',
          refs: [...f.boundarySegments],
        });
      }
    }
  }

  faces.sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));
  return { faces, issues, openSegments };
}
