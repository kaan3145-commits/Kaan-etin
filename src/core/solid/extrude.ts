import { area, ensureCCW, triangulate } from '../geometry/polygon';
import { type Box3, type Vec2, type Vec3, round6 } from '../geometry/vec';

/** Indexed triangle mesh with flat (per-face) normals. Derived data only. */
export interface Mesh {
  positions: number[];
  normals: number[];
  indices: number[];
}

/**
 * Prismatic solid: a planar profile on a façade, extruded along world Y.
 * This is a boundary representation sufficient for 2.5D façade components;
 * general B-Rep solids are delegated to a future kernel (see core/kernel).
 */
export interface PrismGeometry {
  /** Profile in façade-local (x → X, y → Z) coordinates, counter-clockwise. */
  profile: Vec2[];
  /** World position of the façade-local origin on the wall surface. */
  origin: Vec3;
  /** Front face plane (smaller Y, towards the viewer). */
  y0: number;
  /** Back face plane. */
  y1: number;
}

export interface PrismDerived {
  bbox: Box3;
  volume: number;
  frontArea: number;
  mesh: Mesh;
  /** Topological edges as world-space line segments. */
  edges: Array<[Vec3, Vec3]>;
}

export function prismPoint(g: PrismGeometry, p: Vec2, y: number): Vec3 {
  return { x: g.origin.x + p.x, y: g.origin.y + y, z: g.origin.z + p.y };
}

/**
 * Builds the derived boundary of a prism: bounding box, volume, triangle mesh
 * (front cap normal −Y, back cap +Y, one quad per profile edge) and edges.
 */
export function buildPrism(input: PrismGeometry): PrismDerived {
  const g = { ...input, profile: ensureCCW(input.profile) };
  const n = g.profile.length;
  const depth = g.y1 - g.y0;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  const addVertex = (p: Vec3, nx: number, ny: number, nz: number): number => {
    positions.push(p.x, p.y, p.z);
    normals.push(nx, ny, nz);
    return positions.length / 3 - 1;
  };

  const tris = triangulate(g.profile);
  // front cap (towards viewer, normal −Y): CCW in (x, z) seen from −Y
  const front = g.profile.map((p) => addVertex(prismPoint(g, p, g.y0), 0, -1, 0));
  for (const [a, b, c] of tris) indices.push(front[a], front[b], front[c]);
  // back cap (normal +Y): reversed winding
  const back = g.profile.map((p) => addVertex(prismPoint(g, p, g.y1), 0, 1, 0));
  for (const [a, b, c] of tris) indices.push(back[a], back[c], back[b]);
  // side walls
  for (let i = 0; i < n; i++) {
    const p = g.profile[i];
    const q = g.profile[(i + 1) % n];
    const ex = q.x - p.x;
    const ez = q.y - p.y;
    const l = Math.hypot(ex, ez) || 1;
    // outward normal of a CCW edge in the (x, z) plane
    const nx = ez / l;
    const nz = -ex / l;
    const f0 = addVertex(prismPoint(g, p, g.y0), nx, 0, nz);
    const f1 = addVertex(prismPoint(g, q, g.y0), nx, 0, nz);
    const b1 = addVertex(prismPoint(g, q, g.y1), nx, 0, nz);
    const b0 = addVertex(prismPoint(g, p, g.y1), nx, 0, nz);
    indices.push(f0, b0, b1, f0, b1, f1);
  }

  const edges: Array<[Vec3, Vec3]> = [];
  for (let i = 0; i < n; i++) {
    const p = g.profile[i];
    const q = g.profile[(i + 1) % n];
    edges.push([prismPoint(g, p, g.y0), prismPoint(g, q, g.y0)]);
    edges.push([prismPoint(g, p, g.y1), prismPoint(g, q, g.y1)]);
    edges.push([prismPoint(g, p, g.y0), prismPoint(g, p, g.y1)]);
  }

  const xs = g.profile.map((p) => p.x);
  const zs = g.profile.map((p) => p.y);
  const frontArea = area(g.profile);
  return {
    bbox: {
      min: { x: round6(g.origin.x + Math.min(...xs)), y: round6(g.origin.y + g.y0), z: round6(g.origin.z + Math.min(...zs)) },
      max: { x: round6(g.origin.x + Math.max(...xs)), y: round6(g.origin.y + g.y1), z: round6(g.origin.z + Math.max(...zs)) },
    },
    volume: round6(frontArea * depth),
    frontArea: round6(frontArea),
    mesh: { positions, normals, indices },
    edges,
  };
}
