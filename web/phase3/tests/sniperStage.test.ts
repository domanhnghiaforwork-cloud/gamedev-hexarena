import { describe, expect, it } from 'vitest';
import {
  BUILTIN_SPECIAL_SKILL_IDS,
  executeFighterAttack,
  executeFighterDash,
  getSpecialSkillsForMode,
  setFighterForm,
  triggerFighterSpecial,
} from '@attacks/index';
import { SNIPER_SHOT_COOLDOWN, SNIPER_SLOW_FACTOR } from '@attacks/ranged/specials/sniperStage';
import { ARENA_RADIUS, FIXED_DT, PLAYER_MOVE_SPEED, createDefaultLoadout } from '@core/constants';
import { createMatchState, stepSimulation } from '@core/physics/simulation';
import {
  RANGED_SNIPER_CONE_HALF_ANGLE,
  clampAngleToSniperCone,
  isRangedSniperActive,
} from '@core/world/structure';
import { buildSeatSnapshot } from '@net/protocol';

describe('Ranged Special Skill #2 — Thương Kích Lục Giác (ranged:sniper_stage)', () => {
  it('registers in Ranged mode, locks ±32° cone, roots shooter movement, and consumes hexes tip-to-root', () => {
    const rangedSkills = getSpecialSkillsForMode('ranged');
    expect(rangedSkills.some((s) => s.id === BUILTIN_SPECIAL_SKILL_IDS.RANGED_SNIPER_STAGE)).toBe(true);

    const loadout = createDefaultLoadout();
    const state = createMatchState(loadout, loadout, () => 0.5, false);
    state.obstacles = [];
    const { player } = state;
    setFighterForm(state, player, 'slot1'); // Ranged

    const coneCenter = 0;
    const ok = triggerFighterSpecial(
      state,
      player,
      undefined,
      BUILTIN_SPECIAL_SKILL_IDS.RANGED_SNIPER_STAGE,
      { angle: coneCenter, strength: 1 },
    );
    expect(ok).toBe(true);
    expect(isRangedSniperActive(player)).toBe(true);
    expect(player.specialActive?.coneAngle).toBeCloseTo(coneCenter, 5);

    // Clamps out-of-cone aim strictly to ±32°
    const clamped = clampAngleToSniperCone(player, Math.PI * 0.75);
    expect(clamped).toBeCloseTo(RANGED_SNIPER_CONE_HALF_ANGLE, 4);

    // Shooter is rooted while sniper stage is active
    const startX = player.x;
    const startY = player.y;
    player.vx = PLAYER_MOVE_SPEED;
    player.vy = PLAYER_MOVE_SPEED;
    stepSimulation(state, FIXED_DT);
    expect(player.x).toBeCloseTo(startX, 3);
    expect(player.y).toBeCloseTo(startY, 3);

    // Fires outermost hex first, leaving rootHexId for last, with 0.50s cadence
    const rootId = player.rootHexId;
    executeFighterAttack(state, player, 0, 1.0);
    expect(player.attackCooldown).toBeCloseTo(SNIPER_SHOT_COOLDOWN, 3);
    const shotHexes = player.hexes.filter((h) => h.state === 'SNIPER_SHOT');
    expect(shotHexes).toHaveLength(1);
    expect(shotHexes[0].id).not.toBe(rootId);
    expect(shotHexes[0].sniperEmpowered).toBe(false);
  });

  it('empowers strictly ONLY the 4th shot (shots 1..3 and 5..7 remain normal) and applies 35% slow on hit', () => {
    const loadout = createDefaultLoadout();
    // Use uniform base materials so damage differences isolate tip/spine role and 4th-shot empower
    loadout.hexMaterials = Array(loadout.hexMaterials.length).fill('base');
    const state = createMatchState(loadout, loadout, () => 0.5, false);
    state.obstacles = [];
    const { player, enemy } = state;

    setFighterForm(state, player, 'slot1');
    setFighterForm(state, enemy, 'loose');
    // Keep enemy hexes out of the line of fire so all 6 shots hit enemy body cleanly for damage & slow comparison
    for (const h of enemy.hexes) {
      h.state = 'BROKEN';
      h.cooldown = 99;
    }
    player.x = -250;
    player.y = 0;
    enemy.x = 180;
    enemy.y = 0;

    triggerFighterSpecial(
      state,
      player,
      undefined,
      BUILTIN_SPECIAL_SKILL_IDS.RANGED_SNIPER_STAGE,
      { angle: 0, strength: 1 },
    );

    const shotDamages: number[] = [];
    const empoweredFlags: boolean[] = [];

    for (let i = 0; i < 6; i++) {
      const hpBefore = enemy.hp;
      player.attackCooldown = 0;
      executeFighterAttack(state, player, 0, 1.0);

      const activeBullet = player.hexes.find((h) => h.state === 'SNIPER_SHOT');
      expect(activeBullet).toBeDefined();
      empoweredFlags.push(Boolean(activeBullet?.sniperEmpowered));

      // Step simulation until bullet impacts enemy
      for (let t = 0; t < 40; t++) {
        stepSimulation(state, FIXED_DT);
        if (enemy.hp < hpBefore) break;
      }
      shotDamages.push(hpBefore - enemy.hp);
      expect(enemy.slowTimer).toBeGreaterThan(0.3);
      expect(enemy.slowFactor).toBeCloseTo(SNIPER_SLOW_FACTOR, 2);
      // Bullet disappears after hitting target (SNIPER_SPENT while stage is active)
      expect(player.hexes.some((h) => h.state === 'SNIPER_SHOT')).toBe(false);
    }

    // Only shot #4 (index 3) is empowered; shots #5 and #6 are back to normal!
    expect(empoweredFlags).toEqual([false, false, false, true, false, false]);
    expect(shotDamages[3]).toBeGreaterThan(shotDamages[0] * 1.3);
    expect(shotDamages[3]).toBeGreaterThan(shotDamages[2] * 1.6);
    expect(shotDamages[4]).toBeLessThan(shotDamages[3] * 0.65);
  });

  it('blocks sniper bullets on arena obstacles and handles thin vs thick shields via 4-Rule Physics', () => {
    const loadout = createDefaultLoadout();
    const state = createMatchState(loadout, loadout, () => 0.5, false);
    const { player, enemy } = state;

    // Place a solid hex obstacle directly between player and enemy
    state.obstacles = [
      {
        id: 1,
        shape: 'square',
        x: 0,
        y: 0,
        angle: 0,
        r: 0,
        hw: 48,
        hh: 48,
        boundR: 68,
        height: 40,
        normals: [
          { nx: 1, ny: 0, d: 48 },
          { nx: -1, ny: 0, d: 48 },
          { nx: 0, ny: 1, d: 48 },
          { nx: 0, ny: -1, d: 48 },
        ],
        verts: [
          { x: -48, y: -48 },
          { x: 48, y: -48 },
          { x: 48, y: 48 },
          { x: -48, y: 48 },
        ],
      },
    ];
    player.x = -240;
    player.y = 0;
    enemy.x = 240;
    enemy.y = 0;

    setFighterForm(state, player, 'slot1');
    triggerFighterSpecial(
      state,
      player,
      undefined,
      BUILTIN_SPECIAL_SKILL_IDS.RANGED_SNIPER_STAGE,
      { angle: 0, strength: 1 },
    );

    const hpBefore = enemy.hp;
    executeFighterAttack(state, player, 0, 1.0);
    for (let t = 0; t < 40; t++) {
      stepSimulation(state, FIXED_DT);
    }
    expect(enemy.hp).toBe(hpBefore);
    expect(player.hexes.some((h) => h.state === 'SNIPER_SHOT')).toBe(false);

    // Now test against enemy assembled defense shield at 60% scale (high structural resistance blocks normal shot)
    state.obstacles = [];
    setFighterForm(state, enemy, 'slot3');
    enemy.targetScale = 0.6;
    enemy.currentScale = 0.6;
    enemy.facing = Math.PI;
    enemy.x = 180;
    enemy.y = 0;
    player.x = -220;
    player.y = 0;
    player.attackCooldown = 0;
    const enemyHpBeforeShield = enemy.hp;
    executeFighterAttack(state, player, 0, 1.0);
    for (let t = 0; t < 40; t++) {
      stepSimulation(state, FIXED_DT);
    }
    // Thick compressed shield hex absorbs the shot without piercing enemy body
    expect(enemy.hp).toBe(enemyHpBeforeShield);
    expect(enemy.hexes.some((h) => h.hp < h.maxHp || h.state === 'BROKEN')).toBe(true);
  });

  it('recalls spent hexes from multiple angles outside the arena when canceled or finished, and syncs snapshots', () => {
    const loadout = createDefaultLoadout();
    const state = createMatchState(loadout, loadout, () => 0.5, false);
    state.obstacles = [];
    const { player } = state;
    setFighterForm(state, player, 'slot1');
    player.x = -200;
    player.y = 0;

    triggerFighterSpecial(
      state,
      player,
      undefined,
      BUILTIN_SPECIAL_SKILL_IDS.RANGED_SNIPER_STAGE,
      { angle: 0, strength: 1 },
    );

    // Fire 3 shots into empty space past enemy/arena
    for (let i = 0; i < 3; i++) {
      player.attackCooldown = 0;
      executeFighterAttack(state, player, 0.1 * (i - 1), 1.0);
      for (let t = 0; t < 80; t++) {
        stepSimulation(state, FIXED_DT);
      }
    }

    const spentBefore = player.hexes.filter((h) => h.state === 'SNIPER_SPENT');
    expect(spentBefore).toHaveLength(3);

    // Verify snapshot serialization during sniper stage
    const activeSnap = buildSeatSnapshot(state, 'player', 10, 1000, 1, []);
    expect(activeSnap.self.specialActive?.skillId).toBe(BUILTIN_SPECIAL_SKILL_IDS.RANGED_SNIPER_STAGE);
    expect(activeSnap.self.specialActive?.shotsFired).toBe(3);

    // Emergency Dash cancels sniper stage cleanly -> un-roots & spawns SNIPER_RETURN hexes around arena exterior
    const dashOk = executeFighterDash(state, player, Math.PI * 0.5);
    expect(dashOk).toBe(true);
    expect(isRangedSniperActive(player)).toBe(false);

    const returning = player.hexes.filter((h) => h.state === 'SNIPER_RETURN');
    expect(returning).toHaveLength(3);
    for (const h of returning) {
      expect(Math.hypot(h.x, h.y)).toBeGreaterThan(ARENA_RADIUS);
    }
    // Check multiple return directions (at least 2 distinct quadrants)
    const angles = returning.map((h) => Math.atan2(h.y, h.x));
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(1.0);

    // Simulate until all returning hexes reassemble back into weapon
    for (let t = 0; t < 150; t++) {
      stepSimulation(state, FIXED_DT);
    }
    expect(player.hexes.every((h) => h.state === 'ASSEMBLED')).toBe(true);
  });
});
