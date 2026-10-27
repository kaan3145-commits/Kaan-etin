import type { Material } from './types';

export const DEFAULT_MATERIALS: Material[] = [
  { id: 'mat_plaster', name: 'Painted plaster', color: '#d9d6cf', roughness: 0.95, category: 'plaster' },
  { id: 'mat_oak', name: 'Oak veneer', color: '#b48a5c', roughness: 0.7, category: 'wood' },
  { id: 'mat_walnut', name: 'Walnut veneer', color: '#6e4b35', roughness: 0.65, category: 'wood' },
  { id: 'mat_white_lacquer', name: 'White lacquer', color: '#efeee9', roughness: 0.35, category: 'lacquer' },
  { id: 'mat_anthracite', name: 'Anthracite lacquer', color: '#3c3f43', roughness: 0.4, category: 'lacquer' },
  { id: 'mat_mdf', name: 'Raw MDF', color: '#a08566', roughness: 0.9, category: 'wood' },
  { id: 'mat_travertine', name: 'Travertine', color: '#cbbba0', roughness: 0.8, category: 'stone' },
  { id: 'mat_brass', name: 'Brushed brass', color: '#b5964f', roughness: 0.35, category: 'metal' },
];

export function findMaterial(materials: Material[], id: string): Material {
  return materials.find((m) => m.id === id) ?? FALLBACK_MATERIAL;
}

export const FALLBACK_MATERIAL: Material = {
  id: 'mat_unknown',
  name: 'Unassigned',
  color: '#999999',
  roughness: 0.8,
  category: 'other',
};
