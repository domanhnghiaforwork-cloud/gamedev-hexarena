import { isHexStolen, runStructuralBFSAndReassemble } from '../../../world/structure';
import type { Fighter, HexEntity, MatchState } from '../../../types';
import { BUILTIN_SPECIAL_SKILL_IDS, type SpecialSkillDefinition } from '../../types';

export const PARRY_DISARM_SKILL: SpecialSkillDefinition = {
  id: BUILTIN_SPECIAL_SKILL_IDS.MELEE_PARRY_DISARM,
  modeId: 'melee',
  name: 'Phản Chém Tước Mảnh',
  short: 'PHẢN TƯỚC',
  dur: 8.0,
  cd: 20.0,
  disarmDur: 4.5,
  color: '#fbbf24',
  desc: 'Tự phóng to 150% nhưng giữ độ bền/độ cứng chuẩn 100%; mọi nhát chém trong 8s có thể bật ngược & chiếm mảnh đơn địch (4.5s) hoặc tước 1 mảnh vũ khí ghép của địch.',
  activate: ({ state, fighter }) => {
    const prevScale = fighter.targetScale;
    fighter.targetScale = 1.5;
    fighter.specialActive = {
      type: 'melee',
      skillId: PARRY_DISARM_SKILL.id,
      timer: PARRY_DISARM_SKILL.dur,
      maxTimer: PARRY_DISARM_SKILL.dur,
      duration: PARRY_DISARM_SKILL.dur,
      consumed: false,
      prevScale,
    };
    state.events.push({
      type: 'floatingText',
      x: fighter.x,
      y: fighter.y - 36,
      text: 'PHẢN CHÉM TƯỚC MẢNH!',
      color: PARRY_DISARM_SKILL.color,
      scale: 1.05,
    });
    return true;
  },
  onUpdate: ({ fighter }) => {
    fighter.targetScale = 1.5;
  },
  onExpire: ({ fighter }) => {
    const prevScale = fighter.specialActive?.prevScale;
    fighter.specialActive = null;
    if (prevScale) {
      fighter.targetScale = prevScale;
    }
  },
};

export function performMeleeParrySteal(
  state: MatchState,
  att: Fighter,
  def: Fighter,
  dh: HexEntity,
): boolean {
  const anim = att.attackAnim;
  if (!anim || anim.type !== 'melee' || !anim.empoweredParry) return false;
  const disarmDur = PARRY_DISARM_SKILL.disarmDur ?? 4.5;

  if (dh.state === 'ASSEMBLED') {
    if (anim.stolenCount >= 1) return false;
    const assembled = def.hexes.filter((h) => h.state === 'ASSEMBLED');
    if (assembled.length === 0) return false;
    const nonRoot = assembled.filter((h) => h.id !== def.rootHexId);
    const pool = nonRoot.length > 0 ? nonRoot : assembled;
    const victim = pool[Math.floor(Math.random() * pool.length)];

    const knockAng = Math.atan2(victim.y - att.y, victim.x - att.x) + (Math.random() - 0.5) * 0.35;
    victim.state = 'STOLEN_FLY';
    victim.stolenById = att.id;
    victim.stolenTimer = disarmDur;
    victim.selected = false;
    victim.altitude = 0;
    victim.vx = Math.cos(knockAng) * 560;
    victim.vy = Math.sin(knockAng) * 560;
    victim.remainingDist = 195;
    victim.hitCooldown = 0.08;
    victim.trail = [];

    anim.stolenCount++;
    runStructuralBFSAndReassemble(def, state.events, true);
    state.events.push({ type: 'sparks', x: victim.x, y: victim.y, color: '#fbbf24', count: 16, speed: 300, size: 3.6 });
    state.events.push({ type: 'shockwave', x: victim.x, y: victim.y, r: 12, maxR: 68, life: 0.25, color: '#fbbf24' });
    state.events.push({ type: 'floatingText', x: victim.x, y: victim.y - 24, text: 'TƯỚC MẢNH!', color: '#fbbf24', scale: 1.15 });
    state.hitStopTimer = Math.max(state.hitStopTimer, 0.048);
    state.events.push({ type: 'hitStop', duration: 0.048 });
    state.events.push({ type: 'shake', amount: 8 });
    state.events.push({ type: 'sfx', kind: 'pierce' });
    if (!att.isAI) state.events.push({ type: 'haptic', pattern: [20, 14, 22], target: att.id });
    return true;
  } else {
    if (anim.stolenCount >= 3 || isHexStolen(dh)) return false;
    const reflAng = Math.atan2(def.y - dh.y, def.x - dh.x) + (Math.random() - 0.5) * 0.28;
    dh.state = 'STOLEN_FLY';
    dh.stolenById = att.id;
    dh.stolenTimer = disarmDur;
    dh.selected = false;
    dh.altitude = 0;
    dh.vx = Math.cos(reflAng) * 640;
    dh.vy = Math.sin(reflAng) * 640;
    dh.remainingDist = 250;
    dh.hitCooldown = 0.06;
    dh.trail = [];

    anim.stolenCount++;
    state.events.push({ type: 'sparks', x: dh.x, y: dh.y, color: '#fbbf24', count: 14, speed: 280, size: 3.4 });
    state.events.push({ type: 'shockwave', x: dh.x, y: dh.y, r: 10, maxR: 58, life: 0.22, color: '#fbbf24' });
    state.events.push({ type: 'floatingText', x: dh.x, y: dh.y - 20, text: 'PHẢN TƯỚC!', color: '#fbbf24', scale: 1.1 });
    state.hitStopTimer = Math.max(state.hitStopTimer, 0.042);
    state.events.push({ type: 'hitStop', duration: 0.042 });
    state.events.push({ type: 'shake', amount: 7 });
    state.events.push({ type: 'sfx', kind: 'pierce' });
    if (!att.isAI) state.events.push({ type: 'haptic', pattern: [18, 12, 18], target: att.id });
    return true;
  }
}
