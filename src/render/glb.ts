import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { FacadeModel } from '../core/parametric/regenerate';
import { buildModelGroup, disposeGroup } from './sceneBuilder';

/**
 * Exports the façade as a binary glTF (GLB) visual model.
 * GLB is a mesh format for visualisation; it is not an editable CAD solid.
 * glTF is Y-up and in metres, so the Z-up millimetre model is converted here.
 */
export async function exportGlb(model: FacadeModel): Promise<ArrayBuffer> {
  const { group } = buildModelGroup(model);
  // edges are a viewer aid, not part of the visual model
  const edgeObjects: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (o.userData.isEdges) edgeObjects.push(o);
  });
  edgeObjects.forEach((o) => o.removeFromParent());

  const root = new THREE.Group();
  root.name = 'KAD Geometry Engine';
  root.scale.setScalar(0.001); // mm → m
  root.rotation.x = -Math.PI / 2; // Z-up → Y-up
  root.add(group);
  root.userData = { units: 'mm (scaled to m)', facade: model.facade.name, source: 'kad-geometry-engine' };

  const exporter = new GLTFExporter();
  try {
    const result = await exporter.parseAsync(root, { binary: true });
    return result as ArrayBuffer;
  } finally {
    disposeGroup(root);
  }
}
