import { BUILTIN_SPECIAL_SKILL_IDS, type SpecialSkillDefinition } from '../../types';

export const GRAVITY_FIELD_SKILL: SpecialSkillDefinition = {
  id: BUILTIN_SPECIAL_SKILL_IDS.LOOSE_GRAVITY_FIELD,
  modeId: 'loose',
  name: 'Trường Trọng Lực',
  short: 'TRỌNG LỰC',
  dur: 8.0,
  cd: 18.0,
  color: '#38bdf8',
  desc: 'Mở trường trọng lực phạm vi rộng (+40% so với bản cũ): làm chậm 80% mọi thực thể vật lý của địch bên trong, giữ mảnh quay ở quỹ đạo giữa trường và tăng +30% tốc quay/phóng/thu.',
  activate: ({ state, fighter }) => {
    fighter.specialActive = {
      type: 'loose',
      skillId: GRAVITY_FIELD_SKILL.id,
      timer: GRAVITY_FIELD_SKILL.dur,
      maxTimer: GRAVITY_FIELD_SKILL.dur,
      duration: GRAVITY_FIELD_SKILL.dur,
    };
    state.events.push({
      type: 'floatingText',
      x: fighter.x,
      y: fighter.y - 36,
      text: 'TRƯỜNG TRỌNG LỰC!',
      color: GRAVITY_FIELD_SKILL.color,
      scale: 1.05,
    });
    state.events.push({ type: 'sfx', kind: 'gravityField' });
    return true;
  },
  onExpire: ({ fighter }) => {
    fighter.specialActive = null;
  },
};
