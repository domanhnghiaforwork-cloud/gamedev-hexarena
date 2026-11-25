import type { AttackModeDefinition } from '../types';
import { executeLooseAttack } from './attack';
import { GRAVITY_FIELD_SKILL } from './specials/gravityField';

export * from './attack';
export * from './specials/gravityField';

export const LOOSE_ATTACK_MODE: AttackModeDefinition = {
  id: 'loose',
  isStance: false,
  label: 'Đơn lẻ',
  short: 'ĐƠN LẺ',
  color: '#38bdf8',
  attackLabel: 'PHÓNG',
  summary: 'Tách mảnh lục giác độc lập, tự xoay 3 chế độ và phóng/thu hồi linh hoạt. Chiêu đặc biệt: Trường Trọng Lực.',
  defaultSpecialSkillId: GRAVITY_FIELD_SKILL.id,
  specialSkills: [GRAVITY_FIELD_SKILL],
  executeAttack: executeLooseAttack,
};
