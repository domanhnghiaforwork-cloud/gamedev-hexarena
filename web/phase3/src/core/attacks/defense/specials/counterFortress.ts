import { PLAYER_RADIUS } from '../../../constants';
import { angleDiff, clamp, dist } from '../../../math/hexMath';
import { segmentIntersectsAnyObstacle } from '../../../world/obstacles';
import { isHexStolen } from '../../../world/structure';
import type { Fighter, MatchState } from '../../../types';
import { BUILTIN_SPECIAL_SKILL_IDS, type ApplyHexDurabilityLossFn, type SpecialSkillDefinition } from '../../types';

export function triggerShieldCounterPulse(
  state: MatchState,
  fighter: Fighter,
  opponent: Fighter,
  applyHexDurabilityLossFn: ApplyHexDurabilityLossFn,
): void {
  if (!fighter.specialActive || fighter.specialActive.type !== 'defense') return;
  const stored = clamp(fighter.specialActive.storedEnergy ?? 0, 0, 360);
  const prevScale = fighter.specialActive.prevScale ?? 1.5;
  fighter.specialActive = null;
  fighter.targetScale = prevScale;

  const ang = fighter.facing;
  const range = 210 + stored * 0.45;
  const halfArc = 1.12;
  const pulseDmg = Math.round(12 + stored * 0.14);
  const pulseColor = stored >= 60 ? '#fbbf24' : '#34d399';

  state.events.push({
    type: 'shockwave',
    x: fighter.x + Math.cos(ang) * (PLAYER_RADIUS + 20),
    y: fighter.y + Math.sin(ang) * (PLAYER_RADIUS + 20),
    r: 22,
    maxR: range * 0.92,
    life: 0.30,
    color: pulseColor,
  });
  state.events.push({
    type: 'sparks',
    x: fighter.x + Math.cos(ang) * 45,
    y: fighter.y + Math.sin(ang) * 45,
    color: pulseColor,
    count: 20,
    speed: 360,
    size: 4.0,
  });
  state.events.push({ type: 'sfx', kind: 'pulse' });
  state.events.push({ type: 'shake', amount: 7 + stored * 0.03 });
  if (!fighter.isAI) state.events.push({ type: 'haptic', pattern: [22, 14, 26] });

  if (fighter.id === 'player') state.stats.playerAttacks++;
  else state.stats.enemyAttacks++;

  const dOpp = dist(fighter.x, fighter.y, opponent.x, opponent.y);
  const angToOpp = Math.atan2(opponent.y - fighter.y, opponent.x - fighter.x);
  if (dOpp < range && Math.abs(angleDiff(ang, angToOpp)) <= halfArc) {
    if (!segmentIntersectsAnyObstacle(state.obstacles, fighter.x, fighter.y, opponent.x, opponent.y, 0)) {
      const kb = 390 + stored * 1.4;
      opponent.kbX += Math.cos(angToOpp) * kb;
      opponent.kbY += Math.sin(angToOpp) * kb;

      opponent.hp = Math.max(0, opponent.hp - pulseDmg);
      opponent.damageFlash = 0.24;
      if (fighter.id === 'player') {
        state.stats.dmgDealt += pulseDmg;
        state.stats.playerHits++;
        state.stats.playerDmgByMode.defense += pulseDmg;
      } else {
        state.stats.enemyDmg += pulseDmg;
        state.stats.enemyHits++;
        state.stats.enemyDmgByMode.defense += pulseDmg;
      }

      state.events.push({
        type: 'floatingText',
        x: opponent.x,
        y: opponent.y - 34,
        text: stored >= 60 ? 'PHẢN XUNG!' : 'SÓNG XUNG!',
        color: '#34d399',
        scale: 1.05,
      });
      state.events.push({
        type: 'floatingText',
        x: opponent.x,
        y: opponent.y - 14,
        text: `-${pulseDmg}`,
        color: opponent.id === 'enemy' ? '#fef08a' : '#fb7185',
        scale: 1.2,
      });
      state.hitStopTimer = Math.max(state.hitStopTimer, 0.04);
      state.events.push({ type: 'hitStop', duration: 0.04 });

      if (opponent.hp <= 0 && !state.matchOver) {
        state.matchOver = true;
        state.winner = opponent.id === 'enemy' ? 'player' : 'enemy';
        state.events.push({ type: 'matchEnd', playerWon: opponent.id === 'enemy' });
      }
    }
  }

  const hexBlastDmg = Math.round(pulseDmg * 1.35);
  for (const eh of opponent.hexes) {
    if (eh.state === 'BROKEN' || isHexStolen(eh)) continue;
    const dH = dist(fighter.x, fighter.y, eh.x, eh.y);
    const angToH = Math.atan2(eh.y - fighter.y, eh.x - fighter.x);
    if (dH < range && Math.abs(angleDiff(ang, angToH)) <= halfArc) {
      if (!segmentIntersectsAnyObstacle(state.obstacles, fighter.x, fighter.y, eh.x, eh.y, 0)) {
        applyHexDurabilityLossFn(state, fighter, opponent, eh, hexBlastDmg, true);
      }
      if (eh.state === 'LAUNCHED' || eh.state === 'PLANTED' || eh.state === 'RECALLING') {
        eh.state = 'LAUNCHED';
        eh.isAutoReturning = false;
        eh.hasBounced = true;
        eh.vx = Math.cos(angToH) * (440 + stored * 0.85);
        eh.vy = Math.sin(angToH) * (440 + stored * 0.85);
        eh.remainingDist = 180;
      }
    }
  }
}

export const COUNTER_FORTRESS_SKILL: SpecialSkillDefinition = {
  id: BUILTIN_SPECIAL_SKILL_IDS.DEFENSE_COUNTER_FORTRESS,
  modeId: 'defense',
  name: 'Pháo Đài Phản Xung',
  short: 'PHÁO ĐÀI',
  dur: 8.0,
  cd: 20.0,
  color: '#34d399',
  desc: 'Phóng to 150% nhưng giữ độ cứng của 60% (-40% tốc chạy, khóa Lướt). Tích động năng đỡ đòn rồi phóng Sóng Phản Xung (12–62 HP).',
  activate: ({ state, fighter }) => {
    const prevScale = fighter.targetScale;
    fighter.targetScale = 1.5;
    fighter.specialActive = {
      type: 'defense',
      skillId: COUNTER_FORTRESS_SKILL.id,
      timer: COUNTER_FORTRESS_SKILL.dur,
      maxTimer: COUNTER_FORTRESS_SKILL.dur,
      duration: COUNTER_FORTRESS_SKILL.dur,
      storedEnergy: 0,
      prevScale,
    };
    state.events.push({
      type: 'floatingText',
      x: fighter.x,
      y: fighter.y - 36,
      text: 'PHÁO ĐÀI PHẢN XUNG!',
      color: COUNTER_FORTRESS_SKILL.color,
      scale: 1.05,
    });
    return true;
  },
  onReactivate: ({ state, fighter, opponent, applyHexDurabilityLoss }) => {
    if (!applyHexDurabilityLoss) return false;
    triggerShieldCounterPulse(state, fighter, opponent, applyHexDurabilityLoss);
    fighter.attackCooldown = 0.35;
    return true;
  },
  onUpdate: ({ fighter }) => {
    fighter.targetScale = 1.5;
  },
  onExpire: ({ state, fighter, opponent, applyHexDurabilityLoss }) => {
    if (applyHexDurabilityLoss) {
      triggerShieldCounterPulse(state, fighter, opponent, applyHexDurabilityLoss);
    } else {
      fighter.specialActive = null;
    }
  },
};
