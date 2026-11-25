import { ARENA_RADIUS, PLAYER_RADIUS } from '../../../constants';
import { axialToLocal } from '../../../math/hexMath';
import {
  RANGED_SNIPER_CONE_HALF_ANGLE,
  RANGED_SNIPER_RANGE,
  clampAngleToSniperCone,
  computeLooseKineticEnergy,
  computeRangedKineticEnergy,
  isRangedSniperActive,
  updateAdjacencyCounts,
} from '../../../world/structure';
import type { Fighter, HexEntity, MatchState } from '../../../types';
import { BUILTIN_SPECIAL_SKILL_IDS, type SpecialSkillDefinition } from '../../types';

export const SNIPER_DURATION = 10.0;
export const SNIPER_COOLDOWN = 22.0;
export const SNIPER_SHOT_COOLDOWN = 0.50;
export const SNIPER_BULLET_SPEED = 1450;
export const SNIPER_FOURTH_SPEED = 1680;
export const SNIPER_SLOW_DURATION = 0.60;
export const SNIPER_SLOW_FACTOR = 0.65;
export const SNIPER_RETURN_SPEED = 1220;

export function launchHexSniperReturn(
  hex: HexEntity,
  index: number,
  total: number,
  baseAngle: number,
): void {
  const safeTotal = Math.max(1, total);
  const ang = baseAngle + (index / safeTotal) * Math.PI * 2 + 0.35;
  const spawnDist = ARENA_RADIUS + 95;
  hex.x = Math.cos(ang) * spawnDist;
  hex.y = Math.sin(ang) * spawnDist;
  hex.vx = 0;
  hex.vy = 0;
  hex.altitude = 1.0;
  hex.state = 'SNIPER_RETURN';
  hex.sniperEmpowered = false;
  hex.trail = [];
}

export function spendSniperHex(fighter: Fighter, hex: HexEntity): void {
  hex.vx = 0;
  hex.vy = 0;
  hex.sniperEmpowered = false;
  hex.trail = [];
  if (isRangedSniperActive(fighter)) {
    hex.state = 'SNIPER_SPENT';
  } else {
    launchHexSniperReturn(hex, hex.id, Math.max(1, fighter.hexes.length), Math.atan2(hex.y, hex.x));
  }
}

export function endRangedSniperStage(
  state: MatchState,
  fighter: Fighter,
  canceled: boolean,
): void {
  if (!isRangedSniperActive(fighter)) return;
  const baseAng = (fighter.specialActive?.coneAngle ?? fighter.facing) + Math.PI * 0.25;
  fighter.specialActive = null;

  const spent = fighter.hexes.filter((h) => h.state === 'SNIPER_SPENT');
  spent.forEach((h, idx) => {
    launchHexSniperReturn(h, idx, spent.length, baseAng);
  });

  if (spent.length > 0) {
    state.events.push({ type: 'sfx', kind: 'recall' });
  }
  if (canceled) {
    state.events.push({
      type: 'floatingText',
      x: fighter.x,
      y: fighter.y - 34,
      text: 'HỦY THƯƠNG KÍCH',
      color: '#cbd5e1',
      scale: 0.92,
    });
  }
}

export function fireRangedSniperShot(
  state: MatchState,
  fighter: Fighter,
  rawAngle: number,
): boolean {
  if (fighter.attackCooldown > 0 || state.matchOver || !isRangedSniperActive(fighter) || !fighter.specialActive) {
    return false;
  }

  const assembled = fighter.hexes.filter((h) => h.state === 'ASSEMBLED');
  if (assembled.length === 0) {
    endRangedSniperStage(state, fighter, false);
    return false;
  }

  // Consume from tip/outermost hex inward, reserving root hex for last!
  assembled.sort((a, b) => {
    const aRoot = a.id === fighter.rootHexId ? 1 : 0;
    const bRoot = b.id === fighter.rootHexId ? 1 : 0;
    if (aRoot !== bRoot) return aRoot - bRoot;
    const la = axialToLocal(a.q, a.r, 1);
    const lb = axialToLocal(b.q, b.r, 1);
    return Math.hypot(lb.x, lb.y) - Math.hypot(la.x, la.y);
  });
  const hex = assembled[0];

  const shotAngle = clampAngleToSniperCone(fighter, rawAngle);
  fighter.facing = shotAngle;

  const shotNum = (fighter.specialActive.shotsFired ?? 0) + 1;
  fighter.specialActive.shotsFired = shotNum;
  const isFourth = shotNum === 4;

  const muzzleDist = PLAYER_RADIUS + 20;
  hex.x = fighter.x + Math.cos(shotAngle) * muzzleDist;
  hex.y = fighter.y + Math.sin(shotAngle) * muzzleDist;

  const spd = isFourth ? SNIPER_FOURTH_SPEED : SNIPER_BULLET_SPEED;
  hex.state = 'SNIPER_SHOT';
  hex.sniperEmpowered = isFourth;
  hex.launchSpeed = spd;
  hex.vx = Math.cos(shotAngle) * spd;
  hex.vy = Math.sin(shotAngle) * spd;
  hex.spinAngle = shotAngle;
  hex.altitude = 0;
  hex.hitCooldown = 0;
  hex.remainingDist = RANGED_SNIPER_RANGE + 140;

  const baseE = Math.max(
    computeRangedKineticEnergy(fighter),
    computeLooseKineticEnergy(fighter, hex) * 1.45,
  );
  hex.initialEnergy = baseE * (isFourth ? 2.45 : 1.45);
  hex.energy = hex.initialEnergy;
  hex.trail = [{ x: hex.x, y: hex.y }];

  fighter.attackCooldown = SNIPER_SHOT_COOLDOWN;
  fighter.recoilTimer = isFourth ? 0.24 : 0.16;
  fighter.recoilAngle = shotAngle;
  fighter.recoilAmp = isFourth ? 15 : 8.5;

  if (fighter.id === 'player') state.stats.playerAttacks++;
  else state.stats.enemyAttacks++;

  const shotColor = isFourth ? '#fbbf24' : '#e879f9';
  state.events.push({
    type: 'sparks',
    x: hex.x,
    y: hex.y,
    color: shotColor,
    count: isFourth ? 16 : 9,
    speed: isFourth ? 340 : 230,
    size: isFourth ? 4.0 : 2.9,
  });
  state.events.push({
    type: 'shockwave',
    x: hex.x,
    y: hex.y,
    r: 8,
    maxR: isFourth ? 68 : 36,
    life: isFourth ? 0.24 : 0.16,
    color: shotColor,
  });
  state.events.push({ type: 'sfx', kind: isFourth ? 'pierce' : 'launch' });
  state.events.push({ type: 'shake', amount: isFourth ? 9.5 : 4.2 });
  if (!fighter.isAI) {
    state.events.push({
      type: 'haptic',
      pattern: isFourth ? [22, 10, 24] : [12],
      target: fighter.id,
    });
  }
  if (isFourth) {
    state.events.push({
      type: 'floatingText',
      x: fighter.x,
      y: fighter.y - 34,
      text: 'PHÁT THỨ 4!',
      color: '#fbbf24',
      scale: 1.15,
    });
  }

  updateAdjacencyCounts(fighter);

  const remainingAssembled = fighter.hexes.some((h) => h.state === 'ASSEMBLED');
  if (!remainingAssembled) {
    endRangedSniperStage(state, fighter, false);
  }
  return true;
}

export const SNIPER_STAGE_SKILL: SpecialSkillDefinition = {
  id: BUILTIN_SPECIAL_SKILL_IDS.RANGED_SNIPER_STAGE,
  modeId: 'ranged',
  name: 'Thương Kích Lục Giác',
  short: 'THƯƠNG KÍCH',
  dur: SNIPER_DURATION,
  cd: SNIPER_COOLDOWN,
  color: '#e879f9',
  targeting: 'direction',
  aimRange: RANGED_SNIPER_RANGE,
  desc: 'Đứng im mở vùng bắn tỉa 64°: phóng từng mảnh Hex tốc độ cực cao làm chậm 35% (0.6s), phát thứ 4 bạo kích & xuyên giáp mạnh. Hết mảnh hoặc hủy sẽ thu hồi mảnh từ nhiều hướng ngoài sân.',
  activate: ({ state, fighter, aimAngle }) => {
    const assembled = fighter.hexes.filter((h) => h.state === 'ASSEMBLED');
    if (assembled.length === 0) return false;

    fighter.attackAnim = null;
    fighter.vx = 0;
    fighter.vy = 0;
    fighter.dashTimer = 0;

    const coneAngle = aimAngle ?? fighter.facing;
    fighter.facing = coneAngle;
    fighter.specialActive = {
      type: 'ranged',
      skillId: SNIPER_STAGE_SKILL.id,
      timer: SNIPER_DURATION,
      maxTimer: SNIPER_DURATION,
      duration: SNIPER_DURATION,
      coneAngle,
      coneHalfAngle: RANGED_SNIPER_CONE_HALF_ANGLE,
      shotsFired: 0,
      totalAmmo: assembled.length,
    };

    state.events.push({
      type: 'floatingText',
      x: fighter.x,
      y: fighter.y - 36,
      text: 'THƯƠNG KÍCH!',
      color: SNIPER_STAGE_SKILL.color,
      scale: 1.08,
    });
    return true;
  },
  onReactivate: ({ state, fighter }) => {
    endRangedSniperStage(state, fighter, true);
    return true;
  },
  onExpire: ({ state, fighter }) => {
    endRangedSniperStage(state, fighter, false);
  },
};
