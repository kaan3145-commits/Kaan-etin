import type { Vec2, Vec3 } from '../geometry/vec';
import { buildPrism, type Mesh } from '../solid/extrude';

/**
 * Extension point for geometry kernels.
 *
 * v1 ships `PrismKernel`, an exact analytic kernel for planar profiles extruded
 * along the façade normal (enough for panels, lambri, niches, shelves, carcasses).
 * A future `OpenCascadeKernel` (opencascade.js, WebAssembly) implements the same
 * interface to provide true B-Rep solids, booleans, fillets and STEP export.
 *
 * Rule: a kernel may only claim `step: true` if it produces real B-Rep topology.
 * Meshes must never be written out under a STEP/IGES extension.
 */
export interface KernelCapabilities {
  brep: boolean;
  booleans: boolean;
  step: boolean;
}

export interface ExtrudeRequest {
  /** Counter-clockwise profile in façade-local (x, z) coordinates. */
  profile: Vec2[];
  origin: Vec3;
  y0: number;
  y1: number;
}

export interface KernelSolid {
  kernel: string;
  volume: number;
  mesh: Mesh;
  /** Opaque kernel-specific handle (e.g. an OCC TopoDS_Shape). */
  handle?: unknown;
}

export interface GeometryKernel {
  readonly id: string;
  readonly capabilities: KernelCapabilities;
  extrude(req: ExtrudeRequest): KernelSolid;
  /** Only available when capabilities.step is true. */
  exportStep?(solids: KernelSolid[]): Uint8Array;
}

export const PrismKernel: GeometryKernel = {
  id: 'prism',
  capabilities: { brep: false, booleans: false, step: false },
  extrude(req) {
    const r = buildPrism(req);
    return { kernel: 'prism', volume: r.volume, mesh: r.mesh };
  },
};
