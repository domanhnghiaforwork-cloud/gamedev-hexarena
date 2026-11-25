import type { AttackModeDefinition } from '../types';
import { executeMeleeAttack } from './attack';
import { PARRY_DISARM_SKILL } from './specials/parryDisarm';

export * from './attack';
export * from './specials/parryDisarm';

export const MELEE_ATTACK_MODE: AttackModeDefinition = {
  id: 'melee',
  isStance: true,
  stanceKey: 'melee',
  label: 'Đánh gần',
  short: 'ĐÁNH GẦN',
  color: '#fbbf24',
  attackLabel: 'CHÉM',
  summary: 'Vung chém vòng cung rộng trước mặt theo kích thước co giãn. Chiêu đặc biệt: Phản Chém Tước Mảnh.',
  defaultSpecialSkillId: PARRY_DISARM_SKILL.id,
  specialSkills: [PARRY_DISARM_SKILL],
  executeAttack: executeMeleeAttack,
};
