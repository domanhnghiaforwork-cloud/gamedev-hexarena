import { BASE_HEX_RADIUS } from '../../constants';
import { clamp, dist } from '../../math/hexMath';
import { constrainToHexArena } from '../../world/obstacles';
import { computeLooseKineticEnergy, getEffectiveHexStats } from '../../world/structure';
import type { Fighter, FireMode, HexEntity, MatchState } from '../../types';
import type { AttackExecuteContext } from '../types';

export function getLooseLaunchRange(strength: number): number {
  return 120 + 360 * clamp(strength, 0, 1);
}

export function launchHex(
  state: MatchState,
  fighter: Fighter,
  hex: HexEntity,
  angle: number,
  distFactor = 1.0,
  fireMode: FireMode = fighter.fireMode,
): void {
  const stats = getEffectiveHexStats(fighter, hex);
  const range = getLooseLaunchRange(distFactor);
  const looseOverdrive = fighter.specialActive?.type === 'loose' ? 1.30 : 1.0;
  const speed = 640 * stats.speedMult * looseOverdrive;

  const target = {
    x: fighter.x + Math.cos(angle) * range,
    y: fighter.y + Math.sin(angle) * range,
  };
  constrainToHexArena(target, stats.radius + 4);

  const toTx = target.x - hex.x;
  const toTy = target.y - hex.y;
  const travelDist = Math.max(8, Math.hypot(toTx, toTy));
  const flyAngle = Math.atan2(toTy, toTx);

  hex.state = 'LAUNCHED';
  hex.selected = false;
  hex.altitude = 0;
  hex.hitCooldown = 0;
  hex.autoReturn = fireMode !== 'xayah';
  hex.isAutoReturning = false;
  hex.launchSpeed = speed;
  hex.randomRoll =
    fighter.form === 'loose' && fighter.rotMode === 'random'
      ? 0.70 + Math.random() * 0.55
      : 1.0;
  const initE = computeLooseKineticEnergy(fighter, hex);
  hex.initialEnergy = initE;
  hex.energy = initE;
  hex.vx = Math.cos(flyAngle) * speed;
  hex.vy = Math.sin(flyAngle) * speed;
  hex.targetX = target.x;
  hex.targetY = target.y;
  hex.remainingDist = travelDist;
  hex.hasBounced = false;
  hex.bouncesLeft = fighter.rotMode === 'random' ? 3 : 0;
  hex.trail = [];
  if (fighter.id === 'player') state.stats.playerAttacks++;
  else state.stats.enemyAttacks++;
  state.events.push({ type: 'sfx', kind: 'launch' });
}

export function executeLooseAttack({ state, fighter, angle, strength }: AttackExecuteContext): void {
  let pool = fighter.hexes.filter((h) => h.state === 'ORBIT' && h.selected);
  if (pool.length === 0 && fighter.isAI) {
    pool = fighter.hexes.filter((h) => h.state === 'ORBIT');
  }
  if (pool.length === 0) {
    if (!fighter.isAI) {
      state.events.push({ type: 'sfx', kind: 'cancel' });
      const hasOrbit = fighter.hexes.some((h) => h.state === 'ORBIT');
      if (hasOrbit) {
        state.events.push({
          type: 'toast',
          message: `Chọn mảnh (1–${fighter.hexes.length}) hoặc bấm Chọn hết để phóng!`,
          target: fighter.id,
        });
      }
    }
    return;
  }

  if (fighter.fireMode === 'xayah') {
    launchHex(state, fighter, pool[0], angle, strength, 'xayah');
    fighter.attackCooldown = 0.14;
  } else if (fighter.fireMode === 'seq') {
    fighter.seqFireQueue = pool.map((h) => ({ hexId: h.id, angle, strength, fireMode: 'seq' }));
    fighter.seqFireTimer = 0;
    fighter.attackCooldown = 0.25;
  } else {
    const n = pool.length;
    const spread = Math.min(0.55, (n - 1) * 0.10);
    pool.forEach((h, i) => {
      const offset = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
      launchHex(state, fighter, h, angle + offset, strength, 'volley');
    });
    fighter.attackCooldown = 0.32;
  }
}

export function recallSpecificHex(state: MatchState, fighter: Fighter, hex: HexEntity): boolean {
  if (fighter.form !== 'loose') return false;
  if (hex.state !== 'PLANTED' && hex.state !== 'LAUNCHED') return false;
  hex.state = 'RECALLING';
  hex.isAutoReturning = false;
  hex.selected = true;
  hex.hitCooldown = 0;
  hex.trail = [];
  state.events.push({
    type: 'shockwave',
    x: hex.x,
    y: hex.y,
    r: BASE_HEX_RADIUS * fighter.currentScale * 0.7,
    maxR: BASE_HEX_RADIUS * fighter.currentScale * 2.4,
    life: 0.22,
    color: '#fbbf24',
  });
  state.events.push({ type: 'sfx', kind: 'recall' });
  return true;
}

export function findPlantedHexAtWorld(fighter: Fighter, wx: number, wy: number): HexEntity | null {
  if (fighter.form !== 'loose') return null;
  const hitR = BASE_HEX_RADIUS * fighter.currentScale * 1.5 + 10;
  let best: HexEntity | null = null;
  let bestD = Infinity;
  for (const h of fighter.hexes) {
    if (h.state !== 'PLANTED' && h.state !== 'LAUNCHED') continue;
    const d = dist(wx, wy, h.x, h.y);
    if (d <= hitR && d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

export function triggerSmartRecall(state: MatchState, fighter: Fighter): boolean {
  if (fighter.form !== 'loose') return false;
  const planted = fighter.hexes.filter((h) => h.state === 'PLANTED' || h.state === 'LAUNCHED');
  if (planted.length === 0) return false;

  const selectedPlanted = planted.filter((h) => h.selected);
  const toRecall = selectedPlanted.length > 0 ? selectedPlanted : planted;

  for (const h of toRecall) {
    h.state = 'RECALLING';
    h.isAutoReturning = false;
    h.selected = true;
    h.hitCooldown = 0;
    h.trail = [];
  }
  state.events.push({ type: 'sfx', kind: 'recall' });
  return true;
}

export function toggleSelectAllHexes(state: MatchState, fighter: Fighter): void {
  if (fighter.form !== 'loose') return;
  const selectable = fighter.hexes.filter((h) => h.state === 'ORBIT');
  if (selectable.length === 0) return;
  const allSelected = selectable.every((h) => h.selected);
  for (const h of selectable) {
    h.selected = !allSelected;
  }
  state.events.push({ type: 'sfx', kind: 'uiClick' });
}
