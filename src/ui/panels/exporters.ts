import { layoutSheet } from '../../core/drawing/projection';
import { sheetToDxf } from '../../core/export/dxf';
import { sheetToSvg } from '../../core/export/svg';
import { exportGlb } from '../../render/glb';
import { getDrawings, getModel } from '../../state/derived';
import { useStore } from '../../state/store';
import { downloadBlob, safeFilename } from '../util/download';

function current() {
  const { doc, activeFacadeId } = useStore.getState();
  const model = getModel(doc, activeFacadeId);
  return { doc, model, drawings: getDrawings(model), base: safeFilename(doc.project.name) };
}

export function exportDxf() {
  const { drawings, base } = current();
  downloadBlob(sheetToDxf(layoutSheet(drawings)), `${base}.dxf`, 'application/dxf');
}

export function exportSvg() {
  const { drawings, base } = current();
  downloadBlob(sheetToSvg(layoutSheet(drawings)), `${base}.svg`, 'image/svg+xml');
}

export function saveProject() {
  const { base } = current();
  downloadBlob(useStore.getState().serialize(), `${base}.kad.json`, 'application/json');
}

export async function exportGlbFile() {
  const { model, base } = current();
  try {
    const buf = await exportGlb(model);
    downloadBlob(buf, `${base}.glb`, 'model/gltf-binary');
  } catch (e) {
    useStore.getState().setError(`GLB export failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function openProjectFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.kad.json,application/json';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (f) useStore.getState().loadText(await f.text());
  };
  input.click();
}
