import type { Box2, Vec2 } from '../geometry/vec';
import type { DrawingType, Id } from '../model/types';

/** CAD layer names. Shared by the DXF, SVG and on-screen renderers. */
export const LAYERS = {
  wall: 'KAD-WALL',
  cut: 'KAD-CUT',
  dim: 'KAD-DIM',
  anno: 'KAD-ANNO',
  title: 'KAD-TITLE',
  hidden: 'KAD-HIDDEN',
} as const;

export function componentLayer(semantic: string): string {
  return `KAD-${semantic.toUpperCase()}`;
}

/** AutoCAD Color Index per layer. */
export const LAYER_COLORS: Record<string, number> = {
  'KAD-WALL': 8,
  'KAD-CUT': 7,
  'KAD-DIM': 1,
  'KAD-ANNO': 3,
  'KAD-TITLE': 7,
  'KAD-HIDDEN': 9,
  'KAD-PANEL': 30,
  'KAD-LAMBRI': 32,
  'KAD-NICHE': 4,
  'KAD-SHELF': 5,
  'KAD-CABINET': 6,
  'KAD-FRAME': 40,
  'KAD-GENERIC': 7,
};

export type Primitive =
  | { type: 'line'; a: Vec2; b: Vec2; layer: string; ref?: string; dashed?: boolean }
  | { type: 'polyline'; points: Vec2[]; closed: boolean; layer: string; ref?: string }
  | {
      type: 'text';
      at: Vec2;
      text: string;
      /** Model-space text height in mm. */
      height: number;
      /** Degrees, counter-clockwise. */
      rotation: number;
      align: 'left' | 'center' | 'right';
      layer: string;
    };

/** Linear dimension between two points, offset perpendicular to the measured direction. */
export interface Dimension {
  a: Vec2;
  b: Vec2;
  /** 'h' measures Δx, 'v' measures Δy. */
  direction: 'h' | 'v';
  /** Position of the dimension line: y (for 'h') or x (for 'v') in drawing coordinates. */
  at: number;
  value: number;
  layer: string;
}

export interface Drawing {
  id: Id;
  type: DrawingType;
  name: string;
  scale: number;
  /** Drawing coordinate axes, e.g. ['X', 'Z'] for an elevation. */
  axes: [string, string];
  primitives: Primitive[];
  dimensions: Dimension[];
  bounds: Box2;
}
