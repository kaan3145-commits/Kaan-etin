/**
 * KAD Geometry Engine — public API of the geometry core.
 * Pure TypeScript: no DOM, React or Three.js dependencies.
 */
export * from './geometry/vec';
export * from './geometry/polygon';
export * from './model/types';
export * from './model/ids';
export * from './model/materials';
export * from './model/factory';
export * from './model/query';
export * from './parametric/panelLayout';
export * from './parametric/regenerate';
export * from './sketch/faces';
export * from './sketch/constraints';
export * from './solid/extrude';
export * from './drawing/types';
export * from './drawing/dimensions';
export * from './drawing/projection';
export * from './export/dxf';
export * from './export/svg';
export * from './export/json';
export * from './calibration/homography';
export * from './kernel/GeometryKernel';
export * as ops from './ops/operations';
export * from './examples/wallPaneling';
export * from './sketch/snap';
