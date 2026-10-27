# KAD Geometry Engine — engineering rules

Parametric reconstruction module of KAD Atlas: measured façade + regions → editable 2D/3D geometry → CAD output.
Pipeline: POINT → LINE → CLOSED CONTOUR → PLANAR FACE → EXTRUSION → SOLID → TECHNICAL DRAWING.

## Commands

```bash
npm install
npm run dev         # app at http://localhost:5173
npm test            # vitest unit tests (src/**/*.test.ts)
npm run typecheck   # tsc, strict
npm run build       # typecheck + production build
npm run example     # regenerate examples/wall-paneling.{kad.json,dxf,svg}
```

Before committing: `npm run typecheck && npm test`. If drawing/export code changed, run `npm run example` and commit the regenerated files.

## Boundaries (do not cross)

- `src/core/` is pure TypeScript: **no imports of React, Konva, Three.js or DOM APIs**. It must stay portable into KAD Atlas as a package.
- The document model (`core/model/types.ts`) is the **only source of truth**. Faces, solids, meshes and drawings are derived by `regenerate()` and are never stored or edited directly.
- Rendering (`src/render`, `src/ui/viewer3d`) reads derived solids one-way. Never read geometry back from Three.js objects.
- All document changes go through `core/ops/operations.ts` (`applyOp`, immer). The UI calls `useStore().apply(op, label)`; one user action = one undo step (`beginLive`/`applyLive` for drags).
- Do not rebuild Product DNA extraction here; DNA is stored as optional metadata on regions only.

## Geometry conventions

- Units: millimetres everywhere. World axes: X width, Y depth (+Y into the wall), Z height; right-handed, Z up.
- Wall surface at y = 0, wall body y ∈ [0, wallThickness]; components extrude toward the viewer: y ∈ [−(standoff+thickness), −standoff].
- Sketches/layouts use façade-local (x, z). Polygons are counter-clockwise; `Vec2.y` means façade z.
- Derived numbers go through `round6()`; keep algorithms deterministic (no randomness, no time) — identical input ⇒ byte-identical DXF.
- Unknown dimensions are never presented as measured: keep `provenance` (`measured` / `assumed` / `derived`) on parameters.

## Export rules

- DXF: hand-written R12 (AC1009) writer, 1:1 mm, `$INSUNITS=4`, layers `KAD-*`, dimensions exploded to LINE+TEXT. Validate changes with an independent reader (e.g. `ezdxf` audit) when touching `export/dxf.ts`.
- Never fake CAD output with raster screenshots. GLB is a visual mesh only. **Never write a mesh as STEP**; STEP requires a B-Rep kernel implementing `core/kernel/GeometryKernel.ts` with `capabilities.step = true` (planned: OpenCascade.js).

## Tests

- Unit tests live next to the code (`*.test.ts`). Every new algorithm gets tests; every bug fix gets a regression test.
- `src/core/milestone.test.ts` is the acceptance test for milestone 1 (4200 × 2800 wall, 5 × 800 mm panels, 10 mm gaps, 18 mm, 80 mm margins). Keep it green.

## Layout

```
src/core/      geometry, model, parametric, sketch, solid, drawing, export, calibration, kernel, ops
src/state/     zustand store (history), derived-model cache
src/render/    Three.js scene building, GLB export
src/ui/        React UI: editor2d (Konva), viewer3d (Three.js), panels
scripts/       build-example.ts
examples/      sample project + generated DXF/SVG
```
