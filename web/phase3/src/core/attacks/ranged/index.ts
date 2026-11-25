import type { AttackModeDefinition } from '../types';
import { executeRangedAttack } from './attack';
import { GUIDED_SPEAR_SKILL } from './specials/guidedSpear';
import { SNIPER_STAGE_SKILL } from './specials/sniperStage';

export * from './attack';
export * from './specials/guidedSpear';
export * from './specials/sniperStage';

export const RANGED_ATTACK_MODE: AttackModeDefinition = {
  id: 'ranged',
  isStance: true,
  stanceKey: 'ranged',
  label: 'Đánh xa',
  short: 'ĐÁNH XA',
  color: '#c084fc',
  attackLabel: 'PHI',
  summary:
    'Phi thẳng cả khối vũ khí theo hướng ngắm rồi bay về 2× tốc độ (50% sát thương). Chiêu đặc biệt: Ngự Thương Độc Lập / Thương Kích Lục Giác.',
  defaultSpecialSkillId: GUIDED_SPEAR_SKILL.id,
  specialSkills: [GUIDED_SPEAR_SKILL, SNIPER_STAGE_SKILL],
  executeAttack: executeRangedAttack,
};
