import { createDocument, createPanelSystemRegion } from '../model/factory';
import { firstFacade } from '../model/query';
import type { Id, KadDocument, Mm, PanelLayoutParams, SemanticType } from '../model/types';
import { addRegion, applyOp } from '../ops/operations';

/**
 * Structured request for applying a panel system to a measured façade.
 * This is the target a future natural-language / Product-DNA layer will fill in, e.g.
 *   "Apply the reference lambri system to this 4200 × 2800 mm façade, distribute
 *    the panels evenly, 18 mm thick, and prepare the dimensioned DXF."
 */
export interface PanelingRequest {
  projectName?: string;
  facadeWidth: Mm;
  facadeHeight: Mm;
  count: number;
  panelWidth?: Mm;
  gap: Mm;
  thickness: Mm;
  standoff?: Mm;
  distribution?: PanelLayoutParams['distribution'];
  alignment?: PanelLayoutParams['alignment'];
  sideMargin?: Mm;
  material?: Id;
  semantic?: SemanticType;
}

export function createPanelingProject(req: PanelingRequest): KadDocument {
  const doc = createDocument({
    name: req.projectName ?? 'Wall paneling',
    facade: { width: req.facadeWidth, height: req.facadeHeight, name: 'Façade A' },
  });
  const facade = firstFacade(doc);
  const region = createPanelSystemRegion(facade.id, {
    name: 'Wall panels',
    semantic: req.semantic ?? 'panel',
    material: req.material ?? 'mat_oak',
    thickness: req.thickness,
    standoff: req.standoff ?? 0,
    layout: {
      count: req.count,
      panelWidth: req.panelWidth ?? 0,
      gap: req.gap,
      distribution: req.distribution ?? (req.panelWidth ? 'fixedWidth' : 'fillWidth'),
      alignment: req.alignment ?? 'center',
      sideMargin: req.sideMargin ?? 0,
    },
  });
  return { ...applyOp(doc, addRegion(facade.id, region)), revision: 0 };
}

/** First milestone demonstration: 4200 × 2800 mm wall, 5 × 800 mm panels, 10 mm gaps, 18 mm thick, centred. */
export function createWallPanelingExample(): KadDocument {
  return createPanelingProject({
    projectName: 'Wall paneling — milestone 1',
    facadeWidth: 4200,
    facadeHeight: 2800,
    count: 5,
    panelWidth: 800,
    gap: 10,
    thickness: 18,
    alignment: 'center',
  });
}
