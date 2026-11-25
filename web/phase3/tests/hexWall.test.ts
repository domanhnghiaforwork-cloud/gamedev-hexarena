import { describe, expect, it } from 'vitest';
import {
  BUILTIN_SPECIAL_SKILL_IDS,
  HEX_WALL_SKILL,
  executeFighterAttack,
  executeFighterDash,
  getSpecialSkillsForMode,
  setFighterForm,
  setFighterScale,
  setFighterSpecialSkill,
  triggerFighterSpecial,
} from '@attacks/index';
import { HEX_HP_MULTIPLIER, MATERIALS, createDefaultLoadout } from '@core/constants';
import { createMatchState, stepSimulation } from '@core/physics/simulation';
import { HEX_WALL_COUNT, HEX_WALL_MAX_ACTIVE, HEX_WALL_PLACE_CD } from '@core/world/structure';
import { buildSeatSnapshot } from '@net/protocol';

describe('Defense Special #2: Tường Lục Giác (defense:hex_wall)', () => {
  it('registers as the 2nd defense special and keeps mobility/dash unlocked', () => {
    const defSkills = getSpecialSkillsForMode('defense');
    expect(defSkills.map((s) => s.id)).toEqual([
      BUILTIN_SPECIAL_SKILL_IDS.DEFENSE_COUNTER_FORTRESS,
      BUILTIN_SPECIAL_SKILL_IDS.DEFENSE_HEX_WALL,
    ]);
    expect(HEX_WALL_SKILL.dur).toBe(8.0);

    const state = createMatchState(createDefaultLoadout(), createDefaultLoadout(), () => 0.5, false);
    const { player } = state;
    // slot3 in createDefaultLoadout is defense
    setFighterForm(state, player, 'slot3');
    setFighterSpecialSkill(state, player, BUILTIN_SPECIAL_SKILL_IDS.DEFENSE_HEX_WALL, 'defense');

    expect(triggerFighterSpecial(state, player)).toBe(true);
    expect(player.specialActive?.skillId).toBe(BUILTIN_SPECIAL_SKILL_IDS.DEFENSE_HEX_WALL);
    setFighterScale(state, player, 0.6);
    expect(player.targetScale).toBe(0.6); // Scale stays unlocked unlike Pháo Đài
    expect(executeFighterDash(state, player, 0)).toBe(true); // Dash remains unlocked!
  });

  it('places 4 base-material 100% hexes in a row every 0.5s without consuming weapon hexes and enforces 4-wall cap + 5s expiry', () => {
    const state = createMatchState(createDefaultLoadout(), createDefaultLoadout(), () => 0.5, false);
    state.obstacles = []; // clear arena obstacles so all 4 hexes spawn cleanly
    const { player } = state;
    setFighterForm(state, player, 'slot3');
    setFighterSpecialSkill(state, player, BUILTIN_SPECIAL_SKILL_IDS.DEFENSE_HEX_WALL, 'defense');
    triggerFighterSpecial(state, player);

    const intactWeaponBefore = player.hexes.filter((h) => h.state === 'ASSEMBLED').length;
    executeFighterAttack(state, player, 0, 1.0);

    expect(state.walls).toHaveLength(1);
    expect(state.walls[0].hexes).toHaveLength(HEX_WALL_COUNT);
    expect(state.walls[0].hexes[0].maxHp).toBe(Math.round(MATERIALS.base.dur * HEX_HP_MULTIPLIER));
    expect(player.attackCooldown).toBeCloseTo(HEX_WALL_PLACE_CD, 4);
    expect(player.hexes.filter((h) => h.state === 'ASSEMBLED').length).toBe(intactWeaponBefore);

    // 0.5s cooldown blocks immediate 2nd placement
    executeFighterAttack(state, player, 0, 1.0);
    expect(state.walls).toHaveLength(1);

    // Place 4 more walls -> max 4 kept, oldest (id=1) dissolved
    for (let i = 0; i < 4; i++) {
      player.attackCooldown = 0;
      executeFighterAttack(state, player, 0, 1.0);
    }
    expect(state.walls).toHaveLength(HEX_WALL_MAX_ACTIVE);
    expect(state.walls.map((w) => w.id)).toEqual([2, 3, 4, 5]);

    // Walls expire cleanly after 5s
    for (let step = 0; step < 310; step++) {
      stepSimulation(state, 1 / 60);
    }
    expect(state.walls).toHaveLength(0);
  });

  it('physically blocks BOTH fighters and intercepts incoming attacks (serializing cleanly for PvP)', () => {
    const state = createMatchState(createDefaultLoadout(), createDefaultLoadout(), () => 0.5, false);
    state.obstacles = [];
    const { player, enemy } = state;
    player.x = -120;
    player.y = 0;
    setFighterForm(state, player, 'slot3');
    setFighterSpecialSkill(state, player, BUILTIN_SPECIAL_SKILL_IDS.DEFENSE_HEX_WALL, 'defense');
    triggerFighterSpecial(state, player);
    executeFighterAttack(state, player, 0, 1.0);

    const wall = state.walls[0];
    const centerWh = wall.hexes[1];

    // Push test for BOTH owner (player) and opponent (enemy)
    player.x = centerWh.x - 5;
    player.y = centerWh.y;
    enemy.x = centerWh.x + 5;
    enemy.y = centerWh.y;
    stepSimulation(state, 1 / 60);
    expect(Math.hypot(player.x - centerWh.x, player.y - centerWh.y)).toBeGreaterThanOrEqual(45);
    expect(Math.hypot(enemy.x - centerWh.x, enemy.y - centerWh.y)).toBeGreaterThanOrEqual(45);

    // Enemy launched loose hex hits centerWh specifically (outside neighbor w.hexes[0] radius)
    const wallHpBefore = centerWh.hp;
    enemy.form = 'loose';
    const eHex = enemy.hexes[0];
    eHex.state = 'LAUNCHED';
    eHex.hitCooldown = 0;
    eHex.x = centerWh.x + 24;
    eHex.y = centerWh.y;
    eHex.vx = -400;
    eHex.vy = 0;
    eHex.remainingDist = 300;
    eHex.energy = 60;
    eHex.initialEnergy = 60;
    stepSimulation(state, 1 / 60);
    expect(centerWh.hp).toBeLessThan(wallHpBefore);

    // PvP snapshot maps wall ownerId for guest perspective
    const guestSnap = buildSeatSnapshot(state, 'enemy', 1, 100, 0, []);
    expect(guestSnap.walls?.[0].ownerId).toBe('enemy');
  });
});
