import { BASE_HEX_RADIUS, DASH_COOLDOWN, PLAYER_RADIUS } from '@core/constants';
import { applyHexDurabilityLoss } from '@core/combat';
import { angleDiff, clamp, dist } from '@core/hexMath';
import {
  executeFighterAttack,
  executeFighterDash,
  setFighterForm,
  setFighterScale,
  triggerFighterSpecial,
  triggerSmartRecall,
} from '@core/skills';
import { getActiveStance } from '@core/structure';
import type { CombatStance, MatchState, SlotKey } from '@core/types';

function findSlotByStance(state: MatchState, stance: CombatStance): SlotKey | null {
  const keys: SlotKey[] = ['slot1', 'slot2', 'slot3'];
  for (const k of keys) {
    if (state.enemy.loadout.blueprints[k].stance === stance) return k;
  }
  return null;
}

export function updateBotAI(state: MatchState, dt: number): void {
  if (state.matchOver) return;
  const { enemy, player, obstacles } = state;

  const dToPlayer = dist(enemy.x, enemy.y, player.x, player.y);
  const angToPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);

  enemy.aiTimer -= dt;
  enemy.aiActionTimer -= dt;

  // Smooth facing toward player when not mid-slash (capped turn speed during Defense Fortress)
  if (!enemy.attackAnim) {
    const diff = angleDiff(enemy.facing, angToPlayer);
    if (enemy.specialActive?.type === 'defense') {
      enemy.facing += clamp(diff, -3.4 * dt, 3.4 * dt);
    } else {
      enemy.facing += diff * Math.min(1, dt * 8);
    }
  }

  const playerStance = getActiveStance(player);
  const enemyStance = getActiveStance(enemy);

  if (enemy.aiTimer <= 0) {
    enemy.aiTimer = 1.6 + Math.random() * 1.4;
    enemy.aiStrafeDir = Math.random() < 0.5 ? -1 : 1;

    const intactCount = enemy.hexes.filter((h) => h.state !== 'BROKEN').length;
    const playerThreatClose = dToPlayer < 220 && (playerStance === 'melee' || playerStance === 'defense');
    const defenseSlot = findSlotByStance(state, 'defense');
    const meleeSlot = findSlotByStance(state, 'melee');
    const rangedSlot = findSlotByStance(state, 'ranged');

    if (intactCount <= Math.max(2, Math.floor(enemy.hexes.length * 0.42))) {
      setFighterForm(state, enemy, 'loose');
      enemy.rotMode = 'random';
      setFighterScale(state, enemy, 1.0);
    } else if (playerThreatClose && defenseSlot && Math.random() < 0.55) {
      setFighterForm(state, enemy, defenseSlot);
      setFighterScale(state, enemy, player.targetScale <= 0.7 ? 0.6 : 1.5);
    } else if (dToPlayer < 220 && meleeSlot && Math.random() < 0.55) {
      setFighterForm(state, enemy, meleeSlot);
      setFighterScale(state, enemy, Math.random() < 0.45 ? 0.6 : 1.0);
    } else if (dToPlayer >= 220 && dToPlayer < 520 && rangedSlot && Math.random() < 0.55) {
      setFighterForm(state, enemy, rangedSlot);
      setFighterScale(state, enemy, Math.random() < 0.7 ? 0.6 : 1.0);
    } else {
      setFighterForm(state, enemy, 'loose');
      enemy.rotMode = Math.random() < 0.6 ? 'normal' : 'random';
      enemy.fireMode = Math.random() < 0.5 ? 'xayah' : Math.random() < 0.5 ? 'seq' : 'volley';
      setFighterScale(state, enemy, Math.random() < 0.5 ? 0.6 : 1.0);
    }
  }

  // Movement spacing & obstacle/planted avoidance
  const idealDist = enemyStance === 'ranged' ? 350 : enemy.form === 'loose' ? 290 : 145;
  let moveX = 0;
  let moveY = 0;
  if (dToPlayer > idealDist + 40) {
    moveX += Math.cos(angToPlayer);
    moveY += Math.sin(angToPlayer);
  } else if (dToPlayer < idealDist - 45) {
    moveX -= Math.cos(angToPlayer);
    moveY -= Math.sin(angToPlayer);
  }
  moveX += Math.cos(angToPlayer + (Math.PI / 2) * enemy.aiStrafeDir) * 0.78;
  moveY += Math.sin(angToPlayer + (Math.PI / 2) * enemy.aiStrafeDir) * 0.78;

  for (const obs of obstacles) {
    const od = dist(enemy.x, enemy.y, obs.x, obs.y);
    if (od < obs.boundR + PLAYER_RADIUS + 55) {
      const away = Math.atan2(enemy.y - obs.y, enemy.x - obs.x);
      moveX += Math.cos(away) * 1.5;
      moveY += Math.sin(away) * 1.5;
    }
  }

  const pHexR = BASE_HEX_RADIUS * player.currentScale;
  for (const ph of player.hexes) {
    if (ph.state !== 'PLANTED') continue;
    const pd = dist(enemy.x, enemy.y, ph.x, ph.y);
    if (pd < PLAYER_RADIUS + pHexR + 36) {
      const away = Math.atan2(enemy.y - ph.y, enemy.x - ph.x);
      moveX += Math.cos(away) * 1.35;
      moveY += Math.sin(away) * 1.35;
    }
  }

  const mLen = Math.hypot(moveX, moveY);
  if (mLen > 0.05) {
    const aiSpeed = 170;
    enemy.vx = (moveX / mLen) * aiSpeed;
    enemy.vy = (moveY / mLen) * aiSpeed;
  } else {
    enemy.vx *= 0.85;
    enemy.vy *= 0.85;
  }

  // Tactical Special Skill
  if (enemy.specialCooldown <= 0 && !enemy.specialActive && Math.random() < dt * 0.22) {
    if (
      (enemyStance === 'ranged' && dToPlayer < 480) ||
      (enemyStance === 'defense' && dToPlayer < 260) ||
      (enemyStance === 'melee' && dToPlayer < 210) ||
      (enemy.form === 'loose' && dToPlayer < 360)
    ) {
      triggerFighterSpecial(state, enemy);
      enemy.specialCooldown += 3.0;
    }
  }

  // Tactical Dash
  if (enemy.dashCooldown <= 0 && Math.random() < dt * 0.55) {
    const incomingRanged = player.attackAnim?.type === 'ranged';
    if (incomingRanged && dToPlayer < 460) {
      executeFighterDash(state, enemy, angToPlayer + (Math.PI / 2) * enemy.aiStrafeDir);
      enemy.dashCooldown = DASH_COOLDOWN + 1.8;
    } else if (enemyStance === 'melee' && dToPlayer > 180 && dToPlayer < 320) {
      executeFighterDash(state, enemy, angToPlayer);
      enemy.dashCooldown = DASH_COOLDOWN + 1.8;
    }
  }

  // Tactical attacks & recalls
  if (enemy.aiActionTimer <= 0) {
    if (enemy.form === 'loose') {
      const planted = enemy.hexes.filter((h) => h.state === 'PLANTED');
      const orbiting = enemy.hexes.filter((h) => h.state === 'ORBIT');
      if (planted.length >= 3 || (planted.length >= 1 && orbiting.length === 0)) {
        triggerSmartRecall(state, enemy);
        enemy.aiActionTimer = 0.85 + Math.random() * 0.4;
      } else if (orbiting.length > 0 && dToPlayer < 520) {
        const str = clamp((dToPlayer - 100) / 360, 0.25, 0.95);
        executeFighterAttack(state, enemy, angToPlayer + (Math.random() - 0.5) * 0.14, str, applyHexDurabilityLoss);
        enemy.aiActionTimer = 0.45 + Math.random() * 0.35;
      } else {
        enemy.aiActionTimer = 0.35;
      }
    } else if (enemyStance === 'ranged') {
      if (!enemy.attackAnim && dToPlayer < 540) {
        const str = clamp((dToPlayer - 200) / 320, 0.45, 1.0);
        executeFighterAttack(state, enemy, angToPlayer + (Math.random() - 0.5) * 0.08, str, applyHexDurabilityLoss);
        enemy.aiActionTimer = 0.95 + Math.random() * 0.55;
      } else {
        enemy.aiActionTimer = 0.3;
      }
    } else if (enemyStance === 'melee') {
      if (dToPlayer < 210) {
        executeFighterAttack(state, enemy, angToPlayer, 1.0, applyHexDurabilityLoss);
        enemy.aiActionTimer = 0.72 + Math.random() * 0.45;
      } else {
        enemy.aiActionTimer = 0.25;
      }
    } else if (enemyStance === 'defense') {
      // Pure defense stance: only release Counter-Pulse when Defense Special is charged
      if (enemy.specialActive?.type === 'defense' && (enemy.specialActive.storedEnergy ?? 0) >= 85 && dToPlayer < 230) {
        executeFighterAttack(state, enemy, angToPlayer, 1.0, applyHexDurabilityLoss);
        enemy.aiActionTimer = 0.9;
      } else {
        enemy.aiActionTimer = 0.35;
      }
    }
  }
}
