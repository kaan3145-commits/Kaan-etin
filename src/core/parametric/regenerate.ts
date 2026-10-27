import { type Vec2, type Vec3 } from '../geometry/vec';
import { findMaterial } from '../model/materials';
import type { Facade, Id, KadDocument, Material, Mm, Region, SemanticType } from '../model/types';
import { analyzeSketch } from '../sketch/faces';
import { buildPrism, type PrismDerived, type PrismGeometry } from '../solid/extrude';
import { computePanelLayout, type PanelLayoutResult } from './panelLayout';

export interface DerivedFace {
  /** Unique within the façade: `${regionId}/${faceKey}`. */
  id: string;
  regionId: Id;
  key: string;
  polygon: Vec2[];
  boundarySegments: Id[];
  /** Outward normal of the planar face (the façade plane faces −Y). */
  normal: Vec3;
  area: number;
  semantic: SemanticType;
  material: Id;
  panelIndex?: number;
}

export interface Solid extends PrismGeometry, PrismDerived {
  /** `${regionId}/${faceKey}/${instance}` — stable while the source definitions are stable. */
  id: string;
  facadeId: Id;
  regionId: Id;
  faceId: string;
  /** Feature chain that produced this solid. */
  featureIds: Id[];
  instance: number;
  panelIndex?: number;
  semantic: SemanticType;
  material: Material;
  thickness: Mm;
  standoff: Mm;
}

export interface ModelIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  entityId: Id;
  refs?: Id[];
}

export interface FacadeModel {
  facade: Facade;
  wall: Solid;
  faces: DerivedFace[];
  solids: Solid[];
  layouts: Record<Id, PanelLayoutResult>;
  issues: ModelIssue[];
}

const FACADE_NORMAL: Vec3 = { x: 0, y: -1, z: 0 };

function rectPolygon(x: number, z: number, w: number, h: number): Vec2[] {
  return [
    { x, y: z },
    { x: x + w, y: z },
    { x: x + w, y: z + h },
    { x, y: z + h },
  ];
}

function regionFaces(facade: Facade, region: Region, layouts: Record<Id, PanelLayoutResult>, issues: ModelIssue[]): DerivedFace[] {
  if (region.source === 'panelSystem') {
    const layout = computePanelLayout(facade.width, facade.height, region.layout);
    layouts[region.id] = layout;
    for (const i of layout.issues) issues.push({ ...i, entityId: region.id });
    return layout.panels
      .filter((p) => !region.overrides[String(p.index)]?.suppressed)
      .map((p) => ({
        id: `${region.id}/panel-${p.index}`,
        regionId: region.id,
        key: `panel-${p.index}`,
        polygon: rectPolygon(p.x, p.z, p.width, p.height),
        boundarySegments: [],
        normal: FACADE_NORMAL,
        area: p.width * p.height,
        semantic: region.semantic,
        material: region.overrides[String(p.index)]?.material ?? region.material,
        panelIndex: p.index,
      }));
  }

  const analysis = analyzeSketch(region.sketch);
  for (const i of analysis.issues) issues.push({ severity: i.severity, code: i.code, message: i.message, entityId: region.id, refs: i.refs });
  return analysis.faces.map((f) => ({
    id: `${region.id}/${f.key}`,
    regionId: region.id,
    key: f.key,
    polygon: f.polygon,
    boundarySegments: f.boundarySegments,
    normal: FACADE_NORMAL,
    area: f.area,
    semantic: region.semantic,
    material: region.material,
  }));
}

/**
 * Regenerates all derived geometry of a façade from its parametric definition:
 *   region → faces (layout or sketch analysis) → extrude feature → pattern → solids.
 * Pure and deterministic: the same document always yields the same model.
 */
export function regenerateFacade(doc: KadDocument, facade: Facade): FacadeModel {
  const materials = doc.project.materials;
  const issues: ModelIssue[] = [];
  const layouts: Record<Id, PanelLayoutResult> = {};
  const faces: DerivedFace[] = [];
  const solids: Solid[] = [];

  if (!(facade.width > 0) || !(facade.height > 0)) {
    issues.push({ severity: 'error', code: 'facade-size', message: 'Façade width and height must be positive.', entityId: facade.id });
  }
  if (!(facade.wallThickness > 0)) {
    issues.push({ severity: 'error', code: 'wall-thickness', message: 'Wall thickness must be positive.', entityId: facade.id });
  }

  const wallGeom: PrismGeometry = {
    profile: rectPolygon(0, 0, Math.max(facade.width, 1e-3), Math.max(facade.height, 1e-3)),
    origin: facade.origin,
    y0: 0,
    y1: Math.max(facade.wallThickness, 1e-3),
  };
  const wall: Solid = {
    ...wallGeom,
    ...buildPrism(wallGeom),
    id: `${facade.id}/wall`,
    facadeId: facade.id,
    regionId: facade.id,
    faceId: `${facade.id}/wall`,
    featureIds: [],
    instance: 0,
    semantic: 'wall',
    material: findMaterial(materials, facade.wallMaterial),
    thickness: facade.wallThickness,
    standoff: 0,
  };

  for (const region of facade.regions) {
    const rFaces = regionFaces(facade, region, layouts, issues);
    faces.push(...rFaces);
    if (!region.visible) continue;

    const { extrude, pattern } = region;
    if (!(extrude.thickness > 0)) {
      issues.push({ severity: 'error', code: 'thickness', message: `${region.name}: thickness must be positive.`, entityId: region.id });
      continue;
    }
    if (extrude.standoff < 0) {
      issues.push({ severity: 'error', code: 'standoff', message: `${region.name}: standoff cannot be negative.`, entityId: region.id });
      continue;
    }
    const instances = pattern ? Math.max(1, Math.floor(pattern.count)) : 1;
    const featureIds = pattern ? [extrude.id, pattern.id] : [extrude.id];

    for (const face of rFaces) {
      const override =
        region.source === 'panelSystem' && face.panelIndex !== undefined ? region.overrides[String(face.panelIndex)] : undefined;
      const thickness = override?.thickness ?? extrude.thickness;
      if (!(thickness > 0)) {
        issues.push({ severity: 'error', code: 'thickness', message: `${region.name}: panel thickness must be positive.`, entityId: region.id });
        continue;
      }
      for (let k = 0; k < instances; k++) {
        const dx = pattern && pattern.axis === 'x' ? k * pattern.spacing : 0;
        const dz = pattern && pattern.axis === 'z' ? k * pattern.spacing : 0;
        const geom: PrismGeometry = {
          profile: face.polygon.map((p) => ({ x: p.x + dx, y: p.y + dz })),
          origin: facade.origin,
          y0: -(extrude.standoff + thickness),
          y1: -extrude.standoff,
        };
        const derived = buildPrism(geom);
        const solid: Solid = {
          ...geom,
          ...derived,
          id: `${face.id}/${k}`,
          facadeId: facade.id,
          regionId: region.id,
          faceId: face.id,
          featureIds,
          instance: k,
          panelIndex: face.panelIndex,
          semantic: region.semantic,
          material: findMaterial(materials, face.material),
          thickness,
          standoff: extrude.standoff,
        };
        const outside =
          derived.bbox.min.x < facade.origin.x - 1e-6 ||
          derived.bbox.max.x > facade.origin.x + facade.width + 1e-6 ||
          derived.bbox.min.z < facade.origin.z - 1e-6 ||
          derived.bbox.max.z > facade.origin.z + facade.height + 1e-6;
        if (outside) {
          issues.push({ severity: 'warning', code: 'outside-facade', message: `${region.name}: solid extends beyond the façade.`, entityId: region.id, refs: [solid.id] });
        }
        solids.push(solid);
      }
    }
  }

  return { facade, wall, faces, solids, layouts, issues };
}

export function regenerate(doc: KadDocument): FacadeModel[] {
  return doc.project.spaces.flatMap((s) => s.facades.map((f) => regenerateFacade(doc, f)));
}
