import type { Vec2 } from '../geometry/vec';
import type { Facade, PixelPoint } from '../model/types';

/** 3×3 projective transform, row-major. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Solves A·x = b with partial-pivot Gaussian elimination. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) throw new Error('Degenerate calibration: points are collinear or coincident.');
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Homography mapping four source points onto four destination points (DLT, h33 = 1). */
export function computeHomography(src: Vec2[], dst: Vec2[]): Mat3 {
  if (src.length !== 4 || dst.length !== 4) throw new Error('Homography needs exactly 4 point pairs.');
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyHomography(H: Mat3, p: Vec2): Vec2 {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

export function invertHomography(H: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('Homography is singular.');
  const inv: Mat3 = [
    A, -(b * i - c * h), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * h - b * g), a * e - b * d,
  ];
  return inv.map((v) => v / det) as Mat3;
}

/**
 * Pixel → façade-local world transform from the reference image's four corner
 * pixels (BL, BR, TR, TL). Corrects planar perspective; for a frontal photo it
 * reduces to a scale + offset.
 */
export function pixelToFacadeTransform(facade: Pick<Facade, 'width' | 'height'>, corners: PixelPoint[]): Mat3 {
  const src = corners.map((c) => ({ x: c.px, y: c.py }));
  const dst = [
    { x: 0, y: 0 },
    { x: facade.width, y: 0 },
    { x: facade.width, y: facade.height },
    { x: 0, y: facade.height },
  ];
  return computeHomography(src, dst);
}

/** Default calibration: the whole image spans the façade. */
export function fullImageCorners(w: number, h: number): [PixelPoint, PixelPoint, PixelPoint, PixelPoint] {
  return [
    { px: 0, py: h },
    { px: w, py: h },
    { px: w, py: 0 },
    { px: 0, py: 0 },
  ];
}
