import { useEffect } from 'react';
import { findRegion } from '../core/model/query';
import * as ops from '../core/ops/operations';
import { useDrawings, useModel } from '../state/derived';
import { type Tool, type ViewPreset, useStore } from '../state/store';
import { Editor2D } from './editor2d/Editor2D';
import { CalibrationDialog } from './panels/CalibrationDialog';
import { LeftPanel } from './panels/LeftPanel';
import { RightPanel } from './panels/RightPanel';
import { Viewer3D } from './viewer3d/Viewer3D';

function Pipeline() {
  const model = useModel();
  const drawings = useDrawings();
  const sketches = model.facade.regions.flatMap((r) => (r.source === 'sketch' ? [r.sketch] : []));
  const points = sketches.reduce((n, s) => n + s.points.length, 0) + model.faces.reduce((n, f) => n + (f.boundarySegments.length ? 0 : f.polygon.length), 0);
  const lines = sketches.reduce((n, s) => n + s.segments.length, 0) + model.faces.reduce((n, f) => n + (f.boundarySegments.length ? 0 : f.polygon.length), 0);
  const steps = [
    { n: '01', label: 'Point', value: points },
    { n: '02', label: 'Line', value: lines },
    { n: '03', label: 'Plane', value: model.faces.length },
    { n: '04', label: 'Solid', value: model.solids.length + 1 },
    { n: '05', label: 'CAD output', value: drawings.length },
  ];
  return (
    <ol className="pipeline" data-testid="pipeline">
      {steps.map((s) => (
        <li key={s.n}>
          <span className="n">{s.n}</span>
          <span className="l">{s.label}</span>
          <span className="v">{s.value}</span>
        </li>
      ))}
    </ol>
  );
}

function Header() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const layout = useStore((s) => s.layout);
  const setLayout = useStore((s) => s.setLayout);
  const name = useStore((s) => s.doc.project.name);
  return (
    <header className="app-header">
      <div className="brand">
        <div>
          <b>KAD</b> Geometry Engine
        </div>
        <span>Parametric Reconstruction System</span>
      </div>
      <div className="project-name">{name}</div>
      <Pipeline />
      <div className="header-actions">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" data-testid="undo">
          ↶ Undo
        </button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" data-testid="redo">
          ↷ Redo
        </button>
        <div className="seg">
          {(['2d', 'split', '3d'] as const).map((l) => (
            <button key={l} className={layout === l ? 'active' : ''} onClick={() => setLayout(l)}>
              {l === 'split' ? '2D | 3D' : l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function ViewBar() {
  const setView = useStore((s) => s.setView);
  const views: Array<[ViewPreset, string]> = [
    ['iso', 'Isometric'],
    ['front', 'Front'],
    ['top', 'Top'],
    ['right', 'Side'],
  ];
  return (
    <div className="viewbar">
      <span className="title">Axonometric · orthographic</span>
      {views.map(([v, l]) => (
        <button key={v} onClick={() => setView(v)} data-testid={`view-${v}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

function StatusBar() {
  const lastAction = useStore((s) => s.lastAction);
  const revision = useStore((s) => s.doc.revision);
  const error = useStore((s) => s.error);
  const setError = useStore((s) => s.setError);
  const model = useModel();
  const errors = model.issues.filter((i) => i.severity === 'error').length;
  const warnings = model.issues.length - errors;
  return (
    <footer className="statusbar">
      <span>{lastAction}</span>
      <span className="muted">rev {revision}</span>
      <span className="muted">units mm · X width · Y depth · Z height</span>
      {model.issues.length > 0 && (
        <span className={errors ? 'err' : 'warn'}>
          {errors} error(s), {warnings} warning(s)
        </span>
      )}
      {error && (
        <span className="err" data-testid="error" onClick={() => setError(null)} title="Click to dismiss">
          ⚠ {error}
        </span>
      )}
    </footer>
  );
}

const TOOL_KEYS: Record<string, Tool> = { v: 'select', p: 'point', l: 'line', r: 'rect' };

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // only text entry blocks shortcuts; checkboxes, sliders and buttons do not
      const nonText = ['checkbox', 'radio', 'range', 'button'];
      const typing =
        t?.tagName === 'TEXTAREA' || t?.tagName === 'SELECT' || (t?.tagName === 'INPUT' && !nonText.includes((t as HTMLInputElement).type));
      if (typing) return;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod) return;
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool) s.setTool(tool);
      if (e.key === 'Escape') {
        s.setTool('select');
      }
      if (e.key === 'f' || e.key === 'F') window.dispatchEvent(new Event('kad:fit2d'));
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = s.selection;
        if (!sel) return;
        if (sel.kind === 'point') s.apply(ops.deletePoint(sel.regionId, sel.id), 'Delete point') && s.select(null);
        else if (sel.kind === 'segment') s.apply(ops.deleteSegment(sel.regionId, sel.id), 'Delete line') && s.select(null);
        else if (sel.kind === 'region') s.apply(ops.deleteRegion(sel.id), `Delete ${findRegion(s.doc, sel.id)?.region.name ?? 'region'}`) && s.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  useShortcuts();
  const layout = useStore((s) => s.layout);
  const calibrating = useStore((s) => s.calibrating);
  return (
    <div className="app">
      <Header />
      <LeftPanel />
      <main className={`workspace layout-${layout}`}>
        {layout !== '3d' && (
          <div className="pane">
            <div className="viewbar">
              <span className="title">Elevation editor · XZ plane</span>
              <button onClick={() => window.dispatchEvent(new Event('kad:fit2d'))}>Fit (F)</button>
            </div>
            <Editor2D />
          </div>
        )}
        {layout !== '2d' && (
          <div className="pane">
            <ViewBar />
            <Viewer3D />
          </div>
        )}
      </main>
      <RightPanel />
      <StatusBar />
      {calibrating && <CalibrationDialog />}
    </div>
  );
}
