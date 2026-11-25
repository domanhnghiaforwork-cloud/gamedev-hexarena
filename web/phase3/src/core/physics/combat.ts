import {
  BASE_HEX_RADIUS,
  DEFLECT_ANGLE_RAD,
  HEX_COOLDOWN,
  HEX_REGEN_DELAY,
  LOAD_SHARE_RATIO,
  MATERIALS,
  PLAYER_RADIUS,
} from '../constants';
import { clamp, dist } from '../math/hexMath';
import {
  isCircleBlockedByObstacle,
  placePlantedHexSafely,
  segmentIntersectsAnyObstacle,
} from '../world/obstacles';
import { triggerShieldMiniPulse } from '../attacks/defense/specials/counterFortress';
import { performMeleeParrySteal } from '../attacks/melee/specials/parryDisarm';
import { GUIDED_SPEAR_DMG_MULT } from '../attacks/ranged/specials/guidedSpear';
import {
  SNIPER_SLOW_DURATION,
  SNIPER_SLOW_FACTOR,
  spendSniperHex,
} from '../attacks/ranged/specials/sniperStage';
import {
  computeLooseKineticEnergy,
  getActiveStance,
  getAnchoredNeighbors,
  getEffectiveHexStats,
  getStructuralResistance,
  isDefenseFortressActive,
  isHexAnchored,
  isHexStolen,
  isLooseGravityFieldActive,
  runStructuralBFSAndReassemble,
} from '../world/structure';
import type { Fighter, HexEntity, MatchState, SfxKind, SummonedWall, SummonedWallHex } from '../types';

function clashSfxForHexes(a: HexEntity, b: HexEntity): SfxKind {
  if (a.material.id === 'heavy' || b.material.id === 'heavy') return 'clashHeavy';
  if (a.material.id === 'sharp' || b.material.id === 'sharp') return 'clashSharp';
  return 'clash';
}

export function applyHexDurabilityLoss(
  state: MatchState,
  attacker: Fighter | null,
  defender: Fighter,
  defHex: HexEntity,
  amount: number,
  showNumber = true,
): boolean {
  if (defHex.state === 'BROKEN' || amount <= 0) return false;
  const dmg = Math.max(1, Math.round(amount));
  defHex.hp -= dmg;
  defHex.flashTimer = 0.16;
  defHex.regenDelay = HEX_REGEN_DELAY;

  const defColor = defender.id === 'player' ? '#38bdf8' : '#fb7185';
  const defR = BASE_HEX_RADIUS * defender.currentScale;

  if (defHex.hp <= 0) {
    defHex.hp = 0;
    const wasAssembled = defHex.state === 'ASSEMBLED';
    defHex.state = 'BROKEN';
    defHex.cooldown = HEX_COOLDOWN;
    defHex.selected = false;

    state.events.push({ type: 'shatter', x: defHex.x, y: defHex.y, color: defColor, radius: defR });
    state.events.push({
      type: 'floatingText',
      x: defHex.x,
      y: defHex.y - 22,
      text: 'VỠ MẢNH!',
      color: '#fbbf24',
      scale: 1.15,
    });
    if (showNumber) {
      state.events.push({
        type: 'floatingText',
        x: defHex.x,
        y: defHex.y - 6,
        text: `-${dmg}`,
        color: '#cbd5e1',
        scale: 0.78,
      });
    }
    state.events.push({ type: 'sfx', kind: 'shatter' });
    state.hitStopTimer = Math.max(state.hitStopTimer, 0.045);
    state.events.push({ type: 'hitStop', duration: 0.045 });
    state.events.push({ type: 'shake', amount: 10 });
    state.events.push({ type: 'haptic', pattern: [24, 18, 28], target: defender.id });

    if (attacker) {
      if (attacker.id === 'player') state.stats.hexBroken++;
      else state.stats.enemyHexBroken++;
    }

    if (wasAssembled && defender.form !== 'loose') {
      runStructuralBFSAndReassemble(defender, state.events, true);
    }
    return true;
  }

  if (showNumber && dmg >= 3) {
    state.events.push({
      type: 'floatingText',
      x: defHex.x,
      y: defHex.y - 12,
      text: `-${dmg}`,
      color: '#cbd5e1',
      scale: 0.76,
    });
  }
  return false;
}

export function damageHex(
  state: MatchState,
  attacker: Fighter,
  attHex: HexEntity,
  defender: Fighter,
  defHex: HexEntity,
  dmgMult = 1.0,
  opts: { forceShatter?: boolean } = {},
): boolean {
  if (defHex.state === 'BROKEN') return false;

  const attStats = getEffectiveHexStats(attacker, attHex);
  const defResistance = getStructuralResistance(defender, defHex);

  const midX = (attHex.x + defHex.x) * 0.5;
  const midY = (attHex.y + defHex.y) * 0.5;
  const attColor = attacker.id === 'player' ? '#38bdf8' : '#fb7185';
  state.events.push({ type: 'sparks', x: midX, y: midY, color: '#ffffff', count: 7, speed: 200, size: 2.8 });
  state.events.push({ type: 'sparks', x: midX, y: midY, color: attColor, count: 6, speed: 260, size: 3.2 });

  if (opts.forceShatter) {
    const shatterDmg = Math.max(defHex.hp, Math.round(attStats.damage * dmgMult));
    return applyHexDurabilityLoss(state, attacker, defender, defHex, shatterDmg, true);
  }

  const rawDmg = attStats.damage * dmgMult * (100 / Math.max(25, defResistance));
  const totalDmg = Math.max(4, Math.round(rawDmg));

  // Rule 2.2: 30% Load Sharing across edge-adjacent intact anchored neighbors
  const neighbors = getAnchoredNeighbors(defender, defHex);
  let primaryDmg = totalDmg;
  if (neighbors.length > 0) {
    const sharedPool = totalDmg * LOAD_SHARE_RATIO;
    primaryDmg = totalDmg - sharedPool;
    const perNeighbor = sharedPool / neighbors.length;
    for (const nb of neighbors) {
      applyHexDurabilityLoss(state, attacker, defender, nb, perNeighbor, perNeighbor >= 5);
    }
  }

  const shattered = applyHexDurabilityLoss(state, attacker, defender, defHex, primaryDmg, true);
  if (!shattered) {
    state.events.push({ type: 'sfx', kind: clashSfxForHexes(attHex, defHex) });
    if (attacker.currentScale <= 0.65) {
      state.hitStopTimer = Math.max(state.hitStopTimer, 0.028);
      state.events.push({ type: 'hitStop', duration: 0.028 });
      state.events.push({ type: 'shake', amount: 4.5 });
    }
  }
  return shattered;
}

export function damageFighterBody(
  state: MatchState,
  attacker: Fighter,
  attHex: HexEntity,
  defender: Fighter,
  multiplier = 1.0,
): void {
  if (state.matchOver) return;
  const attStats = getEffectiveHexStats(attacker, attHex);
  const dmg = Math.max(8, Math.round(attStats.damage * 1.15 * multiplier));

  defender.hp = Math.max(0, defender.hp - dmg);
  defender.damageFlash = 0.22;

  const kbAng = Math.atan2(defender.y - attHex.y, defender.x - attHex.x);
  const weightFactor = (160 - attHex.material.agil) / 70;
  const kbForce = 180 * weightFactor * (0.7 + 0.4 * attacker.currentScale);
  defender.kbX += Math.cos(kbAng) * kbForce;
  defender.kbY += Math.sin(kbAng) * kbForce;

  const color = attacker.id === 'player' ? '#7dd3fc' : '#fda4af';
  const isShrunkPierce = attacker.currentScale <= 0.65;

  state.events.push({
    type: 'sparks',
    x: defender.x,
    y: defender.y,
    color,
    count: isShrunkPierce ? 16 : 9,
    speed: isShrunkPierce ? 320 : 210,
    size: isShrunkPierce ? 4 : 3,
  });

  if (isShrunkPierce) {
    state.events.push({ type: 'shockwave', x: defender.x, y: defender.y, r: 10, maxR: 62, life: 0.22, color: '#fbbf24' });
    state.events.push({
      type: 'floatingText',
      x: defender.x,
      y: defender.y - 28,
      text: `-${dmg} XUYÊN!`,
      color: '#fbbf24',
      scale: 1.15,
    });
    state.hitStopTimer = Math.max(state.hitStopTimer, 0.042);
    state.events.push({ type: 'hitStop', duration: 0.042 });
    state.events.push({ type: 'shake', amount: 8.5 });
    state.events.push({ type: 'haptic', pattern: [18], target: attacker.id });
    state.events.push({ type: 'sfx', kind: 'pierce' });
  } else {
    state.events.push({
      type: 'floatingText',
      x: defender.x,
      y: defender.y - 24,
      text: `-${dmg}`,
      color,
      scale: 0.95,
    });
    state.events.push({ type: 'shake', amount: 4 });
    state.events.push({ type: 'sfx', kind: clashSfxForHexes(attHex, attHex) });
  }

  const mode = attHex.state === 'STOLEN_FLY' || attHex.state === 'STOLEN_RETURN'
    ? 'melee'
    : attHex.state === 'SNIPER_SHOT'
      ? 'ranged'
      : attacker.form === 'loose'
        ? 'loose'
        : getActiveStance(attacker) ?? 'melee';

  if (attacker.id === 'player') {
    state.stats.dmgDealt += dmg;
    state.stats.playerHits++;
    state.stats.playerDmgByMode[mode] += dmg;
  } else {
    state.stats.enemyDmg += dmg;
    state.stats.enemyHits++;
    state.stats.enemyDmgByMode[mode] += dmg;
  }

  if (defender.hp <= 0) {
    state.matchOver = true;
    state.winner = attacker.id;
    state.events.push({ type: 'matchEnd', playerWon: attacker.id === 'player' });
  } else if (isDefenseFortressActive(defender)) {
    chargeShieldFortress(state, attacker, defender, 65);
  }
}

export function computeDefenseNormal(def: Fighter, dh: HexEntity, ah: HexEntity): { nx: number; ny: number } {
  let cx = ah.x - dh.x;
  let cy = ah.y - dh.y;
  const cd = Math.hypot(cx, cy) || 1;
  cx /= cd;
  cy /= cd;

  if (isHexAnchored(def, dh)) {
    let rx = dh.x - def.x;
    let ry = dh.y - def.y;
    const rd = Math.hypot(rx, ry) || 1;
    rx /= rd;
    ry /= rd;
    const nx = rx * 0.65 + cx * 0.35;
    const ny = ry * 0.65 + cy * 0.35;
    const nd = Math.hypot(nx, ny) || 1;
    return { nx: nx / nd, ny: ny / nd };
  }
  return { nx: cx, ny: cy };
}

export function isBodyShieldedAlongPath(
  px: number,
  py: number,
  def: Fighter,
  defR: number,
  walls: SummonedWall[] = [],
): boolean {
  const vx = def.x - px;
  const vy = def.y - py;
  const lenSq = vx * vx + vy * vy;
  if (lenSq < 1e-4) return false;
  for (const dh of def.hexes) {
    if (!isHexAnchored(def, dh)) continue;
    const t = clamp(((dh.x - px) * vx + (dh.y - py) * vy) / lenSq, 0, 1);
    const nearX = px + vx * t;
    const nearY = py + vy * t;
    if (dist(dh.x, dh.y, nearX, nearY) < defR * 1.05) {
      return true;
    }
  }
  const wallR = BASE_HEX_RADIUS;
  for (const w of walls) {
    for (const wh of w.hexes) {
      if (wh.broken) continue;
      const t = clamp(((wh.x - px) * vx + (wh.y - py) * vy) / lenSq, 0, 1);
      const nearX = px + vx * t;
      const nearY = py + vy * t;
      if (dist(wh.x, wh.y, nearX, nearY) < wallR * 1.05) {
        return true;
      }
    }
  }
  return false;
}

export function computeEffectiveImpactAngle(
  att: Fighter,
  def: Fighter,
  rawTheta: number,
  defHex: HexEntity | null = null,
  rng: () => number = Math.random,
): number {
  let theta = rawTheta;
  if (att.form === 'loose' && att.rotMode === 'normal') {
    theta *= 0.55;
  }
  if (def.form === 'loose' && def.rotMode === 'random') {
    theta = Math.min(Math.PI * 0.48, theta + ((24 + rng() * 22) * Math.PI) / 180);
  }
  if (isLooseGravityFieldActive(def) && defHex && defHex.state === 'ORBIT') {
    theta = Math.min(Math.PI * 0.48, theta + (22 * Math.PI) / 180);
  }
  return theta;
}

function chargeShieldFortress(
  state: MatchState,
  att: Fighter,
  def: Fighter,
  absorbedEnergy: number,
): void {
  if (isDefenseFortressActive(def) && def.specialActive) {
    const add = clamp(absorbedEnergy * 0.75, 25, 110);
    def.specialActive.storedEnergy = Math.min(360, (def.specialActive.storedEnergy ?? 0) + add);
    triggerShieldMiniPulse(state, def, att, absorbedEnergy, applyHexDurabilityLoss);
  }
}

function applyWallHexDurabilityLoss(
  state: MatchState,
  wh: SummonedWallHex,
  wallOwnerId: Fighter['id'],
  amount: number,
): boolean {
  if (wh.broken || amount <= 0) return false;
  const dmg = Math.max(1, Math.round(amount));
  wh.hp -= dmg;
  wh.flashTimer = 0.16;
  const col = wallOwnerId === 'player' ? '#2dd4bf' : '#fb7185';
  if (wh.hp <= 0) {
    wh.hp = 0;
    wh.broken = true;
    state.events.push({ type: 'shatter', x: wh.x, y: wh.y, color: col, radius: BASE_HEX_RADIUS });
    state.events.push({ type: 'floatingText', x: wh.x, y: wh.y - 16, text: 'VỠ TƯỜNG!', color: '#fbbf24', scale: 0.95 });
    state.events.push({ type: 'sfx', kind: 'shatter' });
    state.events.push({ type: 'shake', amount: 5.5 });
    return true;
  }
  state.events.push({ type: 'floatingText', x: wh.x, y: wh.y - 10, text: `-${dmg}`, color: '#cbd5e1', scale: 0.72 });
  return false;
}

function getWallAdjCount(wall: SummonedWall, wh: SummonedWallHex): number {
  let adj = 0;
  for (const other of wall.hexes) {
    if (other.broken || other.id === wh.id) continue;
    if (Math.abs(other.id - wh.id) === 1) adj++;
  }
  return adj;
}

function resolveAttacksVsWalls(state: MatchState): void {
  if (state.walls.length === 0) return;
  const wallR = BASE_HEX_RADIUS;

  for (const att of [state.player, state.enemy]) {
    const attR = BASE_HEX_RADIUS * att.currentScale;
    const attStance = getActiveStance(att);

    // 1. Ranged Thrown / Guided Spear vs Enemy Walls
    if (
      attStance === 'ranged' &&
      att.attackAnim &&
      att.attackAnim.type === 'ranged' &&
      att.attackAnim.phase !== 'ricochet'
    ) {
      const anim = att.attackAnim;
      const isReturn = anim.phase === 'return';
      const isGuided = anim.phase === 'guided';
      const passDmgMult = isReturn ? 0.5 : isGuided ? GUIDED_SPEAR_DMG_MULT : 1.0;
      const spearHexes = att.hexes.filter((h) => h.state === 'ASSEMBLED');
      const dirX = Math.cos(anim.angle);
      const dirY = Math.sin(anim.angle);

      for (const w of state.walls) {
        if (w.ownerId === att.id) continue;
        for (const wh of w.hexes) {
          if (wh.broken) continue;
          const hitKey = -(10000 + w.id * 16 + wh.id);
          if (!isGuided && anim.hitHexIds.has(hitKey)) continue;
          if (isGuided && anim.guidedStunTimer > 0) continue;

          const hitAh = spearHexes.find(
            (ah) => !isCircleBlockedByObstacle(state.obstacles, ah.x, ah.y, attR * 0.35) && dist(ah.x, ah.y, wh.x, wh.y) < (attR + wallR) * 0.92,
          );
          if (!hitAh) continue;
          anim.hitHexIds.add(hitKey);

          const adj = getWallAdjCount(w, wh);
          const rWall = MATERIALS.base.hard * (1 + 0.1 * adj) * 1.4;
          const attStats = getEffectiveHexStats(att, hitAh);

          if (anim.energy < rWall) {
            applyWallHexDurabilityLoss(state, wh, w.ownerId, Math.round(attStats.damage * 1.2 * passDmgMult));
            if (isGuided) {
              anim.anchorX -= dirX * 18;
              anim.anchorY -= dirY * 18;
              anim.angle = Math.atan2(-dirY, -dirX) + (Math.random() - 0.5) * 0.7;
              anim.guidedStunTimer = 0.25;
              anim.hitHexIds.clear();
            } else {
              anim.energy = 0;
              if (!isReturn) {
                anim.anchorX -= dirX * 14;
                anim.anchorY -= dirY * 14;
                anim.phase = 'return';
                anim.energy = anim.initialEnergy * 0.5;
                anim.hitBody = false;
                anim.hitHexIds.clear();
              }
            }
            state.events.push({ type: 'sparks', x: wh.x, y: wh.y, color: '#2dd4bf', count: 8, speed: 220, size: 2.8 });
            state.events.push({ type: 'sfx', kind: 'clash' });
            break;
          } else {
            applyWallHexDurabilityLoss(state, wh, w.ownerId, wh.hp + 1);
            anim.energy = Math.max(0, anim.energy - rWall);
            state.events.push({ type: 'floatingText', x: wh.x, y: wh.y - 28, text: 'XUYÊN TƯỜNG!', color: '#fbbf24', scale: 0.9 });
          }
        }
      }
      continue;
    }

    // 1b. Sniper Shot Projectiles vs Enemy Walls
    for (const ah of att.hexes) {
      if (ah.state !== 'SNIPER_SHOT') continue;
      if (isCircleBlockedByObstacle(state.obstacles, ah.x, ah.y, attR * 0.35)) continue;
      for (const w of state.walls) {
        if (w.ownerId === att.id) continue;
        for (const wh of w.hexes) {
          if (wh.broken) continue;
          if (dist(ah.x, ah.y, wh.x, wh.y) >= (attR + wallR) * 0.96) continue;
          const attStats = getEffectiveHexStats(att, ah);
          const adj = getWallAdjCount(w, wh);
          const rWall = MATERIALS.base.hard * (1 + 0.1 * adj) * 1.4;
          const isFourth = Boolean(ah.sniperEmpowered);

          state.events.push({ type: 'sparks', x: wh.x, y: wh.y, color: isFourth ? '#fbbf24' : '#2dd4bf', count: 8, speed: 230, size: 2.8 });
          if (ah.energy < rWall) {
            applyWallHexDurabilityLoss(state, wh, w.ownerId, Math.round(attStats.damage * (isFourth ? 2.1 : 1.35)));
            state.events.push({ type: 'sfx', kind: 'clash' });
            spendSniperHex(att, ah);
          } else {
            applyWallHexDurabilityLoss(state, wh, w.ownerId, wh.hp + 1);
            ah.energy = Math.max(0, ah.energy - rWall);
            const ratio = clamp(ah.energy / Math.max(1, ah.initialEnergy), 0.45, 1.0);
            const spd = (ah.launchSpeed || 1450) * ratio;
            const vLen = Math.hypot(ah.vx, ah.vy) || 1;
            ah.vx = (ah.vx / vLen) * spd;
            ah.vy = (ah.vy / vLen) * spd;
            state.events.push({ type: 'floatingText', x: wh.x, y: wh.y - 28, text: 'XUYÊN TƯỜNG!', color: '#fbbf24', scale: 0.9 });
          }
          break;
        }
        if (ah.state !== 'SNIPER_SHOT') break;
      }
    }

    // 2. Melee / Loose Projectiles vs Enemy Walls
    for (const ah of att.hexes) {
      if (ah.state === 'BROKEN' || isHexStolen(ah) || ah.hitCooldown > 0) continue;
      const isLooseAttacking = ah.state === 'LAUNCHED' || (ah.state === 'RECALLING' && ah.isAutoReturning);
      const isAssembledAttacking = ah.state === 'ASSEMBLED' && att.attackAnim !== null && !att.attackAnim.wallBlocked;
      if (!isLooseAttacking && !isAssembledAttacking) continue;

      let hitWall = false;
      for (const w of state.walls) {
        if (w.ownerId === att.id) continue;
        for (const wh of w.hexes) {
          if (wh.broken) continue;
          const hitKey = -(10000 + w.id * 16 + wh.id);
          if (isAssembledAttacking && att.attackAnim?.hitHexIds.has(hitKey)) continue;
          if (dist(ah.x, ah.y, wh.x, wh.y) >= (attR + wallR) * 0.92) continue;

          const attStats = getEffectiveHexStats(att, ah);
          const adj = getWallAdjCount(w, wh);
          const rWall = MATERIALS.base.hard * (1 + 0.1 * adj) * 1.4;

          if (isLooseAttacking) {
            if (ah.energy < rWall) {
              applyWallHexDurabilityLoss(state, wh, w.ownerId, Math.round(attStats.damage * 1.1));
              if (ah.autoReturn) {
                ah.energy = 0;
                ah.state = 'RECALLING';
                ah.isAutoReturning = true;
                ah.vx = 0;
                ah.vy = 0;
              } else {
                ah.energy = 0;
                ah.state = 'PLANTED';
                ah.vx = 0;
                ah.vy = 0;
              }
            } else {
              applyWallHexDurabilityLoss(state, wh, w.ownerId, wh.hp + 1);
              ah.energy = Math.max(0, ah.energy - rWall);
            }
            ah.hitCooldown = 0.25;
            hitWall = true;
          } else if (att.attackAnim) {
            att.attackAnim.hitHexIds.add(hitKey);
            const dmgMult = attStance === 'melee' ? 1.35 : 0.4;
            applyWallHexDurabilityLoss(state, wh, w.ownerId, Math.round(attStats.damage * dmgMult));
            if (attStance === 'defense') {
              state.events.push({ type: 'sfx', kind: 'clash' });
            } else {
              state.events.push({ type: 'sfx', kind: 'clashHeavy' });
            }
            hitWall = true;
          }
          state.events.push({ type: 'sparks', x: (ah.x + wh.x) * 0.5, y: (ah.y + wh.y) * 0.5, color: '#2dd4bf', count: 7, speed: 190, size: 2.6 });
          break;
        }
        if (hitWall) break;
      }
    }
  }
}

function applyLooseSelfWear(
  state: MatchState,
  att: Fighter,
  ah: HexEntity,
  def: Fighter,
  dh: HexEntity,
  rDef: number,
): void {
  if (!isHexAnchored(def, dh)) return;
  if (att.rotMode === 'static') return;
  if (att.rotMode === 'normal') {
    const wearDmg = Math.round(clamp(rDef * 0.16, 12, 55));
    applyHexDurabilityLoss(state, def, att, ah, wearDmg, true);
  } else if (att.rotMode === 'random') {
    damageHex(state, def, dh, att, ah, 0.35);
  }
}

/**
 * Full 4-Rule Emergent Combat Collision & Defense Physics Pipeline (Stance-Agnostic!).
 */
export function resolveCombatCollisions(state: MatchState): void {
  resolveAttacksVsWalls(state);

  const pairs: Array<[Fighter, Fighter]> = [
    [state.player, state.enemy],
    [state.enemy, state.player],
  ];

  for (const [att, def] of pairs) {
    const attR = BASE_HEX_RADIUS * att.currentScale;
    const defR = BASE_HEX_RADIUS * def.currentScale;
    const attStance = getActiveStance(att);

    // A. RANGED STANCE THROWN / GUIDED WEAPON
    if (attStance === 'ranged' && att.attackAnim && att.attackAnim.type === 'ranged' && att.attackAnim.phase !== 'ricochet') {
      const anim = att.attackAnim;
      const isReturn = anim.phase === 'return';
      const isGuided = anim.phase === 'guided';
      const passDmgMult = isReturn ? 0.5 : isGuided ? GUIDED_SPEAR_DMG_MULT : 1.0;
      const spearHexes = att.hexes.filter((h) => h.state === 'ASSEMBLED');
      const dirX = Math.cos(anim.angle);
      const dirY = Math.sin(anim.angle);

      // Step 1 (Rule 1): Gather ALL Hex-vs-Hex hits front-to-back
      const hexHits: Array<{ ah: HexEntity; dh: HexEntity; order: number }> = [];
      for (const ah of spearHexes) {
        if (isCircleBlockedByObstacle(state.obstacles, ah.x, ah.y, attR * 0.35)) continue;
        for (const dh of def.hexes) {
          if (
            dh.state === 'BROKEN' ||
            isHexStolen(dh) ||
            dh.state === 'SNIPER_SPENT' ||
            dh.state === 'SNIPER_RETURN' ||
            (!isGuided && anim.hitHexIds.has(dh.id))
          ) {
            continue;
          }
          if (isGuided && anim.guidedStunTimer > 0) continue;
          const d = dist(ah.x, ah.y, dh.x, dh.y);
          if (d < (attR + defR) * 0.92) {
            if (segmentIntersectsAnyObstacle(state.obstacles, ah.x, ah.y, dh.x, dh.y, 0)) continue;
            const order = (dh.x - anim.anchorX) * dirX + (dh.y - anim.anchorY) * dirY;
            hexHits.push({ ah, dh, order });
          }
        }
      }
      hexHits.sort((a, b) => a.order - b.order);

      let stoppedThisFrame = false;
      for (const { ah, dh } of hexHits) {
        if (
          anim.energy <= 0 ||
          stoppedThisFrame ||
          anim.phase === 'ricochet' ||
          dh.state === 'BROKEN' ||
          (!isGuided && anim.hitHexIds.has(dh.id))
        ) {
          continue;
        }
        anim.hitHexIds.add(dh.id);

        const { nx, ny } = computeDefenseNormal(def, dh, ah);
        const rawCos = clamp(-(dirX * nx + dirY * ny), 0, 1);
        const theta = computeEffectiveImpactAngle(att, def, Math.acos(rawCos), dh);
        const cosTheta = Math.max(0, Math.cos(theta));
        const eEff = anim.energy * cosTheta;
        const rDef = getStructuralResistance(def, dh);

        if (theta > DEFLECT_ANGLE_RAD && eEff < rDef) {
          // Rule 4: Glancing Ricochet (>35 deg & blocked)
          const dot = dirX * nx + dirY * ny;
          let rx = dirX - 2 * dot * nx;
          let ry = dirY - 2 * dot * ny;
          const toDefX = def.x - dh.x;
          const toDefY = def.y - dh.y;
          if (rx * toDefX + ry * toDefY > 0) {
            rx = nx;
            ry = ny;
          }
          if (isGuided) {
            anim.angle = Math.atan2(ry, rx);
            anim.guidedStunTimer = 0.22;
            anim.anchorX += nx * 16;
            anim.anchorY += ny * 16;
          } else {
            anim.phase = 'ricochet';
            anim.ricochetTimer = 0.18;
            anim.angle = Math.atan2(ry, rx);
            anim.energy = 0;
          }
          stoppedThisFrame = true;

          chargeShieldFortress(state, att, def, anim.initialEnergy * 0.7);
          damageHex(state, att, ah, def, dh, 0.30 * passDmgMult);
          state.events.push({
            type: 'sparks',
            x: (ah.x + dh.x) * 0.5,
            y: (ah.y + dh.y) * 0.5,
            color: '#fbbf24',
            count: 10,
            speed: 240,
            size: 3.0,
          });
          state.events.push({ type: 'floatingText', x: dh.x, y: dh.y - 18, text: 'TRƯỢT!', color: '#fbbf24', scale: 0.95 });
          state.events.push({ type: 'sfx', kind: 'bounce' });
          break;
        } else if (eEff < rDef) {
          // Rule 3 Scenario 1 / 2: Full Block or Multi-Layer Stop
          chargeShieldFortress(state, att, def, anim.initialEnergy);
          damageHex(state, att, ah, def, dh, 0.85 * passDmgMult);
          if (isHexAnchored(def, dh)) {
            damageHex(state, def, dh, att, ah, 0.55);
          }
          def.kbX += dirX * 135;
          def.kbY += dirY * 135;
          stoppedThisFrame = true;

          if (isGuided) {
            anim.anchorX -= dirX * 18;
            anim.anchorY -= dirY * 18;
            anim.angle = Math.atan2(-dirY, -dirX) + (Math.random() - 0.5) * 0.8;
            anim.guidedStunTimer = 0.28;
            anim.hitHexIds.clear();
          } else {
            anim.energy = 0;
            if (!isReturn) {
              anim.anchorX -= dirX * 14;
              anim.anchorY -= dirY * 14;
              anim.phase = 'return';
              anim.energy = anim.initialEnergy * 0.5;
              anim.hitBody = false;
              anim.hitHexIds.clear();
            }
          }
          state.events.push({ type: 'floatingText', x: dh.x, y: dh.y - 18, text: 'CHẶN!', color: '#7dd3fc', scale: 0.95 });
          state.hitStopTimer = Math.max(state.hitStopTimer, 0.032);
          state.events.push({ type: 'hitStop', duration: 0.032 });
          state.events.push({ type: 'shake', amount: 5.5 });
          state.events.push({ type: 'sfx', kind: clashSfxForHexes(ah, dh) });
          break;
        } else {
          // Rule 3 Scenario 3: Pierced with Attenuation
          damageHex(state, att, ah, def, dh, passDmgMult, { forceShatter: true });
          damageHex(state, def, dh, att, ah, 0.70);
          anim.energy = Math.max(0, eEff - rDef);
          state.events.push({ type: 'floatingText', x: dh.x, y: dh.y - 32, text: 'XUYÊN PHÁ!', color: '#fbbf24', scale: 0.95 });
        }
      }

      // Step 2 (Rule 1): Ground Hitbox Ring ONLY if residual kinetic energy remains & unobstructed!
      const canHitBody = isGuided ? anim.guidedHitBodyCd <= 0 : !anim.hitBody;
      if (!stoppedThisFrame && anim.energy > 0 && anim.phase !== 'ricochet' && canHitBody) {
        for (const ah of spearHexes) {
          if (isCircleBlockedByObstacle(state.obstacles, ah.x, ah.y, attR * 0.35)) continue;
          const dBody = dist(ah.x, ah.y, def.x, def.y);
          if (dBody < attR * 0.85 + PLAYER_RADIUS) {
            if (segmentIntersectsAnyObstacle(state.obstacles, ah.x, ah.y, def.x, def.y, 0)) continue;
            if (isBodyShieldedAlongPath(ah.x, ah.y, def, defR, state.walls)) continue;

            if (isGuided) anim.guidedHitBodyCd = 0.45;
            else anim.hitBody = true;

            const energyRatio = anim.initialEnergy > 0 ? clamp(anim.energy / anim.initialEnergy, 0.22, 1.0) : 1.0;
            damageFighterBody(state, att, ah, def, 1.25 * passDmgMult * energyRatio);
            break;
          }
        }
      }
      continue;
    }

    // A2. RANGED SNIPER STAGE BULLETS (4-Rule Emergent Collision Pipeline + Hit Slow)
    for (const ah of att.hexes) {
      if (ah.state !== 'SNIPER_SHOT') continue;
      if (isCircleBlockedByObstacle(state.obstacles, ah.x, ah.y, attR * 0.35)) continue;

      const isFourth = Boolean(ah.sniperEmpowered);
      const defCandidates: Array<{ dh: HexEntity; d: number }> = [];
      for (const dh of def.hexes) {
        if (
          dh.state === 'BROKEN' ||
          isHexStolen(dh) ||
          dh.state === 'SNIPER_SPENT' ||
          dh.state === 'SNIPER_RETURN'
        ) {
          continue;
        }
        const d = dist(ah.x, ah.y, dh.x, dh.y);
        if (d < (attR + defR) * 0.96) {
          if (segmentIntersectsAnyObstacle(state.obstacles, ah.x, ah.y, dh.x, dh.y, 0)) continue;
          defCandidates.push({ dh, d });
        }
      }
      defCandidates.sort((a, b) => a.d - b.d);

      for (const { dh } of defCandidates) {
        if (dh.state === 'BROKEN' || isHexStolen(dh)) continue;
        const vLen = Math.hypot(ah.vx, ah.vy) || 1;
        const dirX = ah.vx / vLen;
        const dirY = ah.vy / vLen;
        const { nx, ny } = computeDefenseNormal(def, dh, ah);
        const rawCos = clamp(-(dirX * nx + dirY * ny), 0, 1);
        const theta = computeEffectiveImpactAngle(att, def, Math.acos(rawCos), dh);
        const cosTheta = Math.max(0, Math.cos(theta));
        const eEff = ah.energy * cosTheta;
        const rDef = getStructuralResistance(def, dh);

        if (theta > DEFLECT_ANGLE_RAD && eEff < rDef) {
          chargeShieldFortress(state, att, def, ah.energy * 0.7);
          damageHex(state, att, ah, def, dh, 0.35);
          state.events.push({ type: 'floatingText', x: dh.x, y: dh.y - 16, text: 'TRƯỢT!', color: '#fbbf24', scale: 0.85 });
          state.events.push({ type: 'sfx', kind: 'bounce' });
          spendSniperHex(att, ah);
          break;
        } else if (eEff < rDef) {
          chargeShieldFortress(state, att, def, ah.energy);
          damageHex(state, att, ah, def, dh, isFourth ? 1.85 : 1.25);
          def.kbX += dirX * 115;
          def.kbY += dirY * 115;
          state.events.push({ type: 'floatingText', x: dh.x, y: dh.y - 16, text: 'CHẶN!', color: '#34d399', scale: 0.90 });
          spendSniperHex(att, ah);
          break;
        } else {
          damageHex(state, att, ah, def, dh, isFourth ? 1.85 : 1.25, { forceShatter: true });
          const remE = Math.max(0, eEff - rDef);
          ah.energy = remE;
          const ratio = clamp(remE / Math.max(1, ah.initialEnergy), 0.45, 1.0);
          const spd = (ah.launchSpeed || 1450) * ratio;
          ah.vx = dirX * spd;
          ah.vy = dirY * spd;
          state.events.push({ type: 'floatingText', x: dh.x, y: dh.y - 20, text: 'XUYÊN PHÁ!', color: '#fbbf24', scale: 0.96 });
        }
      }

      if (ah.state !== 'SNIPER_SHOT') continue;

      const dBody = dist(ah.x, ah.y, def.x, def.y);
      if (dBody < attR * 0.90 + PLAYER_RADIUS) {
        if (segmentIntersectsAnyObstacle(state.obstacles, ah.x, ah.y, def.x, def.y, 0)) continue;
        if (isBodyShieldedAlongPath(ah.x, ah.y, def, defR, state.walls)) {
          spendSniperHex(att, ah);
          continue;
        }
        const energyRatio = clamp(ah.energy / Math.max(1, ah.initialEnergy), 0.35, 1.0);
        const mult = (isFourth ? 2.45 : 1.35) * energyRatio;
        damageFighterBody(state, att, ah, def, mult);
        def.slowTimer = Math.max(def.slowTimer, SNIPER_SLOW_DURATION);
        def.slowFactor = Math.min(def.slowFactor, SNIPER_SLOW_FACTOR);
        if (isFourth) {
          state.events.push({ type: 'shockwave', x: def.x, y: def.y, r: 12, maxR: 84, life: 0.28, color: '#fbbf24' });
          state.events.push({ type: 'floatingText', x: def.x, y: def.y - 34, text: 'PHÁT THỨ 4!', color: '#fbbf24', scale: 1.22 });
          state.hitStopTimer = Math.max(state.hitStopTimer, 0.05);
          state.events.push({ type: 'hitStop', duration: 0.05 });
          state.events.push({ type: 'shake', amount: 11 });
          state.events.push({ type: 'sfx', kind: 'pierce' });
        }
        spendSniperHex(att, ah);
      }
    }

    // B. LOOSE HEXES & ANCHORED MELEE / DEFENSE STANCE
    for (const ah of att.hexes) {
      if (
        ah.state === 'BROKEN' ||
        isHexStolen(ah) ||
        ah.state === 'SNIPER_SHOT' ||
        ah.state === 'SNIPER_SPENT' ||
        ah.state === 'SNIPER_RETURN' ||
        ah.hitCooldown > 0
      ) {
        continue;
      }

      const isLooseOverdriveOrbit = ah.state === 'ORBIT' && isLooseGravityFieldActive(att);
      const isLooseAttacking =
        ah.state === 'LAUNCHED' ||
        ah.state === 'RECALLING' ||
        ah.state === 'PLANTED' ||
        isLooseOverdriveOrbit;
      const isAssembledAttacking =
        ah.state === 'ASSEMBLED' &&
        att.attackAnim !== null &&
        !att.attackAnim.wallBlocked;

      if (!isLooseAttacking && !isAssembledAttacking) continue;

      const isAutoReturnLoose = ah.state === 'RECALLING' && ah.isAutoReturning;
      const attackDmgMult = isAutoReturnLoose ? 0.5 : 1.0;
      const isHighFlightRecall = ah.state === 'RECALLING' && !ah.isAutoReturning;

      if (!isHighFlightRecall) {
        if (isCircleBlockedByObstacle(state.obstacles, ah.x, ah.y, attR * 0.35)) continue;
        if (isAssembledAttacking && segmentIntersectsAnyObstacle(state.obstacles, att.x, att.y, ah.x, ah.y, 0)) continue;
      }

      // Step 1 (Rule 1): Defender intact hexes first
      let blockedByHex = false;
      const defCandidates: Array<{ dh: HexEntity; d: number }> = [];
      for (const dh of def.hexes) {
        if (
          dh.state === 'BROKEN' ||
          isHexStolen(dh) ||
          dh.state === 'SNIPER_SPENT' ||
          dh.state === 'SNIPER_RETURN'
        ) {
          continue;
        }
        if (isHighFlightRecall && !isHexAnchored(def, dh)) continue;
        const d = dist(ah.x, ah.y, dh.x, dh.y);
        if (d < (attR + defR) * 0.90) {
          if (!isHighFlightRecall && segmentIntersectsAnyObstacle(state.obstacles, ah.x, ah.y, dh.x, dh.y, 0)) continue;
          defCandidates.push({ dh, d });
        }
      }
      defCandidates.sort((a, b) => a.d - b.d);

      for (const { dh } of defCandidates) {
        if (dh.state === 'BROKEN' || isHexStolen(dh)) continue;
        if (isAssembledAttacking && att.attackAnim && att.attackAnim.hitHexIds.has(dh.id)) {
          blockedByHex = true;
          continue;
        }

        // Melee Special (Phản Chém Tước Mảnh)
        if (isAssembledAttacking && att.attackAnim?.type === 'melee' && att.attackAnim.empoweredParry) {
          if (performMeleeParrySteal(state, att, def, dh)) {
            att.attackAnim.hitHexIds.add(dh.id);
            blockedByHex = true;
            break;
          }
        }

        // Flying Loose Projectile -> 4-Rule Pipeline
        if (ah.state === 'LAUNCHED' || ah.state === 'RECALLING') {
          let vx = ah.vx;
          let vy = ah.vy;
          if (ah.state === 'RECALLING') {
            vx = att.x - ah.x;
            vy = att.y - ah.y;
          }
          const vLen = Math.hypot(vx, vy) || 1;
          const dirX = vx / vLen;
          const dirY = vy / vLen;
          const { nx, ny } = computeDefenseNormal(def, dh, ah);
          const rawCos = clamp(-(dirX * nx + dirY * ny), 0, 1);
          const theta = computeEffectiveImpactAngle(att, def, Math.acos(rawCos), dh);
          const cosTheta = Math.max(0, Math.cos(theta));

          const curEnergy =
            ah.state === 'RECALLING'
              ? computeLooseKineticEnergy(att, ah) * (isAutoReturnLoose ? 0.5 : 0.95)
              : ah.energy;
          const eEff = curEnergy * cosTheta;
          const rDef = getStructuralResistance(def, dh);

          if (theta > DEFLECT_ANGLE_RAD && eEff < rDef) {
            chargeShieldFortress(state, att, def, curEnergy * 0.7);
            damageHex(state, att, ah, def, dh, 0.30 * attackDmgMult);
            if (ah.state === 'LAUNCHED') {
              const dot = ah.vx * nx + ah.vy * ny;
              ah.vx = (ah.vx - 2 * dot * nx) * 0.85;
              ah.vy = (ah.vy - 2 * dot * ny) * 0.85;
              if (Math.hypot(ah.vx, ah.vy) < 180) {
                ah.vx = nx * 240;
                ah.vy = ny * 240;
              }
              ah.hasBounced = true;
              ah.remainingDist = Math.min(ah.remainingDist, 140);
            }
            ah.hitCooldown = 0.24;
            blockedByHex = true;
            state.events.push({ type: 'floatingText', x: dh.x, y: dh.y - 16, text: 'TRƯỢT!', color: '#fbbf24', scale: 0.85 });
            state.events.push({ type: 'sfx', kind: 'bounce' });
            break;
          } else if (eEff < rDef) {
            chargeShieldFortress(state, att, def, curEnergy);
            damageHex(state, att, ah, def, dh, attackDmgMult);
            applyLooseSelfWear(state, att, ah, def, dh, rDef);
            def.kbX += dirX * 65;
            def.kbY += dirY * 65;
            ah.hitCooldown = 0.24;
            blockedByHex = true;

            if (ah.state === 'LAUNCHED') {
              if (att.rotMode === 'random' && ah.bouncesLeft > 0) {
                const dot = ah.vx * nx + ah.vy * ny;
                const rx = ah.vx - 2 * dot * nx;
                const ry = ah.vy - 2 * dot * ny;
                const jitter = (Math.random() - 0.5) * 0.44;
                const ang = Math.atan2(ry, rx) + jitter;
                const spd = Math.max(280, vLen * 0.92);
                ah.vx = Math.cos(ang) * spd;
                ah.vy = Math.sin(ang) * spd;
                ah.bouncesLeft--;
                ah.hasBounced = true;
                ah.energy = ah.initialEnergy * 0.85;
                ah.remainingDist = Math.max(ah.remainingDist, 180);
                state.events.push({
                  type: 'sparks',
                  x: (ah.x + dh.x) * 0.5,
                  y: (ah.y + dh.y) * 0.5,
                  color: '#fbbf24',
                  count: 8,
                  speed: 220,
                  size: 2.8,
                });
                state.events.push({ type: 'sfx', kind: 'bounce' });
              } else if (ah.autoReturn) {
                ah.energy = 0;
                ah.state = 'RECALLING';
                ah.isAutoReturning = true;
                ah.vx = 0;
                ah.vy = 0;
              } else {
                ah.energy = 0;
                ah.state = 'PLANTED';
                ah.vx = 0;
                ah.vy = 0;
                placePlantedHexSafely(state.obstacles, ah, attR, att, def);
              }
            } else {
              ah.energy = 0;
            }
            break;
          } else {
            damageHex(state, att, ah, def, dh, attackDmgMult, { forceShatter: true });
            applyLooseSelfWear(state, att, ah, def, dh, rDef);
            const remE = Math.max(0, eEff - rDef);
            ah.energy = remE;
            if (ah.state === 'LAUNCHED' && ah.initialEnergy > 0) {
              const ratio = clamp(remE / ah.initialEnergy, 0.30, 1.0);
              ah.vx *= ratio;
              ah.vy *= ratio;
            }
            continue;
          }
        }

        // Defense Stance normal bash: 0 durability/HP damage, pure pushback
        if (isAssembledAttacking && attStance === 'defense' && att.attackAnim) {
          att.attackAnim.hitHexIds.add(dh.id);
          const pushAng = Math.atan2(def.y - att.y, def.x - att.x);
          def.kbX += Math.cos(pushAng) * 180;
          def.kbY += Math.sin(pushAng) * 180;
          state.events.push({
            type: 'sparks',
            x: (ah.x + dh.x) * 0.5,
            y: (ah.y + dh.y) * 0.5,
            color: '#34d399',
            count: 6,
            speed: 170,
            size: 2.5,
          });
          state.events.push({ type: 'sfx', kind: clashSfxForHexes(ah, dh) });
          blockedByHex = true;
          break;
        }

        // Anchored Melee / Planted / Centrifugal Orbit clash
        chargeShieldFortress(state, att, def, 45);
        damageHex(state, att, ah, def, dh, attackDmgMult);
        if (isHexAnchored(def, dh)) {
          damageHex(state, def, dh, att, ah, 0.55);
          blockedByHex = true;
        }
        if (isAssembledAttacking && att.attackAnim) {
          att.attackAnim.hitHexIds.add(dh.id);
        } else {
          ah.hitCooldown = 0.26;
        }
        break;
      }

      if (blockedByHex) continue;

      // Step 2 (Rule 1): Ground Hitbox Ring check
      const dBody = dist(ah.x, ah.y, def.x, def.y);
      if (dBody < attR * 0.85 + PLAYER_RADIUS) {
        if (!isHighFlightRecall && segmentIntersectsAnyObstacle(state.obstacles, ah.x, ah.y, def.x, def.y, 0)) continue;
        if (isBodyShieldedAlongPath(ah.x, ah.y, def, defR, state.walls)) continue;

        if (isAssembledAttacking && att.attackAnim) {
          if (!att.attackAnim.hitBody) {
            att.attackAnim.hitBody = true;
            if (attStance === 'defense') {
              const kbAng = Math.atan2(def.y - att.y, def.x - att.x);
              def.kbX += Math.cos(kbAng) * 320;
              def.kbY += Math.sin(kbAng) * 320;
              state.events.push({ type: 'sparks', x: def.x, y: def.y, color: '#34d399', count: 10, speed: 220, size: 3.0 });
              state.events.push({ type: 'floatingText', x: def.x, y: def.y - 24, text: 'ĐẨY LÙI!', color: '#34d399', scale: 0.95 });
              state.events.push({ type: 'sfx', kind: clashSfxForHexes(ah, ah) });
            } else {
              damageFighterBody(state, att, ah, def, 1.05 * attackDmgMult);
            }
          }
        } else {
          let energyRatio = 1.0;
          if (ah.state === 'LAUNCHED' && ah.initialEnergy > 0) {
            energyRatio = clamp(ah.energy / ah.initialEnergy, 0.25, 1.0);
          }
          const mult = isLooseOverdriveOrbit
            ? 0.55
            : isAutoReturnLoose
              ? 0.40
              : ah.state === 'RECALLING'
                ? 0.90
                : ah.state === 'PLANTED'
                  ? 0.50
                  : 0.80 * energyRatio;
          damageFighterBody(state, att, ah, def, mult);
          ah.hitCooldown = isLooseOverdriveOrbit ? 0.38 : 0.30;
          if (ah.state === 'LAUNCHED' && att.rotMode !== 'random') {
            ah.vx *= 0.65;
            ah.vy *= 0.65;
          }
        }
      }
    }
  }
}
