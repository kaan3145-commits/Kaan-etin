import { describe, expect, it } from 'vitest';
import { applyHomography, computeHomography, invertHomography, pixelToFacadeTransform } from '../calibration/homography';
import { buildDrawings } from '../drawing/projection';
import { createDocument, createSketchRegion } from '../model/factory';
import { firstFacade } from '../model/query';
import { addRegion, applyOp, batch, rectangleOp, setPattern, setExtrude } from '../ops/operations';
import { regenerateFacade } from '../parametric/regenerate';
import { buildPrism } from './extrude';

const L = [
  { x: 0, y: 0 },
  { x: 600, y: 0 },
  { x: 600, y: 300 },
  { x: 300, y: 300 },
  { x: 300, y: 900 },
  { x: 0, y: 900 },
];

describe('buildPrism', () => {
  it('extrudes an L-profile into a closed solid', () => {
    const r = buildPrism({ profile: L, origin: { x: 0, y: 0, z: 0 }, y0: -40, y1: 0 });
    const a = 600 * 300 + 300 * 600;
    expect(r.frontArea).toBe(a);
    expect(r.volume).toBe(a * 40);
    expect(r.bbox).toEqual({ min: { x: 0, y: -40, z: 0 }, max: { x: 600, y: 0, z: 900 } });
    // caps: 2·(n−2) triangles, sides: 2 per edge
    expect(r.mesh.indices.length / 3).toBe(2 * (L.length - 2) + 2 * L.length);
    expect(r.edges).toHaveLength(3 * L.length);
  });

  it('produces outward-facing triangles (divergence check: signed volume = volume)', () => {
    const r = buildPrism({ profile: L, origin: { x: 100, y: 0, z: 50 }, y0: -40, y1: 0 });
    const P = r.mesh.positions;
    let v = 0;
    for (let i = 0; i < r.mesh.indices.length; i += 3) {
      const [a, b, c] = [r.mesh.indices[i], r.mesh.indices[i + 1], r.mesh.indices[i + 2]].map((k) => [P[3 * k], P[3 * k + 1], P[3 * k + 2]]);
      v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    expect(v).toBeCloseTo(r.volume, 3);
  });
});

describe('sketch region → solid → drawings', () => {
  it('extrudes a drawn rectangle, applies a vertical array and sections it', () => {
    let doc = createDocument();
    const f = firstFacade(doc);
    const region = createSketchRegion(f.id, { semantic: 'shelf', thickness: 300, standoff: 0 });
    const rect = rectangleOp(region.id, 1000, 800, 2200, 830);
    doc = applyOp(doc, batch(addRegion(f.id, region), rect.op));
    doc = applyOp(doc, setPattern(region.id, { count: 3, spacing: 400, axis: 'z' }));
    doc = applyOp(doc, setExtrude(region.id, { thickness: 280 }));
    const m = regenerateFacade(doc, firstFacade(doc));
    expect(m.issues).toEqual([]);
    expect(m.solids).toHaveLength(3);
    expect(m.solids.map((s) => s.bbox.min.z)).toEqual([800, 1200, 1600]);
    expect(m.solids.every((s) => s.bbox.min.y === -280)).toBe(true);
    expect(m.solids[2].featureIds).toHaveLength(2);

    const section = buildDrawings(m).find((d) => d.type === 'section')!;
    const cuts = section.primitives.filter((p) => p.type === 'polyline' && p.layer === 'KAD-CUT');
    expect(cuts).toHaveLength(4); // wall + 3 shelves (cut at x = 2100)
  });
});

describe('calibration', () => {
  it('maps the four reference corners exactly onto the façade', () => {
    const corners = [
      { px: 102, py: 880 },
      { px: 1630, py: 905 },
      { px: 1580, py: 60 },
      { px: 140, py: 95 },
    ];
    const H = pixelToFacadeTransform({ width: 4200, height: 2800 }, corners);
    const expected = [
      [0, 0],
      [4200, 0],
      [4200, 2800],
      [0, 2800],
    ];
    corners.forEach((c, i) => {
      const w = applyHomography(H, { x: c.px, y: c.py });
      expect(w.x).toBeCloseTo(expected[i][0], 6);
      expect(w.y).toBeCloseTo(expected[i][1], 6);
    });
    const inv = invertHomography(H);
    const back = applyHomography(inv, { x: 4200, y: 2800 });
    expect(back.x).toBeCloseTo(1580, 6);
    expect(back.y).toBeCloseTo(60, 6);
  });

  it('rejects degenerate calibration', () => {
    const p = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    expect(() => computeHomography(p, p)).toThrow(/Degenerate/);
  });
});
