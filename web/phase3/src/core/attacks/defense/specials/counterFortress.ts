import { PLAYER_RADIUS } from '../../../constants';
import { angleDiff, clamp, dist } from '../../../math/hexMath';
import { segmentIntersectsAnyObstacle } from '../../../world/obstacles';
import { isHexStolen } from '../../../world/structure';
import type { Fighter, MatchState } from '../../../types';
import { BUILTIN_SPECIAL_SKILL_IDS, type ApplyHexDurabilityLossFn, type SpecialSkillDefinition } from '../../types';

export function triggerShieldMiniPulse(
  state: MatchState,
  defender: Fighter,
  attacker: Fighter,
  absorbedEnergy: number,
  applyHexDurabilityLossFn: ApplyHexDurabilityLossFn,
): boolean {
  if (state.matchOver || !defender.specialActive || defender.specialActive.type !== 'defense') {
    return false;
  }
  if ((defender.specialActive.miniPulseCd ?? 0) > 0) return false;

  defender.specialActive.miniPulseCd = 0.30;
  const miniRange = 165;
  const miniDmg = clamp(Math.round(14 + absorbedEnergy * 0.05), 14, 24);

  state.events.push({
    type: 'shockwave',
    x: defender.x,
    y: defender.y,
    r: PLAYER_RADIUS * 0.9,
    maxR: miniRange,
    life: 0.22,
    color: '#34d399',
  });
  state.events.push({
    type: 'sparks',
    x: defender.x,
    y: defender.y,
    color: '#34d399',
    count: 10,
    speed: 240,
    size: 3.0,
  });
  state.events.push({ type: 'sfx', kind: 'pulse' });
  state.events.push({ type: 'shake', amount: 3.8 });

  const dAtt = dist(defender.x, defender.y, attacker.x, attacker.y);
  if (dAtt < miniRange) {
    if (!segmentIntersectsAnyObstacle(state.obstacles, defender.x, defender.y, attacker.x, attacker.y, 0)) {
      const angToAtt = Math.atan2(attacker.y - defender.y, attacker.x - defender.x);
      attacker.kbX += Math.cos(angToAtt) * 210;
      attacker.kbY += Math.sin(angToAtt) * 210;
      attacker.hp = Math.max(0, attacker.hp - miniDmg);
      attacker.damageFlash = 0.18;

      if (defender.id === 'player') {
        state.stats.dmgDealt += miniDmg;
        state.stats.playerHits++;
        state.stats.playerDmgByMode.defense += miniDmg;
      } else {
        state.stats.enemyDmg += miniDmg;
        state.stats.enemyHits++;
        state.stats.enemyDmgByMode.defense += miniDmg;
      }

      state.events.push({
        type: 'floatingText',
        x: attacker.x,
        y: attacker.y - 26,
        text: 'XUNG PHẢN!',
        color: '#34d399',
        scale: 0.9,
      });
      state.events.push({
        type: 'floatingText',
        x: attacker.x,
        y: attacker.y - 10,
        text: `-${miniDmg}`,
        color: attacker.id === 'enemy' ? '#fef08a' : '#fb7185',
        scale: 1.0,
      });

      if (attacker.hp <= 0 && !state.matchOver) {
        state.matchOver = true;
        state.winner = attacker.id === 'enemy' ? 'player' : 'enemy';
        state.events.push({ type: 'matchEnd', playerWon: attacker.id === 'enemy' });
      }
    }
  }

  const miniHexDmg = Math.round(miniDmg * 1.15);
  for (const ah of attacker.hexes) {
    if (ah.state === 'BROKEN' || isHexStolen(ah)) continue;
    if (dist(defender.x, defender.y, ah.x, ah.y) < miniRange) {
      if (!segmentIntersectsAnyObstacle(state.obstacles, defender.x, defender.y, ah.x, ah.y, 0)) {
        applyHexDurabilityLossFn(state, defender, attacker, ah, miniHexDmg, true);
      }
    }
  }
  return true;
}

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
  const range = 290 + stored * 0.65;
  const halfArc = 1.25;
  const pulseDmg = Math.round(12 + stored * 0.14);
  const pulseColor = stored >= 60 ? '#fbbf24' : '#34d399';

  state.events.push({
    type: 'shockwave',
    x: fighter.x + Math.cos(ang) * (PLAYER_RADIUS + 20),
    y: fighter.y + Math.sin(ang) * (PLAYER_RADIUS + 20),
    r: 22,
    maxR: range * 0.96,
    life: 0.34,
    color: pulseColor,
  });
  state.events.push({
    type: 'shockwave',
    x: fighter.x + Math.cos(ang) * (PLAYER_RADIUS + 14),
    y: fighter.y + Math.sin(ang) * (PLAYER_RADIUS + 14),
    r: 14,
    maxR: range * 0.68,
    life: 0.24,
    color: '#ffffff',
  });
  state.events.push({
    type: 'sparks',
    x: fighter.x + Math.cos(ang) * 45,
    y: fighter.y + Math.sin(ang) * 45,
    color: pulseColor,
    count: 24,
    speed: 410,
    size: 4.2,
  });
  state.events.push({ type: 'sfx', kind: 'pulse' });
  state.events.push({ type: 'shake', amount: 9 + stored * 0.035 });
  if (!fighter.isAI) state.events.push({ type: 'haptic', pattern: [24, 14, 28] });

  if (fighter.id === 'player') state.stats.playerAttacks++;
  else state.stats.enemyAttacks++;

  const dOpp = dist(fighter.x, fighter.y, opponent.x, opponent.y);
  const angToOpp = Math.atan2(opponent.y - fighter.y, opponent.x - fighter.x);
  if (dOpp < range && Math.abs(angleDiff(ang, angToOpp)) <= halfArc) {
    if (!segmentIntersectsAnyObstacle(state.obstacles, fighter.x, fighter.y, opponent.x, opponent.y, 0)) {
      const kb = 580 + stored * 2.1;
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
        eh.vx = Math.cos(angToH) * (620 + stored * 1.25);
        eh.vy = Math.sin(angToH) * (620 + stored * 1.25);
        eh.remainingDist = 260;
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
  desc: 'Phóng to 150% nhưng giữ độ cứng của 60% (-40% tốc chạy, khóa Lướt). Mỗi lần bị đánh tự phát sóng xung kích nhỏ gây sát thương và kết thúc bằng Sóng Phản Xung tầm rộng đẩy lùi mạnh.',
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
      miniPulseCd: 0,
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
  onUpdate: ({ fighter }, dt) => {
    fighter.targetScale = 1.5;
    if (fighter.specialActive && (fighter.specialActive.miniPulseCd ?? 0) > 0) {
      fighter.specialActive.miniPulseCd = Math.max(0, (fighter.specialActive.miniPulseCd ?? 0) - dt);
    }
  },
  onExpire: ({ state, fighter, opponent, applyHexDurabilityLoss }) => {
    if (applyHexDurabilityLoss) {
      triggerShieldCounterPulse(state, fighter, opponent, applyHexDurabilityLoss);
    } else {
      fighter.specialActive = null;
    }
  },
};
