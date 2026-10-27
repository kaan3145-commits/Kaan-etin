import type { Vec2 } from '../geometry/vec';
import type { Dimension, Primitive } from './types';

/** Formats a millimetre value for annotation: integers stay integers, otherwise one decimal. */
export function formatMm(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function hDim(a: Vec2, b: Vec2, at: number, layer = 'KAD-DIM'): Dimension {
  return { a, b, direction: 'h', at, value: Math.abs(b.x - a.x), layer };
}

export function vDim(a: Vec2, b: Vec2, at: number, layer = 'KAD-DIM'): Dimension {
  return { a, b, direction: 'v', at, value: Math.abs(b.y - a.y), layer };
}

/**
 * Chain of horizontal dimensions through sorted x stations. A chain with a
 * single link would only repeat the overall dimension, so it is omitted.
 */
export function hChain(xs: number[], fromY: number, at: number, allowSingle = false): Dimension[] {
  if (xs.length < 3 && !allowSingle) return [];
  const out: Dimension[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    if (xs[i + 1] - xs[i] > 1e-6) out.push(hDim({ x: xs[i], y: fromY }, { x: xs[i + 1], y: fromY }, at));
  }
  return out;
}

export function vChain(ys: number[], fromX: number, at: number, allowSingle = false): Dimension[] {
  if (ys.length < 3 && !allowSingle) return [];
  const out: Dimension[] = [];
  for (let i = 0; i + 1 < ys.length; i++) {
    if (ys[i + 1] - ys[i] > 1e-6) out.push(vDim({ x: fromX, y: ys[i] }, { x: fromX, y: ys[i + 1] }, at));
  }
  return out;
}

/**
 * Explodes a dimension into CAD primitives: extension lines, dimension line,
 * architectural oblique ticks and a value label. Sizes follow the drawing scale
 * (paper text height 2.5 mm).
 */
export function explodeDimension(d: Dimension, scale: number): Primitive[] {
  const textH = 2.5 * scale;
  const tick = 1.5 * scale;
  const gap = 1 * scale;
  const ext = 1.5 * scale;
  const out: Primitive[] = [];
  const L = d.layer;
  const text = formatMm(d.value);

  if (d.direction === 'h') {
    const y = d.at;
    const x1 = Math.min(d.a.x, d.b.x);
    const x2 = Math.max(d.a.x, d.b.x);
    const pa = d.a.x <= d.b.x ? d.a : d.b;
    const pb = d.a.x <= d.b.x ? d.b : d.a;
    const sign = y >= pa.y ? 1 : -1;
    out.push({ type: 'line', a: { x: x1, y: pa.y + sign * gap }, b: { x: x1, y: y + sign * ext }, layer: L });
    out.push({ type: 'line', a: { x: x2, y: pb.y + sign * gap }, b: { x: x2, y: y + sign * ext }, layer: L });
    out.push({ type: 'line', a: { x: x1, y }, b: { x: x2, y }, layer: L });
    for (const x of [x1, x2]) {
      out.push({ type: 'line', a: { x: x - tick / 2, y: y - tick / 2 }, b: { x: x + tick / 2, y: y + tick / 2 }, layer: L });
    }
    out.push({ type: 'text', at: { x: (x1 + x2) / 2, y: y + 0.8 * scale }, text, height: textH, rotation: 0, align: 'center', layer: L });
  } else {
    const x = d.at;
    const y1 = Math.min(d.a.y, d.b.y);
    const y2 = Math.max(d.a.y, d.b.y);
    const pa = d.a.y <= d.b.y ? d.a : d.b;
    const pb = d.a.y <= d.b.y ? d.b : d.a;
    const sign = x >= pa.x ? 1 : -1;
    out.push({ type: 'line', a: { x: pa.x + sign * gap, y: y1 }, b: { x: x + sign * ext, y: y1 }, layer: L });
    out.push({ type: 'line', a: { x: pb.x + sign * gap, y: y2 }, b: { x: x + sign * ext, y: y2 }, layer: L });
    out.push({ type: 'line', a: { x, y: y1 }, b: { x, y: y2 }, layer: L });
    for (const y of [y1, y2]) {
      out.push({ type: 'line', a: { x: x - tick / 2, y: y - tick / 2 }, b: { x: x + tick / 2, y: y + tick / 2 }, layer: L });
    }
    out.push({ type: 'text', at: { x: x - 0.8 * scale, y: (y1 + y2) / 2 }, text, height: textH, rotation: 90, align: 'center', layer: L });
  }
  return out;
}
