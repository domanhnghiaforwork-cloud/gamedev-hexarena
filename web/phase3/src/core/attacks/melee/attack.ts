import { clamp } from '../../math/hexMath';
import type { AttackExecuteContext } from '../types';

export function executeMeleeAttack({ state, fighter, angle }: AttackExecuteContext): void {
  const speedScale = Math.pow(fighter.currentScale, -0.5);
  const dur = clamp(0.30 / speedScale, 0.19, 0.42);
  const sweepHalf = 0.75 + 0.22 * fighter.currentScale;
  const isParryReady = fighter.specialActive?.type === 'melee';
  fighter.attackAnim = {
    type: 'melee',
    timer: 0,
    duration: dur,
    angle,
    startAngle: angle - sweepHalf,
    endAngle: angle + sweepHalf,
    lastSafeAngle: angle - sweepHalf,
    wallBlocked: false,
    empoweredParry: isParryReady,
    stolenCount: 0,
    hitBody: false,
    hitHexIds: new Set(),
  };
  fighter.attackCooldown = dur + 0.12;
  state.events.push({ type: 'sfx', kind: 'launch' });
}
