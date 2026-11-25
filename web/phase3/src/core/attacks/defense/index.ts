import type { AttackModeDefinition } from '../types';
import { executeDefenseAttack } from './attack';
import { COUNTER_FORTRESS_SKILL } from './specials/counterFortress';
import { HEX_WALL_SKILL } from './specials/hexWall';

export * from './attack';
export * from './specials/counterFortress';
export * from './specials/hexWall';

export const DEFENSE_ATTACK_MODE: AttackModeDefinition = {
  id: 'defense',
  isStance: true,
  stanceKey: 'defense',
  label: 'Phòng thủ',
  short: 'PHÒNG THỦ',
  color: '#34d399',
  attackLabel: 'CHẮN',
  summary:
    'Thuần phòng thủ: xoay góc che chắn & làm trượt đòn. Chiêu đặc biệt: Pháo Đài Phản Xung / Tường Lục Giác.',
  defaultSpecialSkillId: COUNTER_FORTRESS_SKILL.id,
  specialSkills: [COUNTER_FORTRESS_SKILL, HEX_WALL_SKILL],
  executeAttack: executeDefenseAttack,
};
