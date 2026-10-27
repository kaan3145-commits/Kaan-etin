import { verticalLineIntervals } from '../geometry/polygon';
import { type Box2, type Vec2, round6 } from '../geometry/vec';
import type { DrawingDef } from '../model/types';
import type { FacadeModel, Solid } from '../parametric/regenerate';
import { explodeDimension, formatMm, hChain, hDim, vChain, vDim } from './dimensions';
import { type Dimension, type Drawing, LAYERS, type Primitive, componentLayer } from './types';

function uniqSorted(values: number[]): number[] {
  const r = [...new Set(values.map(round6))].sort((a, b) => a - b);
  return r.filter((v, i) => i === 0 || v - r[i - 1] > 1e-6);
}

function rect(x0: number, y0: number, x1: number, y1: number): Vec2[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

export function drawingBounds(primitives: Primitive[], dims: Dimension[], scale: number): Box2 {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (p: Vec2) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  const all = [...primitives, ...dims.flatMap((d) => explodeDimension(d, scale))];
  for (const p of all) {
    if (p.type === 'line') {
      add(p.a);
      add(p.b);
    } else if (p.type === 'polyline') p.points.forEach(add);
    else {
      add(p.at);
      add({ x: p.at.x, y: p.at.y + p.height });
    }
  }
  if (!Number.isFinite(minX)) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

const visibleSolids = (m: FacadeModel): Solid[] => m.solids;
const local = (m: FacadeModel) => m.facade.origin;

function title(text: string, x: number, y: number, scale: number): Primitive {
  return { type: 'text', at: { x, y }, text, height: 3.5 * scale, rotation: 0, align: 'left', layer: LAYERS.title };
}

/** Front elevation: orthographic projection onto the façade plane (X → x, Z → y). */
export function elevationDrawing(m: FacadeModel, def: DrawingDef): Drawing {
  const { width: W, height: H } = m.facade;
  const s = def.scale;
  const sp = 8 * s; // dimension line spacing (8 mm on paper)
  const o = local(m);
  const prims: Primitive[] = [{ type: 'polyline', points: rect(0, 0, W, H), closed: true, layer: LAYERS.wall, ref: m.wall.id }];

  const solids = visibleSolids(m);
  for (const sol of solids) {
    prims.push({
      type: 'polyline',
      points: sol.profile.map((p) => ({ x: round6(p.x + sol.origin.x - o.x), y: round6(p.y + sol.origin.z - o.z) })),
      closed: true,
      layer: componentLayer(sol.semantic),
      ref: sol.id,
    });
  }

  // Panel systems are chained along the bottom/left, free-sketched components along the
  // top/right, so each chain reads as one set-out rather than a merge of unrelated edges.
  const systemIds = new Set(m.facade.regions.filter((r) => r.source === 'panelSystem').map((r) => r.id));
  const xStations = (list: Solid[]) => uniqSorted([0, W, ...list.flatMap((sl) => [sl.bbox.min.x - o.x, sl.bbox.max.x - o.x])]);
  const zStations = (list: Solid[]) => uniqSorted([0, H, ...list.flatMap((sl) => [sl.bbox.min.z - o.z, sl.bbox.max.z - o.z])]);
  const systems = solids.filter((sl) => systemIds.has(sl.regionId));
  const components = solids.filter((sl) => !systemIds.has(sl.regionId));
  const dims: Dimension[] = [
    ...hChain(xStations(systems), 0, -sp),
    hDim({ x: 0, y: 0 }, { x: W, y: 0 }, -2 * sp),
    ...vChain(zStations(systems), 0, -sp),
    vDim({ x: 0, y: 0 }, { x: 0, y: H }, -2 * sp),
    ...hChain(xStations(components), H, H + 1.5 * sp),
    ...vChain(zStations(components), W, W + sp),
  ];

  // section markers
  for (const sec of m.facade.drawings.filter((d) => d.type === 'section')) {
    const cx = sec.cutX ?? W / 2;
    const label = sec.name.replace(/^Section\s*/i, '').split('-')[0] || 'A';
    prims.push({ type: 'line', a: { x: cx, y: -0.5 * sp }, b: { x: cx, y: H + 0.5 * sp }, layer: LAYERS.anno, dashed: true });
    prims.push({ type: 'text', at: { x: cx, y: H + 0.7 * sp }, text: label, height: 3.5 * s, rotation: 0, align: 'center', layer: LAYERS.anno });
  }

  prims.push(title(`${def.name.toUpperCase()}  1:${s}`, 0, -3.6 * sp, s));
  return {
    id: def.id,
    type: 'elevation',
    name: def.name,
    scale: s,
    axes: ['X', 'Z'],
    primitives: prims,
    dimensions: dims,
    bounds: drawingBounds(prims, dims, s),
  };
}

/** Plan: orthographic projection from above (X → x, Y → y). Wall body is at y ∈ [0, t]. */
export function planDrawing(m: FacadeModel, def: DrawingDef): Drawing {
  const { width: W, wallThickness: T } = m.facade;
  const s = def.scale;
  const sp = 8 * s;
  const o = local(m);
  const prims: Primitive[] = [{ type: 'polyline', points: rect(0, 0, W, T), closed: true, layer: LAYERS.wall, ref: m.wall.id }];
  const solids = visibleSolids(m);
  for (const sol of solids) {
    prims.push({
      type: 'polyline',
      points: rect(sol.bbox.min.x - o.x, sol.bbox.min.y - o.y, sol.bbox.max.x - o.x, sol.bbox.max.y - o.y).map((p) => ({ x: round6(p.x), y: round6(p.y) })),
      closed: true,
      layer: componentLayer(sol.semantic),
      ref: sol.id,
    });
  }
  const minY = Math.min(0, ...solids.map((sl) => sl.bbox.min.y - o.y));
  const ys = uniqSorted([0, T, ...solids.flatMap((sl) => [sl.bbox.min.y - o.y, sl.bbox.max.y - o.y])]);
  const dims: Dimension[] = [
    hDim({ x: 0, y: minY }, { x: W, y: minY }, minY - 1.5 * sp),
    ...vChain(ys, W, W + sp, true),
  ];
  prims.push(title(`${def.name.toUpperCase()}  1:${s}`, 0, minY - 3 * sp, s));
  return {
    id: def.id,
    type: 'plan',
    name: def.name,
    scale: s,
    axes: ['X', 'Y'],
    primitives: prims,
    dimensions: dims,
    bounds: drawingBounds(prims, dims, s),
  };
}

/**
 * Vertical section at façade-local x = cutX, viewed from the right
 * (Y → x, Z → y). Cut faces are computed by intersecting each solid's profile
 * with the cutting plane, so non-rectangular profiles section correctly.
 */
export function sectionDrawing(m: FacadeModel, def: DrawingDef): Drawing {
  const { width: W, height: H, wallThickness: T } = m.facade;
  const s = def.scale;
  const sp = 8 * s;
  const o = local(m);
  const cutX = def.cutX ?? W / 2;
  const prims: Primitive[] = [];
  const zStations: number[] = [0, H];
  const yStations: number[] = [0, T];

  if (cutX >= 0 && cutX <= W) {
    prims.push({ type: 'polyline', points: rect(0, 0, T, H), closed: true, layer: LAYERS.cut, ref: m.wall.id });
  }
  for (const sol of visibleSolids(m)) {
    const localCut = cutX - (sol.origin.x - o.x);
    for (const [z0, z1] of verticalLineIntervals(sol.profile, localCut)) {
      const zz0 = round6(z0 + sol.origin.z - o.z);
      const zz1 = round6(z1 + sol.origin.z - o.z);
      const y0 = round6(sol.y0 + sol.origin.y - o.y);
      const y1 = round6(sol.y1 + sol.origin.y - o.y);
      prims.push({ type: 'polyline', points: rect(y0, zz0, y1, zz1), closed: true, layer: LAYERS.cut, ref: sol.id });
      zStations.push(zz0, zz1);
      yStations.push(y0, y1);
    }
  }
  const ys = uniqSorted(yStations);
  const zs = uniqSorted(zStations);
  const dims: Dimension[] = [...hChain(ys, 0, -sp, true), ...vChain(zs, T, T + sp, true)];
  prims.push(title(`${def.name.toUpperCase()}  (X = ${formatMm(cutX)})  1:${s}`, ys[0], -3 * sp, s));
  return {
    id: def.id,
    type: 'section',
    name: def.name,
    scale: s,
    axes: ['Y', 'Z'],
    primitives: prims,
    dimensions: dims,
    bounds: drawingBounds(prims, dims, s),
  };
}

export function buildDrawing(m: FacadeModel, def: DrawingDef): Drawing {
  if (def.type === 'plan') return planDrawing(m, def);
  if (def.type === 'section') return sectionDrawing(m, def);
  return elevationDrawing(m, def);
}

export function buildDrawings(m: FacadeModel): Drawing[] {
  return m.facade.drawings.map((d) => buildDrawing(m, d));
}

export interface SheetItem {
  drawing: Drawing;
  /** Translation applied to place the drawing on the sheet (model space). */
  offset: Vec2;
}

/** Arranges drawings on one model-space sheet: elevation, plan below it, section to the right. */
export function layoutSheet(drawings: Drawing[]): SheetItem[] {
  const items: SheetItem[] = [];
  const elev = drawings.find((d) => d.type === 'elevation');
  const margin = elev ? 15 * elev.scale : 300;
  let cursorRight = elev ? elev.bounds.max.x + margin : 0;
  let cursorBelow = elev ? elev.bounds.min.y - margin : 0;
  if (elev) items.push({ drawing: elev, offset: { x: 0, y: 0 } });
  for (const d of drawings) {
    if (d === elev) continue;
    if (d.type === 'plan') {
      items.push({ drawing: d, offset: { x: 0, y: cursorBelow - d.bounds.max.y } });
      cursorBelow = cursorBelow - (d.bounds.max.y - d.bounds.min.y) - margin;
    } else {
      items.push({ drawing: d, offset: { x: cursorRight - d.bounds.min.x, y: 0 } });
      cursorRight += d.bounds.max.x - d.bounds.min.x + margin;
    }
  }
  return items;
}
