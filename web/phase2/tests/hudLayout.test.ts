import { describe, expect, it } from 'vitest';
import {
  computeDesktopDockLayout,
  computeSmartMobileLayout,
  getRotateHandlePos,
  isWidgetRotatable,
} from '@input/hudPresets';
import {
  createDefaultPCConfig,
  createMobileHUDPreset,
  type MobilePresetId,
  type MobileWidgetId,
} from '@storage/profiles';

describe('Dual-Mode Smart Mobile HUD & PC Dock Layout Solver', () => {
  const viewports = [
    { name: 'iPhone SE landscape', vw: 667, vh: 375 },
    { name: 'iPhone 14 landscape', vw: 844, vh: 390 },
    { name: 'Android 20:9 landscape', vw: 915, vh: 412 },
    { name: 'iPad landscape', vw: 1024, vh: 768 },
  ];
  const presets: MobilePresetId[] = ['4-finger', '3-finger', '2-finger'];

  it('keeps all mobile widgets inside safe viewport bounds across 4 devices, 3 presets, and 5..10 hexes', () => {
    for (const vp of viewports) {
      for (const preset of presets) {
        const cfg = createMobileHUDPreset(preset);
        for (const hexCount of [5, 7, 10]) {
          const layout = computeSmartMobileLayout(vp.vw, vp.vh, hexCount, cfg, {
            top: 0,
            right: 20,
            bottom: 12,
            left: 20,
          });

          expect(layout.arc.hexCount).toBe(hexCount);
          // Every widget center must sit strictly inside viewport
          const widgetKeys = Object.keys(layout.widgetBounds) as MobileWidgetId[];
          for (const k of widgetKeys) {
            const b = layout.widgetBounds[k];
            const cx = b.x + b.w * 0.5;
            const cy = b.y + b.h * 0.5;
            expect(cx).toBeGreaterThan(0);
            expect(cx).toBeLessThan(vp.vw);
            expect(cy).toBeGreaterThan(0);
            expect(cy).toBeLessThan(vp.vh);
          }

          // 2-finger preset places Rotation & Scale lower (closer to thumbs) than 4-finger Claw
          if (preset === '2-finger') {
            const claw = computeSmartMobileLayout(vp.vw, vp.vh, hexCount, createMobileHUDPreset('4-finger'));
            expect(layout.rotGroupRect.y).toBeGreaterThan(claw.rotGroupRect.y);
            expect(layout.scaleGroupRect.y).toBeGreaterThan(claw.scaleGroupRect.y);
          }
        }
      }
    }
  });

  it('expands mobile Arc-Selector sweep angle smoothly when scaling up to 10 hexes', () => {
    const cfg = createMobileHUDPreset('4-finger');
    const arc7 = computeSmartMobileLayout(844, 390, 7, cfg).arc;
    const arc10 = computeSmartMobileLayout(844, 390, 10, cfg).arc;
    expect(arc10.endAng - arc10.startAng).toBeGreaterThan(arc7.endAng - arc7.startAng);
  });

  it('fits Desktop PC Dock cleanly inside narrow & wide screens even with 10 hexes in Loose mode', () => {
    const pcCfg = createDefaultPCConfig();
    for (const vw of [960, 1280, 1920]) {
      const dock = computeDesktopDockLayout(vw, 720, 10, true, pcCfg);
      expect(dock.hexSlots).toHaveLength(10);
      expect(dock.barRect.x).toBeGreaterThanOrEqual(8);
      expect(dock.barRect.x + dock.barRect.w).toBeLessThanOrEqual(vw - 8);
    }
  });

  it('rotates mobile button clusters (90° horiz/vert) and Arc-Selector cleanly inside viewport bounds', () => {
    const cfg = createMobileHUDPreset('4-finger');
    const baseLayout = computeSmartMobileLayout(844, 390, 7, cfg);
    expect(baseLayout.scaleGroupRect.w).toBeGreaterThan(baseLayout.scaleGroupRect.h);
    expect(baseLayout.btnAll.y).toBeLessThan(baseLayout.btnRecall.y);

    cfg.widgets.scaleCluster.rotation = 90;
    cfg.widgets.recall.rotation = 90;
    cfg.widgets.atk.rotation = 45;
    cfg.widgets.form.rotation = 90;

    const rotLayout = computeSmartMobileLayout(844, 390, 7, cfg);
    // 90° flips horizontal Scale cluster into vertical column, and stacked Recall into side-by-side row
    expect(rotLayout.scaleGroupRect.h).toBeGreaterThan(rotLayout.scaleGroupRect.w);
    expect(rotLayout.btnAll.y).toBeCloseTo(rotLayout.btnRecall.y, 4);
    expect(rotLayout.btnAll.x).toBeLessThan(rotLayout.btnRecall.x);
    expect(rotLayout.recallGroupRect.w).toBeGreaterThan(baseLayout.recallGroupRect.w);
    // Atk Arc-Selector rotates by +45° (PI / 4) and Form radial rotates by +90° (PI / 2)
    expect(rotLayout.arc.startAng - baseLayout.arc.startAng).toBeCloseTo(Math.PI / 4, 5);
    expect(rotLayout.formRotRad).toBeCloseTo(Math.PI / 2, 5);

    // Rotate handle stays strictly inside viewport for every rotatable widget
    for (const wid of ['atk', 'form', 'recall', 'fireTabs', 'rotCluster', 'scaleCluster'] as MobileWidgetId[]) {
      expect(isWidgetRotatable(wid)).toBe(true);
      const rh = getRotateHandlePos(rotLayout, wid);
      expect(rh).not.toBeNull();
      expect(rh!.cx - rh!.r).toBeGreaterThanOrEqual(0);
      expect(rh!.cx + rh!.r).toBeLessThanOrEqual(844);
      expect(rh!.cy - rh!.r).toBeGreaterThanOrEqual(0);
      expect(rh!.cy + rh!.r).toBeLessThanOrEqual(390);
    }
  });
});
