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
import {
  createIdleSpecialRadialState,
  startMobileSpecialPress,
  stepMobileSpecialMove,
} from '@input/specialGesture';
import {
  createDefaultPCConfig,
  createMobileHUDPreset,
  formatKeyLabel,
  sanitizeMobileHUDConfig,
  sanitizePCControlConfig,
} from '@storage/profiles';

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

  it('tightens Mobile radial petals, places Lock chip cleanly without overlap, and preserves specialSelectorLocked', () => {
    const cfg = createMobileHUDPreset('2-finger');
    expect(cfg.specialSelectorLocked).toBe(false);
    cfg.specialSelectorLocked = true;
    const sanitized = sanitizeMobileHUDConfig(cfg);
    expect(sanitized.specialSelectorLocked).toBe(true);

    for (const vp of [
      { vw: 568, vh: 320 },
      { vw: 844, vh: 390 },
      { vw: 1024, vh: 768 },
    ]) {
      const layout = computeSmartMobileLayout(vp.vw, vp.vh, 7, sanitized);
      expect(layout.specialLockLocked).toBe(true);
      const p1 = getMobileSpecialRadialPos(layout.special, layout.baseScale, layout.specialRotRad, 0, 2);
      const p2 = getMobileSpecialRadialPos(layout.special, layout.baseScale, layout.specialRotRad, 1, 2);

      // Tight radial hugs close to the Ulti button without colliding with each other
      const distToSpecial = Math.hypot(p1.x - layout.special.cx, p1.y - layout.special.cy);
      expect(distToSpecial).toBeCloseTo(layout.special.r + 30 * layout.baseScale, 3);
      expect(Math.hypot(p1.x - p2.x, p1.y - p2.y)).toBeGreaterThan(p1.r + p2.r + 2);

      // Lock chip has clean clearance from Form button and radial petals
      const dLockToForm = Math.hypot(layout.specialLock.cx - layout.form.cx, layout.specialLock.cy - layout.form.cy);
      expect(dLockToForm).toBeGreaterThan(layout.specialLock.r + layout.form.r + 4);
      const dLockToP1 = Math.hypot(layout.specialLock.cx - p1.x, layout.specialLock.cy - p1.y);
      expect(dLockToP1).toBeGreaterThan(layout.specialLock.r + p1.r + 2);
    }
  });

  it('passes aimAngle and aimStrength into SpecialSkillContext and launches Guided Spear along aimed angle', () => {
    const loadout = createDefaultLoadout();
    const state = createMatchState(loadout, loadout, () => 0.5, false);
    const { player } = state;
    // slot1 in createDefaultLoadout is ranged
    setFighterForm(state, player, 'slot1');

    const targetAngle = -Math.PI * 0.65;
    const castOk = triggerFighterSpecial(state, player, undefined, undefined, {
      angle: targetAngle,
      strength: 0.85,
    });
    expect(castOk).toBe(true);
    expect(player.facing).toBeCloseTo(targetAngle, 5);
    expect(player.attackAnim?.type).toBe('ranged');
    if (player.attackAnim?.type === 'ranged') {
      expect(player.attackAnim.phase).toBe('guided');
      expect(player.attackAnim.angle).toBeCloseTo(targetAngle, 5);
    }
  });

  it('executes Mobile tight-select -> lock -> Dynamic Pivot aim -> Cancel Cách B re-select, and Lock-bypass flow', () => {
    const cfg = createMobileHUDPreset('2-finger');
    const layout = computeSmartMobileLayout(844, 390, 7, cfg);
    const skills = [{ id: 'loose:gravity_field' }, { id: 'loose:prism_web' }];
    const p1 = getMobileSpecialRadialPos(layout.special, layout.baseScale, layout.specialRotRad, 0, 2);
    const p2 = getMobileSpecialRadialPos(layout.special, layout.baseScale, layout.specialRotRad, 1, 2);

    // 1. Unlocked: press -> drag out -> enter 'selecting' -> touch petal 0 -> lock & set Dynamic Pivot at p1
    const sr = createIdleSpecialRadialState();
    startMobileSpecialPress(sr, {
      pointerId: 1,
      layout,
      modeId: 'loose',
      selectedIndex: 0,
      selectedSkillId: skills[0].id,
      skillCount: skills.length,
      selectorLocked: false,
      defaultFacing: 0,
      nowMs: 1000,
    });
    expect(sr.phase).toBe('pending');

    // Drag onto petal 0 directly -> opens selecting and locks skill 0 with pivot at p1
    const lockRes = stepMobileSpecialMove(sr, {
      px: p1.x,
      py: p1.y,
      nowMs: 1050,
      layout,
      skills,
      selectedIndex: 0,
      selectedSkillId: skills[0].id,
      selectorLocked: false,
      defaultFacing: 0,
      canRotateFacing: true,
    });
    expect(lockRes.lockedNow).toBe(true);
    expect(sr.phase).toBe('aiming');
    expect(sr.lockedSkillId).toBe(skills[0].id);
    expect(sr.pivotX).toBeCloseTo(p1.x, 4);
    expect(sr.pivotY).toBeCloseTo(p1.y, 4);

    // 2. Continue dragging relative to Dynamic Pivot -> rotates aimAngle without losing lock
    const aimRes = stepMobileSpecialMove(sr, {
      px: p1.x,
      py: p1.y + 38,
      nowMs: 1120,
      layout,
      skills,
      selectedIndex: 0,
      selectedSkillId: skills[0].id,
      selectorLocked: false,
      defaultFacing: 0,
      canRotateFacing: true,
    });
    expect(sr.phase).toBe('aiming');
    expect(sr.aimMoved).toBe(true);
    expect(sr.aimAngle).toBeCloseTo(Math.PI * 0.5, 3);
    expect(aimRes.nextFacing).toBeCloseTo(Math.PI * 0.5, 3);

    // 3. Cách B: Drag into Cancel X zone -> arms reselect ('reselect_armed', cancelHovered = true)
    const armRes = stepMobileSpecialMove(sr, {
      px: layout.cancel.cx,
      py: layout.cancel.cy,
      nowMs: 1200,
      layout,
      skills,
      selectedIndex: 0,
      selectedSkillId: skills[0].id,
      selectorLocked: false,
      defaultFacing: 0,
      canRotateFacing: true,
    });
    expect(armRes.cancelHovered).toBe(true);
    expect(sr.phase).toBe('reselect_armed');

    // 4. Drag back out of Cancel X -> smoothly re-opens 'selecting' without lifting finger, then lock petal 1!
    const unlockRes = stepMobileSpecialMove(sr, {
      px: layout.special.cx,
      py: layout.special.cy,
      nowMs: 1260,
      layout,
      skills,
      selectedIndex: 0,
      selectedSkillId: skills[0].id,
      selectorLocked: false,
      defaultFacing: 0,
      canRotateFacing: true,
    });
    expect(unlockRes.unlockedToSelect).toBe(true);
    expect(unlockRes.cancelHovered).toBe(false);
    expect(sr.phase).toBe('selecting');
    expect(sr.lockedSkillId).toBeNull();

    // After unlock debounce (120ms), dragging onto petal 1 locks skill 1 with pivot at p2
    const relockRes = stepMobileSpecialMove(sr, {
      px: p2.x,
      py: p2.y,
      nowMs: 1400,
      layout,
      skills,
      selectedIndex: 0,
      selectedSkillId: skills[0].id,
      selectorLocked: false,
      defaultFacing: 0,
      canRotateFacing: true,
    });
    expect(relockRes.lockedNow).toBe(true);
    expect(sr.phase).toBe('aiming');
    expect(sr.lockedSkillId).toBe(skills[1].id);
    expect(sr.pivotX).toBeCloseTo(p2.x, 4);

    // 5. Locked toggle ON: dragging Ulti bypasses 'selecting' and enters 'aiming' directly at Ulti center
    const srLocked = createIdleSpecialRadialState();
    startMobileSpecialPress(srLocked, {
      pointerId: 2,
      layout,
      modeId: 'loose',
      selectedIndex: 1,
      selectedSkillId: skills[1].id,
      skillCount: skills.length,
      selectorLocked: true,
      defaultFacing: 0,
      nowMs: 2000,
    });
    const directAimRes = stepMobileSpecialMove(srLocked, {
      px: layout.special.cx + 32,
      py: layout.special.cy,
      nowMs: 2040,
      layout,
      skills,
      selectedIndex: 1,
      selectedSkillId: skills[1].id,
      selectorLocked: true,
      defaultFacing: 0,
      canRotateFacing: true,
    });
    expect(srLocked.phase).toBe('aiming');
    expect(srLocked.lockedSkillId).toBe(skills[1].id);
    expect(srLocked.pivotX).toBeCloseTo(layout.special.cx, 4);
    expect(directAimRes.nextFacing).toBeCloseTo(0, 3);
  });
});
