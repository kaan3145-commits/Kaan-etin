# KAD Geometry Engine — architecture (v0.1, milestone 1)

## Goal

Turn a measured façade, user-defined regions and (optionally) a reference image into
dimensionally exact, editable geometry: 2D elevation, synchronized orthographic 3D
model, and CAD drawings — without manually redrawing anything.

The axonometric view is only a *view* of the model. The source of truth is a typed,
versioned, parametric document in real-world millimetre coordinates.

## Layers

```
            ┌────────────── UI (React) ──────────────┐
            │ LeftPanel   Editor2D (Konva)  RightPanel│
            │             Viewer3D (Three.js)         │
            └───────▲───────────────┬────────────────┘
          derived   │               │ ops (commands)
          model     │               ▼
            ┌───────┴─────── state (zustand) ────────┐
            │ doc · undo/redo history · selection     │
            └───────▲───────────────┬────────────────┘
                    │ regenerate()  │ applyOp()
            ┌───────┴─────── core (pure TS) ─────────┐
            │ model → parametric → sketch → solid →  │
            │ drawing → export (DXF/SVG/JSON)        │
            └────────────────────────────────────────┘
```

`src/core` has no UI or rendering dependencies, so it can be moved into KAD Atlas as a
package (or run in a worker / on a server) unchanged.

## Document model (`core/model/types.ts`)

```
KadDocument (format, schemaVersion, revision, units = mm)
└─ Project            materials[]
   └─ Space
      └─ Façade       width, height, origin, wallThickness, reference image, drawings[]
         └─ Region    semantic type, material, Extrude feature, LinearPattern feature
            ├─ panelSystem: PanelLayoutParams + per-panel overrides
            └─ sketch:      Sketch { points, segments, constraints }
```

Every entity has a stable `id`, `parentId`, `name`, `rev` (bumped on change) and optional
per-parameter `provenance` (`measured` / `assumed` / `derived`).

Derived (never stored): `DerivedFace` → `Solid` (prism B-rep: profile, y-range, bbox,
volume, mesh, edges) → `Drawing` (primitives + dimensions).

Mapping to the conceptual hierarchy *Project → Space → Façade → Region → Sketch → Face →
Feature → Solid → Drawing*: Sketch and layout rules live in the Region; Faces are derived
from them; Features (extrude, pattern) are region parameters; Solids and Drawings are
derived; drawing *definitions* (type, scale, section position) are stored on the Façade.

## Algorithms

| Step | Module | Notes |
|---|---|---|
| Calibration | `calibration/homography.ts` | 4-point DLT homography pixel ↔ façade; image rectified per pixel in the UI |
| Points | `sketch/snap.ts` | endpoint/vertex › axis alignment › grid; adaptive snap increment |
| Lines → faces | `sketch/faces.ts` | crossing/overlap detection, dangling-chain pruning, planar half-edge face tracing, stable face keys (hash of boundary segment ids), nested-contour warning |
| Constraints | `sketch/constraints.ts` | iterative solver: horizontal, vertical, fixed, distance; dragged point pinned |
| Layout rules | `parametric/panelLayout.ts` | `run = n·w + (n−1)·g`; fixed-width (centre/start/end) or fill-width; overflow is an error, never clipped |
| Solids | `solid/extrude.ts` | exact prism: ear-clipping caps, outward normals, edges, volume |
| Regeneration | `parametric/regenerate.ts` | region → faces → extrude → pattern → solids; validation issues |
| Drawings | `drawing/projection.ts` | elevation (XZ), plan (XY), section at X (profile ∩ cutting plane); chain + overall dimensions |
| Export | `export/dxf.ts`, `svg.ts`, `json.ts`; `render/glb.ts` | DXF R12 with layers; SVG at scale; JSON with schema validation + migrations; GLB visual mesh |

## Decisions

- **Own DXF writer instead of Maker.js.** We need TEXT entities for dimension values,
  explicit layer colours/linetypes, R12 compatibility and byte-deterministic output for
  tests. The writer is ~150 lines and validated with ezdxf (0 audit errors). The drawing
  model (`Primitive[]`) is exporter-agnostic, so Maker.js or another backend can be added.
- **Prism kernel now, OpenCascade later.** 2.5D façade components (panels, lambri, niches,
  shelves, carcasses) are exact prisms. `core/kernel/GeometryKernel.ts` defines the interface
  an OpenCascade.js kernel will implement for booleans, fillets, free-form parts and STEP.
- **Immutable documents (immer).** Exact undo/redo, cheap change detection, and a model
  cache keyed by document identity.
- **Raw Three.js instead of react-three-fiber.** Keeps rendering a thin one-way adapter.

## Known limits (v0.1)

- Holes/voids inside a contour are reported, not subtracted (needs B-Rep booleans).
- No clash detection between overlapping solids of different regions yet.
- Elevation drawing has no hidden-line removal (2.5D façades rarely need it).
- One façade per space in the UI (the model already supports several).
- Arcs/curves are not in the sketch model yet (phase 2: free-form furniture and curves).
