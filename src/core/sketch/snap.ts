import type { Vec2 } from '../geometry/vec';
import type { Id } from '../model/types';

export interface SnapTarget {
  p: Vec2;
  /** Sketch point id when the target is a point of the active sketch. */
  pointId?: Id;
}

export interface SnapSettings {
  grid: boolean;
  endpoint: boolean;
  axis: boolean;
}

export interface SnapResult {
  p: Vec2;
  kind: 'endpoint' | 'vertex' | 'axis' | 'grid' | 'none';
  pointId?: Id;
}

export interface SnapContext {
  /** Model units per screen pixel⁻¹ (pixels per mm). */
  pxPerMm: number;
  targets: SnapTarget[];
  /** Reference point for axis alignment (e.g. the previous point of a polyline). */
  anchors: Vec2[];
  gridStep: number;
  settings: SnapSettings;
  /** Pick radius in pixels. */
  radiusPx?: number;
}

/** Grid step (mm) such that minor grid lines are at least `minPx` apart. */
export function adaptiveGridStep(pxPerMm: number, minPx = 10): number {
  const steps = [1, 5, 10, 50, 100, 500, 1000, 5000];
  return steps.find((s) => s * pxPerMm >= minPx) ?? 5000;
}

/**
 * Snaps a raw cursor position. Priority: existing endpoints/vertices, then
 * axis alignment with the anchors (per coordinate), then the grid.
 */
export function snapPoint(raw: Vec2, ctx: SnapContext): SnapResult {
  const r = (ctx.radiusPx ?? 10) / ctx.pxPerMm;
  if (ctx.settings.endpoint) {
    let best: SnapTarget | undefined;
    let bestD = r;
    for (const t of ctx.targets) {
      const d = Math.hypot(t.p.x - raw.x, t.p.y - raw.y);
      if (d <= bestD) {
        best = t;
        bestD = d;
      }
    }
    if (best) return { p: { ...best.p }, kind: best.pointId ? 'endpoint' : 'vertex', pointId: best.pointId };
  }
  const g = ctx.gridStep;
  let x = ctx.settings.grid ? Math.round(raw.x / g) * g : raw.x;
  let y = ctx.settings.grid ? Math.round(raw.y / g) * g : raw.y;
  let kind: SnapResult['kind'] = ctx.settings.grid ? 'grid' : 'none';
  if (ctx.settings.axis) {
    const axisR = 8 / ctx.pxPerMm;
    for (const a of ctx.anchors) {
      if (Math.abs(raw.x - a.x) <= axisR) {
        x = a.x;
        kind = 'axis';
      }
      if (Math.abs(raw.y - a.y) <= axisR) {
        y = a.y;
        kind = 'axis';
      }
    }
  }
  return { p: { x: Math.round(x * 1e6) / 1e6, y: Math.round(y * 1e6) / 1e6 }, kind };
}
