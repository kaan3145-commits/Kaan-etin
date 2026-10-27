import { useState } from 'react';
import { fullImageCorners } from '../../core/calibration/homography';
import { createDocument } from '../../core/model/factory';
import type { Region } from '../../core/model/types';
import * as ops from '../../core/ops/operations';
import { createWallPanelingExample } from '../../core/examples/wallPaneling';
import { useModel } from '../../state/derived';
import { type Selection, type Tool, useStore } from '../../state/store';
import { openProjectFile, saveProject } from './exporters';
import { Section, Toggle } from './fields';

const TOOLS: Array<{ id: Tool; label: string; key: string; hint: string }> = [
  { id: 'select', label: 'Select', key: 'V', hint: 'Select and drag points; drag empty space to pan' },
  { id: 'point', label: 'Point', key: 'P', hint: 'Place reference points' },
  { id: 'line', label: 'Line', key: 'L', hint: 'Connect points into lines and closed contours' },
  { id: 'rect', label: 'Rectangle', key: 'R', hint: 'Rectangular contour with H/V constraints' },
];

function ReferencePanel() {
  const model = useModel();
  const apply = useStore((s) => s.apply);
  const setCalibrating = useStore((s) => s.setCalibrating);
  const beginLive = useStore((s) => s.beginLive);
  const applyLive = useStore((s) => s.applyLive);
  const facade = model.facade;
  const ref = facade.reference;

  const upload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        const img = new Image();
        img.onload = () => {
          const ok = apply(
            ops.setReference(facade.id, {
              dataUrl,
              pixelWidth: img.naturalWidth,
              pixelHeight: img.naturalHeight,
              corners: fullImageCorners(img.naturalWidth, img.naturalHeight),
              opacity: 0.6,
              visible: true,
            }),
            'Place reference image',
          );
          if (ok) setCalibrating(true);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <Section title="Reference image">
      {ref ? (
        <>
          <img className="ref-thumb" src={ref.dataUrl} alt="Reference" />
          <div className="row">
            <button onClick={() => setCalibrating(true)}>Calibrate corners</button>
            <button onClick={() => apply(ops.setReference(facade.id, null), 'Remove reference image')}>Remove</button>
          </div>
          <Toggle label="Show on façade" checked={ref.visible} onChange={(v) => apply(ops.setReferenceProps(facade.id, { visible: v }), 'Toggle reference')} />
          <label className="field">
            <span className="field-label">Opacity</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={ref.opacity}
              onPointerDown={() => beginLive('Reference opacity')}
              onChange={(e) => applyLive(ops.setReferenceProps(facade.id, { opacity: Number(e.target.value) }))}
            />
          </label>
          <p className="hint">
            {ref.pixelWidth} × {ref.pixelHeight} px, mapped onto {facade.width} × {facade.height} mm (4-point perspective correction).
          </p>
        </>
      ) : (
        <>
          <button className="btn-wide" onClick={upload}>
            Place reference image…
          </button>
          <p className="hint">Optional. The image is a tracing aid only; dimensions always come from the entered façade size.</p>
        </>
      )}
    </Section>
  );
}

function ToolsPanel() {
  const activeRegionId = useStore((s) => s.activeRegionId);
  const setActiveRegion = useStore((s) => s.setActiveRegion);
  const activeName = useModel().facade.regions.find((r) => r.id === activeRegionId)?.name;
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const snaps = useStore((s) => s.snaps);
  const setSnaps = useStore((s) => s.setSnaps);
  const showDimensions = useStore((s) => s.showDimensions);
  const setShowDimensions = useStore((s) => s.setShowDimensions);
  return (
    <Section title="Geometry tools">
      <div className="tool-grid">
        {TOOLS.map((t) => (
          <button key={t.id} data-testid={`tool-${t.id}`} className={tool === t.id ? 'active' : ''} title={`${t.hint} (${t.key})`} onClick={() => setTool(t.id)}>
            {t.label}
            <kbd>{t.key}</kbd>
          </button>
        ))}
      </div>
      <div className="active-sketch">
        <span>
          Drawing into: <b>{activeName ?? 'new sketch region'}</b>
        </span>
        {activeName && (
          <button className="btn-link" title="The next contour starts a new sketch region" onClick={() => setActiveRegion(null)}>
            + New region
          </button>
        )}
      </div>
      <div className="snaps">
        <Toggle label="Grid snap" checked={snaps.grid} onChange={(v) => setSnaps({ grid: v })} />
        <Toggle label="Endpoint snap" checked={snaps.endpoint} onChange={(v) => setSnaps({ endpoint: v })} />
        <Toggle label="Axis alignment" checked={snaps.axis} onChange={(v) => setSnaps({ axis: v })} />
        <Toggle label="Dimensions" checked={showDimensions} onChange={setShowDimensions} />
      </div>
    </Section>
  );
}

function TreeItem(p: { label: string; meta?: string; sel: Selection; depth: number; onClick?: () => void; active?: boolean }) {
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const isSel = !!p.sel && !!selection && selection.kind === p.sel.kind && selection.id === p.sel.id;
  return (
    <li
      className={`tree-item${isSel ? ' selected' : ''}${p.active ? ' active' : ''}`}
      style={{ paddingLeft: 8 + p.depth * 12 }}
      onClick={() => (p.onClick ? p.onClick() : select(p.sel))}
    >
      <span>{p.label}</span>
      {p.meta && <span className="meta">{p.meta}</span>}
    </li>
  );
}

function HierarchyPanel() {
  const doc = useStore((s) => s.doc);
  const activeRegionId = useStore((s) => s.activeRegionId);
  const select = useStore((s) => s.select);
  const setActiveRegion = useStore((s) => s.setActiveRegion);
  const model = useModel();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const regionMeta = (r: Region) => {
    const n = model.solids.filter((s) => s.regionId === r.id).length;
    return `${r.semantic} · ${n} solid${n === 1 ? '' : 's'}${r.visible ? '' : ' · hidden'}`;
  };

  return (
    <Section title="Geometry hierarchy">
      <ul className="tree" data-testid="hierarchy">
        <TreeItem label={doc.project.name} meta="project" sel={null} depth={0} />
        {doc.project.spaces.map((space) => (
          <div key={space.id}>
            <TreeItem label={space.name} meta="space" sel={null} depth={1} />
            {space.facades.map((f) => (
              <div key={f.id}>
                <TreeItem label={f.name} meta={`${f.width} × ${f.height}`} sel={{ kind: 'facade', id: f.id }} depth={2} />
                {f.regions.map((r) => (
                  <div key={r.id}>
                    <TreeItem
                      label={`${open[r.id] ? '▾' : '▸'} ${r.name}`}
                      meta={regionMeta(r)}
                      sel={{ kind: 'region', id: r.id }}
                      depth={3}
                      active={r.id === activeRegionId}
                      onClick={() => {
                        select({ kind: 'region', id: r.id });
                        if (r.source === 'sketch') setActiveRegion(r.id);
                        setOpen((o) => ({ ...o, [r.id]: !o[r.id] }));
                      }}
                    />
                    {open[r.id] &&
                      model.solids
                        .filter((s) => s.regionId === r.id)
                        .map((s) => (
                          <TreeItem
                            key={s.id}
                            label={s.panelIndex !== undefined ? `Panel ${s.panelIndex + 1}` : `Solid ${s.faceId.split('/').pop()}${s.instance ? ` #${s.instance + 1}` : ''}`}
                            meta={`${Math.round(s.bbox.max.x - s.bbox.min.x)} × ${Math.round(s.bbox.max.z - s.bbox.min.z)} × ${Math.round(s.thickness)}`}
                            sel={{ kind: 'solid', id: s.id, regionId: r.id }}
                            depth={4}
                          />
                        ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </ul>
    </Section>
  );
}

function ProjectPanel() {
  const load = useStore((s) => s.load);
  return (
    <Section title="Project">
      <div className="row wrap">
        <button onClick={() => load(createDocument({ name: 'New project' }))}>New</button>
        <button onClick={openProjectFile}>Open…</button>
        <button onClick={saveProject}>Save</button>
        <button onClick={() => load(createWallPanelingExample())} data-testid="load-example">
          Example
        </button>
      </div>
    </Section>
  );
}

export function LeftPanel() {
  return (
    <aside className="panel left-panel">
      <ProjectPanel />
      <ReferencePanel />
      <ToolsPanel />
      <HierarchyPanel />
    </aside>
  );
}
