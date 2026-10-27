import { create } from 'zustand';
import { createWallPanelingExample } from '../core/examples/wallPaneling';
import { parseDocument, serializeDocument } from '../core/export/json';
import { firstFacade } from '../core/model/query';
import type { Id, KadDocument } from '../core/model/types';
import { applyOp, type Op } from '../core/ops/operations';
import type { SnapSettings } from '../core/sketch/snap';

export type Tool = 'select' | 'point' | 'line' | 'rect';

export type Selection =
  | { kind: 'facade'; id: Id }
  | { kind: 'region'; id: Id }
  | { kind: 'solid'; id: string; regionId: Id }
  | { kind: 'point'; id: Id; regionId: Id }
  | { kind: 'segment'; id: Id; regionId: Id }
  | null;

export type ViewPreset = 'iso' | 'front' | 'top' | 'right';

interface HistoryEntry {
  doc: KadDocument;
  label: string;
}

interface State {
  doc: KadDocument;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Label of the last committed operation, for the status bar. */
  lastAction: string;
  selection: Selection;
  hover: string | null;
  tool: Tool;
  /** Sketch region receiving new points/lines. */
  activeRegionId: Id | null;
  activeFacadeId: Id;
  error: string | null;
  viewPreset: { preset: ViewPreset; nonce: number };
  layout: 'split' | '2d' | '3d';
  snaps: SnapSettings;
  showDimensions: boolean;
  calibrating: boolean;

  /** Applies an operation as one undoable step. Returns false (and sets `error`) when it is rejected. */
  apply: (op: Op, label: string) => boolean;
  /** Starts an interactive edit (drag): records one undo step, subsequent `applyLive` calls are not recorded. */
  beginLive: (label: string) => void;
  applyLive: (op: Op) => void;
  undo: () => void;
  redo: () => void;
  load: (doc: KadDocument) => void;
  loadText: (text: string) => boolean;
  serialize: () => string;
  select: (s: Selection) => void;
  setHover: (id: string | null) => void;
  setTool: (t: Tool) => void;
  setActiveRegion: (id: Id | null) => void;
  setError: (e: string | null) => void;
  setView: (p: ViewPreset) => void;
  setLayout: (l: 'split' | '2d' | '3d') => void;
  setSnaps: (s: Partial<SnapSettings>) => void;
  setShowDimensions: (v: boolean) => void;
  setCalibrating: (v: boolean) => void;
}

const HISTORY_LIMIT = 200;
const AUTOSAVE_KEY = 'kad-geometry-engine:autosave';

function initialDoc(): KadDocument {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) return parseDocument(saved);
  } catch {
    /* no storage or corrupt autosave: fall back to the example */
  }
  return createWallPanelingExample();
}

const startDoc = initialDoc();

export const useStore = create<State>((set, get) => ({
  doc: startDoc,
  past: [],
  future: [],
  lastAction: 'Opened project',
  selection: null,
  hover: null,
  tool: 'select',
  activeRegionId: null,
  activeFacadeId: firstFacade(startDoc).id,
  error: null,
  viewPreset: { preset: 'iso', nonce: 0 },
  layout: 'split',
  snaps: { grid: true, endpoint: true, axis: true },
  showDimensions: true,
  calibrating: false,

  apply(op, label) {
    const { doc, past } = get();
    try {
      const next = applyOp(doc, op);
      set({ doc: next, past: [...past, { doc, label }].slice(-HISTORY_LIMIT), future: [], lastAction: label, error: null });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },

  beginLive(label) {
    const { doc, past } = get();
    set({ past: [...past, { doc, label }].slice(-HISTORY_LIMIT), future: [], lastAction: label });
  },

  applyLive(op) {
    try {
      set({ doc: applyOp(get().doc, op), error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  undo() {
    const { past, future, doc } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    set({
      doc: prev.doc,
      past: past.slice(0, -1),
      future: [{ doc, label: prev.label }, ...future],
      lastAction: `Undo: ${prev.label}`,
      selection: validSelection(prev.doc, get().selection),
    });
  },

  redo() {
    const { past, future, doc } = get();
    const next = future[0];
    if (!next) return;
    set({
      doc: next.doc,
      past: [...past, { doc, label: next.label }],
      future: future.slice(1),
      lastAction: `Redo: ${next.label}`,
      selection: validSelection(next.doc, get().selection),
    });
  },

  load(doc) {
    set({
      doc,
      past: [],
      future: [],
      selection: null,
      activeRegionId: null,
      activeFacadeId: firstFacade(doc).id,
      lastAction: `Opened ${doc.project.name}`,
      error: null,
    });
  },

  loadText(text) {
    try {
      get().load(parseDocument(text));
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  },

  serialize() {
    return serializeDocument({ ...get().doc, modifiedAt: new Date().toISOString() });
  },

  select: (selection) => set({ selection }),
  setHover: (hover) => set({ hover }),
  setTool: (tool) => set({ tool }),
  setActiveRegion: (activeRegionId) => set({ activeRegionId }),
  setError: (error) => set({ error }),
  setView: (preset) => set((s) => ({ viewPreset: { preset, nonce: s.viewPreset.nonce + 1 } })),
  setLayout: (layout) => set({ layout }),
  setSnaps: (p) => set((s) => ({ snaps: { ...s.snaps, ...p } })),
  setShowDimensions: (showDimensions) => set({ showDimensions }),
  setCalibrating: (calibrating) => set({ calibrating }),
}));

/** Drops a selection that no longer exists in the given document. */
function validSelection(doc: KadDocument, sel: Selection): Selection {
  if (!sel) return null;
  const facades = doc.project.spaces.flatMap((s) => s.facades);
  if (sel.kind === 'facade') return facades.some((f) => f.id === sel.id) ? sel : null;
  const regions = facades.flatMap((f) => f.regions);
  if (sel.kind === 'region') return regions.some((r) => r.id === sel.id) ? sel : null;
  const region = regions.find((r) => r.id === sel.regionId);
  if (!region) return null;
  if (sel.kind === 'point') return region.source === 'sketch' && region.sketch.points.some((p) => p.id === sel.id) ? sel : null;
  if (sel.kind === 'segment') return region.source === 'sketch' && region.sketch.segments.some((p) => p.id === sel.id) ? sel : null;
  return sel;
}

// Autosave (best effort; the explicit Save button writes a .kad.json file)
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.doc === prev.doc) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, serializeDocument(s.doc));
    } catch {
      /* storage unavailable or full */
    }
  }, 400);
});
