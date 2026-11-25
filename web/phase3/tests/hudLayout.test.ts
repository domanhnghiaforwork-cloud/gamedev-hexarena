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
  MOBILE_HUD_VERSION,
  sanitizeMobileHUDConfig,
  type MobilePresetId,
  type MobileWidgetId,
} from '@storage/profiles';

function rectGap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return -Math.min(ox, oy);
}

describe('Dual-Mode Smart Mobile HUD & PC Dock Layout Solver', () => {
  const viewports = [
    { name: 'Small Android landscape', vw: 568, vh: 320, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
    { name: 'iPhone SE landscape', vw: 667, vh: 375, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
    { name: 'iPhone 14 Notch landscape', vw: 844, vh: 390, insets: { top: 0, right: 44, bottom: 21, left: 44 } },
    { name: 'iPhone 16 Pro Max Dynamic Island', vw: 932, vh: 430, insets: { top: 0, right: 52, bottom: 21, left: 52 } },
    { name: 'Android 20:9 landscape', vw: 915, vh: 412, insets: { top: 0, right: 24, bottom: 12, left: 24 } },
    { name: 'iPad Mini landscape', vw: 1024, vh: 768, insets: { top: 0, right: 0, bottom: 20, left: 0 } },
    { name: 'iPad Pro landscape', vw: 1366, vh: 1024, insets: { top: 0, right: 0, bottom: 20, left: 0 } },
  ];
  const presets: MobilePresetId[] = ['4-finger', '3-finger', '2-finger'];

  it('keeps all mobile widgets inside safe bounds with ZERO overlap and >= 8px clearance across 7 real devices', () => {
    for (const vp of viewports) {
      for (const preset of presets) {
        const cfg = createMobileHUDPreset(preset);
        for (const hexCount of [5, 7, 10]) {
          const layout = computeSmartMobileLayout(vp.vw, vp.vh, hexCount, cfg, vp.insets);

          expect(layout.arc.hexCount).toBe(hexCount);
          const widgetKeys = Object.keys(layout.widgetBounds) as MobileWidgetId[];

          // 1. Every interactive widget stays strictly inside safe viewport bounds
          for (const k of widgetKeys) {
            const b = layout.widgetBounds[k];
            expect(b.x).toBeGreaterThanOrEqual(layout.safeLeft - 1);
            expect(b.x + b.w).toBeLessThanOrEqual(vp.vw - layout.safeRight + 1);
            expect(b.y).toBeGreaterThanOrEqual(layout.safeTop - 1);
            expect(b.y + b.h).toBeLessThanOrEqual(vp.vh - layout.safeBottom + 1);
          }

          // 2. Zero overlap and minimum 8px gap between every pair of interactive widgets
          for (let i = 0; i < widgetKeys.length; i++) {
            for (let j = i + 1; j < widgetKeys.length; j++) {
              const g = rectGap(layout.widgetBounds[widgetKeys[i]], layout.widgetBounds[widgetKeys[j]]);
              expect(g).toBeGreaterThanOrEqual(8);
            }
          }

          // 3. Primary action buttons meet ergonomic touch diameter (>= 44px on standard phones iPhone SE / 14+)
          if (vp.vw >= 667) {
            expect(layout.dash.r * 2).toBeGreaterThanOrEqual(44);
            expect(layout.form.r * 2).toBeGreaterThanOrEqual(44);
            expect(layout.special.r * 2).toBeGreaterThanOrEqual(46);
            expect(layout.atk.r * 2).toBeGreaterThanOrEqual(68);
            expect(layout.joy.r * 2).toBeGreaterThanOrEqual(86);
          }

          // 4. 2-finger preset places Rotation & Scale lower (closer to thumbs) than 4-finger Claw
          if (preset === '2-finger') {
            const claw = computeSmartMobileLayout(vp.vw, vp.vh, hexCount, createMobileHUDPreset('4-finger'), vp.insets);
            expect(layout.rotGroupRect.y).toBeGreaterThan(claw.rotGroupRect.y);
            expect(layout.scaleGroupRect.y).toBeGreaterThan(claw.scaleGroupRect.y);
          }
        }
      }
    }
  });

  it('migrates legacy v1 mobile HUD configs cleanly to v2 while preserving custom v2 positions and rotations', () => {
    const legacyV1 = {
      version: 1,
      preset: '4-finger',
      snapGrid: false,
      widgets: {
        atk: { nx: 0.88, ny: 0.79, scale: 1.0, opacity: 0.94 },
      },
    };
    const migrated = sanitizeMobileHUDConfig(legacyV1);
    expect(migrated.version).toBe(MOBILE_HUD_VERSION);
    expect(migrated.snapGrid).toBe(false);
    expect(migrated.widgets.recall.nx).toBeCloseTo(createMobileHUDPreset('4-finger').widgets.recall.nx, 4);

    const customV2 = createMobileHUDPreset('2-finger');
    customV2.widgets.atk.nx = 0.82;
    customV2.widgets.atk.rotation = 45;
    const kept = sanitizeMobileHUDConfig(customV2);
    expect(kept.version).toBe(MOBILE_HUD_VERSION);
    expect(kept.widgets.atk.nx).toBeCloseTo(0.82, 4);
    expect(kept.widgets.atk.rotation).toBe(45);
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
