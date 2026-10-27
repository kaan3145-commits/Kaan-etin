# KAD Geometry Engine — Parametric Reconstruction System

A module of **KAD Atlas** that converts measured façades, user-defined regions and
reference images into dimensionally exact, editable 2D drawings and 3D models.

```
01 POINT → 02 LINE → 03 PLANE → 04 SOLID → 05 CAD / BIM OUTPUT
```

The axonometric 3D view is a visualization; the geometry itself is parametric and lives in
real-world millimetre coordinates, so every view and export comes from the same model.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
npm test           # unit + milestone acceptance tests
```

The app opens with the milestone-1 example: a 4200 × 2800 mm wall with five 800 mm panels,
10 mm gaps, 18 mm thick, centred (80 mm side margins).

## What works in v0.1

- **2D geometry editor (XZ façade plane)** — point, line and rectangle tools; grid / endpoint /
  axis snapping; drag points (constraint solver keeps H/V, fixed and length constraints);
  closed contours become faces automatically; invalid contours (crossing, open, nested) are
  reported.
- **Parametric panel systems** — count, width, gap, alignment, fill-width mode, offsets,
  per-panel overrides (material, thickness, omit). Changing the wall re-derives every panel.
- **Parametric 3D** — thickness, standoff and linear repeat per region; synchronized
  orthographic viewer (isometric, front, top, side), orbit/pan, selection shared with 2D.
- **Reference image** — 4-corner perspective calibration; image rectified onto the façade;
  digitised points keep their pixel coordinates.
- **Technical drawings** — front elevation, plan, section A-A, chain and overall dimensions.
- **Export** — layer-separated DXF (R12, mm), SVG at scale, JSON project (save/reopen,
  fully editable), GLB visual model. STEP is intentionally disabled until a B-Rep kernel
  (OpenCascade.js) is integrated — meshes are never exported as STEP.
- **Engineering** — typed versioned document, undo/redo, validation, deterministic output,
  42 unit tests.

Sample outputs: [`examples/`](examples) (`wall-paneling.kad.json`, `.dxf`, `.svg`).

Shortcuts: `V` select · `P` point · `L` line · `R` rectangle · `F` fit · `Esc` cancel ·
`Del` delete · `Ctrl+Z` / `Ctrl+Shift+Z` undo / redo · space-drag or middle-drag to pan.

## Coordinate system

X = width, Y = depth (+Y into the wall), Z = height, millimetres. The wall surface is at
y = 0; components project toward the viewer (negative Y).

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers, data model, algorithms, decisions
- [`CLAUDE.md`](CLAUDE.md) — engineering rules for development sessions

---

### Türkçe özet

KAD Geometry Engine, ölçüsü girilen bir cepheyi ve kullanıcının tanımladığı bölgeleri
ölçülendirilebilir, düzenlenebilir 2D/3D geometriye ve CAD çıktısına dönüştürür. İlk sürüm
2.5D parametrik cephe modellemeye odaklanır (lambri, panel, niş, raf, dolap gövdesi).
Tek doğru kaynak parametrik belge modelidir; aksonometrik görünüm, plan, kesit ve DXF aynı
geometriden üretilir. Ölçülmemiş değerler "assumed" (varsayım) olarak işaretli kalır.
