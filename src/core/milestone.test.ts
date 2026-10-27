/**
 * Milestone 1 acceptance test — parametric wall paneling.
 * Wall 4200 × 2800 mm, 5 panels × 800 mm, 10 mm gaps, 18 mm thick, centred → 80 mm margins.
 */
import { describe, expect, it } from 'vitest';
import { buildDrawings, layoutSheet } from './drawing/projection';
import { sheetToDxf } from './export/dxf';
import { parseDocument, serializeDocument } from './export/json';
import { sheetToSvg } from './export/svg';
import { createWallPanelingExample } from './examples/wallPaneling';
import { firstFacade } from './model/query';
import { applyOp, setFacadeParams, setPanelOverride } from './ops/operations';
import { regenerateFacade } from './parametric/regenerate';

/** Minimal DXF reader: returns entities as (type, groups) records. */
function readDxf(text: string) {
  const lines = text.split('\n');
  const pairs: Array<[number, string]> = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i]), lines[i + 1]]);
  const entities: Array<{ type: string; g: Array<[number, string]> }> = [];
  const layers: string[] = [];
  let section = '';
  let cur: { type: string; g: Array<[number, string]> } | null = null;
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 0 && v === 'SECTION') section = pairs[i + 1][1];
    if (section === 'TABLES' && c === 0 && v === 'LAYER') layers.push(pairs[i + 1][1]);
    if (section === 'ENTITIES' && c === 0) {
      if (cur) entities.push(cur);
      cur = v === 'ENDSEC' ? null : { type: v, g: [] };
    } else if (cur) cur.g.push([c, v]);
  }
  return { entities, layers, pairs };
}

describe('milestone 1: parametric wall paneling', () => {
  const doc = createWallPanelingExample();
  const facade = firstFacade(doc);

  it('1. generates the panel geometry mathematically', () => {
    const m = regenerateFacade(doc, facade);
    expect(m.issues).toEqual([]);
    expect(m.solids).toHaveLength(5);
    const xs = m.solids.map((s) => [s.bbox.min.x, s.bbox.max.x]);
    expect(xs).toEqual([
      [80, 880],
      [890, 1690],
      [1700, 2500],
      [2510, 3310],
      [3320, 4120],
    ]);
    for (const s of m.solids) {
      expect(s.bbox.min.y).toBe(-18);
      expect(s.bbox.max.y).toBe(0);
      expect(s.bbox.min.z).toBe(0);
      expect(s.bbox.max.z).toBe(2800);
      expect(s.volume).toBe(800 * 2800 * 18);
      expect(s.mesh.indices.length / 3).toBe(12); // box: 6 faces × 2 triangles
    }
    const layout = Object.values(m.layouts)[0];
    expect(layout.marginStart).toBe(80);
    expect(layout.marginEnd).toBe(80);
    // wall solid sits behind the finished surface
    expect(m.wall.bbox).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 4200, y: 150, z: 2800 } });
  });

  it('2/4/5. recalculates dependent panel positions when the wall changes', () => {
    const d2 = applyOp(doc, setFacadeParams(facade.id, { width: 4600 }));
    const m = regenerateFacade(d2, firstFacade(d2));
    expect(m.solids[0].bbox.min.x).toBe(280);
    expect(4600 - m.solids[4].bbox.max.x).toBe(280);
    expect(d2.revision).toBe(doc.revision + 1);
    // original document untouched (immutability → exact undo)
    expect(firstFacade(doc).width).toBe(4200);
  });

  it('6. supports per-panel identity and overrides', () => {
    const regionId = facade.regions[0].id;
    const d2 = applyOp(doc, setPanelOverride(regionId, 2, { thickness: 25, material: 'mat_walnut' }));
    const m = regenerateFacade(d2, firstFacade(d2));
    const p2 = m.solids.find((s) => s.panelIndex === 2)!;
    expect(p2.id).toBe(`${regionId}/panel-2/0`);
    expect(p2.bbox.min.y).toBe(-25);
    expect(p2.material.id).toBe('mat_walnut');
    const d3 = applyOp(d2, setPanelOverride(regionId, 4, { suppressed: true }));
    expect(regenerateFacade(d3, firstFacade(d3)).solids).toHaveLength(4);
  });

  it('7. generates a dimensionally valid, layer-separated DXF', () => {
    const m = regenerateFacade(doc, facade);
    const dxf = sheetToDxf(layoutSheet(buildDrawings(m)));
    const { entities, layers, pairs } = readDxf(dxf);
    expect(pairs.find(([c, v]) => c === 1 && v === 'AC1009')).toBeTruthy();
    expect(dxf.trim().endsWith('EOF')).toBe(true);
    expect(layers).toEqual(expect.arrayContaining(['KAD-WALL', 'KAD-PANEL', 'KAD-DIM', 'KAD-CUT', 'KAD-TITLE']));

    // the elevation is at the sheet origin: panel outlines carry true mm coordinates
    const panelPolys = entities.filter((e) => e.type === 'POLYLINE' && e.g.some(([c, v]) => c === 8 && v === 'KAD-PANEL'));
    expect(panelPolys.length).toBeGreaterThanOrEqual(5);
    const verts: Array<[number, number]> = [];
    let i = 0;
    while (i < entities.length) {
      const e = entities[i];
      if (e.type === 'POLYLINE' && e.g.some(([c, v]) => c === 8 && v === 'KAD-PANEL')) {
        const poly: Array<[number, number]> = [];
        i++;
        while (entities[i].type === 'VERTEX') {
          const g = Object.fromEntries(entities[i].g);
          poly.push([Number(g[10]), Number(g[20])]);
          i++;
        }
        if (poly.every(([, y]) => y >= 0)) verts.push(...poly); // elevation view only
      } else i++;
    }
    expect(verts).toEqual(expect.arrayContaining([[80, 0], [880, 0], [880, 2800], [80, 2800], [3320, 0], [4120, 2800]]));

    // dimension texts include margins, panel widths, gaps and the overall size
    const texts = entities.filter((e) => e.type === 'TEXT').map((e) => Object.fromEntries(e.g)[1]);
    for (const t of ['80', '800', '10', '4200', '2800', '18']) expect(texts).toContain(t);
  });

  it('exports SVG with the same geometry', () => {
    const m = regenerateFacade(doc, facade);
    const svg = sheetToSvg(layoutSheet(buildDrawings(m)));
    expect(svg).toContain('<svg');
    expect(svg).toContain('id="KAD-PANEL"');
    expect(svg).toContain('points="80,0 880,0 880,-2800 80,-2800"');
  });

  it('8. saves and reopens the complete editable project', () => {
    const edited = applyOp(doc, setPanelOverride(facade.regions[0].id, 1, { material: 'mat_walnut' }));
    const text = serializeDocument(edited);
    const reopened = parseDocument(text);
    expect(reopened).toEqual(edited);
    const a = regenerateFacade(edited, firstFacade(edited));
    const b = regenerateFacade(reopened, firstFacade(reopened));
    expect(b.solids.map((s) => s.bbox)).toEqual(a.solids.map((s) => s.bbox));
    // still editable after reopening
    const again = applyOp(reopened, setFacadeParams(firstFacade(reopened).id, { width: 4400 }));
    expect(regenerateFacade(again, firstFacade(again)).solids[0].bbox.min.x).toBe(180);
  });

  it('rejects foreign or corrupt project files', () => {
    expect(() => parseDocument('{')).toThrow(/valid JSON/);
    expect(() => parseDocument('{"format":"other"}')).toThrow(/Not a KAD/);
    expect(() => parseDocument(JSON.stringify({ ...doc, schemaVersion: 99 }))).toThrow(/newer/);
  });

  it('is deterministic', () => {
    const a = sheetToDxf(layoutSheet(buildDrawings(regenerateFacade(doc, facade))));
    const b = sheetToDxf(layoutSheet(buildDrawings(regenerateFacade(doc, facade))));
    expect(a).toBe(b);
  });
});
