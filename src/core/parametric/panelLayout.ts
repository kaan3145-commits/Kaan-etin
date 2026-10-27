import { round6 } from '../geometry/vec';
import type { Mm, PanelLayoutParams } from '../model/types';

export interface PanelRect {
  index: number;
  /** Façade-local left edge. */
  x: Mm;
  /** Façade-local bottom edge. */
  z: Mm;
  width: Mm;
  height: Mm;
}

export interface LayoutIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface PanelLayoutResult {
  panels: PanelRect[];
  panelWidth: Mm;
  panelHeight: Mm;
  /** Distance from façade left edge to first panel. */
  marginStart: Mm;
  /** Distance from last panel to façade right edge. */
  marginEnd: Mm;
  /** Overall width of the panel run including gaps. */
  runWidth: Mm;
  issues: LayoutIssue[];
}

/**
 * Lays out an equal-width panel run on a façade of the given size.
 *
 *   runWidth = count · panelWidth + (count − 1) · gap
 *
 * Every value is derived purely from the inputs, so a change of façade width
 * re-derives the positions of all dependent panels.
 */
export function computePanelLayout(
  facadeWidth: Mm,
  facadeHeight: Mm,
  p: PanelLayoutParams,
): PanelLayoutResult {
  const issues: LayoutIssue[] = [];
  const count = Math.floor(p.count);
  const empty = (): PanelLayoutResult => ({
    panels: [],
    panelWidth: 0,
    panelHeight: 0,
    marginStart: 0,
    marginEnd: 0,
    runWidth: 0,
    issues,
  });

  if (!(facadeWidth > 0) || !(facadeHeight > 0)) {
    issues.push({ severity: 'error', code: 'facade-size', message: 'Façade width and height must be positive.' });
    return empty();
  }
  if (!(count >= 1)) {
    issues.push({ severity: 'error', code: 'count', message: 'Panel count must be at least 1.' });
    return empty();
  }
  if (p.gap < 0) {
    issues.push({ severity: 'error', code: 'gap', message: 'Gap cannot be negative.' });
    return empty();
  }
  if (p.sideMargin < 0) {
    issues.push({ severity: 'error', code: 'margin', message: 'Side margin cannot be negative.' });
    return empty();
  }

  const gaps = (count - 1) * p.gap;
  let width: number;
  let start: number;

  if (p.distribution === 'fillWidth') {
    width = (facadeWidth - 2 * p.sideMargin - gaps) / count;
    start = p.sideMargin;
    if (!(width > 0)) {
      issues.push({
        severity: 'error',
        code: 'no-space',
        message: `No space for ${count} panels: margins and gaps exceed the façade width.`,
      });
      return empty();
    }
  } else {
    width = p.panelWidth;
    if (!(width > 0)) {
      issues.push({ severity: 'error', code: 'panel-width', message: 'Panel width must be positive.' });
      return empty();
    }
    const run = count * width + gaps;
    start =
      p.alignment === 'center'
        ? (facadeWidth - run) / 2
        : p.alignment === 'start'
          ? p.sideMargin
          : facadeWidth - p.sideMargin - run;
    if (run > facadeWidth + 1e-9) {
      issues.push({
        severity: 'error',
        code: 'overflow',
        message: `Panel run ${round6(run)} mm exceeds façade width ${facadeWidth} mm.`,
      });
    } else if (start < -1e-9 || start + run > facadeWidth + 1e-9) {
      issues.push({
        severity: 'error',
        code: 'outside',
        message: 'Panel run extends beyond the façade with the given alignment and margin.',
      });
    }
  }

  const height = p.panelHeight ?? facadeHeight - p.bottomOffset - p.topOffset;
  const z = p.bottomOffset;
  if (!(height > 0)) {
    issues.push({ severity: 'error', code: 'panel-height', message: 'Panel height must be positive.' });
    return empty();
  }
  if (z < 0 || z + height > facadeHeight + 1e-9) {
    issues.push({ severity: 'error', code: 'vertical-overflow', message: 'Panels extend beyond the façade height.' });
  }

  const panels: PanelRect[] = [];
  for (let i = 0; i < count; i++) {
    panels.push({
      index: i,
      x: round6(start + i * (width + p.gap)),
      z: round6(z),
      width: round6(width),
      height: round6(height),
    });
  }
  const runWidth = round6(count * width + gaps);
  return {
    panels,
    panelWidth: round6(width),
    panelHeight: round6(height),
    marginStart: round6(start),
    marginEnd: round6(facadeWidth - start - count * width - gaps),
    runWidth,
    issues,
  };
}
