import type { Vec2 } from '../geometry/vec';
import { explodeDimension } from '../drawing/dimensions';
import type { SheetItem } from '../drawing/projection';
import { LAYER_COLORS, type Primitive } from '../drawing/types';

/**
 * Minimal, dependency-free ASCII DXF writer (AutoCAD R12 / AC1009).
 *
 * R12 is the most widely readable DXF dialect (AutoCAD, BricsCAD, LibreCAD,
 * Rhino, SketchUp, ezdxf). Geometry is written 1:1 in millimetres
 * ($INSUNITS = 4) as LINE, closed POLYLINE and TEXT entities on named layers.
 * Dimensions are written exploded (lines + text), which every reader supports.
 */

function num(v: number): string {
  const r = Math.round(v * 1e6) / 1e6;
  return String(Object.is(r, -0) ? 0 : r);
}

/** Non-ASCII characters are written as \U+XXXX escapes, as R12 readers expect. */
function dxfText(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out += c < 128 ? ch : `\\U+${c.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return out;
}

class DxfBuilder {
  private lines: string[] = [];
  pair(code: number, value: string | number): this {
    this.lines.push(String(code), typeof value === 'number' ? num(value) : value);
    return this;
  }
  point(base: number, p: Vec2): this {
    return this.pair(base, p.x).pair(base + 10, p.y).pair(base + 20, 0);
  }
  toString(): string {
    return this.lines.join('\n') + '\n';
  }
}

export interface DxfOptions {
  /** Linetype scale; use the drawing scale denominator so dashes read well on paper. */
  ltscale?: number;
}

function translate(p: Vec2, o: Vec2): Vec2 {
  return { x: p.x + o.x, y: p.y + o.y };
}

export function sheetPrimitives(items: SheetItem[]): Primitive[] {
  const out: Primitive[] = [];
  for (const { drawing, offset } of items) {
    const all = [...drawing.primitives, ...drawing.dimensions.flatMap((d) => explodeDimension(d, drawing.scale))];
    for (const p of all) {
      if (p.type === 'line') out.push({ ...p, a: translate(p.a, offset), b: translate(p.b, offset) });
      else if (p.type === 'polyline') out.push({ ...p, points: p.points.map((q) => translate(q, offset)) });
      else out.push({ ...p, at: translate(p.at, offset) });
    }
  }
  return out;
}

export function primitivesToDxf(prims: Primitive[], opts: DxfOptions = {}): string {
  const layers = [...new Set(prims.map((p) => p.layer))].sort();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const ext = (p: Vec2) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const p of prims) {
    if (p.type === 'line') {
      ext(p.a);
      ext(p.b);
    } else if (p.type === 'polyline') p.points.forEach(ext);
    else ext(p.at);
  }
  if (!Number.isFinite(minX)) minX = minY = maxX = maxY = 0;

  const d = new DxfBuilder();
  // HEADER
  d.pair(0, 'SECTION').pair(2, 'HEADER');
  d.pair(9, '$ACADVER').pair(1, 'AC1009');
  d.pair(9, '$INSUNITS').pair(70, 4);
  d.pair(9, '$MEASUREMENT').pair(70, 1);
  d.pair(9, '$LTSCALE').pair(40, opts.ltscale ?? 1);
  d.pair(9, '$EXTMIN').point(10, { x: minX, y: minY });
  d.pair(9, '$EXTMAX').point(10, { x: maxX, y: maxY });
  d.pair(0, 'ENDSEC');

  // TABLES: linetypes and layers
  d.pair(0, 'SECTION').pair(2, 'TABLES');
  d.pair(0, 'TABLE').pair(2, 'LTYPE').pair(70, 2);
  d.pair(0, 'LTYPE').pair(2, 'CONTINUOUS').pair(70, 0).pair(3, 'Solid line').pair(72, 65).pair(73, 0).pair(40, 0);
  d.pair(0, 'LTYPE').pair(2, 'DASHED').pair(70, 0).pair(3, 'Dashed __ __ __').pair(72, 65).pair(73, 2).pair(40, 15).pair(49, 10).pair(49, -5);
  d.pair(0, 'ENDTAB');
  d.pair(0, 'TABLE').pair(2, 'LAYER').pair(70, layers.length + 1);
  d.pair(0, 'LAYER').pair(2, '0').pair(70, 0).pair(62, 7).pair(6, 'CONTINUOUS');
  for (const name of layers) {
    d.pair(0, 'LAYER').pair(2, name).pair(70, 0).pair(62, LAYER_COLORS[name] ?? 7).pair(6, 'CONTINUOUS');
  }
  d.pair(0, 'ENDTAB');
  d.pair(0, 'ENDSEC');

  // ENTITIES
  d.pair(0, 'SECTION').pair(2, 'ENTITIES');
  for (const p of prims) {
    if (p.type === 'line') {
      d.pair(0, 'LINE').pair(8, p.layer);
      if (p.dashed) d.pair(6, 'DASHED');
      d.point(10, p.a).point(11, p.b);
    } else if (p.type === 'polyline') {
      d.pair(0, 'POLYLINE').pair(8, p.layer).pair(66, 1).point(10, { x: 0, y: 0 }).pair(70, p.closed ? 1 : 0);
      for (const v of p.points) d.pair(0, 'VERTEX').pair(8, p.layer).point(10, v);
      d.pair(0, 'SEQEND').pair(8, p.layer);
    } else {
      const h = p.align === 'center' ? 1 : p.align === 'right' ? 2 : 0;
      d.pair(0, 'TEXT').pair(8, p.layer).point(10, p.at).pair(40, p.height).pair(1, dxfText(p.text));
      if (p.rotation) d.pair(50, p.rotation);
      if (h !== 0) d.pair(72, h).point(11, p.at);
    }
  }
  d.pair(0, 'ENDSEC');
  d.pair(0, 'EOF');
  return d.toString();
}

export function sheetToDxf(items: SheetItem[]): string {
  const scale = items[0]?.drawing.scale ?? 1;
  return primitivesToDxf(sheetPrimitives(items), { ltscale: scale });
}
