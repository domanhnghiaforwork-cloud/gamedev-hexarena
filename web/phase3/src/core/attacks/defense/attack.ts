import type { AttackExecuteContext } from '../types';
import { triggerShieldCounterPulse } from './specials/counterFortress';

export function executeDefenseAttack({ state, fighter, applyHexDurabilityLoss }: AttackExecuteContext): void {
  // Defense Stance is PURE DEFENSE: cannot execute a normal attack!
  // Only when Pháo Đài Phản Xung (Defense Special) is active can the player unleash the damaging Counter-Pulse.
  if (fighter.specialActive?.type === 'defense' && applyHexDurabilityLoss) {
    const opp = fighter.id === 'player' ? state.enemy : state.player;
    triggerShieldCounterPulse(state, fighter, opp, applyHexDurabilityLoss);
    fighter.attackCooldown = 0.35;
  }
}
