import { afterEach, describe, expect, it } from 'vitest';
import {
  cycleFighterSpecialSkill,
  getFighterSelectedSpecialInfo,
  registerSpecialSkill,
  setFighterForm,
  setFighterSpecialSkill,
  triggerFighterSpecial,
  unregisterSpecialSkill,
} from '@attacks/index';
import type { SpecialSkillDefinition } from '@attacks/types';
import { createDefaultLoadout } from '@core/constants';
import { createMatchState } from '@core/physics/simulation';
import {
  computeDesktopDockLayout,
  computeSmartMobileLayout,
  getMobileSpecialRadialPos,
  getPCSpecialOptionRects,
  getPCSpecialRadialPos,
  isWidgetRotatable,
} from '@input/hudPresets';
import { createDefaultPCConfig, createMobileHUDPreset, formatKeyLabel, sanitizePCControlConfig } from '@storage/profiles';

const TEMP_MELEE_SKILL_ID = 'test_melee_ulti_2';

function makeTempMeleeSkill(): SpecialSkillDefinition {
  return {
    id: TEMP_MELEE_SKILL_ID,
    modeId: 'melee',
    name: 'Test Kiếm Chiêu 2',
    short: 'Kiếm 2',
    dur: 6,
    cd: 16,
    color: '#38bdf8',
    desc: 'Kỹ năng thử nghiệm thứ 2 cho nhánh Đánh gần.',
    activate: ({ fighter }) => {
      fighter.specialActive = {
        type: 'melee',
        skillId: TEMP_MELEE_SKILL_ID,
        timer: 6,
        maxTimer: 6,
        duration: 6,
      };
      return true;
    },
  };
}

describe('In-Match Special Skill Selector & Switching Framework', () => {
  afterEach(() => {
    unregisterSpecialSkill(TEMP_MELEE_SKILL_ID);
  });

  it('persists selectedSpecialByMode across form switches and supports cycle + override cast', () => {
    registerSpecialSkill(makeTempMeleeSkill());

    const loadout = createDefaultLoadout();
    // slot2 in createDefaultLoadout is melee
    const state = createMatchState(loadout, loadout, () => 0.5, false);
    const { player } = state;

    setFighterForm(state, player, 'slot2');
    const info1 = getFighterSelectedSpecialInfo(player);
    expect(info1.modeId).toBe('melee');
    expect(info1.total).toBe(2);
    expect(info1.index).toBe(0);

    // Cycle from skill 1 -> skill 2
    const cycled = cycleFighterSpecialSkill(state, player);
    expect(cycled.id).toBe(TEMP_MELEE_SKILL_ID);
    expect(getFighterSelectedSpecialInfo(player).index).toBe(1);

    // Switch to loose and back to slot2 -> melee selection stays on skill 2!
    setFighterForm(state, player, 'loose');
    expect(getFighterSelectedSpecialInfo(player).modeId).toBe('loose');
    expect(getFighterSelectedSpecialInfo(player).index).toBe(0);

    setFighterForm(state, player, 'slot2');
    expect(getFighterSelectedSpecialInfo(player).skill.id).toBe(TEMP_MELEE_SKILL_ID);
    expect(getFighterSelectedSpecialInfo(player).index).toBe(1);

    // Cast skill 2 when ready via overrideSkillId
    const castOk = triggerFighterSpecial(state, player, undefined, TEMP_MELEE_SKILL_ID);
    expect(castOk).toBe(true);
    expect(player.specialActive?.skillId).toBe(TEMP_MELEE_SKILL_ID);
    expect(player.specialCooldown).toBeGreaterThan(0);

    // Clear active buff while keeping cooldown > 0 -> override switches default quietly without casting
    player.specialActive = null;
    const defaultSkillId = getFighterSelectedSpecialInfo(player).skills[0].id;
    const castOnCd = triggerFighterSpecial(state, player, undefined, defaultSkillId);
    expect(castOnCd).toBe(false);
    expect(player.specialActive).toBeNull();
    expect(player.selectedSpecialByMode.melee).toBe(defaultSkillId);

    // Explicit setFighterSpecialSkill rejects skill from wrong mode
    expect(setFighterSpecialSkill(state, player, TEMP_MELEE_SKILL_ID, 'loose')).toBeNull();
  });

  it('computes Mobile & PC radial/pill geometry cleanly and enables rotation for special widget', () => {
    expect(isWidgetRotatable('special')).toBe(true);

    const mobCfg = createMobileHUDPreset('2-finger');
    const mobLayout = computeSmartMobileLayout(844, 390, 7, mobCfg);
    const p1 = getMobileSpecialRadialPos(mobLayout.special, mobLayout.baseScale, mobLayout.specialRotRad, 0, 2);
    const p2 = getMobileSpecialRadialPos(mobLayout.special, mobLayout.baseScale, mobLayout.specialRotRad, 1, 2);
    expect(Math.hypot(p1.x - p2.x, p1.y - p2.y)).toBeGreaterThan(20);

    const pcCfg = createDefaultPCConfig();
    const pcLayout = computeDesktopDockLayout(1280, 720, 7, false, pcCfg);
    const pills = getPCSpecialOptionRects(pcLayout.specialBtn, pcLayout.scale, 2);
    expect(pills).toHaveLength(2);
    expect(pills[0].y).toBeLessThan(pcLayout.specialBtn.y);
    expect(pills[1].x).toBeGreaterThan(pills[0].x);

    const r1 = getPCSpecialRadialPos(640, 360, 0, 2);
    const r2 = getPCSpecialRadialPos(640, 360, 1, 2);
    expect(r1.x).toBeLessThan(640);
    expect(r2.x).toBeGreaterThan(640);
  });

  it('provides cycleSpecial default keybind when sanitizing legacy PC control configs and guards formatKeyLabel', () => {
    const legacy = sanitizePCControlConfig({
      version: 1,
      keybinds: { special: 'c' },
    });
    expect(legacy.keybinds.special).toBe('c');
    expect(legacy.keybinds.cycleSpecial).toBe('v');
    expect(formatKeyLabel(undefined)).toBe('?');
    expect(formatKeyLabel(null)).toBe('?');
    expect(formatKeyLabel('v')).toBe('V');
  });
});
