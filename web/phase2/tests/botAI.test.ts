import { describe, expect, it } from 'vitest';
import { updateBotAI } from '@ai/botController';
import { FIXED_DT } from '@core/constants';
import { stepSimulation } from '@core/simulation';
import { createMatchState } from '@core/simulation';
import { launchHex, setFighterForm, triggerFighterSpecial } from '@core/skills';
import { getActiveStance } from '@core/structure';

describe('Tactical Counter-Play Bot AI', () => {
  it('counters Pháo Đài Phản Xung without mirroring defense and avoids charging its front', () => {
    const state = createMatchState();
    state.obstacles = [];
    const { player, enemy } = state;

    setFighterForm(state, player, 'slot3'); // Defense
    player.x = 0;
    player.y = 0;
    player.facing = 0; // Facing right toward Bot
    triggerFighterSpecial(state, player); // Pháo Đài active!

    enemy.x = 180;
    enemy.y = 0;
    enemy.facing = Math.PI;
    enemy.aiTimer = 0;
    enemy.aiActionTimer = 0;

    for (let i = 0; i < 45; i++) {
      stepSimulation(state, FIXED_DT, undefined, updateBotAI);
    }

    // Must NOT copy player's defense stance; should counter with ranged or loose!
    expect(getActiveStance(enemy)).not.toBe('defense');
    expect(enemy.specialActive?.type).not.toBe('defense');
  });

  it('counters Phản Chém Tước Mảnh (melee special) without copying melee and kites away', () => {
    const state = createMatchState();
    state.obstacles = [];
    const { player, enemy } = state;

    setFighterForm(state, player, 'slot2'); // Melee
    player.x = 0;
    player.y = 0;
    triggerFighterSpecial(state, player); // Phản Chém Tước Mảnh active!

    enemy.x = 150;
    enemy.y = 0;
    enemy.aiTimer = 0;

    for (let i = 0; i < 40; i++) {
      stepSimulation(state, FIXED_DT, undefined, updateBotAI);
    }

    expect(getActiveStance(enemy)).not.toBe('melee');
    expect(Math.hypot(enemy.x - player.x, enemy.y - player.y)).toBeGreaterThan(200);
  });

  it('chooses an anti-shield counter instead of mirroring normal Defense stance', () => {
    const state = createMatchState();
    state.obstacles = [];
    const { player, enemy } = state;

    setFighterForm(state, player, 'slot3'); // Defense
    player.x = -120;
    player.y = 0;
    player.facing = 0;

    enemy.x = 160;
    enemy.y = 0;
    enemy.aiTimer = 0;

    for (let i = 0; i < 20; i++) {
      stepSimulation(state, FIXED_DT, undefined, updateBotAI);
    }

    expect(getActiveStance(enemy)).not.toBe('defense');
  });

  it('triggers immediate Xayah pincer recall when player crosses a planted hex return line', () => {
    const state = createMatchState();
    state.obstacles = [];
    const { player, enemy } = state;

    setFighterForm(state, enemy, 'loose');
    enemy.x = 220;
    enemy.y = 0;
    player.x = 0;
    player.y = 0;

    // Plant one of enemy's hexes behind the player at (-180, 0)
    const hex = enemy.hexes[0];
    hex.state = 'PLANTED';
    hex.x = -180;
    hex.y = 0;
    enemy.aiTimer = 2.0; // Prevent form switch
    enemy.aiActionTimer = 1.0;

    updateBotAI(state, FIXED_DT);

    expect(hex.state).toBe('RECALLING');
  });

  it('dashes perpendicular to evade an incoming fast projectile', () => {
    const state = createMatchState();
    state.obstacles = [];
    const { player, enemy } = state;

    setFighterForm(state, player, 'loose');
    player.x = -150;
    player.y = 0;
    enemy.x = 80;
    enemy.y = 0;
    enemy.dashCooldown = 0;
    enemy.aiTimer = 2.0;

    // Launch a fast player hex straight at Bot (+X)
    const proj = player.hexes[0];
    proj.x = -20;
    proj.y = 0;
    launchHex(state, player, proj, 0, 1.0, 'xayah');
    proj.vx = 680;
    proj.vy = 0;

    updateBotAI(state, FIXED_DT);

    expect(enemy.dashTimer).toBeGreaterThan(0);
    // Perpendicular dash along Y means |dashVy| dominates |dashVx|
    expect(Math.abs(enemy.dashVy)).toBeGreaterThan(Math.abs(enemy.dashVx));
  });
});
