/**
 * Writes the milestone-1 sample project and its derived drawings to examples/.
 *   npm run example
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  buildDrawings,
  createWallPanelingExample,
  firstFacade,
  layoutSheet,
  regenerateFacade,
  serializeDocument,
  sheetToDxf,
  sheetToSvg,
} from '../src/core';

const doc = createWallPanelingExample();
// fixed timestamps keep the committed example reproducible
doc.createdAt = doc.modifiedAt = '2026-01-01T00:00:00.000Z';
const model = regenerateFacade(doc, firstFacade(doc));
const sheet = layoutSheet(buildDrawings(model));

mkdirSync('examples', { recursive: true });
writeFileSync('examples/wall-paneling.kad.json', serializeDocument(doc));
writeFileSync('examples/wall-paneling.dxf', sheetToDxf(sheet));
writeFileSync('examples/wall-paneling.svg', sheetToSvg(sheet));

const layout = Object.values(model.layouts)[0];
console.log(`Panels: ${model.solids.length}, margins ${layout.marginStart} / ${layout.marginEnd} mm, run ${layout.runWidth} mm`);
console.log('Wrote examples/wall-paneling.{kad.json,dxf,svg}');
