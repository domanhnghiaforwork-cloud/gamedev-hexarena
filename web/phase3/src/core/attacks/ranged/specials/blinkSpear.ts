import { BASE_HEX_RADIUS, PLAYER_RADIUS } from '../../../constants';
import { dist } from '../../../math/hexMath';
import {
  constrainToHexArena,
  resolveCircleObstacle,
  segmentIntersectsAnyObstacle,
} from '../../../world/obstacles';
import {
  computeRangedKineticEnergy,
  getActiveAnchorDist,
  isDefenseFortressActive,
  isHexStolen,
  isRangedBlinkActive,
} from '../../../world/structure';
import type { Fighter, MatchState, RangedAttackAnim } from '../../../types';
import {
  BUILTIN_SPECIAL_SKILL_IDS,
  type ApplyHexDurabilityLossFn,
  type SpecialSkillDefinition,
} from '../../types';

export const BLINK_SPEAR_DURATION = 3.5;
export const BLINK_SPEAR_COOLDOWN = 16.0;
export const BLINK_SPEAR_RANGE = 620;
export const BLINK_SPEAR_PASS_DMG_MULT = 1.15;
export const BLINK_SHOCKWAVE_RADIUS = 135;
export const BLINK_SHOCKWAVE_BODY_DMG = 48;
export const BLINK_SHOCKWAVE_HEX_DMG = 35;
export const BLINK_SHOCKWAVE_KNOCKBACK = 340;

export function resolveSafeBlinkPosition(
  state: MatchState,
  x: number,
  y: number,
): { x: number; y: number } {
  const pos = { x, y };
  constrainToHexArena(pos, PLAYER_RADIUS + 6);
  for (let iter = 0; iter < 2; iter++) {
    for (const obs of state.obstacles) {
      const hit = resolveCircleObstacle(pos.x, pos.y, PLAYER_RADIUS + 4, obs);
      if (hit) {
        pos.x += hit.nx * hit.push;
        pos.y += hit.ny * hit.push;
      }
    }
    constrainToHexArena(pos, PLAYER_RADIUS + 6);
  }
  return pos;
}

export function plantBlinkSpearAt(
  state: MatchState,
  anim: RangedAttackAnim,
  x: number,
  y: number,
): void {
  const safe = resolveSafeBlinkPosition(state, x, y);
  anim.anchorX = safe.x;
  anim.anchorY = safe.y;
  anim.phase = 'blink_planted';
  anim.energy = 0;
  anim.altitude = 0;
  state.events.push({
    type: 'sparks',
    x: safe.x,
    y: safe.y,
    color: '#c084fc',
    count: 10,
    speed: 210,
    size: 2.9,
  });
  state.events.push({ type: 'sfx', kind: 'snap' });
}

export function executeBlinkToSpear(
  state: MatchState,
  fighter: Fighter,
  opponent: Fighter,
  applyHexDurabilityLossFn?: ApplyHexDurabilityLossFn,
): boolean {
  if (!isRangedBlinkActive(fighter)) return false;
  const anim = fighter.attackAnim;
  if (!anim || anim.type !== 'ranged') return false;
  if (anim.phase !== 'blink_out' && anim.phase !== 'blink_planted') return false;

  const oldX = fighter.x;
  const oldY = fighter.y;
  const dest = resolveSafeBlinkPosition(state, anim.anchorX, anim.anchorY);

  fighter.dashAfterimages.push({ x: oldX, y: oldY, life: 0.24, maxLife: 0.24 });
  fighter.dashAfterimages.push({
    x: (oldX + dest.x) * 0.5,
    y: (oldY + dest.y) * 0.5,
    life: 0.20,
    maxLife: 0.20,
  });

  state.events.push({
    type: 'shockwave',
    x: oldX,
    y: oldY,
    r: PLAYER_RADIUS * 0.6,
    maxR: PLAYER_RADIUS * 2.0,
    life: 0.20,
    color: '#c084fc',
  });

  fighter.x = dest.x;
  fighter.y = dest.y;
  fighter.vx = 0;
  fighter.vy = 0;
  fighter.kbX = 0;
  fighter.kbY = 0;
  fighter.dashTimer = 0;
  fighter.attackAnim = null;
  fighter.specialActive = null;
  fighter.attackCooldown = 0.16;

  state.events.push({
    type: 'shockwave',
    x: dest.x,
    y: dest.y,
    r: PLAYER_RADIUS * 0.8,
    maxR: BLINK_SHOCKWAVE_RADIUS,
    life: 0.28,
    color: '#c084fc',
  });
  state.events.push({
    type: 'sparks',
    x: dest.x,
    y: dest.y,
    color: '#e879f9',
    count: 16,
    speed: 280,
    size: 3.4,
  });
  state.events.push({
    type: 'floatingText',
    x: dest.x,
    y: dest.y - 34,
    text: 'BIẾN ẢNH!',
    color: '#e879f9',
    scale: 1.1,
  });
  state.events.push({ type: 'sfx', kind: 'dash' });
  state.events.push({ type: 'sfx', kind: 'special' });
  state.events.push({ type: 'shake', amount: 7.5 });
  state.hitStopTimer = Math.max(state.hitStopTimer, 0.032);
  state.events.push({ type: 'hitStop', duration: 0.032 });
  if (!fighter.isAI) {
    state.events.push({ type: 'haptic', pattern: [18, 10, 18], target: fighter.id });
  }

  // Arrival plasma shockwave damages nearby enemy hexes & enemy body
  if (applyHexDurabilityLossFn) {
    for (const dh of opponent.hexes) {
      if (dh.state === 'BROKEN' || isHexStolen(dh)) continue;
      if (dist(dest.x, dest.y, dh.x, dh.y) <= BLINK_SHOCKWAVE_RADIUS) {
        if (!segmentIntersectsAnyObstacle(state.obstacles, dest.x, dest.y, dh.x, dh.y, 0)) {
          applyHexDurabilityLossFn(state, fighter, opponent, dh, BLINK_SHOCKWAVE_HEX_DMG, true);
        }
      }
    }
  }

  const dOpp = dist(dest.x, dest.y, opponent.x, opponent.y);
  if (
    !state.matchOver &&
    dOpp <= BLINK_SHOCKWAVE_RADIUS + PLAYER_RADIUS &&
    !segmentIntersectsAnyObstacle(state.obstacles, dest.x, dest.y, opponent.x, opponent.y, 0)
  ) {
    const dmg = BLINK_SHOCKWAVE_BODY_DMG;
    opponent.hp = Math.max(0, opponent.hp - dmg);
    opponent.damageFlash = 0.22;

    const kbAng = Math.atan2(opponent.y - dest.y, opponent.x - dest.x);
    opponent.kbX += Math.cos(kbAng) * BLINK_SHOCKWAVE_KNOCKBACK;
    opponent.kbY += Math.sin(kbAng) * BLINK_SHOCKWAVE_KNOCKBACK;

    if (fighter.id === 'player') {
      state.stats.dmgDealt += dmg;
      state.stats.playerHits++;
      state.stats.playerDmgByMode.ranged += dmg;
    } else {
      state.stats.enemyDmg += dmg;
      state.stats.enemyHits++;
      state.stats.enemyDmgByMode.ranged += dmg;
    }

    state.events.push({
      type: 'floatingText',
      x: opponent.x,
      y: opponent.y - 26,
      text: `-${dmg}`,
      color: '#e879f9',
      scale: 1.05,
    });

    if (opponent.hp <= 0) {
      state.matchOver = true;
      state.winner = fighter.id;
      state.events.push({ type: 'matchEnd', playerWon: fighter.id === 'player' });
    } else if (isDefenseFortressActive(opponent) && opponent.specialActive) {
      opponent.specialActive.storedEnergy = Math.min(360, (opponent.specialActive.storedEnergy ?? 0) + 55);
    }
  }

  return true;
}

export const BLINK_SPEAR_SKILL: SpecialSkillDefinition = {
  id: BUILTIN_SPECIAL_SKILL_IDS.RANGED_BLINK_SPEAR,
  modeId: 'ranged',
  name: 'Phi Thương Biến Ảnh',
  short: 'BIẾN ẢNH',
  dur: BLINK_SPEAR_DURATION,
  cd: BLINK_SPEAR_COOLDOWN,
  color: '#c084fc',
  targeting: 'direction',
  aimRange: BLINK_SPEAR_RANGE,
  desc: 'Phi thẳng thương năng lượng tầm xa xuyên mục tiêu rồi cắm đất 3.5s. Bấm lại Ulti hoặc Đánh để dịch chuyển tức thì tới vị trí thương kèm sóng xung kích đẩy lùi!',
  activate: ({ state, fighter, aimAngle }) => {
    const assembled = fighter.hexes.filter((h) => h.state === 'ASSEMBLED');
    if (assembled.length === 0) return false;

    const launchAng = aimAngle ?? fighter.facing;
    fighter.facing = launchAng;

    const speedScale = Math.pow(fighter.currentScale, -0.5);
    const R = BASE_HEX_RADIUS * fighter.currentScale;
    const startDist = getActiveAnchorDist(fighter, R);
    const outSpeed = 1080 * speedScale;
    const initEnergy = computeRangedKineticEnergy(fighter) * 1.45;
    const sx = fighter.x + Math.cos(launchAng) * startDist;
    const sy = fighter.y + Math.sin(launchAng) * startDist;

    fighter.specialActive = {
      type: 'ranged',
      skillId: BLINK_SPEAR_SKILL.id,
      timer: BLINK_SPEAR_DURATION,
      maxTimer: BLINK_SPEAR_DURATION,
      duration: BLINK_SPEAR_DURATION,
    };

    fighter.attackAnim = {
      type: 'ranged',
      phase: 'blink_out',
      timer: 0,
      duration: 99,
      angle: launchAng,
      outSpeed,
      retSpeed: outSpeed * 1.7,
      maxDist: BLINK_SPEAR_RANGE,
      traveled: 0,
      initialEnergy: initEnergy,
      energy: initEnergy,
      ricochetTimer: 0,
      guidedHitBodyCd: 0,
      guidedStunTimer: 0,
      anchorX: sx,
      anchorY: sy,
      targetX: sx + Math.cos(launchAng) * BLINK_SPEAR_RANGE,
      targetY: sy + Math.sin(launchAng) * BLINK_SPEAR_RANGE,
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

    if (fighter.id === 'player') state.stats.playerAttacks++;
    else state.stats.enemyAttacks++;

    state.events.push({
      type: 'floatingText',
      x: fighter.x,
      y: fighter.y - 36,
      text: 'PHI THƯƠNG!',
      color: BLINK_SPEAR_SKILL.color,
      scale: 1.05,
    });
    state.events.push({ type: 'sfx', kind: 'launch' });
    return true;
  },
  onReactivate: ({ state, fighter, opponent, applyHexDurabilityLoss }) => {
    return executeBlinkToSpear(state, fighter, opponent, applyHexDurabilityLoss);
  },
  onExpire: ({ state, fighter }) => {
    fighter.specialActive = null;
    if (
      fighter.attackAnim &&
      fighter.attackAnim.type === 'ranged' &&
      (fighter.attackAnim.phase === 'blink_out' || fighter.attackAnim.phase === 'blink_planted')
    ) {
      fighter.attackAnim.phase = 'return';
      fighter.attackAnim.energy = fighter.attackAnim.initialEnergy * 0.5;
      fighter.attackAnim.hitBody = false;
      fighter.attackAnim.hitHexIds.clear();
      state.events.push({ type: 'sfx', kind: 'recall' });
    }
  },
};
