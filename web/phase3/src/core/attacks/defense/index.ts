import type { AttackModeDefinition } from '../types';
import { executeDefenseAttack } from './attack';
import { COUNTER_FORTRESS_SKILL } from './specials/counterFortress';

export * from './attack';
export * from './specials/counterFortress';

export const DEFENSE_ATTACK_MODE: AttackModeDefinition = {
  id: 'defense',
  isStance: true,
  stanceKey: 'defense',
  label: 'Phòng thủ',
  short: 'PHÒNG THỦ',
  color: '#34d399',
  attackLabel: 'CHẮN',
  summary: 'Thuần phòng thủ: không thể bấm tấn công thường, chỉ xoay góc che chắn & làm trượt đòn. Chiêu đặc biệt: Pháo Đài Phản Xung (phóng sóng gây sát thương).',
  defaultSpecialSkillId: COUNTER_FORTRESS_SKILL.id,
  specialSkills: [COUNTER_FORTRESS_SKILL],
  executeAttack: executeDefenseAttack,
};
