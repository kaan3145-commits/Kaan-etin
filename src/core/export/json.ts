import { DOCUMENT_FORMAT, SCHEMA_VERSION, type KadDocument } from '../model/types';

export class DocumentFormatError extends Error {}

export function serializeDocument(doc: KadDocument): string {
  return JSON.stringify(doc, null, 2) + '\n';
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Schema migrations keyed by the version they upgrade from. */
const MIGRATIONS: Record<number, Migration> = {};

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new DocumentFormatError(message);
}

/**
 * Parses and validates a saved project. Derived geometry is never stored, so a
 * loaded document is regenerated from its parameters and is fully editable.
 */
export function parseDocument(text: string): KadDocument {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DocumentFormatError('File is not valid JSON.');
  }
  assert(raw && typeof raw === 'object', 'Project file must contain a JSON object.');
  assert(raw.format === DOCUMENT_FORMAT, `Not a KAD Geometry Engine project (format "${String(raw.format)}").`);
  let version = Number(raw.schemaVersion);
  assert(Number.isInteger(version) && version >= 1, 'Missing schema version.');
  assert(version <= SCHEMA_VERSION, `Project schema v${version} is newer than this application (v${SCHEMA_VERSION}).`);
  while (version < SCHEMA_VERSION) {
    const m = MIGRATIONS[version];
    assert(m, `No migration from schema v${version}.`);
    raw = m(raw);
    version++;
  }

  const doc = raw as unknown as KadDocument;
  assert(doc.units === 'mm', 'Only millimetre projects are supported.');
  assert(doc.project && Array.isArray(doc.project.spaces), 'Project has no spaces.');
  assert(Array.isArray(doc.project.materials), 'Project has no material library.');
  const ids = new Set<string>();
  const unique = (id: string, what: string) => {
    assert(typeof id === 'string' && id.length > 0, `${what} is missing an id.`);
    assert(!ids.has(id), `Duplicate id ${id}.`);
    ids.add(id);
  };
  unique(doc.project.id, 'Project');
  for (const space of doc.project.spaces) {
    unique(space.id, 'Space');
    assert(Array.isArray(space.facades), `Space ${space.id} has no façades.`);
    for (const f of space.facades) {
      unique(f.id, 'Façade');
      assert(f.parentId === space.id, `Façade ${f.id} has a wrong parent.`);
      assert(typeof f.width === 'number' && typeof f.height === 'number', `Façade ${f.id} has no dimensions.`);
      for (const r of f.regions) {
        unique(r.id, 'Region');
        assert(r.parentId === f.id, `Region ${r.id} has a wrong parent.`);
        assert(r.source === 'panelSystem' || r.source === 'sketch', `Region ${r.id} has an unknown source.`);
        if (r.source === 'sketch') {
          const pts = new Set(r.sketch.points.map((p) => p.id));
          for (const s of r.sketch.segments) {
            assert(pts.has(s.a) && pts.has(s.b), `Segment ${s.id} references a missing point.`);
          }
        }
      }
    }
  }
  return doc;
}
