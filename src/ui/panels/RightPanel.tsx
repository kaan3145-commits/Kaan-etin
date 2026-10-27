import { formatMm } from '../../core/drawing/dimensions';
import { createPanelSystemRegion } from '../../core/model/factory';
import { createId } from '../../core/model/ids';
import { SEMANTIC_TYPES, type Facade, type Material, type PanelSystemRegion, type Region, type SemanticType, type SketchRegion } from '../../core/model/types';
import * as ops from '../../core/ops/operations';
import type { FacadeModel, Solid } from '../../core/parametric/regenerate';
import { analyzeSketch } from '../../core/sketch/faces';
import { useModel } from '../../state/derived';
import { useStore } from '../../state/store';
import { exportDxf, exportGlbFile, exportSvg, saveProject } from './exporters';
import { MaterialField, NumberField, ReadOnly, Section, SelectField, TextField, Toggle } from './fields';

const semanticOptions = SEMANTIC_TYPES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }));
const mm = (v: number) => `${formatMm(v)} mm`;

function FacadeProps({ facade, materials }: { facade: Facade; materials: Material[] }) {
  const apply = useStore((s) => s.apply);
  const prov = facade.provenance ?? {};
  const setDims = (patch: Parameters<typeof ops.setFacadeParams>[1], label: string) => apply(ops.setFacadeParams(facade.id, patch), label);
  const section = facade.drawings.find((d) => d.type === 'section');
  return (
    <>
      <Section title="Façade">
        <TextField label="Name" value={facade.name} onCommit={(v) => apply(ops.renameEntity(facade.id, v), 'Rename façade')} />
        <NumberField
          testId="facade-width"
          label="Width (X)"
          unit="mm"
          step={10}
          value={facade.width}
          onCommit={(v) => v !== null && setDims({ width: v }, 'Change façade width')}
          provenance={prov.width}
          onProvenance={(p) => apply(ops.setProvenance(facade.id, 'width', p), 'Set provenance')}
        />
        <NumberField
          testId="facade-height"
          label="Height (Z)"
          unit="mm"
          step={10}
          value={facade.height}
          onCommit={(v) => v !== null && setDims({ height: v }, 'Change façade height')}
          provenance={prov.height}
          onProvenance={(p) => apply(ops.setProvenance(facade.id, 'height', p), 'Set provenance')}
        />
        <NumberField
          label="Wall thickness (Y)"
          unit="mm"
          step={5}
          value={facade.wallThickness}
          onCommit={(v) => v !== null && setDims({ wallThickness: v }, 'Change wall thickness')}
          provenance={prov.wallThickness}
          onProvenance={(p) => apply(ops.setProvenance(facade.id, 'wallThickness', p), 'Set provenance')}
        />
        <MaterialField label="Wall finish" value={facade.wallMaterial} materials={materials} onChange={(id) => setDims({ wallMaterial: id }, 'Change wall finish')} />
      </Section>
      <Section title="Drawings">
        {section && (
          <NumberField
            label="Section A-A at X"
            unit="mm"
            step={50}
            value={Math.round(section.cutX ?? facade.width / 2)}
            onCommit={(v) => v !== null && apply(ops.setDrawingParams(facade.id, section.id, { cutX: v }), 'Move section')}
          />
        )}
        <SelectField
          label="Scale"
          value={String(facade.drawings[0]?.scale ?? 20)}
          options={['10', '20', '25', '50'].map((s) => ({ value: s, label: `1:${s}` }))}
          onChange={(v) => apply(ops.batch(...facade.drawings.map((d) => ops.setDrawingParams(facade.id, d.id, { scale: Number(v) }))), 'Change drawing scale')}
        />
      </Section>
    </>
  );
}

function RegionCommon({ region, materials }: { region: Region; materials: Material[] }) {
  const apply = useStore((s) => s.apply);
  const select = useStore((s) => s.select);
  const prov = region.provenance ?? {};
  return (
    <>
      <Section
        title={region.source === 'panelSystem' ? 'Panel system' : 'Sketch region'}
        actions={
          <button
            className="btn-icon danger"
            title="Delete region"
            onClick={() => {
              if (apply(ops.deleteRegion(region.id), `Delete ${region.name}`)) select(null);
            }}
          >
            Delete
          </button>
        }
      >
        <TextField label="Name" value={region.name} onCommit={(v) => apply(ops.renameEntity(region.id, v), 'Rename region')} />
        <SelectField<SemanticType>
          label="Component type"
          value={region.semantic}
          options={semanticOptions}
          onChange={(v) => apply(ops.setRegionParams(region.id, { semantic: v }), 'Change component type')}
        />
        <MaterialField value={region.material} materials={materials} onChange={(id) => apply(ops.setRegionParams(region.id, { material: id }), 'Change material')} />
        <Toggle label="Visible in model" checked={region.visible} onChange={(v) => apply(ops.setRegionParams(region.id, { visible: v }), v ? 'Show region' : 'Hide region')} />
        {region.dna && <ReadOnly label="Product DNA" value={[region.dna.category, region.dna.style].filter(Boolean).join(' · ') || 'attached'} />}
      </Section>
      <Section title="Extrusion (depth)">
        <NumberField
          testId="thickness"
          label="Thickness"
          unit="mm"
          value={region.extrude.thickness}
          onCommit={(v) => v !== null && apply(ops.setExtrude(region.id, { thickness: v }), 'Change thickness')}
          provenance={prov.thickness}
          onProvenance={(p) => apply(ops.setProvenance(region.id, 'thickness', p), 'Set provenance')}
        />
        <NumberField
          label="Standoff from wall"
          unit="mm"
          value={region.extrude.standoff}
          onCommit={(v) => v !== null && apply(ops.setExtrude(region.id, { standoff: v }), 'Change standoff')}
          provenance={prov.standoff}
          onProvenance={(p) => apply(ops.setProvenance(region.id, 'standoff', p), 'Set provenance')}
        />
      </Section>
      <Section title="Repeat (linear array)">
        <Toggle
          label="Repeat this region"
          checked={!!region.pattern}
          onChange={(v) => apply(ops.setPattern(region.id, v ? { count: 2, spacing: 400, axis: 'z' } : null), v ? 'Add repeat' : 'Remove repeat')}
        />
        {region.pattern && (
          <>
            <NumberField
              label="Count"
              value={region.pattern.count}
              min={1}
              onCommit={(v) => v !== null && apply(ops.setPattern(region.id, { ...region.pattern!, count: v }), 'Change repeat count')}
            />
            <NumberField
              label="Spacing"
              unit="mm"
              step={10}
              value={region.pattern.spacing}
              onCommit={(v) => v !== null && apply(ops.setPattern(region.id, { ...region.pattern!, spacing: v }), 'Change repeat spacing')}
            />
            <SelectField<'x' | 'z'>
              label="Direction"
              value={region.pattern.axis}
              options={[
                { value: 'x', label: 'Horizontal (X)' },
                { value: 'z', label: 'Vertical (Z)' },
              ]}
              onChange={(v) => apply(ops.setPattern(region.id, { ...region.pattern!, axis: v }), 'Change repeat direction')}
            />
          </>
        )}
      </Section>
    </>
  );
}

function PanelSystemProps({ region, model }: { region: PanelSystemRegion; model: FacadeModel }) {
  const apply = useStore((s) => s.apply);
  const L = region.layout;
  const result = model.layouts[region.id];
  const set = (patch: Partial<typeof L>, label: string) => apply(ops.setLayout(region.id, patch), label);
  return (
    <Section title="Layout rule">
      <NumberField testId="panel-count" label="Panel count" value={L.count} min={1} onCommit={(v) => v !== null && set({ count: v }, 'Change panel count')} />
      <SelectField<typeof L.distribution>
        label="Distribution"
        value={L.distribution}
        options={[
          { value: 'fixedWidth', label: 'Fixed panel width' },
          { value: 'fillWidth', label: 'Fill width (fixed margins)' },
        ]}
        onChange={(v) => set({ distribution: v }, 'Change distribution')}
      />
      <NumberField
        testId="panel-width"
        label="Panel width"
        unit="mm"
        step={10}
        value={L.distribution === 'fillWidth' ? result?.panelWidth ?? 0 : L.panelWidth}
        disabled={L.distribution === 'fillWidth'}
        onCommit={(v) => v !== null && set({ panelWidth: v }, 'Change panel width')}
      />
      <NumberField testId="panel-gap" label="Gap" unit="mm" value={L.gap} onCommit={(v) => v !== null && set({ gap: v }, 'Change gap')} />
      {L.distribution === 'fixedWidth' && (
        <SelectField<typeof L.alignment>
          label="Alignment"
          value={L.alignment}
          options={[
            { value: 'center', label: 'Centred' },
            { value: 'start', label: 'From left' },
            { value: 'end', label: 'From right' },
          ]}
          onChange={(v) => set({ alignment: v }, 'Change alignment')}
        />
      )}
      {(L.distribution === 'fillWidth' || L.alignment !== 'center') && (
        <NumberField label="Side margin" unit="mm" value={L.sideMargin} onCommit={(v) => v !== null && set({ sideMargin: v }, 'Change side margin')} />
      )}
      <NumberField label="Bottom offset" unit="mm" value={L.bottomOffset} onCommit={(v) => v !== null && set({ bottomOffset: v }, 'Change bottom offset')} />
      <NumberField label="Top offset" unit="mm" value={L.topOffset} disabled={L.panelHeight !== null} onCommit={(v) => v !== null && set({ topOffset: v }, 'Change top offset')} />
      <NumberField label="Panel height" unit="mm" nullable="fill" value={L.panelHeight} onCommit={(v) => set({ panelHeight: v }, 'Change panel height')} />
      {Object.entries(region.overrides).some(([, o]) => o.suppressed) && (
        <div className="omitted">
          <span>Omitted:</span>
          {Object.entries(region.overrides)
            .filter(([, o]) => o.suppressed)
            .map(([k]) => (
              <button key={k} className="btn-link" title="Restore this panel" onClick={() => apply(ops.setPanelOverride(region.id, Number(k), { suppressed: undefined }), 'Restore panel')}>
                Panel {Number(k) + 1} ↺
              </button>
            ))}
        </div>
      )}
      {result && result.panels.length > 0 && (
        <div className="derived">
          <ReadOnly testId="margin-start" label="Left margin" value={mm(result.marginStart)} />
          <ReadOnly testId="margin-end" label="Right margin" value={mm(result.marginEnd)} />
          <ReadOnly label="Run width" value={mm(result.runWidth)} />
          <ReadOnly label="Panel size" value={`${formatMm(result.panelWidth)} × ${formatMm(result.panelHeight)} mm`} />
        </div>
      )}
    </Section>
  );
}

function SketchProps({ region }: { region: SketchRegion }) {
  const a = analyzeSketch(region.sketch);
  return (
    <Section title="Sketch topology">
      <ReadOnly label="Points" value={region.sketch.points.length} />
      <ReadOnly label="Lines" value={region.sketch.segments.length} />
      <ReadOnly label="Closed faces" value={a.faces.length} />
      <ReadOnly label="Face area" value={`${formatMm(a.faces.reduce((s, f) => s + f.area, 0) / 1e6)} m²`} />
      <ReadOnly label="Constraints" value={region.sketch.constraints.length} />
    </Section>
  );
}

function SolidProps({ solid, region, materials }: { solid: Solid; region: Region; materials: Material[] }) {
  const apply = useStore((s) => s.apply);
  const select = useStore((s) => s.select);
  const b = solid.bbox;
  const idx = solid.panelIndex;
  const override = region.source === 'panelSystem' && idx !== undefined ? region.overrides[String(idx)] ?? {} : null;
  return (
    <>
      <Section
        title={idx !== undefined ? `Panel ${idx + 1}` : `Component${solid.instance ? ` #${solid.instance + 1}` : ''}`}
        actions={
          <button className="btn-link" onClick={() => select({ kind: 'region', id: region.id })}>
            {region.name} ›
          </button>
        }
      >
        <ReadOnly label="Type" value={solid.semantic} />
        <ReadOnly label="Width (X)" value={mm(b.max.x - b.min.x)} testId="solid-width" />
        <ReadOnly label="Height (Z)" value={mm(b.max.z - b.min.z)} />
        <ReadOnly label="Depth (Y)" value={mm(b.max.y - b.min.y)} />
        <ReadOnly label="Position X / Z" value={`${formatMm(b.min.x)} / ${formatMm(b.min.z)} mm`} testId="solid-x" />
        <ReadOnly label="Face area" value={`${(solid.frontArea / 1e6).toFixed(3)} m²`} />
        <ReadOnly label="Volume" value={`${(solid.volume / 1e9).toFixed(4)} m³`} />
        <ReadOnly label="Material" value={solid.material.name} />
        <ReadOnly label="Source" value={<code>{solid.id}</code>} />
      </Section>
      {override && idx !== undefined && (
        <Section
          title="Panel override"
          actions={
            Object.keys(override).length > 0 && (
              <button className="btn-link" onClick={() => apply(ops.setPanelOverride(region.id, idx, null), 'Reset panel override')}>
                Reset
              </button>
            )
          }
        >
          <MaterialField
            value={override.material ?? ''}
            materials={materials}
            allowInherit
            onChange={(id) => apply(ops.setPanelOverride(region.id, idx, { material: id || undefined }), 'Override panel material')}
          />
          <NumberField
            label="Thickness"
            unit="mm"
            nullable="inherit"
            value={override.thickness ?? null}
            onCommit={(v) => apply(ops.setPanelOverride(region.id, idx, { thickness: v ?? undefined }), 'Override panel thickness')}
          />
          <Toggle
            label="Omit this panel (opening)"
            checked={!!override.suppressed}
            onChange={(v) => {
              if (apply(ops.setPanelOverride(region.id, idx, { suppressed: v || undefined }), v ? 'Omit panel' : 'Restore panel') && v) {
                select({ kind: 'region', id: region.id });
              }
            }}
          />
        </Section>
      )}
    </>
  );
}

function PointProps({ region, pointId }: { region: SketchRegion; pointId: string }) {
  const apply = useStore((s) => s.apply);
  const select = useStore((s) => s.select);
  const p = region.sketch.points.find((q) => q.id === pointId);
  if (!p) return null;
  const fixed = region.sketch.constraints.find((c) => c.type === 'fixed' && c.point === p.id);
  return (
    <Section
      title="Point"
      actions={
        <button className="btn-icon danger" onClick={() => apply(ops.deletePoint(region.id, p.id), 'Delete point') && select(null)}>
          Delete
        </button>
      }
    >
      <NumberField label="X" unit="mm" value={p.x} onCommit={(v) => v !== null && apply(ops.movePoint(region.id, p.id, v, p.z), 'Move point')} />
      <NumberField label="Z" unit="mm" value={p.z} onCommit={(v) => v !== null && apply(ops.movePoint(region.id, p.id, p.x, v), 'Move point')} />
      <ReadOnly label="Y (wall plane)" value="0 mm" />
      {p.image && <ReadOnly label="Reference px" value={`${p.image.px}, ${p.image.py}`} />}
      <Toggle
        label="Fixed"
        checked={!!fixed}
        onChange={(v) =>
          apply(
            v ? ops.addConstraint(region.id, { id: createId('con'), type: 'fixed', point: p.id, x: p.x, z: p.z }) : ops.deleteConstraint(region.id, fixed!.id),
            v ? 'Fix point' : 'Unfix point',
          )
        }
      />
    </Section>
  );
}

function SegmentProps({ region, segId }: { region: SketchRegion; segId: string }) {
  const apply = useStore((s) => s.apply);
  const select = useStore((s) => s.select);
  const seg = region.sketch.segments.find((s) => s.id === segId);
  if (!seg) return null;
  const a = region.sketch.points.find((p) => p.id === seg.a)!;
  const b = region.sketch.points.find((p) => p.id === seg.b)!;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const cons = region.sketch.constraints.filter((c) => c.type !== 'fixed' && c.segment === seg.id);
  const has = (t: string) => cons.find((c) => c.type === t);
  const toggle = (type: 'horizontal' | 'vertical', on: boolean) => {
    const existing = has(type);
    apply(on ? ops.addConstraint(region.id, { id: createId('con'), type, segment: seg.id }) : ops.deleteConstraint(region.id, existing!.id), `${on ? 'Add' : 'Remove'} ${type} constraint`);
  };
  const dist = has('distance');
  return (
    <Section
      title="Line"
      actions={
        <button className="btn-icon danger" onClick={() => apply(ops.deleteSegment(region.id, seg.id), 'Delete line') && select(null)}>
          Delete
        </button>
      }
    >
      <NumberField
        label="Length"
        unit="mm"
        value={Math.round(len * 1000) / 1000}
        onCommit={(v) =>
          v !== null &&
          apply(
            ops.batch(
              ...(dist ? [ops.deleteConstraint(region.id, dist.id)] : []),
              ops.addConstraint(region.id, { id: createId('con'), type: 'distance', segment: seg.id, value: v }),
            ),
            'Set line length',
          )
        }
      />
      <Toggle label="Horizontal" checked={!!has('horizontal')} onChange={(v) => toggle('horizontal', v)} />
      <Toggle label="Vertical" checked={!!has('vertical')} onChange={(v) => toggle('vertical', v)} />
      {dist && <Toggle label={`Length locked (${formatMm((dist as { value: number }).value)} mm)`} checked onChange={() => apply(ops.deleteConstraint(region.id, dist.id), 'Unlock length')} />}
    </Section>
  );
}

function ExportSection() {
  return (
    <Section title="Export">
      <div className="export-grid">
        <button onClick={exportDxf} data-testid="export-dxf" title="Elevation, plan and section with dimensions, layer-separated (AutoCAD R12 DXF, mm)">
          DXF <small>drawings</small>
        </button>
        <button onClick={exportSvg} title="Vector drawing sheet at scale">
          SVG <small>sheet</small>
        </button>
        <button onClick={saveProject} title="Complete editable parametric project">
          JSON <small>project</small>
        </button>
        <button onClick={exportGlbFile} title="Visual mesh model (glTF binary). Not an editable CAD solid.">
          GLB <small>visual 3D</small>
        </button>
        <button disabled title="STEP needs a B-Rep kernel (OpenCascade), planned for the next phase. Meshes are never exported as STEP.">
          STEP <small>needs B-Rep</small>
        </button>
      </div>
    </Section>
  );
}

function Issues({ model }: { model: FacadeModel }) {
  const select = useStore((s) => s.select);
  if (model.issues.length === 0) return null;
  return (
    <Section title={`Validation (${model.issues.length})`}>
      <ul className="issues">
        {model.issues.map((i, k) => (
          <li key={k} className={i.severity} onClick={() => select({ kind: 'region', id: i.entityId })}>
            <b>{i.severity === 'error' ? 'Error' : 'Warning'}</b> {i.message}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function RightPanel() {
  const model = useModel();
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const apply = useStore((s) => s.apply);
  const select = useStore((s) => s.select);
  const materials = doc.project.materials;
  const facade = model.facade;
  const regionOf = (id: string) => facade.regions.find((r) => r.id === id);

  let body: React.ReactNode;
  if (selection?.kind === 'region' && regionOf(selection.id)) {
    const r = regionOf(selection.id)!;
    body = (
      <>
        <RegionCommon region={r} materials={materials} />
        {r.source === 'panelSystem' ? <PanelSystemProps region={r} model={model} /> : <SketchProps region={r} />}
      </>
    );
  } else if (selection?.kind === 'solid') {
    const solid = model.solids.find((s) => s.id === selection.id);
    const r = regionOf(selection.regionId);
    body = solid && r ? <SolidProps solid={solid} region={r} materials={materials} /> : null;
  } else if (selection?.kind === 'point' || selection?.kind === 'segment') {
    const r = regionOf(selection.regionId);
    body =
      r?.source === 'sketch' ? (
        <>
          {selection.kind === 'point' ? <PointProps region={r} pointId={selection.id} /> : <SegmentProps region={r} segId={selection.id} />}
          <RegionCommon region={r} materials={materials} />
        </>
      ) : null;
  } else {
    body = (
      <>
        <FacadeProps facade={facade} materials={materials} />
        <Section title="Add component system">
          <button
            className="btn-wide"
            onClick={() => {
              const region = createPanelSystemRegion(facade.id, { name: `Panel system ${facade.regions.length + 1}` });
              if (apply(ops.addRegion(facade.id, region), 'Add panel system')) select({ kind: 'region', id: region.id });
            }}
          >
            + Parametric panel system
          </button>
          <p className="hint">Or draw points, lines and rectangles on the façade with the tools on the left — closed contours become faces.</p>
        </Section>
      </>
    );
  }

  return (
    <aside className="panel right-panel" data-testid="right-panel">
      {body}
      <Issues model={model} />
      <ExportSection />
    </aside>
  );
}
