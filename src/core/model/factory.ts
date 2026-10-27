import { createId } from './ids';
import { DEFAULT_MATERIALS } from './materials';
import {
  DOCUMENT_FORMAT,
  SCHEMA_VERSION,
  type DrawingDef,
  type Facade,
  type KadDocument,
  type PanelLayoutParams,
  type PanelSystemRegion,
  type SemanticType,
  type SketchRegion,
  type Space,
  type Mm,
  type Id,
} from './types';

export function defaultDrawings(width: Mm): DrawingDef[] {
  return [
    { id: createId('drw'), type: 'elevation', name: 'Front elevation', scale: 20 },
    { id: createId('drw'), type: 'plan', name: 'Plan', scale: 20 },
    { id: createId('drw'), type: 'section', name: 'Section A-A', scale: 20, cutX: width / 2 },
  ];
}

export function createFacade(
  parentId: Id,
  opts: { name?: string; width: Mm; height: Mm; wallThickness?: Mm },
): Facade {
  return {
    kind: 'facade',
    id: createId('fac'),
    parentId,
    name: opts.name ?? 'Façade A',
    rev: 0,
    width: opts.width,
    height: opts.height,
    origin: { x: 0, y: 0, z: 0 },
    wallThickness: opts.wallThickness ?? 150,
    wallMaterial: 'mat_plaster',
    reference: null,
    regions: [],
    drawings: defaultDrawings(opts.width),
    provenance: { width: 'measured', height: 'measured', wallThickness: 'assumed' },
  };
}

export function createDocument(opts: {
  name?: string;
  facade?: { width: Mm; height: Mm; name?: string; wallThickness?: Mm };
} = {}): KadDocument {
  const now = new Date().toISOString();
  const projectId = createId('prj');
  const space: Space = {
    kind: 'space',
    id: createId('spc'),
    parentId: projectId,
    name: 'Space 01',
    rev: 0,
    facades: [],
  };
  space.facades.push(createFacade(space.id, opts.facade ?? { width: 4200, height: 2800 }));
  return {
    format: DOCUMENT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    units: 'mm',
    createdAt: now,
    modifiedAt: now,
    project: {
      kind: 'project',
      id: projectId,
      parentId: null,
      name: opts.name ?? 'Untitled project',
      rev: 0,
      materials: DEFAULT_MATERIALS.map((m) => ({ ...m })),
      spaces: [space],
    },
  };
}

export const DEFAULT_LAYOUT: PanelLayoutParams = {
  count: 5,
  panelWidth: 800,
  gap: 10,
  distribution: 'fixedWidth',
  alignment: 'center',
  sideMargin: 0,
  bottomOffset: 0,
  topOffset: 0,
  panelHeight: null,
};

export function createPanelSystemRegion(
  facadeId: Id,
  opts: {
    name?: string;
    layout?: Partial<PanelLayoutParams>;
    thickness?: Mm;
    standoff?: Mm;
    material?: Id;
    semantic?: SemanticType;
  } = {},
): PanelSystemRegion {
  return {
    kind: 'region',
    source: 'panelSystem',
    id: createId('reg'),
    parentId: facadeId,
    name: opts.name ?? 'Panel system',
    rev: 0,
    semantic: opts.semantic ?? 'panel',
    material: opts.material ?? 'mat_oak',
    visible: true,
    extrude: {
      id: createId('fea'),
      type: 'extrude',
      thickness: opts.thickness ?? 18,
      standoff: opts.standoff ?? 0,
    },
    pattern: null,
    layout: { ...DEFAULT_LAYOUT, ...opts.layout },
    overrides: {},
    provenance: { thickness: 'measured', standoff: 'assumed' },
  };
}

export function createSketchRegion(
  facadeId: Id,
  opts: { name?: string; semantic?: SemanticType; material?: Id; thickness?: Mm; standoff?: Mm } = {},
): SketchRegion {
  return {
    kind: 'region',
    source: 'sketch',
    id: createId('reg'),
    parentId: facadeId,
    name: opts.name ?? 'Sketch region',
    rev: 0,
    semantic: opts.semantic ?? 'generic',
    material: opts.material ?? 'mat_white_lacquer',
    visible: true,
    extrude: {
      id: createId('fea'),
      type: 'extrude',
      thickness: opts.thickness ?? 18,
      standoff: opts.standoff ?? 0,
    },
    pattern: null,
    sketch: { id: createId('skt'), points: [], segments: [], constraints: [] },
    provenance: { thickness: 'assumed', standoff: 'assumed' },
  };
}
