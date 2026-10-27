import { produce } from 'immer';
import { createId } from '../model/ids';
import { allFacades } from '../model/query';
import { solveSketch } from '../sketch/constraints';
import type {
  Constraint,
  DrawingDef,
  EntityBase,
  ExtrudeFeature,
  Facade,
  Id,
  KadDocument,
  LinearPattern,
  Mm,
  PanelLayoutParams,
  PanelOverride,
  Provenance,
  ReferenceImage,
  Region,
  SketchPoint,
  SketchRegion,
} from '../model/types';

/**
 * Document operations. Each operation is a pure function that receives an
 * immer draft; `applyOp` produces a new immutable document, bumps the document
 * revision and leaves the input untouched (which is what makes undo/redo exact).
 */
export type Op = (d: KadDocument) => void;

export class OpError extends Error {}

export function applyOp(doc: KadDocument, op: Op): KadDocument {
  return produce(doc, (d) => {
    op(d as KadDocument);
    d.revision += 1;
  });
}

function touch(e: EntityBase) {
  e.rev += 1;
}

function facadeOf(d: KadDocument, id: Id): Facade {
  const f = allFacades(d).find((x) => x.id === id);
  if (!f) throw new OpError(`Façade ${id} not found`);
  return f;
}

function regionOf(d: KadDocument, id: Id): Region {
  for (const f of allFacades(d)) {
    const r = f.regions.find((x) => x.id === id);
    if (r) return r;
  }
  throw new OpError(`Region ${id} not found`);
}

function sketchRegionOf(d: KadDocument, id: Id): SketchRegion {
  const r = regionOf(d, id);
  if (r.source !== 'sketch') throw new OpError('Region is not a sketch region');
  return r;
}

function entityOf(d: KadDocument, id: Id): EntityBase {
  if (d.project.id === id) return d.project;
  for (const s of d.project.spaces) {
    if (s.id === id) return s;
    for (const f of s.facades) {
      if (f.id === id) return f;
      for (const r of f.regions) if (r.id === id) return r;
    }
  }
  throw new OpError(`Entity ${id} not found`);
}

const positive = (v: number | undefined, what: string) => {
  if (v !== undefined && !(Number.isFinite(v) && v > 0)) throw new OpError(`${what} must be a positive number`);
};

export const renameEntity = (id: Id, name: string): Op => (d) => {
  const e = entityOf(d, id);
  e.name = name;
  touch(e);
};

export const setProvenance = (id: Id, key: string, value: Provenance): Op => (d) => {
  const e = entityOf(d, id);
  e.provenance = { ...e.provenance, [key]: value };
  touch(e);
};

export const setFacadeParams =
  (facadeId: Id, patch: Partial<Pick<Facade, 'width' | 'height' | 'wallThickness' | 'wallMaterial'>>): Op =>
  (d) => {
    positive(patch.width, 'Width');
    positive(patch.height, 'Height');
    positive(patch.wallThickness, 'Wall thickness');
    const f = facadeOf(d, facadeId);
    const oldWidth = f.width;
    Object.assign(f, patch);
    // keep section cuts at the same relative position when the width changes
    if (patch.width !== undefined && oldWidth > 0) {
      for (const dr of f.drawings) if (dr.cutX !== undefined) dr.cutX = (dr.cutX / oldWidth) * patch.width;
    }
    touch(f);
  };

export const setDrawingParams =
  (facadeId: Id, drawingId: Id, patch: Partial<Pick<DrawingDef, 'scale' | 'cutX' | 'name'>>): Op =>
  (d) => {
    const f = facadeOf(d, facadeId);
    const dr = f.drawings.find((x) => x.id === drawingId);
    if (!dr) throw new OpError('Drawing not found');
    Object.assign(dr, patch);
    touch(f);
  };

export const setReference = (facadeId: Id, ref: ReferenceImage | null): Op => (d) => {
  const f = facadeOf(d, facadeId);
  f.reference = ref;
  touch(f);
};

export const setReferenceProps =
  (facadeId: Id, patch: Partial<Pick<ReferenceImage, 'opacity' | 'visible' | 'corners'>>): Op =>
  (d) => {
    const f = facadeOf(d, facadeId);
    if (!f.reference) throw new OpError('Façade has no reference image');
    Object.assign(f.reference, patch);
    touch(f);
  };

export const addRegion = (facadeId: Id, region: Region): Op => (d) => {
  const f = facadeOf(d, facadeId);
  if (f.regions.some((r) => r.id === region.id)) throw new OpError('Duplicate region id');
  f.regions.push({ ...region, parentId: f.id } as Region);
  touch(f);
};

export const deleteRegion = (regionId: Id): Op => (d) => {
  for (const f of allFacades(d)) {
    const i = f.regions.findIndex((r) => r.id === regionId);
    if (i >= 0) {
      f.regions.splice(i, 1);
      touch(f);
      return;
    }
  }
  throw new OpError('Region not found');
};

export const setRegionParams =
  (regionId: Id, patch: Partial<Pick<Region, 'name' | 'semantic' | 'material' | 'visible' | 'dna'>>): Op =>
  (d) => {
    const r = regionOf(d, regionId);
    Object.assign(r, patch);
    touch(r);
  };

export const setExtrude = (regionId: Id, patch: Partial<Pick<ExtrudeFeature, 'thickness' | 'standoff'>>): Op => (d) => {
  positive(patch.thickness, 'Thickness');
  if (patch.standoff !== undefined && !(patch.standoff >= 0)) throw new OpError('Standoff cannot be negative');
  const r = regionOf(d, regionId);
  Object.assign(r.extrude, patch);
  touch(r);
};

export const setPattern =
  (regionId: Id, pattern: Omit<LinearPattern, 'id' | 'type'> | null, patternId: Id = createId('fea')): Op =>
  (d) => {
    const r = regionOf(d, regionId);
    if (pattern === null) r.pattern = null;
    else {
      if (!(pattern.count >= 1)) throw new OpError('Pattern count must be at least 1');
      r.pattern = { id: r.pattern?.id ?? patternId, type: 'linearPattern', ...pattern, count: Math.floor(pattern.count) };
    }
    touch(r);
  };

export const setLayout = (regionId: Id, patch: Partial<PanelLayoutParams>): Op => (d) => {
  const r = regionOf(d, regionId);
  if (r.source !== 'panelSystem') throw new OpError('Region is not a panel system');
  if (patch.count !== undefined && !(Number.isInteger(patch.count) && patch.count >= 1)) {
    throw new OpError('Panel count must be a whole number ≥ 1');
  }
  Object.assign(r.layout, patch);
  touch(r);
};

export const setPanelOverride = (regionId: Id, index: number, patch: PanelOverride | null): Op => (d) => {
  const r = regionOf(d, regionId);
  if (r.source !== 'panelSystem') throw new OpError('Region is not a panel system');
  const key = String(index);
  if (patch === null) delete r.overrides[key];
  else {
    const merged: PanelOverride = { ...r.overrides[key], ...patch };
    for (const k of Object.keys(merged) as Array<keyof PanelOverride>) if (merged[k] === undefined) delete merged[k];
    if (Object.keys(merged).length === 0) delete r.overrides[key];
    else r.overrides[key] = merged;
  }
  touch(r);
};

// ---------------------------------------------------------------- sketch

export const addPoint = (regionId: Id, point: SketchPoint): Op => (d) => {
  const r = sketchRegionOf(d, regionId);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) throw new OpError('Point coordinates must be finite');
  r.sketch.points.push(point);
  touch(r);
};

/** Moves a point and re-solves the sketch constraints with that point pinned. */
export const movePoint = (regionId: Id, pointId: Id, x: Mm, z: Mm): Op => (d) => {
  const r = sketchRegionOf(d, regionId);
  const p = r.sketch.points.find((q) => q.id === pointId);
  if (!p) throw new OpError('Point not found');
  p.x = x;
  p.z = z;
  // a fixed constraint on the moved point moves with it
  for (const c of r.sketch.constraints) {
    if (c.type === 'fixed' && c.point === pointId) {
      c.x = x;
      c.z = z;
    }
  }
  const solved = solveSketch(r.sketch, new Set([pointId]));
  r.sketch.points = solved.points;
  touch(r);
};

export const deletePoint = (regionId: Id, pointId: Id): Op => (d) => {
  const r = sketchRegionOf(d, regionId);
  const removedSegs = new Set(r.sketch.segments.filter((s) => s.a === pointId || s.b === pointId).map((s) => s.id));
  r.sketch.points = r.sketch.points.filter((p) => p.id !== pointId);
  r.sketch.segments = r.sketch.segments.filter((s) => !removedSegs.has(s.id));
  r.sketch.constraints = r.sketch.constraints.filter((c) =>
    c.type === 'fixed' ? c.point !== pointId : !removedSegs.has(c.segment),
  );
  touch(r);
};

export const addSegment = (regionId: Id, segId: Id, a: Id, b: Id): Op => (d) => {
  const r = sketchRegionOf(d, regionId);
  if (a === b) throw new OpError('A segment needs two different points');
  const ids = new Set(r.sketch.points.map((p) => p.id));
  if (!ids.has(a) || !ids.has(b)) throw new OpError('Segment references a missing point');
  if (r.sketch.segments.some((s) => (s.a === a && s.b === b) || (s.a === b && s.b === a))) {
    throw new OpError('These points are already connected');
  }
  r.sketch.segments.push({ id: segId, a, b });
  touch(r);
};

export const deleteSegment = (regionId: Id, segId: Id): Op => (d) => {
  const r = sketchRegionOf(d, regionId);
  r.sketch.segments = r.sketch.segments.filter((s) => s.id !== segId);
  r.sketch.constraints = r.sketch.constraints.filter((c) => c.type === 'fixed' || c.segment !== segId);
  touch(r);
};

export const addConstraint = (regionId: Id, c: Constraint): Op => (d) => {
  const r = sketchRegionOf(d, regionId);
  r.sketch.constraints.push(c);
  const solved = solveSketch(r.sketch);
  r.sketch.points = solved.points;
  touch(r);
};

export const deleteConstraint = (regionId: Id, constraintId: Id): Op => (d) => {
  const r = sketchRegionOf(d, regionId);
  r.sketch.constraints = r.sketch.constraints.filter((c) => c.id !== constraintId);
  touch(r);
};

/** Axis-aligned rectangle: 4 points, 4 segments, horizontal/vertical constraints. Returns created IDs. */
export function rectangleOp(regionId: Id, x0: Mm, z0: Mm, x1: Mm, z1: Mm): { op: Op; pointIds: Id[]; segmentIds: Id[] } {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [az, bz] = [Math.min(z0, z1), Math.max(z0, z1)];
  const pointIds = [createId('pt'), createId('pt'), createId('pt'), createId('pt')];
  const segmentIds = [createId('seg'), createId('seg'), createId('seg'), createId('seg')];
  const constraintIds = [createId('con'), createId('con'), createId('con'), createId('con')];
  const coords = [
    [ax, az],
    [bx, az],
    [bx, bz],
    [ax, bz],
  ];
  const op: Op = (d) => {
    if (bx - ax <= 0 || bz - az <= 0) throw new OpError('Rectangle must have a positive width and height');
    const r = sketchRegionOf(d, regionId);
    coords.forEach(([x, z], i) => r.sketch.points.push({ id: pointIds[i], x, z }));
    for (let i = 0; i < 4; i++) r.sketch.segments.push({ id: segmentIds[i], a: pointIds[i], b: pointIds[(i + 1) % 4] });
    r.sketch.constraints.push(
      { id: constraintIds[0], type: 'horizontal', segment: segmentIds[0] },
      { id: constraintIds[1], type: 'vertical', segment: segmentIds[1] },
      { id: constraintIds[2], type: 'horizontal', segment: segmentIds[2] },
      { id: constraintIds[3], type: 'vertical', segment: segmentIds[3] },
    );
    touch(r);
  };
  return { op, pointIds, segmentIds };
}

/** Combines several operations into one undoable step. */
export const batch = (...ops: Op[]): Op => (d) => {
  for (const op of ops) op(d);
};
