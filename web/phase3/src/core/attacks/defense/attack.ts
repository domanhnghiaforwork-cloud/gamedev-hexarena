import { isDefenseFortressActive, isDefenseHexWallActive } from '../../world/structure';
import type { AttackExecuteContext } from '../types';
import { triggerShieldCounterPulse } from './specials/counterFortress';
import { spawnHexWall } from './specials/hexWall';

export function executeDefenseAttack({ state, fighter, angle, applyHexDurabilityLoss }: AttackExecuteContext): void {
  // Defense Stance cannot attack normally; only active Defense specials trigger here:
  if (isDefenseFortressActive(fighter) && applyHexDurabilityLoss) {
    const opp = fighter.id === 'player' ? state.enemy : state.player;
    triggerShieldCounterPulse(state, fighter, opp, applyHexDurabilityLoss);
    fighter.attackCooldown = 0.35;
  } else if (isDefenseHexWallActive(fighter)) {
    spawnHexWall(state, fighter, angle);
  }
}
