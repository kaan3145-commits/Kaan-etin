import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT } from '../model/factory';
import { computePanelLayout } from './panelLayout';

describe('computePanelLayout', () => {
  it('centres 5 × 800 mm panels with 10 mm gaps on a 4200 mm wall (80 mm margins)', () => {
    const r = computePanelLayout(4200, 2800, { ...DEFAULT_LAYOUT, count: 5, panelWidth: 800, gap: 10 });
    expect(r.issues).toEqual([]);
    expect(r.runWidth).toBe(4040);
    expect(r.marginStart).toBe(80);
    expect(r.marginEnd).toBe(80);
    expect(r.panels.map((p) => p.x)).toEqual([80, 890, 1700, 2510, 3320]);
    expect(r.panels.every((p) => p.width === 800 && p.height === 2800 && p.z === 0)).toBe(true);
  });

  it('re-derives positions when the wall width changes', () => {
    const r = computePanelLayout(5000, 2800, { ...DEFAULT_LAYOUT });
    expect(r.marginStart).toBe(480);
    expect(r.marginEnd).toBe(480);
    expect(r.panels[0].x).toBe(480);
  });

  it('start / end alignment respect the side margin', () => {
    const s = computePanelLayout(4200, 2800, { ...DEFAULT_LAYOUT, alignment: 'start', sideMargin: 50 });
    expect(s.marginStart).toBe(50);
    expect(s.marginEnd).toBe(110);
    const e = computePanelLayout(4200, 2800, { ...DEFAULT_LAYOUT, alignment: 'end', sideMargin: 50 });
    expect(e.marginEnd).toBe(50);
    expect(e.marginStart).toBe(110);
  });

  it('fillWidth derives the panel width from margins and gaps', () => {
    const r = computePanelLayout(4200, 2800, { ...DEFAULT_LAYOUT, distribution: 'fillWidth', sideMargin: 100, gap: 10, count: 4 });
    // (4200 − 200 − 30) / 4 = 992.5
    expect(r.panelWidth).toBe(992.5);
    expect(r.marginStart).toBe(100);
    expect(r.marginEnd).toBe(100);
  });

  it('reports overflow instead of silently clipping', () => {
    const r = computePanelLayout(3000, 2800, { ...DEFAULT_LAYOUT });
    expect(r.issues.map((i) => i.code)).toContain('overflow');
  });

  it('handles vertical offsets and explicit height', () => {
    const r = computePanelLayout(4200, 2800, { ...DEFAULT_LAYOUT, bottomOffset: 100, topOffset: 200 });
    expect(r.panelHeight).toBe(2500);
    expect(r.panels[0].z).toBe(100);
    const h = computePanelLayout(4200, 2800, { ...DEFAULT_LAYOUT, bottomOffset: 900, panelHeight: 2500 });
    expect(h.issues.map((i) => i.code)).toContain('vertical-overflow');
  });

  it('rejects invalid parameters', () => {
    expect(computePanelLayout(4200, 2800, { ...DEFAULT_LAYOUT, count: 0 }).issues[0].code).toBe('count');
    expect(computePanelLayout(4200, 2800, { ...DEFAULT_LAYOUT, gap: -1 }).issues[0].code).toBe('gap');
    expect(computePanelLayout(0, 2800, DEFAULT_LAYOUT).issues[0].code).toBe('facade-size');
  });
});
