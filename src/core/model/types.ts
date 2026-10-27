/**
 * KAD Geometry Engine — document model (source of truth).
 *
 * Coordinate system (world, millimetres, right-handed, Z up):
 *   X = horizontal width, Y = depth (+Y goes into the wall), Z = vertical height.
 *   The finished wall surface of a façade lies in the plane y = facade.origin.y.
 *   The wall body occupies y ∈ [0, wallThickness] behind it; applied components
 *   project towards the viewer (negative Y). The front elevation looks along +Y.
 *
 * Façade-local 2D coordinates (sketches, layouts) use (x, z):
 *   x → world X (from the façade's left edge), z → world Z (from the façade's base).
 *
 * Only parametric definitions are stored here. Faces, solids, meshes and drawings
 * are derived deterministically by `regenerate()` and never persisted.
 */

import type { Vec3 } from '../geometry/vec';

export type Id = string;
/** Millimetres. */
export type Mm = number;

export const DOCUMENT_FORMAT = 'kad.geometry-engine' as const;
export const SCHEMA_VERSION = 1 as const;

/**
 * Where a parameter value came from. Values that were not measured must stay
 * visibly flagged as assumptions so they are never mistaken for verified data.
 */
export type Provenance = 'measured' | 'assumed' | 'derived';

export interface EntityBase {
  id: Id;
  parentId: Id | null;
  name: string;
  /** Incremented every time the entity is modified. */
  rev: number;
  /** Per-parameter provenance, keyed by parameter name (e.g. "width"). */
  provenance?: Record<string, Provenance>;
}

export type SemanticType =
  | 'wall'
  | 'panel'
  | 'lambri'
  | 'niche'
  | 'shelf'
  | 'cabinet'
  | 'frame'
  | 'generic';

export const SEMANTIC_TYPES: SemanticType[] = [
  'panel',
  'lambri',
  'niche',
  'shelf',
  'cabinet',
  'frame',
  'generic',
];

/** Optional reference to upstream Product DNA output. Stored, never re-derived here. */
export interface ProductDnaRef {
  source?: string;
  category?: string;
  style?: string;
  materials?: string[];
  components?: string[];
  raw?: unknown;
}

export interface Material {
  id: Id;
  name: string;
  /** sRGB hex, e.g. "#b08a5a". */
  color: string;
  roughness: number;
  category: 'wood' | 'lacquer' | 'stone' | 'metal' | 'plaster' | 'other';
}

export interface KadDocument {
  format: typeof DOCUMENT_FORMAT;
  schemaVersion: typeof SCHEMA_VERSION;
  /** Incremented on every committed operation. */
  revision: number;
  units: 'mm';
  createdAt: string;
  modifiedAt: string;
  project: Project;
}

export interface Project extends EntityBase {
  kind: 'project';
  materials: Material[];
  spaces: Space[];
}

export interface Space extends EntityBase {
  kind: 'space';
  facades: Facade[];
}

export interface Facade extends EntityBase {
  kind: 'facade';
  width: Mm;
  height: Mm;
  /** World position of the bottom-left corner of the finished wall surface. */
  origin: Vec3;
  wallThickness: Mm;
  wallMaterial: Id;
  reference: ReferenceImage | null;
  regions: Region[];
  drawings: DrawingDef[];
}

/** Image pixel coordinate (origin top-left, y down). */
export interface PixelPoint {
  px: number;
  py: number;
}

export interface ReferenceImage {
  dataUrl: string;
  pixelWidth: number;
  pixelHeight: number;
  /**
   * Image pixels of the façade corners in order: bottom-left, bottom-right,
   * top-right, top-left. Defines the pixel → world calibration (homography).
   */
  corners: [PixelPoint, PixelPoint, PixelPoint, PixelPoint];
  opacity: number;
  visible: boolean;
}

/** Extrusion of the region's faces along -Y (towards the viewer). */
export interface ExtrudeFeature {
  id: Id;
  type: 'extrude';
  /** Solid thickness along Y. */
  thickness: Mm;
  /** Distance between wall surface and back of the component. */
  standoff: Mm;
}

/** Repeats every solid of a region. Instance 0 is the original. */
export interface LinearPattern {
  id: Id;
  type: 'linearPattern';
  count: number;
  /** Centre-to-centre distance between instances. */
  spacing: Mm;
  axis: 'x' | 'z';
}

interface RegionBase extends EntityBase {
  kind: 'region';
  semantic: SemanticType;
  material: Id;
  visible: boolean;
  extrude: ExtrudeFeature;
  pattern: LinearPattern | null;
  dna?: ProductDnaRef;
}

export interface PanelLayoutParams {
  count: number;
  /** Used by 'fixedWidth'; derived (ignored) by 'fillWidth'. */
  panelWidth: Mm;
  gap: Mm;
  /**
   * fixedWidth: panel width is fixed, margins are derived from alignment.
   * fillWidth: side margins are fixed, panel width is derived.
   */
  distribution: 'fixedWidth' | 'fillWidth';
  alignment: 'center' | 'start' | 'end';
  /** Margin used for start/end alignment and for fillWidth. */
  sideMargin: Mm;
  bottomOffset: Mm;
  topOffset: Mm;
  /** null → panels fill the height between bottomOffset and topOffset. */
  panelHeight: Mm | null;
}

export interface PanelOverride {
  material?: Id;
  thickness?: Mm;
  suppressed?: boolean;
}

export interface PanelSystemRegion extends RegionBase {
  source: 'panelSystem';
  layout: PanelLayoutParams;
  /** Keyed by panel index. */
  overrides: Record<string, PanelOverride>;
}

export interface SketchRegion extends RegionBase {
  source: 'sketch';
  sketch: Sketch;
}

export type Region = PanelSystemRegion | SketchRegion;

export interface SketchPoint {
  id: Id;
  /** Façade-local horizontal coordinate. */
  x: Mm;
  /** Façade-local vertical coordinate. */
  z: Mm;
  /** Pixel position on the reference image when the point was digitised from it. */
  image?: PixelPoint;
}

export interface SketchSegment {
  id: Id;
  a: Id;
  b: Id;
}

export type Constraint =
  | { id: Id; type: 'horizontal'; segment: Id }
  | { id: Id; type: 'vertical'; segment: Id }
  | { id: Id; type: 'distance'; segment: Id; value: Mm }
  | { id: Id; type: 'fixed'; point: Id; x: Mm; z: Mm };

export interface Sketch {
  id: Id;
  points: SketchPoint[];
  segments: SketchSegment[];
  constraints: Constraint[];
}

export type DrawingType = 'elevation' | 'plan' | 'section';

export interface DrawingDef {
  id: Id;
  type: DrawingType;
  name: string;
  /** Drawing scale denominator (20 → 1:20). Controls annotation sizes only. */
  scale: number;
  /** Section cut position (façade-local x) for 'section' drawings. */
  cutX?: Mm;
}

export type AnyEntity = Project | Space | Facade | Region;
