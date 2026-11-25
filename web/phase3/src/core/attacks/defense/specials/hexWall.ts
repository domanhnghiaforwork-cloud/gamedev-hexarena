import { BASE_HEX_RADIUS, HEX_HP_MULTIPLIER, MATERIALS } from '../../../constants';
import { constrainToHexArena, isCircleBlockedByObstacle } from '../../../world/obstacles';
import {
  HEX_WALL_LIFETIME,
  HEX_WALL_MAX_ACTIVE,
  HEX_WALL_PLACE_CD,
  computeHexWallPositions,
} from '../../../world/structure';
import type { Fighter, MatchState, SummonedWallHex } from '../../../types';
import { BUILTIN_SPECIAL_SKILL_IDS, type SpecialSkillDefinition } from '../../types';

export function spawnHexWall(state: MatchState, fighter: Fighter, angle: number): boolean {
  if (fighter.attackCooldown > 0 || state.matchOver) return false;

  const R = BASE_HEX_RADIUS;
  const positions = computeHexWallPositions(fighter.x, fighter.y, angle);
  const maxHp = Math.round(MATERIALS.base.dur * HEX_HP_MULTIPLIER);
  const hexes: SummonedWallHex[] = [];

  for (let i = 0; i < positions.length; i++) {
    const pos = { x: positions[i].x, y: positions[i].y };
    constrainToHexArena(pos, R + 4);
    if (isCircleBlockedByObstacle(state.obstacles, pos.x, pos.y, R * 0.72)) {
      continue;
    }
    hexes.push({
      id: i,
      x: pos.x,
      y: pos.y,
      hp: maxHp,
      maxHp,
      flashTimer: 0,
      broken: false,
    });
  }

  if (hexes.length === 0) {
    if (!fighter.isAI) state.events.push({ type: 'sfx', kind: 'cancel' });
    return false;
  }

  // Enforce max 4 concurrent walls per owner -> dissolve oldest wall
  const ownerWalls = state.walls.filter((w) => w.ownerId === fighter.id);
  if (ownerWalls.length >= HEX_WALL_MAX_ACTIVE) {
    const excess = ownerWalls.length - HEX_WALL_MAX_ACTIVE + 1;
    let removed = 0;
    for (let i = 0; i < state.walls.length && removed < excess; i++) {
      if (state.walls[i].ownerId === fighter.id) {
        const old = state.walls.splice(i, 1)[0];
        i--;
        removed++;
        for (const wh of old.hexes) {
          if (!wh.broken) {
            state.events.push({
              type: 'sparks',
              x: wh.x,
              y: wh.y,
              color: '#2dd4bf',
              count: 4,
              speed: 140,
              size: 2.2,
            });
          }
        }
      }
    }
  }

  const wallId = state.nextWallId++;
  state.walls.push({
    id: wallId,
    ownerId: fighter.id,
    angle,
    timer: HEX_WALL_LIFETIME,
    maxTimer: HEX_WALL_LIFETIME,
    hexes,
  });

  fighter.attackCooldown = HEX_WALL_PLACE_CD;
  fighter.facing = angle;
  if (fighter.id === 'player') state.stats.playerAttacks++;
  else state.stats.enemyAttacks++;

  const mid = hexes[Math.floor(hexes.length * 0.5)];
  state.events.push({
    type: 'shockwave',
    x: mid.x,
    y: mid.y,
    r: R * 0.8,
    maxR: R * 4.2,
    life: 0.24,
    color: '#2dd4bf',
  });
  for (const wh of hexes) {
    state.events.push({
      type: 'sparks',
      x: wh.x,
      y: wh.y,
      color: '#2dd4bf',
      count: 4,
      speed: 150,
      size: 2.4,
    });
  }
  state.events.push({ type: 'sfx', kind: 'snap' });
  if (!fighter.isAI) state.events.push({ type: 'haptic', pattern: [10], target: fighter.id });
  return true;
}

export const HEX_WALL_SKILL: SpecialSkillDefinition = {
  id: BUILTIN_SPECIAL_SKILL_IDS.DEFENSE_HEX_WALL,
  modeId: 'defense',
  name: 'Tường Lục Giác',
  short: 'ĐẶT TƯỜNG',
  dur: 8.0,
  cd: 20.0,
  color: '#2dd4bf',
  desc: 'Trong 8s, dựng tường chắn gồm 4 mảnh Base (100% cỡ/độ bền) ngay trước mặt mỗi 0.5s, tồn tại 5s, tối đa 4 tường cùng lúc và chặn cả 2 bên.',
  activate: ({ state, fighter }) => {
    fighter.specialActive = {
      type: 'defense',
      skillId: HEX_WALL_SKILL.id,
      timer: HEX_WALL_SKILL.dur,
      maxTimer: HEX_WALL_SKILL.dur,
      duration: HEX_WALL_SKILL.dur,
    };
    fighter.attackCooldown = 0;
    state.events.push({
      type: 'floatingText',
      x: fighter.x,
      y: fighter.y - 36,
      text: 'TƯỜNG LỤC GIÁC!',
      color: HEX_WALL_SKILL.color,
      scale: 1.05,
    });
    return true;
  },
  onExpire: ({ fighter }) => {
    fighter.specialActive = null;
  },
};
