import type { Id, Sketch, SketchPoint } from '../model/types';

export interface SolveResult {
  points: SketchPoint[];
  /** Largest remaining constraint violation in mm. */
  residual: number;
  converged: boolean;
}

/**
 * Small iterative (Gauss–Seidel style) constraint solver for façade sketches.
 * Supports horizontal, vertical, fixed and distance constraints.
 *
 * `pinned` points are treated as immovable for this solve (e.g. the point the
 * user is dragging), so the rest of the sketch follows it.
 */
export function solveSketch(sketch: Sketch, pinned: ReadonlySet<Id> = new Set(), maxIter = 100): SolveResult {
  const pts = new Map(sketch.points.map((p) => [p.id, { ...p }]));
  const segs = new Map(sketch.segments.map((s) => [s.id, s]));
  const fixed = new Set<Id>(pinned);
  for (const c of sketch.constraints) if (c.type === 'fixed') fixed.add(c.point);

  const residual = (): number => {
    let r = 0;
    for (const c of sketch.constraints) {
      if (c.type === 'fixed') {
        const p = pts.get(c.point);
        if (p) r = Math.max(r, Math.abs(p.x - c.x), Math.abs(p.z - c.z));
        continue;
      }
      const s = segs.get(c.segment);
      const a = s && pts.get(s.a);
      const b = s && pts.get(s.b);
      if (!a || !b) continue;
      if (c.type === 'horizontal') r = Math.max(r, Math.abs(a.z - b.z));
      else if (c.type === 'vertical') r = Math.max(r, Math.abs(a.x - b.x));
      else r = Math.max(r, Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - c.value));
    }
    return r;
  };

  // Moves a and b so that their `key` coordinate is shared, respecting fixed points.
  const equalise = (a: SketchPoint, b: SketchPoint, key: 'x' | 'z') => {
    const fa = fixed.has(a.id);
    const fb = fixed.has(b.id);
    if (fa && fb) return;
    if (fa) b[key] = a[key];
    else if (fb) a[key] = b[key];
    else {
      const m = (a[key] + b[key]) / 2;
      a[key] = m;
      b[key] = m;
    }
  };

  let iter = 0;
  for (; iter < maxIter; iter++) {
    for (const c of sketch.constraints) {
      if (c.type === 'fixed') {
        const p = pts.get(c.point);
        if (p) {
          p.x = c.x;
          p.z = c.z;
        }
        continue;
      }
      const s = segs.get(c.segment);
      const a = s && pts.get(s.a);
      const b = s && pts.get(s.b);
      if (!a || !b) continue;
      if (c.type === 'horizontal') equalise(a, b, 'z');
      else if (c.type === 'vertical') equalise(a, b, 'x');
      else {
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 1e-9) continue;
        const ux = dx / len;
        const uz = dz / len;
        const err = len - c.value;
        const fa = fixed.has(a.id);
        const fb = fixed.has(b.id);
        if (fa && fb) continue;
        const wa = fa ? 0 : fb ? 1 : 0.5;
        const wb = fb ? 0 : fa ? 1 : 0.5;
        a.x += ux * err * wa;
        a.z += uz * err * wa;
        b.x -= ux * err * wb;
        b.z -= uz * err * wb;
      }
    }
    if (residual() < 1e-7) break;
  }

  const r = residual();
  return {
    points: sketch.points.map((p) => {
      const q = pts.get(p.id)!;
      return { ...p, x: Math.round(q.x * 1e6) / 1e6, z: Math.round(q.z * 1e6) / 1e6 };
    }),
    residual: r,
    converged: r < 1e-4,
  };
}
