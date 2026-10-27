import * as THREE from 'three';
import type { FacadeModel, Solid } from '../core/parametric/regenerate';

/**
 * Converts derived solids into Three.js objects. This is a one-way view of the
 * geometry model: nothing here is ever read back into the document.
 * World coordinates are used as-is (millimetres, Z up).
 */

export interface SolidObject {
  solid: Solid;
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
}

export function meshGeometry(solid: Solid): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(solid.mesh.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(solid.mesh.normals, 3));
  g.setIndex(solid.mesh.indices);
  g.computeBoundingSphere();
  return g;
}

export function edgeGeometry(solid: Solid): THREE.BufferGeometry {
  const pts: number[] = [];
  for (const [a, b] of solid.edges) pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

export function surfaceMaterial(solid: Solid): THREE.MeshStandardMaterial {
  const key = `${solid.material.id}|${solid.material.color}|${solid.semantic === 'wall'}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(solid.material.color),
      roughness: solid.material.roughness,
      metalness: solid.material.category === 'metal' ? 0.6 : 0,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    m.name = solid.material.name;
    materialCache.set(key, m);
  }
  return m;
}

export function buildSolidObject(solid: Solid, edgeColor = 0x2a2a2a): SolidObject {
  const mesh = new THREE.Mesh(meshGeometry(solid), surfaceMaterial(solid).clone());
  mesh.name = solid.id;
  mesh.userData = {
    solidId: solid.id,
    regionId: solid.regionId,
    semantic: solid.semantic,
    material: solid.material.name,
    thickness_mm: solid.thickness,
    volume_mm3: solid.volume,
  };
  const edges = new THREE.LineSegments(edgeGeometry(solid), new THREE.LineBasicMaterial({ color: edgeColor }));
  edges.name = `${solid.id}#edges`;
  edges.userData = { solidId: solid.id, isEdges: true };
  mesh.add(edges);
  return { solid, mesh, edges };
}

/** Whole façade model (wall + components) as a scene graph. */
export function buildModelGroup(model: FacadeModel): { group: THREE.Group; objects: SolidObject[] } {
  const group = new THREE.Group();
  group.name = model.facade.name;
  const objects = [buildSolidObject(model.wall, 0x777777), ...model.solids.map((s) => buildSolidObject(s))];
  for (const o of objects) group.add(o.mesh);
  return { group, objects };
}

export function disposeGroup(group: THREE.Object3D) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m.dispose());
    }
  });
}
