import { describe, expect, it } from 'vitest';
import {
  autoConnectBlueprint,
  computeBlueprintMetrics,
  normalizeBlueprint,
  resizeLoadoutHexCount,
  sanitizeLoadout,
  validateBlueprint,
} from '@core/world/blueprint';
import { createDefaultLoadout, createSampleTemplates } from '@core/constants';
import type { WeaponBlueprint } from '@core/types';

describe('WeaponBlueprint & Hex Loadout (5–10 hexes)', () => {
  it('validates default loadout and all sample templates (7–10 hexes)', () => {
    const templates = createSampleTemplates();
    for (const tpl of templates) {
      const n = tpl.loadout.hexMaterials.length;
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(10);
      for (const sk of ['slot1', 'slot2', 'slot3'] as const) {
        const res = validateBlueprint(tpl.loadout.blueprints[sk], n);
        expect(res.valid).toBe(true);
        expect(res.disconnectedIndices).toHaveLength(0);
      }
    }
  });

  it('detects disconnected hexes via BFS and auto-connects them cleanly', () => {
    const brokenBp: WeaponBlueprint = {
      id: 'slot1',
      name: 'Y-Fork Test',
      stance: 'ranged',
      defaultScale: 0.6,
      rootHexIndex: 0,
      slots: [
        { hexIndex: 0, q: 0, r: 0 },
        { hexIndex: 1, q: 1, r: 0 },
        { hexIndex: 2, q: 2, r: 0 },
        { hexIndex: 3, q: 4, r: 0 },  // Disconnected island!
        { hexIndex: 4, q: 5, r: -1 }, // Disconnected island!
      ],
    };

    const before = validateBlueprint(brokenBp, 5);
    expect(before.valid).toBe(false);
    expect(before.disconnectedIndices).toEqual([3, 4]);

    const fixed = autoConnectBlueprint(brokenBp);
    const after = validateBlueprint(fixed, 5);
    expect(after.valid).toBe(true);
    expect(after.disconnectedIndices).toHaveLength(0);
  });

  it('normalizes root anchor hex to (0, 0) when rootHexIndex changes', () => {
    const loadout = createDefaultLoadout();
    const bp = loadout.blueprints.slot1;
    bp.rootHexIndex = 2; // originally at (2, 0)
    const norm = normalizeBlueprint(bp);
    const newRoot = norm.slots.find((s) => s.hexIndex === 2)!;
    expect(newRoot.q).toBe(0);
    expect(newRoot.r).toBe(0);
    expect(validateBlueprint(norm, 7).valid).toBe(true);
  });

  it('resizes shared hex pool 7 -> 10 -> 5 while keeping all 3 blueprints valid and connected', () => {
    let loadout = createDefaultLoadout();
    loadout = resizeLoadoutHexCount(loadout, 10);
    expect(loadout.hexMaterials).toHaveLength(10);
    for (const sk of ['slot1', 'slot2', 'slot3'] as const) {
      expect(validateBlueprint(loadout.blueprints[sk], 10).valid).toBe(true);
    }

    loadout = resizeLoadoutHexCount(loadout, 5);
    expect(loadout.hexMaterials).toHaveLength(5);
    for (const sk of ['slot1', 'slot2', 'slot3'] as const) {
      expect(validateBlueprint(loadout.blueprints[sk], 5).valid).toBe(true);
    }
  });

  it('automatically derives emergent tip/front roles and safe anchor distance for custom shapes', () => {
    const loadout = createDefaultLoadout();
    const rangedMetrics = computeBlueprintMetrics(loadout.blueprints.slot1, loadout.hexMaterials);
    expect(rangedMetrics.roles[0]).toBe('root');
    expect(rangedMetrics.roles[6]).toBe('tip');
    expect(rangedMetrics.reachScore).toBeGreaterThan(50);

    const defMetrics = computeBlueprintMetrics(loadout.blueprints.slot3, loadout.hexMaterials);
    expect(defMetrics.roles[0]).toBe('root');
    // Shield extends backward (minLocalX < 0), so anchorDistFactor must automatically expand to clear body
    expect(defMetrics.anchorDistFactor).toBeGreaterThan(2.0);
    expect(defMetrics.avgAdjacency).toBeGreaterThan(2.0);
  });

  it('sanitizes corrupted persistence payloads safely without throwing', () => {
    const safe = sanitizeLoadout({ hexMaterials: ['invalid', 'heavy'], blueprints: null });
    expect(safe.hexMaterials.length).toBe(7);
    expect(validateBlueprint(safe.blueprints.slot1, 7).valid).toBe(true);
  });
});
