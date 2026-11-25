import { describe, expect, it } from 'vitest';
import {
  ANCHOR_BONUS,
  BASE_HEX_RADIUS,
  createDefaultLoadout,
  FIXED_DT,
  HEX_HP_MULTIPLIER,
  MATERIALS,
  PLAYER_RADIUS,
} from '@core/constants';
import { applyHexDurabilityLoss, computeEffectiveImpactAngle, damageHex, isBodyShieldedAlongPath } from '@core/physics/combat';
import { createMatchState, stepSimulation } from '@core/physics/simulation';
import {
  executeFighterAttack,
  issueGuidedWaypoint,
  setFighterForm,
  setFighterRotMode,
  setFighterScale,
  triggerFighterSpecial,
} from '@attacks/index';
import {
  getEffectiveHexStats,
  getLooseGravityFieldRadius,
  getLooseOrbitRadius,
  getStructuralResistance,
  insertRecoveredHexIntoCluster,
  runStructuralBFSAndReassemble,
} from '@core/world/structure';

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

  it('expands Loose Gravity Field +40% over Phase 2 baseline, places orbit hexes at midpoint, and slows enemy entities by 80%', () => {
    const idleInput = {
      mode: 'desktop' as const,
      touchHoldingAttack: false,
      touchAimAngle: 0,
      touchAimStrength: 0,
      desktopHoldingGuided: false,
    };

    // 1. Field radius (+40% over previous 1.30x baseline) & midpoint orbit radius
    const state = createMatchState();
    const { player } = state;
    setFighterForm(state, player, 'loose');
    for (let i = 0; i < 30; i++) stepSimulation(state, FIXED_DT, idleInput);

    expect(triggerFighterSpecial(state, player)).toBe(true);
    expect(player.specialActive?.type).toBe('loose');

    const prevLooseRing = (PLAYER_RADIUS + 24 + BASE_HEX_RADIUS * player.currentScale * 1.15) * 1.20;
    const fieldR = getLooseGravityFieldRadius(player);
    const expectedMidOrbit = (PLAYER_RADIUS + fieldR) * 0.5;
    expect(fieldR).toBeCloseTo(prevLooseRing * 1.30 * 1.40, 4);
    expect(getLooseOrbitRadius(player)).toBeCloseTo(expectedMidOrbit, 4);

    // Let loose hexes settle onto the midpoint orbit
    for (let i = 0; i < 45; i++) stepSimulation(state, FIXED_DT, idleInput);
    const orbitHex = player.hexes.find((h) => h.state === 'ORBIT');
    expect(orbitHex).toBeDefined();
    const orbitDist = Math.hypot(orbitHex!.x - player.x, orbitHex!.y - player.y);
    expect(Math.abs(orbitDist - expectedMidOrbit)).toBeLessThan(1.5);

    // 2. Enemy body moves at 20% speed (-80%) inside the Gravity Field
    const outsideState = createMatchState();
    outsideState.obstacles = [];
    outsideState.player.x = -360;
    outsideState.player.y = 0;
    outsideState.enemy.x = 200;
    outsideState.enemy.y = 0;
    outsideState.enemy.vx = 0;
    outsideState.enemy.vy = 200;
    const outStartY = outsideState.enemy.y;
    stepSimulation(outsideState, FIXED_DT, idleInput);
    const outDisp = Math.abs(outsideState.enemy.y - outStartY);

    const insideState = createMatchState();
    insideState.obstacles = [];
    insideState.player.x = 0;
    insideState.player.y = 0;
    setFighterForm(insideState, insideState.player, 'loose');
    expect(triggerFighterSpecial(insideState, insideState.player)).toBe(true);
    for (const h of insideState.player.hexes) {
      h.state = 'PLANTED';
      h.x = -300;
      h.y = -300;
    }
    insideState.enemy.x = 80; // inside fieldR (~164px)
    insideState.enemy.y = 0;
    insideState.enemy.vx = 0;
    insideState.enemy.vy = 200;
    const inStartY = insideState.enemy.y;
    stepSimulation(insideState, FIXED_DT, idleInput);
    const inDisp = Math.abs(insideState.enemy.y - inStartY);
    expect(inDisp / outDisp).toBeCloseTo(0.2, 2);

    // 3. Enemy LAUNCHED hex flies at 20% speed (-80%) inside the Gravity Field
    const projState = createMatchState();
    projState.obstacles = [];
    projState.player.x = 0;
    projState.player.y = 0;
    setFighterForm(projState, projState.player, 'loose');
    expect(triggerFighterSpecial(projState, projState.player)).toBe(true);

    projState.enemy.x = 300;
    projState.enemy.y = 0;
    setFighterForm(projState, projState.enemy, 'loose');
    for (let i = 0; i < 30; i++) stepSimulation(projState, FIXED_DT, idleInput);

    const testHex = projState.enemy.hexes.find((h) => h.state === 'ORBIT')!;
    testHex.state = 'LAUNCHED';
    testHex.x = 40;
    testHex.y = 0;
    testHex.vx = 600;
    testHex.vy = 0;
    testHex.remainingDist = 400;
    testHex.targetX = 440;
    testHex.targetY = 0;
    testHex.hasBounced = true;
    const prevHexX = testHex.x;
    stepSimulation(projState, FIXED_DT, idleInput);
    expect(testHex.x - prevHexX).toBeCloseTo(600 * 0.2 * FIXED_DT, 2);

    // 4. Enemy melee swing advances at 20% speed (-80%) when inside the Gravity Field
    const meleeOut = createMatchState();
    meleeOut.obstacles = [];
    meleeOut.player.x = -380;
    meleeOut.player.y = 0;
    meleeOut.enemy.x = 0;
    meleeOut.enemy.y = 0;
    setFighterForm(meleeOut, meleeOut.enemy, 'slot2'); // melee
    executeFighterAttack(meleeOut, meleeOut.enemy, 0);
    stepSimulation(meleeOut, FIXED_DT, idleInput);
    const normalTimer = meleeOut.enemy.attackAnim?.timer ?? 0;

    const meleeIn = createMatchState();
    meleeIn.obstacles = [];
    meleeIn.player.x = 0;
    meleeIn.player.y = 0;
    setFighterForm(meleeIn, meleeIn.player, 'loose');
    expect(triggerFighterSpecial(meleeIn, meleeIn.player)).toBe(true);
    meleeIn.enemy.x = 50;
    meleeIn.enemy.y = 0;
    setFighterForm(meleeIn, meleeIn.enemy, 'slot2');
    executeFighterAttack(meleeIn, meleeIn.enemy, 0);
    stepSimulation(meleeIn, FIXED_DT, idleInput);
    const slowedTimer = meleeIn.enemy.attackAnim?.timer ?? 0;
    expect(slowedTimer / normalTimer).toBeCloseTo(0.2, 2);

    // 5. Enemy ranged spear advances at 20% speed (-80%) inside the Gravity Field
    const spearOut = createMatchState();
    spearOut.obstacles = [];
    spearOut.player.x = -380;
    spearOut.player.y = 0;
    spearOut.enemy.x = 0;
    spearOut.enemy.y = 0;
    setFighterForm(spearOut, spearOut.enemy, 'slot1');
    for (let i = 0; i < 30; i++) stepSimulation(spearOut, FIXED_DT, idleInput);
    executeFighterAttack(spearOut, spearOut.enemy, 0);
    expect(spearOut.enemy.attackAnim?.type).toBe('ranged');
    const outAnim = spearOut.enemy.attackAnim!;
    if (outAnim.type !== 'ranged') throw new Error('Expected ranged');
    const outSpearStartX = outAnim.anchorX;
    stepSimulation(spearOut, FIXED_DT, idleInput);
    const outSpearStep = Math.hypot(outAnim.anchorX - outSpearStartX, outAnim.anchorY);

    const spearIn = createMatchState();
    spearIn.obstacles = [];
    spearIn.player.x = 0;
    spearIn.player.y = 0;
    setFighterForm(spearIn, spearIn.player, 'loose');
    expect(triggerFighterSpecial(spearIn, spearIn.player)).toBe(true);
    for (const h of spearIn.player.hexes) {
      h.state = 'PLANTED';
      h.x = -300;
      h.y = -300;
    }
    spearIn.enemy.x = -110; // no body overlap with player (0,0), anchor spawns inside fieldR (~164)
    spearIn.enemy.y = 0;
    setFighterForm(spearIn, spearIn.enemy, 'slot1');
    for (let i = 0; i < 30; i++) stepSimulation(spearIn, FIXED_DT, idleInput);
    executeFighterAttack(spearIn, spearIn.enemy, 0);
    expect(spearIn.enemy.attackAnim?.type).toBe('ranged');
    const inAnim = spearIn.enemy.attackAnim!;
    if (inAnim.type !== 'ranged') throw new Error('Expected ranged');
    const inSpearStartX = inAnim.anchorX;
    stepSimulation(spearIn, FIXED_DT, idleInput);
    const inSpearStep = Math.hypot(inAnim.anchorX - inSpearStartX, inAnim.anchorY);
    expect(inSpearStep / outSpearStep).toBeCloseTo(0.2, 2);
  });

  it('auto-selects all loose shards on match start and when switching back to loose form', () => {
    const state = createMatchState();
    expect(state.player.form).toBe('loose');
    expect(state.player.hexes.every((h) => h.selected)).toBe(true);

    setFighterForm(state, state.player, 'slot2');
    setFighterForm(state, state.player, 'loose');
    expect(state.player.hexes.every((h) => h.state === 'ORBIT' && h.selected)).toBe(true);
  });

  it('enlarges Melee Special to 150% while keeping hardness/resistance equal to 100% scale and restores scale on expiry', () => {
    const state = createMatchState();
    const { player } = state;
    setFighterForm(state, player, 'slot2');
    setFighterScale(state, player, 1.0);
    const root = player.hexes[player.rootHexId];
    const baseRes = getStructuralResistance(player, root);

    expect(triggerFighterSpecial(state, player)).toBe(true);
    expect(player.targetScale).toBe(1.5);
    player.currentScale = 1.5;

    // Even when enlarged to 150%, Melee Special resistance matches 100% scale!
    expect(getStructuralResistance(player, root)).toBeCloseTo(baseRes, 4);

    // Expire skill -> restores previous scale (1.0)
    if (player.specialActive) player.specialActive.timer = 0.01;
    stepSimulation(state, FIXED_DT);
    expect(player.specialActive).toBeNull();
    expect(player.targetScale).toBe(1.0);
  });

  it('emits reactive mini damaging shockwave when Defense Special is hit and expands final Counter-Pulse range & knockback', () => {
    const state = createMatchState();
    state.obstacles = [];
    const { player, enemy } = state;
    setFighterForm(state, player, 'slot3'); // Defense
    player.x = 0;
    player.y = 0;
    player.facing = 0;
    expect(triggerFighterSpecial(state, player, applyHexDurabilityLoss)).toBe(true);
    player.currentScale = 1.5;
    enemy.x = 125;
    enemy.y = 0;
    setFighterForm(state, enemy, 'loose');
    stepSimulation(state, FIXED_DT); // sync shield hex world positions to player (0, 0) at scale 1.5

    const enemyHpBefore = enemy.hp;
    const shieldHex = player.hexes.find((h) => h.state === 'ASSEMBLED')!;
    const attHex = enemy.hexes[0];
    attHex.state = 'LAUNCHED';
    attHex.x = shieldHex.x + 12;
    attHex.y = shieldHex.y;
    attHex.vx = -400;
    attHex.vy = 0;
    attHex.energy = 80;
    attHex.initialEnergy = 80;
    attHex.remainingDist = 120;

    stepSimulation(state, FIXED_DT);
    // Reactive mini shockwave should damage enemy HP & put miniPulseCd on cooldown
    expect(enemy.hp).toBeLessThan(enemyHpBefore);
    expect(player.specialActive?.miniPulseCd ?? 0).toBeGreaterThan(0);

    // Final Counter-Pulse hits at extended range (260px > old 210px) with strong knockback (>= 580)
    const hpBeforeFinal = enemy.hp;
    enemy.x = 260;
    enemy.y = 0;
    enemy.kbX = 0;
    expect(triggerFighterSpecial(state, player, applyHexDurabilityLoss)).toBe(true);
    expect(enemy.hp).toBeLessThan(hpBeforeFinal);
    expect(enemy.kbX).toBeGreaterThanOrEqual(580);
  });
});
