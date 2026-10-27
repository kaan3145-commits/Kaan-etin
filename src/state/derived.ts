import { useMemo } from 'react';
import { buildDrawings } from '../core/drawing/projection';
import type { Drawing } from '../core/drawing/types';
import { findFacade, firstFacade } from '../core/model/query';
import type { KadDocument } from '../core/model/types';
import { type FacadeModel, regenerateFacade } from '../core/parametric/regenerate';
import { useStore } from './store';

// Regeneration is pure, so results are cached per (document, façade) identity.
const modelCache = new WeakMap<KadDocument, Map<string, FacadeModel>>();
const drawingCache = new WeakMap<FacadeModel, Drawing[]>();

export function getModel(doc: KadDocument, facadeId: string): FacadeModel {
  let byFacade = modelCache.get(doc);
  if (!byFacade) {
    byFacade = new Map();
    modelCache.set(doc, byFacade);
  }
  let m = byFacade.get(facadeId);
  if (!m) {
    m = regenerateFacade(doc, findFacade(doc, facadeId) ?? firstFacade(doc));
    byFacade.set(facadeId, m);
  }
  return m;
}

export function getDrawings(m: FacadeModel): Drawing[] {
  let d = drawingCache.get(m);
  if (!d) {
    d = buildDrawings(m);
    drawingCache.set(m, d);
  }
  return d;
}

export function useModel(): FacadeModel {
  const doc = useStore((s) => s.doc);
  const facadeId = useStore((s) => s.activeFacadeId);
  return useMemo(() => getModel(doc, facadeId), [doc, facadeId]);
}

export function useDrawings(): Drawing[] {
  const m = useModel();
  return useMemo(() => getDrawings(m), [m]);
}
