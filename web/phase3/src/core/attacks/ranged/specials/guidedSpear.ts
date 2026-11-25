import { BASE_HEX_RADIUS } from '../../../constants';
import { clamp } from '../../../math/hexMath';
import { constrainToHexArena } from '../../../world/obstacles';
import { computeRangedKineticEnergy, getActiveAnchorDist } from '../../../world/structure';
import type { Fighter, MatchState } from '../../../types';
import { BUILTIN_SPECIAL_SKILL_IDS, type SpecialSkillDefinition } from '../../types';

export function issueGuidedWaypoint(
  state: MatchState,
  fighter: Fighter,
  wx: number,
  wy: number,
  withRipple = true,
): boolean {
  const anim = fighter.attackAnim;
  if (!anim || anim.type !== 'ranged' || anim.phase !== 'guided') return false;
  const R = BASE_HEX_RADIUS * fighter.currentScale;
  const pt = { x: wx, y: wy };
  constrainToHexArena(pt, R * 1.6 + 8);
  anim.hasCmd = true;
  anim.cmdX = pt.x;
  anim.cmdY = pt.y;
  anim.cmdHoldTimer = 0;

  if (withRipple) {
    state.events.push({
      type: 'shockwave',
      x: pt.x,
      y: pt.y,
      r: 8,
      maxR: 38,
      life: 0.24,
      color: '#c084fc',
    });
    state.events.push({ type: 'sfx', kind: 'uiClick' });
  }
  return true;
}

export function clearGuidedWaypoint(state: MatchState, fighter: Fighter): boolean {
  const anim = fighter.attackAnim;
  if (!anim || anim.type !== 'ranged' || anim.phase !== 'guided' || !anim.hasCmd) return false;
  anim.hasCmd = false;
  state.events.push({ type: 'sfx', kind: 'uiClick' });
  return true;
}

export const GUIDED_SPEAR_SKILL: SpecialSkillDefinition = {
  id: BUILTIN_SPECIAL_SKILL_IDS.RANGED_GUIDED_SPEAR,
  modeId: 'ranged',
  name: 'Ngự Thương Độc Lập',
  short: 'NGỰ THƯƠNG',
  dur: 8.0,
  cd: 20.0,
  color: '#c084fc',
  desc: 'Tách vũ khí bay tự do (tốc ~0.56× dễ lái, +35% sát thương). Click bay qua điểm (PC) / kéo hướng lái (Mobile) hoặc Tự động săn địch.',
  activate: ({ state, fighter }) => {
    const assembled = fighter.hexes.filter((h) => h.state === 'ASSEMBLED');
    if (assembled.length === 0) {
      return false;
    }

    const speedScale = Math.pow(fighter.currentScale, -0.5);
    const R = BASE_HEX_RADIUS * fighter.currentScale;
    const startDist = getActiveAnchorDist(fighter, R);
    const baseOutSpeed = 680 * speedScale;
    const guidedSpeed = clamp(baseOutSpeed * 0.56, 320, 440);
    const initEnergy = computeRangedKineticEnergy(fighter) * 1.35;

    fighter.specialActive = {
      type: 'ranged',
      skillId: GUIDED_SPEAR_SKILL.id,
      timer: GUIDED_SPEAR_SKILL.dur,
      maxTimer: GUIDED_SPEAR_SKILL.dur,
      duration: GUIDED_SPEAR_SKILL.dur,
    };

    if (fighter.attackAnim && fighter.attackAnim.type === 'ranged') {
      const anim = fighter.attackAnim;
      anim.phase = 'guided';
      anim.guidedSpeed = guidedSpeed;
      anim.retSpeed = baseOutSpeed * 2.0;
      anim.initialEnergy = initEnergy;
      anim.energy = initEnergy;
      anim.guidedHitBodyCd = 0;
      anim.guidedStunTimer = 0;
      anim.targetX = anim.anchorX + Math.cos(anim.angle) * 140;
      anim.targetY = anim.anchorY + Math.sin(anim.angle) * 140;
      anim.targetAngle = anim.angle;
      anim.hasCmd = false;
      anim.cmdX = anim.anchorX;
      anim.cmdY = anim.anchorY;
      anim.cmdHoldTimer = 0;
      anim.isManualSteer = false;
      anim.hitBody = false;
      anim.hitHexIds.clear();
    } else {
      const launchAng = fighter.facing;
      const sx = fighter.x + Math.cos(launchAng) * startDist;
      const sy = fighter.y + Math.sin(launchAng) * startDist;
      fighter.attackAnim = {
        type: 'ranged',
        phase: 'guided',
        timer: 0,
        duration: 99,
        angle: launchAng,
        outSpeed: baseOutSpeed,
        guidedSpeed,
        retSpeed: baseOutSpeed * 2.0,
        maxDist: 9999,
        traveled: 0,
        initialEnergy: initEnergy,
        energy: initEnergy,
        ricochetTimer: 0,
        guidedHitBodyCd: 0,
        guidedStunTimer: 0,
        anchorX: sx,
        anchorY: sy,
        targetX: sx + Math.cos(launchAng) * 140,
        targetY: sy + Math.sin(launchAng) * 140,
        targetAngle: launchAng,
        hasCmd: false,
        cmdX: sx,
        cmdY: sy,
        cmdHoldTimer: 0,
        isManualSteer: false,
        altitude: 0,
        hitBody: false,
        hitHexIds: new Set(),
      };
    }

    state.events.push({
      type: 'floatingText',
      x: fighter.x,
      y: fighter.y - 36,
      text: 'NGỰ THƯƠNG!',
      color: GUIDED_SPEAR_SKILL.color,
      scale: 1.05,
    });
    return true;
  },
  onExpire: ({ state, fighter }) => {
    fighter.specialActive = null;
    if (fighter.attackAnim && fighter.attackAnim.type === 'ranged' && fighter.attackAnim.phase === 'guided') {
      fighter.attackAnim.phase = 'return';
      fighter.attackAnim.energy = fighter.attackAnim.initialEnergy * 0.5;
      fighter.attackAnim.hitBody = false;
      fighter.attackAnim.hitHexIds.clear();
      state.events.push({ type: 'sfx', kind: 'recall' });
    }
  },
};
