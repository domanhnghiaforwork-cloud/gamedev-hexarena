import { describe, expect, it } from 'vitest';
import {
  BUILTIN_SPECIAL_SKILL_IDS,
  getAttackMode,
  getSpecialSkillsForMode,
  listAttackModes,
  registerSpecialSkill,
  resolveFighterSpecialSkill,
  setFighterForm,
  triggerFighterSpecial,
  unregisterSpecialSkill,
  type SpecialSkillDefinition,
} from '@attacks/index';
import { FONT_PRIMARY_NAME, canvasFont } from '@config/typography';
import { createMatchState } from '@core/physics/simulation';

describe('Phase 3 Extensible Attack Registry (1-to-N Specials) & Typography', () => {
  it('registers all 4 built-in attack modes and their default special skills', () => {
    const modes = listAttackModes();
    expect(modes.map((m) => m.id)).toEqual(['loose', 'ranged', 'melee', 'defense']);

    expect(getAttackMode('loose')?.defaultSpecialSkillId).toBe(BUILTIN_SPECIAL_SKILL_IDS.LOOSE_GRAVITY_FIELD);
    expect(getAttackMode('ranged')?.defaultSpecialSkillId).toBe(BUILTIN_SPECIAL_SKILL_IDS.RANGED_GUIDED_SPEAR);
    expect(getAttackMode('melee')?.defaultSpecialSkillId).toBe(BUILTIN_SPECIAL_SKILL_IDS.MELEE_PARRY_DISARM);
    expect(getAttackMode('defense')?.defaultSpecialSkillId).toBe(BUILTIN_SPECIAL_SKILL_IDS.DEFENSE_COUNTER_FORTRESS);

    for (const mode of modes) {
      expect(getSpecialSkillsForMode(mode.id).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('supports adding a 2nd special skill to an attack mode and dispatching via blueprint.specialSkillId', () => {
    const testSkillId = 'melee:test_blade_storm';
    const secondMeleeSkill: SpecialSkillDefinition = {
      id: testSkillId,
      modeId: 'melee',
      name: 'Bão Kiếm Thử Nghiệm',
      short: 'BÃO KIẾM',
      dur: 6.0,
      cd: 15.0,
      color: '#f59e0b',
      desc: 'Kỹ năng mở rộng thứ 2 cho nhánh Đánh gần.',
      activate: ({ fighter }) => {
        fighter.specialActive = {
          type: 'melee',
          skillId: testSkillId,
          timer: 6.0,
          maxTimer: 6.0,
          duration: 6.0,
        };
        return true;
      },
    };

    registerSpecialSkill(secondMeleeSkill);
    try {
      const meleeSkills = getSpecialSkillsForMode('melee');
      expect(meleeSkills).toHaveLength(2);
      expect(meleeSkills.map((s) => s.id)).toContain(testSkillId);

      const state = createMatchState();
      const { player } = state;
      player.loadout.blueprints.slot2.specialSkillId = testSkillId;
      setFighterForm(state, player, 'slot2');

      expect(resolveFighterSpecialSkill(player).id).toBe(testSkillId);

      const ok = triggerFighterSpecial(state, player);
      expect(ok).toBe(true);
      expect(player.specialActive?.skillId).toBe(testSkillId);
      expect(player.specialCooldown).toBe(15.0);
    } finally {
      unregisterSpecialSkill(testSkillId);
      expect(getSpecialSkillsForMode('melee')).toHaveLength(1);
    }
  });

  it('provides Vietnamese-safe Be Vietnam Pro font helper without bare system-ui fallback', () => {
    const f = canvasFont(800, 14);
    expect(f).toContain(FONT_PRIMARY_NAME);
    expect(f).not.toBe('800 14px system-ui, sans-serif');
  });
});
