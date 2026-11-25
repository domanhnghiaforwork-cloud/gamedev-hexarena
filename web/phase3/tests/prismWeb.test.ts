import { describe, expect, it } from 'vitest';
import {
  BUILTIN_SPECIAL_SKILL_IDS,
  PRISM_WEB_SKILL,
  getSpecialSkillsForMode,
  setFighterSpecialSkill,
  triggerFighterSpecial,
} from '@attacks/index';
import { createDefaultLoadout } from '@core/constants';
import { createMatchState, stepSimulation } from '@core/physics/simulation';
import {
  LOOSE_GRAVITY_SLOW_FACTOR,
  LOOSE_PRISM_SLOW_FACTOR,
  computePrismWebClusters,
  getEnemyLooseSlowFactor,
  getLooseGravityFieldRadius,
  getLoosePrismLinkRange,
} from '@core/world/structure';

describe('Loose Special #2: Lưới Quang Lục Giác (Clustered Convex Hull)', () => {
  it('registers as the 2nd loose special with 12s duration and R equal to Gravity Field diameter', () => {
    const looseSkills = getSpecialSkillsForMode('loose');
    expect(looseSkills.map((s) => s.id)).toEqual([
      BUILTIN_SPECIAL_SKILL_IDS.LOOSE_GRAVITY_FIELD,
      BUILTIN_SPECIAL_SKILL_IDS.LOOSE_PRISM_WEB,
    ]);
    expect(PRISM_WEB_SKILL.dur).toBe(12.0);

    const state = createMatchState(createDefaultLoadout(), createDefaultLoadout(), () => 0.5, false);
    expect(getLoosePrismLinkRange(state.player)).toBeCloseTo(getLooseGravityFieldRadius(state.player) * 2, 4);
  });

  it('auto-switches fireMode to xayah on activation and forms separate clusters + convex hulls', () => {
    const state = createMatchState(createDefaultLoadout(), createDefaultLoadout(), () => 0.5, false);
    const { player } = state;
    player.fireMode = 'volley';

    expect(setFighterSpecialSkill(state, player, BUILTIN_SPECIAL_SKILL_IDS.LOOSE_PRISM_WEB, 'loose')).not.toBeNull();
    expect(triggerFighterSpecial(state, player)).toBe(true);
    expect(player.fireMode).toBe('xayah');
    expect(player.specialActive?.skillId).toBe(BUILTIN_SPECIAL_SKILL_IDS.LOOSE_PRISM_WEB);
    expect(player.specialActive?.timer).toBeCloseTo(12.0, 2);

    // Plant 4 hexes in Cluster A (square + interior point) and 2 hexes in distant Cluster B
    const p = player.hexes;
    p[0].state = 'PLANTED';
    p[0].x = 0;
    p[0].y = 0;
    p[1].state = 'PLANTED';
    p[1].x = 180;
    p[1].y = 0;
    p[2].state = 'PLANTED';
    p[2].x = 90;
    p[2].y = 180;
    // Interior point inside triangle (0,0)-(180,0)-(90,180)
    p[3].state = 'PLANTED';
    p[3].x = 90;
    p[3].y = 60;

    // Distant 2-hex cluster > link range R from Cluster A
    p[4].state = 'PLANTED';
    p[4].x = -420;
    p[4].y = -250;
    p[5].state = 'PLANTED';
    p[5].x = -260;
    p[5].y = -250;

    const clusters = computePrismWebClusters(player);
    expect(clusters).toHaveLength(2);

    const closedCluster = clusters.find((c) => c.isClosed);
    const openCluster = clusters.find((c) => !c.isClosed);
    expect(closedCluster).toBeDefined();
    expect(closedCluster?.nodes).toHaveLength(4);
    expect(closedCluster?.hull).toHaveLength(3); // interior node p[3] excluded from hull boundary
    expect(closedCluster?.edges).toHaveLength(3);

    expect(openCluster).toBeDefined();
    expect(openCluster?.nodes).toHaveLength(2);
    expect(openCluster?.edges).toHaveLength(1);

    // Enemy inside closed convex triangle gets -40% slow (0.60x)
    expect(getEnemyLooseSlowFactor(player, 90, 90, 0)).toBe(LOOSE_PRISM_SLOW_FACTOR);
    // Enemy near distant 2-point line (not closed) gets 1.0x speed
    expect(getEnemyLooseSlowFactor(player, -340, -250, 0)).toBe(1.0);
    // Gravity field (80% slow) is NOT active when Prism Web is active
    expect(getEnemyLooseSlowFactor(player, player.x, player.y, 0)).not.toBe(LOOSE_GRAVITY_SLOW_FACTOR);
  });

  it('deals laser damage along connecting edges and updates loose damage telemetry', () => {
    const state = createMatchState(createDefaultLoadout(), createDefaultLoadout(), () => 0.5, false);
    const { player, enemy } = state;

    setFighterSpecialSkill(state, player, BUILTIN_SPECIAL_SKILL_IDS.LOOSE_PRISM_WEB, 'loose');
    triggerFighterSpecial(state, player);

    // Put enemy along laser segment between two planted hexes
    player.hexes[0].state = 'PLANTED';
    player.hexes[0].x = 100;
    player.hexes[0].y = 0;
    player.hexes[1].state = 'PLANTED';
    player.hexes[1].x = 300;
    player.hexes[1].y = 0;

    enemy.x = 200;
    enemy.y = 0;
    const hpBefore = enemy.hp;

    stepSimulation(state, 1 / 60);

    expect(enemy.hp).toBeLessThan(hpBefore);
    expect(state.stats.playerDmgByMode.loose).toBe(hpBefore - enemy.hp);
  });
});
