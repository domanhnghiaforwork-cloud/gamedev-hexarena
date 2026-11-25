import { PLAYER_RADIUS } from '../constants';
import { clamp } from '../math/hexMath';
import { getActiveBlueprint, getActiveStance, isDefenseFortressActive } from '../world/structure';
import type {
  AttackModeId,
  CombatStance,
  Fighter,
  MatchState,
  SpecialSkillId,
  SpecialSkillKey,
} from '../types';
import { DEFENSE_ATTACK_MODE } from './defense';
import { LOOSE_ATTACK_MODE } from './loose';
import { MELEE_ATTACK_MODE } from './melee';
import { RANGED_ATTACK_MODE } from './ranged';
import type {
  ApplyHexDurabilityLossFn,
  AttackModeDefinition,
  SpecialSkillDefinition,
  SpecialSkillMeta,
  StanceMetaEntry,
} from './types';

const attackModeMap = new Map<AttackModeId, AttackModeDefinition>();
const specialSkillMap = new Map<SpecialSkillId, SpecialSkillDefinition>();

export function registerAttackMode(mode: AttackModeDefinition): void {
  attackModeMap.set(mode.id, mode);
  for (const skill of mode.specialSkills) {
    specialSkillMap.set(skill.id, skill);
  }
}

export function registerSpecialSkill(skill: SpecialSkillDefinition): void {
  specialSkillMap.set(skill.id, skill);
  const mode = attackModeMap.get(skill.modeId);
  if (mode && !mode.specialSkills.some((s) => s.id === skill.id)) {
    mode.specialSkills.push(skill);
  }
}

export function unregisterSpecialSkill(skillId: SpecialSkillId): void {
  const existing = specialSkillMap.get(skillId);
  if (!existing) return;
  specialSkillMap.delete(skillId);
  const mode = attackModeMap.get(existing.modeId);
  if (mode) {
    const idx = mode.specialSkills.findIndex((s) => s.id === skillId);
    if (idx !== -1) mode.specialSkills.splice(idx, 1);
  }
}

// Register built-in Phase 3 attack modes & special skills
registerAttackMode(LOOSE_ATTACK_MODE);
registerAttackMode(RANGED_ATTACK_MODE);
registerAttackMode(MELEE_ATTACK_MODE);
registerAttackMode(DEFENSE_ATTACK_MODE);

export function getAttackMode(modeId: AttackModeId): AttackModeDefinition | undefined {
  return attackModeMap.get(modeId);
}

export function listAttackModes(): AttackModeDefinition[] {
  return Array.from(attackModeMap.values());
}

export function listStanceModes(): AttackModeDefinition[] {
  return Array.from(attackModeMap.values()).filter((m) => m.isStance);
}

export function getSpecialSkillById(skillId: SpecialSkillId): SpecialSkillDefinition | undefined {
  return specialSkillMap.get(skillId);
}

export function getSpecialSkillsForMode(modeId: AttackModeId): SpecialSkillDefinition[] {
  return attackModeMap.get(modeId)?.specialSkills ?? [];
}

export function getDefaultSpecialSkillForMode(modeId: AttackModeId): SpecialSkillDefinition {
  const mode = attackModeMap.get(modeId);
  if (mode) {
    const byDefaultId = specialSkillMap.get(mode.defaultSpecialSkillId);
    if (byDefaultId) return byDefaultId;
    if (mode.specialSkills.length > 0) return mode.specialSkills[0];
  }
  return MELEE_ATTACK_MODE.specialSkills[0];
}

export function getFighterAttackModeId(fighter: Fighter): AttackModeId {
  if (fighter.form === 'loose') return 'loose';
  return getActiveStance(fighter) ?? 'melee';
}

export function getFighterSpecialKey(fighter: Fighter): SpecialSkillKey {
  return getFighterAttackModeId(fighter);
}

export interface FighterSpecialSelectionInfo {
  modeId: AttackModeId;
  skills: SpecialSkillDefinition[];
  skill: SpecialSkillDefinition;
  index: number;
  total: number;
}

export function resolveFighterSpecialSkill(fighter: Fighter): SpecialSkillDefinition {
  const modeId = getFighterAttackModeId(fighter);
  const chosenId = fighter.selectedSpecialByMode?.[modeId];
  if (chosenId) {
    const chosen = specialSkillMap.get(chosenId);
    if (chosen && chosen.modeId === modeId) {
      return chosen;
    }
  }
  const bp = getActiveBlueprint(fighter);
  if (bp?.specialSkillId) {
    const customSkill = specialSkillMap.get(bp.specialSkillId);
    if (customSkill && customSkill.modeId === modeId) {
      return customSkill;
    }
  }
  return getDefaultSpecialSkillForMode(modeId);
}

export function getFighterSelectedSpecialInfo(fighter: Fighter): FighterSpecialSelectionInfo {
  const modeId = getFighterAttackModeId(fighter);
  const skills = getSpecialSkillsForMode(modeId);
  const skill = resolveFighterSpecialSkill(fighter);
  const idx = skills.findIndex((s) => s.id === skill.id);
  return {
    modeId,
    skills: skills.length > 0 ? skills : [skill],
    skill,
    index: idx >= 0 ? idx : 0,
    total: Math.max(1, skills.length),
  };
}

export function setFighterSpecialSkill(
  state: MatchState,
  fighter: Fighter,
  skillId: SpecialSkillId,
  modeId?: AttackModeId,
): SpecialSkillDefinition | null {
  const targetMode = modeId ?? getFighterAttackModeId(fighter);
  const skill = specialSkillMap.get(skillId);
  if (!skill || skill.modeId !== targetMode) return null;
  if (!fighter.selectedSpecialByMode) fighter.selectedSpecialByMode = {};
  fighter.selectedSpecialByMode[targetMode] = skill.id;
  if (!fighter.isAI) state.events.push({ type: 'sfx', kind: 'uiClick' });
  return skill;
}

export function cycleFighterSpecialSkill(state: MatchState, fighter: Fighter): SpecialSkillDefinition {
  const info = getFighterSelectedSpecialInfo(fighter);
  const next = info.skills[(info.index + 1) % info.skills.length] ?? info.skill;
  if (!fighter.selectedSpecialByMode) fighter.selectedSpecialByMode = {};
  fighter.selectedSpecialByMode[info.modeId] = next.id;
  if (!fighter.isAI) state.events.push({ type: 'sfx', kind: 'uiClick' });
  return next;
}

export function executeFighterAttack(
  state: MatchState,
  fighter: Fighter,
  angle: number,
  strength = 1.0,
  applyHexDurabilityLossFn?: ApplyHexDurabilityLossFn,
): void {
  if (fighter.attackCooldown > 0 || state.matchOver) return;
  fighter.facing = angle;

  const modeId = getFighterAttackModeId(fighter);
  const mode = attackModeMap.get(modeId);
  if (!mode) return;

  mode.executeAttack({
    state,
    fighter,
    angle,
    strength,
    applyHexDurabilityLoss: applyHexDurabilityLossFn,
  });
}

export function triggerFighterSpecial(
  state: MatchState,
  fighter: Fighter,
  applyHexDurabilityLossFn?: ApplyHexDurabilityLossFn,
  overrideSkillId?: SpecialSkillId,
  aimOpts?: { angle?: number; strength?: number },
): boolean {
  if (state.matchOver) return false;

  const opp = fighter.id === 'player' ? state.enemy : state.player;
  const activeModeId = getFighterAttackModeId(fighter);
  const hasAngle = typeof aimOpts?.angle === 'number' && Number.isFinite(aimOpts.angle);
  const aimAngle = hasAngle ? aimOpts!.angle! : fighter.facing;
  const aimStrength =
    typeof aimOpts?.strength === 'number' && Number.isFinite(aimOpts.strength)
      ? clamp(aimOpts.strength, 0, 1)
      : 1.0;

  if (overrideSkillId) {
    const override = specialSkillMap.get(overrideSkillId);
    if (override && override.modeId === activeModeId) {
      if (!fighter.selectedSpecialByMode) fighter.selectedSpecialByMode = {};
      fighter.selectedSpecialByMode[activeModeId] = override.id;
    }
  }

  // Allow an already-active special skill to handle reactivation (e.g., early Counter-Pulse release)
  if (fighter.specialActive) {
    const activeSkill =
      (fighter.specialActive.skillId ? specialSkillMap.get(fighter.specialActive.skillId) : undefined) ??
      getDefaultSpecialSkillForMode(fighter.specialActive.type);
    if (activeSkill.onReactivate) {
      if (hasAngle && !isDefenseFortressActive(fighter)) {
        fighter.facing = aimAngle;
      }
      const handled = activeSkill.onReactivate({
        state,
        fighter,
        opponent: opp,
        applyHexDurabilityLoss: applyHexDurabilityLossFn,
        aimAngle,
        aimStrength,
      });
      if (handled) return true;
    }
  }

  if (fighter.specialCooldown > 0) {
    if (!fighter.isAI) {
      state.events.push({ type: 'sfx', kind: overrideSkillId ? 'uiClick' : 'cancel' });
    }
    return false;
  }

  const skill = resolveFighterSpecialSkill(fighter);
  if (hasAngle && !isDefenseFortressActive(fighter)) {
    fighter.facing = aimAngle;
  }
  const activated = skill.activate({
    state,
    fighter,
    opponent: opp,
    applyHexDurabilityLoss: applyHexDurabilityLossFn,
    aimAngle,
    aimStrength,
  });

  if (!activated) {
    if (!fighter.isAI) state.events.push({ type: 'sfx', kind: 'cancel' });
    return false;
  }

  fighter.specialCooldown = skill.cd;
  fighter.specialMaxCooldown = skill.cd;
  if (fighter.id === 'player') state.stats.playerSpecialUses[skill.modeId]++;
  else state.stats.enemySpecialUses[skill.modeId]++;

  state.events.push({
    type: 'shockwave',
    x: fighter.x,
    y: fighter.y,
    r: PLAYER_RADIUS * 0.8,
    maxR: PLAYER_RADIUS * 2.8,
    life: 0.28,
    color: skill.color,
  });
  state.events.push({
    type: 'sparks',
    x: fighter.x,
    y: fighter.y,
    color: skill.color,
    count: 14,
    speed: 240,
    size: 3.4,
  });
  state.events.push({ type: 'sfx', kind: 'special' });
  if (!fighter.isAI) state.events.push({ type: 'haptic', pattern: [16, 12, 16], target: fighter.id });
  return true;
}

export function updateActiveSpecialSkill(
  state: MatchState,
  fighter: Fighter,
  opponent: Fighter,
  dt: number,
  applyHexDurabilityLossFn?: ApplyHexDurabilityLossFn,
): void {
  if (!fighter.specialActive) return;

  const activeSkill =
    (fighter.specialActive.skillId ? specialSkillMap.get(fighter.specialActive.skillId) : undefined) ??
    getDefaultSpecialSkillForMode(fighter.specialActive.type);

  const ctx = {
    state,
    fighter,
    opponent,
    applyHexDurabilityLoss: applyHexDurabilityLossFn,
  };

  fighter.specialActive.timer -= dt;
  activeSkill.onUpdate?.(ctx, dt);

  if (fighter.specialActive && fighter.specialActive.timer <= 0) {
    if (activeSkill.onExpire) {
      activeSkill.onExpire(ctx);
    } else {
      fighter.specialActive = null;
    }
  }
}

function toSkillMeta(key: SpecialSkillKey, skill: SpecialSkillDefinition): SpecialSkillMeta {
  return {
    key,
    id: skill.id,
    name: skill.name,
    short: skill.short,
    dur: skill.dur,
    cd: skill.cd,
    ...(skill.disarmDur !== undefined ? { disarmDur: skill.disarmDur } : {}),
    color: skill.color,
    desc: skill.desc,
    ...(skill.targeting !== undefined ? { targeting: skill.targeting } : {}),
    ...(skill.aimRange !== undefined ? { aimRange: skill.aimRange } : {}),
    ...(skill.aimRadius !== undefined ? { aimRadius: skill.aimRadius } : {}),
  };
}

/** Backward-compatible map of each Attack Mode's default Special Skill metadata */
export const SPECIAL_SKILLS: Record<SpecialSkillKey, SpecialSkillMeta> = {
  loose: toSkillMeta('loose', getDefaultSpecialSkillForMode('loose')),
  ranged: toSkillMeta('ranged', getDefaultSpecialSkillForMode('ranged')),
  melee: toSkillMeta('melee', getDefaultSpecialSkillForMode('melee')),
  defense: toSkillMeta('defense', getDefaultSpecialSkillForMode('defense')),
};

/** Backward-compatible map of CombatStance UI metadata */
export const STANCE_META: Record<CombatStance, StanceMetaEntry> = {
  ranged: {
    label: RANGED_ATTACK_MODE.label,
    short: RANGED_ATTACK_MODE.short,
    color: RANGED_ATTACK_MODE.color,
    attackLabel: RANGED_ATTACK_MODE.attackLabel,
    summary: RANGED_ATTACK_MODE.summary,
  },
  melee: {
    label: MELEE_ATTACK_MODE.label,
    short: MELEE_ATTACK_MODE.short,
    color: MELEE_ATTACK_MODE.color,
    attackLabel: MELEE_ATTACK_MODE.attackLabel,
    summary: MELEE_ATTACK_MODE.summary,
  },
  defense: {
    label: DEFENSE_ATTACK_MODE.label,
    short: DEFENSE_ATTACK_MODE.short,
    color: DEFENSE_ATTACK_MODE.color,
    attackLabel: DEFENSE_ATTACK_MODE.attackLabel,
    summary: DEFENSE_ATTACK_MODE.summary,
  },
};
