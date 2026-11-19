import { describe, expect, it } from 'vitest';
import {
  ANCHOR_BONUS,
  createDefaultLoadout,
  FIXED_DT,
  HEX_HP_MULTIPLIER,
  MATERIALS,
} from '@core/constants';
import { applyHexDurabilityLoss, computeEffectiveImpactAngle, damageHex, isBodyShieldedAlongPath } from '@core/combat';
import { createMatchState, stepSimulation } from '@core/simulation';
import {
  executeFighterAttack,
  issueGuidedWaypoint,
  setFighterForm,
  setFighterRotMode,
  setFighterScale,
  triggerFighterSpecial,
} from '@core/skills';
import {
  getEffectiveHexStats,
  getStructuralResistance,
  insertRecoveredHexIntoCluster,
  runStructuralBFSAndReassemble,
} from '@core/structure';

describe('Power-Law Scaling & 4-Rule Emergent Physics', () => {
  it('follows exact Power-Law scaling S^k and keeps maxHP invariant (k = 0)', () => {
    const state = createMatchState();
    const { player } = state;
    const baseHex = player.hexes[1]; // 'base' material: 100/100/100/100
    expect(baseHex.maxHp).toBe(Math.round(MATERIALS.base.dur * HEX_HP_MULTIPLIER));

    player.currentScale = 1.0;
    const s100 = getEffectiveHexStats(player, baseHex);

    player.currentScale = 0.6;
    const s60 = getEffectiveHexStats(player, baseHex);
    expect(s60.radius / s100.radius).toBeCloseTo(0.6, 4);
    expect(s60.hardness / s100.hardness).toBeCloseTo(Math.pow(0.6, -1.5), 4);
    expect(s60.damage / s100.damage).toBeCloseTo(Math.pow(0.6, -1.0), 4);
    expect(s60.speedMult / s100.speedMult).toBeCloseTo(Math.pow(0.6, -0.5), 4);
    expect(baseHex.maxHp).toBe(220); // k = 0 anti-exploit!

    player.currentScale = 1.5;
    const s150 = getEffectiveHexStats(player, baseHex);
    expect(s150.hardness / s100.hardness).toBeCloseTo(Math.pow(1.5, -1.5), 4);
    expect(s150.damage / s100.damage).toBeCloseTo(Math.pow(1.5, -1.0), 4);
  });

  it('applies Rule 2 Anchor Bonus (1.4x) and 30% Load Sharing across adjacent anchored hexes', () => {
    const state = createMatchState();
    const { player, enemy } = state;
    setFighterForm(state, enemy, 'slot3'); // Defense Shield (high adjacency)
    enemy.currentScale = 1.0;

    const root = enemy.hexes[0]; // Heavy root with multiple neighbors
    expect(root.adjCount).toBeGreaterThanOrEqual(3);
    const expectedR = root.material.hard * Math.pow(1.0, -1.5) * (1 + 0.1 * root.adjCount) * ANCHOR_BONUS;
    expect(getStructuralResistance(enemy, root)).toBeCloseTo(expectedR, 4);

    // Record neighbor HP before damageHex
    const neighborBefore = enemy.hexes[1].hp;
    const attHex = player.hexes[5]; // Sharp
    damageHex(state, player, attHex, enemy, root, 2.0);
    // Load Sharing must distribute 30% durability damage to adjacent neighbor!
    expect(enemy.hexes[1].hp).toBeLessThan(neighborBefore);
  });

  it('enforces Rule 1 Path Shielding (anchored hexes shield the ground hitbox ring)', () => {
    const state = createMatchState();
    const { enemy } = state;
    setFighterForm(state, enemy, 'slot3');
    enemy.x = 200;
    enemy.y = 0;
    enemy.facing = Math.PI; // Shield faces left toward -X
    stepSimulation(state, FIXED_DT);

    // Incoming point strictly in front of the shield (-X side) is shielded
    expect(isBodyShieldedAlongPath(40, 0, enemy, 16.5 * enemy.currentScale)).toBe(true);
    // Flanking attack from behind (+X side) bypasses shield cleanly!
    expect(isBodyShieldedAlongPath(360, 0, enemy, 16.5 * enemy.currentScale)).toBe(false);
  });

  it('integrates Normal Spin (-45% angle) & Random Tumble (+24..46 deg) into Rule 4 Impact Angle', () => {
    const state = createMatchState();
    const { player, enemy } = state;
    setFighterForm(state, player, 'loose');
    setFighterRotMode(state, player, 'normal');

    const raw = (40 * Math.PI) / 180;
    const effNormal = computeEffectiveImpactAngle(player, enemy, raw, null, () => 0.5);
    expect(effNormal).toBeCloseTo(raw * 0.55, 5);

    setFighterForm(state, enemy, 'loose');
    setFighterRotMode(state, enemy, 'random');
    setFighterRotMode(state, player, 'static');
    const effDefRandom = computeEffectiveImpactAngle(player, enemy, (15 * Math.PI) / 180, null, () => 0.5);
    expect(effDefRandom).toBeGreaterThan((35 * Math.PI) / 180);
  });

  it('runs BFS magnetic re-assembly when middle shaft breaks AND when root breaks, then morphs back on full recovery', () => {
    const state = createMatchState(createDefaultLoadout(), createDefaultLoadout());
    const { player } = state;
    setFighterForm(state, player, 'slot1'); // Long Spear (q: 0, 1, 2, 3, 4)

    // Shatter shaft hex #2 at (2, 0) -> detaches tips #5 (3,0) and #6 (4,0)!
    const shaft = player.hexes[2];
    const shattered = applyHexDurabilityLoss(state, state.enemy, player, shaft, 9999);
    expect(shattered).toBe(true);
    expect(shaft.state).toBe('BROKEN');

    // Tips #5 and #6 must have magnetically re-attached to the Root cluster!
    expect(player.hexes[5].isReassembling).toBe(true);
    expect(player.hexes[5].adjCount).toBeGreaterThan(0);

    // Also shatter Root hex #0 -> BFS promotes surviving neighbor to temporary root without crashing!
    applyHexDurabilityLoss(state, state.enemy, player, player.hexes[0], 9999);
    runStructuralBFSAndReassemble(player, state.events, false);
    expect(player.rootHexId).not.toBe(0);

    // Recover both broken hexes -> needsFullMorph becomes true -> stepSimulation restores exact blueprint!
    shaft.state = 'ORBIT';
    shaft.hp = shaft.maxHp;
    insertRecoveredHexIntoCluster(player, shaft, state.events);
    player.hexes[0].state = 'ORBIT';
    player.hexes[0].hp = player.hexes[0].maxHp;
    insertRecoveredHexIntoCluster(player, player.hexes[0], state.events);

    expect(player.needsFullMorph).toBe(true);
    // Advance past 0.045s shatter hit-stop so updateFighter runs full recovery morph
    for (let i = 0; i < 5; i++) {
      stepSimulation(state, FIXED_DT);
    }
    expect(player.needsFullMorph).toBe(false);
    expect(player.rootHexId).toBe(0);
    expect(player.hexes[6].q).toBe(4);
  });

  it('enforces pure Defense Stance (cannot normal attack) while Special Pháo Đài Counter-Pulse still deals damage', () => {
    const state = createMatchState();
    state.obstacles = [];
    const { player, enemy } = state;
    setFighterForm(state, player, 'slot3'); // Defense Stance
    setFighterScale(state, player, 1.5);
    player.x = 0;
    player.y = 0;
    player.facing = 0;
    enemy.x = 95;
    enemy.y = 0;
    setFighterForm(state, enemy, 'loose');

    const hpBefore = enemy.hp;
    // 1. Normal attack in Defense stance must be blocked completely (no attackAnim, 0 HP damage)
    executeFighterAttack(state, player, 0, 1.0, applyHexDurabilityLoss);
    expect(player.attackAnim).toBeNull();
    for (let i = 0; i < 12; i++) {
      stepSimulation(state, FIXED_DT);
    }
    expect(enemy.hp).toBe(hpBefore);

    // 2. Activating Defense Special (Pháo Đài Phản Xung) then unleashing Counter-Pulse deals real damage!
    expect(triggerFighterSpecial(state, player, applyHexDurabilityLoss)).toBe(true);
    expect(player.specialActive?.type).toBe('defense');

    // Re-triggering Special (or pressing Attack while Pháo Đài is active) unleashes damaging Counter-Pulse
    expect(triggerFighterSpecial(state, player, applyHexDurabilityLoss)).toBe(true);
    expect(player.specialActive).toBeNull();
    expect(enemy.hp).toBeLessThan(hpBefore);
  });

  it('flies straight THROUGH clicked PC waypoint during Guided Ranged Special without braking or stopping', () => {
    const state = createMatchState();
    state.obstacles = []; // Clear obstacles for deterministic straight pass-through check
    const { player, enemy } = state;
    setFighterForm(state, player, 'slot1'); // Ranged Stance
    player.x = -200;
    player.y = 0;
    player.facing = 0;
    enemy.x = 350;
    enemy.y = 0;

    expect(triggerFighterSpecial(state, player)).toBe(true);
    expect(player.attackAnim?.type).toBe('ranged');
    const anim = player.attackAnim!;
    if (anim.type !== 'ranged') throw new Error('Expected ranged attackAnim');

    // Click a waypoint straight ahead at (0, 0)
    const clickX = 0;
    const clickY = 0;
    expect(issueGuidedWaypoint(state, player, clickX, clickY, false)).toBe(true);
    expect(anim.hasCmd).toBe(true);

    const desktopInput = {
      mode: 'desktop' as const,
      touchHoldingAttack: false,
      touchAimAngle: 0,
      touchAimStrength: 0,
      desktopHoldingGuided: false,
    };

    const expectedSpeed = anim.guidedSpeed ?? 380;
    let passedWaypoint = false;
    let maxSpeedDrop = 0;

    for (let i = 0; i < 60; i++) {
      const prevX = anim.anchorX;
      const prevY = anim.anchorY;
      stepSimulation(state, FIXED_DT, desktopInput);
      const stepSpeed = Math.hypot(anim.anchorX - prevX, anim.anchorY - prevY) / FIXED_DT;
      maxSpeedDrop = Math.max(maxSpeedDrop, expectedSpeed - stepSpeed);
      if (anim.anchorX > clickX + 40) {
        passedWaypoint = true;
        break;
      }
    }

    // Must fly completely PAST the clicked point without braking or stopping!
    expect(passedWaypoint).toBe(true);
    expect(anim.hasCmd).toBe(false);
    expect(maxSpeedDrop).toBeLessThan(15); // Constant full guidedSpeed (zero arrival braking!)
  });
});
