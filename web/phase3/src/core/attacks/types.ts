import type {
  AttackModeId,
  CombatStance,
  Fighter,
  HexEntity,
  MatchState,
  SpecialSkillId,
  SpecialSkillKey,
} from '../types';

export type ApplyHexDurabilityLossFn = (
  state: MatchState,
  attacker: Fighter | null,
  defender: Fighter,
  defHex: HexEntity,
  amount: number,
  showNumber?: boolean,
) => boolean;

export interface AttackExecuteContext {
  state: MatchState;
  fighter: Fighter;
  angle: number;
  strength: number;
  applyHexDurabilityLoss?: ApplyHexDurabilityLossFn;
}

export type SpecialTargetingMode = 'instant' | 'direction' | 'ground';

export interface SpecialSkillContext {
  state: MatchState;
  fighter: Fighter;
  opponent: Fighter;
  applyHexDurabilityLoss?: ApplyHexDurabilityLossFn;
  aimAngle?: number;
  aimStrength?: number;
}

export interface SpecialSkillMeta {
  key: SpecialSkillKey;
  id?: SpecialSkillId;
  name: string;
  short: string;
  dur: number;
  cd: number;
  disarmDur?: number;
  color: string;
  desc: string;
  targeting?: SpecialTargetingMode;
  aimRange?: number;
  aimRadius?: number;
}

export interface SpecialSkillDefinition {
  id: SpecialSkillId;
  modeId: AttackModeId;
  name: string;
  short: string;
  dur: number;
  cd: number;
  disarmDur?: number;
  color: string;
  desc: string;
  targeting?: SpecialTargetingMode;
  aimRange?: number;
  aimRadius?: number;
  /** Activates the skill. Return false to abort activation without consuming cooldown. */
  activate: (ctx: SpecialSkillContext) => boolean;
  /** Optional handler when pressing Special again while this skill is already active. */
  onReactivate?: (ctx: SpecialSkillContext) => boolean;
  /** Optional per-tick update while active. */
  onUpdate?: (ctx: SpecialSkillContext, dt: number) => void;
  /** Optional expiration hook when active timer reaches 0. */
  onExpire?: (ctx: SpecialSkillContext) => void;
}

export interface StanceMetaEntry {
  label: string;
  short: string;
  color: string;
  attackLabel: string;
  summary: string;
}

export interface AttackModeDefinition {
  id: AttackModeId;
  isStance: boolean;
  stanceKey?: CombatStance;
  label: string;
  short: string;
  color: string;
  attackLabel: string;
  summary: string;
  defaultSpecialSkillId: SpecialSkillId;
  specialSkills: SpecialSkillDefinition[];
  executeAttack: (ctx: AttackExecuteContext) => void;
}

export const BUILTIN_SPECIAL_SKILL_IDS = {
  LOOSE_GRAVITY_FIELD: 'loose:gravity_field',
  LOOSE_PRISM_WEB: 'loose:prism_web',
  RANGED_GUIDED_SPEAR: 'ranged:guided_spear',
  RANGED_SNIPER_STAGE: 'ranged:sniper_stage',
  MELEE_PARRY_DISARM: 'melee:parry_disarm',
  DEFENSE_COUNTER_FORTRESS: 'defense:counter_fortress',
  DEFENSE_HEX_WALL: 'defense:hex_wall',
} as const;
