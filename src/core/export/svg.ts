import type { SheetItem } from '../drawing/projection';
import type { Primitive } from '../drawing/types';
import { sheetPrimitives } from './dxf';

const LAYER_STROKE: Record<string, string> = {
  'KAD-WALL': '#5a5a5a',
  'KAD-CUT': '#111111',
  'KAD-DIM': '#c0392b',
  'KAD-ANNO': '#2e7d32',
  'KAD-TITLE': '#111111',
};

function stroke(layer: string): string {
  return LAYER_STROKE[layer] ?? '#a0662b';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const n = (v: number) => String(Math.round(v * 1000) / 1000);

/**
 * Vector SVG of a drawing sheet. Model space is millimetres; the document is
 * sized so that it prints at the drawing scale (1:scale).
 */
export function sheetToSvg(items: SheetItem[]): string {
  const prims = sheetPrimitives(items);
  const scale = items[0]?.drawing.scale ?? 1;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const ext = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const p of prims) {
    if (p.type === 'line') {
      ext(p.a.x, p.a.y);
      ext(p.b.x, p.b.y);
    } else if (p.type === 'polyline') p.points.forEach((q) => ext(q.x, q.y));
    else {
      ext(p.at.x, p.at.y);
      ext(p.at.x, p.at.y + p.height);
    }
  }
  const pad = 10 * scale;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const w = maxX - minX;
  const h = maxY - minY;
  const sw = 0.25 * scale;

  const byLayer = new Map<string, Primitive[]>();
  for (const p of prims) byLayer.set(p.layer, [...(byLayer.get(p.layer) ?? []), p]);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w / scale)}mm" height="${n(h / scale)}mm" viewBox="${n(minX)} ${n(-maxY)} ${n(w)} ${n(h)}">`,
  );
  parts.push(`<rect x="${n(minX)}" y="${n(-maxY)}" width="${n(w)}" height="${n(h)}" fill="#ffffff"/>`);
  for (const [layer, list] of [...byLayer.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const color = stroke(layer);
    const width = layer === 'KAD-CUT' ? sw * 2.5 : layer === 'KAD-DIM' ? sw * 0.7 : sw;
    parts.push(`<g id="${esc(layer)}" stroke="${color}" stroke-width="${n(width)}" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
    for (const p of list) {
      if (p.type === 'line') {
        const dash = p.dashed ? ` stroke-dasharray="${n(6 * scale)} ${n(3 * scale)}"` : '';
        parts.push(`<line x1="${n(p.a.x)}" y1="${n(-p.a.y)}" x2="${n(p.b.x)}" y2="${n(-p.b.y)}"${dash}/>`);
      } else if (p.type === 'polyline') {
        const pts = p.points.map((q) => `${n(q.x)},${n(-q.y)}`).join(' ');
        parts.push(p.closed ? `<polygon points="${pts}"/>` : `<polyline points="${pts}"/>`);
      } else {
        const anchor = p.align === 'center' ? 'middle' : p.align === 'right' ? 'end' : 'start';
        const rot = p.rotation ? ` transform="rotate(${n(-p.rotation)} ${n(p.at.x)} ${n(-p.at.y)})"` : '';
        parts.push(
          `<text x="${n(p.at.x)}" y="${n(-p.at.y)}" font-size="${n(p.height)}" font-family="Helvetica, Arial, sans-serif" text-anchor="${anchor}" fill="${color}" stroke="none"${rot}>${esc(p.text)}</text>`,
        );
      }
    }
    parts.push('</g>');
  }
  parts.push('</svg>');
  return parts.join('\n') + '\n';
}
