import { BASE_HEX_RADIUS } from '../../constants';
import { clamp } from '../../math/hexMath';
import { computeRangedKineticEnergy, getActiveAnchorDist } from '../../world/structure';
import type { AttackExecuteContext } from '../types';

export function executeRangedAttack({ state, fighter, angle, strength }: AttackExecuteContext): void {
  if (fighter.attackAnim) return;
  const speedScale = Math.pow(fighter.currentScale, -0.5);
  const R = BASE_HEX_RADIUS * fighter.currentScale;
  const startDist = getActiveAnchorDist(fighter, R);
  const outSpeed = 680 * speedScale;
  const maxDist = 320 + 260 * clamp(strength, 0.35, 1.0);
  const initEnergy = computeRangedKineticEnergy(fighter);
  const ax = fighter.x + Math.cos(angle) * startDist;
  const ay = fighter.y + Math.sin(angle) * startDist;

  fighter.attackAnim = {
    type: 'ranged',
    phase: 'out',
    timer: 0,
    duration: 99,
    angle,
    outSpeed,
    retSpeed: outSpeed * 2.0,
    maxDist,
    traveled: 0,
    initialEnergy: initEnergy,
    energy: initEnergy,
    ricochetTimer: 0,
    guidedHitBodyCd: 0,
    guidedStunTimer: 0,
    anchorX: ax,
    anchorY: ay,
    targetX: ax,
    targetY: ay,
    targetAngle: angle,
    hasCmd: false,
    cmdX: ax,
    cmdY: ay,
    cmdHoldTimer: 0,
    isManualSteer: false,
    altitude: 0,
    hitBody: false,
    hitHexIds: new Set(),
  };
  fighter.attackCooldown = 0.25;
  if (fighter.id === 'player') state.stats.playerAttacks++;
  else state.stats.enemyAttacks++;
  state.events.push({ type: 'sfx', kind: 'launch' });
}
