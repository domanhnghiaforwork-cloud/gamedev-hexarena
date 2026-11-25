import {
  ARENA_RADIUS,
  BASE_HEX_RADIUS,
  DASH_COOLDOWN,
  DASH_DURATION,
  DASH_SPEED,
  PLAYER_RADIUS,
} from '@core/constants';
import { applyHexDurabilityLoss } from '@core/combat';
import { angleDiff, clamp, dist } from '@core/hexMath';
import { isCircleBlockedByObstacle, segmentIntersectsAnyObstacle } from '@core/obstacles';
import {
  executeFighterAttack,
  executeFighterDash,
  issueGuidedWaypoint,
  setFighterForm,
  setFighterRotMode,
  setFighterScale,
  triggerFighterSpecial,
  triggerSmartRecall,
} from '@core/skills';
import { getActiveStance, getLooseGravityFieldRadius } from '@core/structure';
import type { CombatStance, Fighter, FormKey, MatchState, Obstacle, ScaleTier, SlotKey } from '@core/types';

type BotTactic = 'poke' | 'flank' | 'rush' | 'kite' | 'counter' | 'trap';

interface BotBrain {
  tactic: BotTactic;
  formLockTimer: number;
  strafeFlipTimer: number;
  guidedWaypointTimer: number;
  lastPlayerSpecial: string | null;
  shieldTiltSign: 1 | -1;
}

interface ThreatInfo {
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  dist: number;
  threatAngle: number;
}

const botBrains = new WeakMap<Fighter, BotBrain>();

function getBrain(enemy: Fighter): BotBrain {
  let brain = botBrains.get(enemy);
  if (!brain) {
    brain = {
      tactic: 'poke',
      formLockTimer: 0,
      strafeFlipTimer: 2.2,
      guidedWaypointTimer: 0,
      lastPlayerSpecial: null,
      shieldTiltSign: 1,
    };
    botBrains.set(enemy, brain);
  }
  return brain;
}

function findSlotByStance(fighter: Fighter, stance: CombatStance): SlotKey | null {
  const keys: SlotKey[] = ['slot1', 'slot2', 'slot3'];
  for (const k of keys) {
    if (fighter.loadout.blueprints[k].stance === stance) return k;
  }
  return null;
}

function distPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq < 1e-4) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / lenSq, 0, 1);
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

function isPointShieldedByPlayer(player: Fighter, fromX: number, fromY: number): boolean {
  const pStance = getActiveStance(player);
  if (pStance !== 'defense' && player.specialActive?.type !== 'defense') return false;
  const angFromPlayer = Math.atan2(fromY - player.y, fromX - player.x);
  return Math.abs(angleDiff(player.facing, angFromPlayer)) < 0.92;
}

function findNearestIncomingThreat(enemy: Fighter, player: Fighter): ThreatInfo | null {
  let best: ThreatInfo | null = null;
  let bestDist = 250;

  if (player.attackAnim && player.attackAnim.type === 'ranged') {
    const anim = player.attackAnim;
    const spd = anim.phase === 'guided' ? (anim.guidedSpeed ?? 380) : anim.phase === 'return' ? anim.retSpeed : anim.outSpeed;
    const vx = Math.cos(anim.angle) * spd;
    const vy = Math.sin(anim.angle) * spd;
    const dx = enemy.x - anim.anchorX;
    const dy = enemy.y - anim.anchorY;
    const d = Math.hypot(dx, dy);
    if (d > 1e-3 && d < bestDist && spd > 1e-3) {
      const dot = (vx * dx + vy * dy) / (spd * d);
      if (dot > 0.65) {
        bestDist = d;
        best = { tx: anim.anchorX, ty: anim.anchorY, vx, vy, dist: d, threatAngle: anim.angle };
      }
    }
  }

  for (const h of player.hexes) {
    if (h.state !== 'LAUNCHED' && h.state !== 'RECALLING') continue;
    let vx = h.vx;
    let vy = h.vy;
    if (h.state === 'RECALLING') {
      vx = player.x - h.x;
      vy = player.y - h.y;
    }
    const spd = Math.hypot(vx, vy);
    const dx = enemy.x - h.x;
    const dy = enemy.y - h.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-3 && d < bestDist && spd > 20) {
      const dot = (vx * dx + vy * dy) / (spd * d);
      if (dot > 0.65) {
        bestDist = d;
        best = { tx: h.x, ty: h.y, vx, vy, dist: d, threatAngle: Math.atan2(vy, vx) };
      }
    }
  }

  return best;
}

function scoreDashEndpoint(x: number, y: number, obstacles: Obstacle[]): number {
  const wallMargin = ARENA_RADIUS * 0.86 - Math.hypot(x, y);
  if (wallMargin < PLAYER_RADIUS + 8) return -1000 + wallMargin;
  let minObsClear = 400;
  for (const obs of obstacles) {
    if (isCircleBlockedByObstacle(obstacles, x, y, PLAYER_RADIUS + 4)) return -900;
    minObsClear = Math.min(minObsClear, dist(x, y, obs.x, obs.y) - obs.boundR);
  }
  return Math.min(wallMargin, minObsClear);
}

function chooseBestPerpAngle(x: number, y: number, refAngle: number, dashDist: number, obstacles: Obstacle[]): number {
  const a1 = refAngle + Math.PI * 0.5;
  const a2 = refAngle - Math.PI * 0.5;
  const s1 = scoreDashEndpoint(x + Math.cos(a1) * dashDist, y + Math.sin(a1) * dashDist, obstacles);
  const s2 = scoreDashEndpoint(x + Math.cos(a2) * dashDist, y + Math.sin(a2) * dashDist, obstacles);
  return s1 >= s2 ? a1 : a2;
}

function pickNonMirrorForm(
  enemy: Fighter,
  candidates: Array<'loose' | CombatStance>,
  avoidStance: CombatStance | 'loose' | null,
): { form: FormKey; rotMode?: 'normal' | 'random' } {
  const filtered = avoidStance ? candidates.filter((c) => c !== avoidStance) : candidates;
  const ordered = filtered.length > 0 ? filtered : candidates;
  for (const item of ordered) {
    if (item === 'loose') {
      return { form: 'loose', rotMode: avoidStance === 'ranged' ? 'random' : 'normal' };
    }
    const slot = findSlotByStance(enemy, item);
    if (slot) return { form: slot };
  }
  return { form: 'loose', rotMode: 'random' };
}

function chooseCounterPlan(state: MatchState, brain: BotBrain, dToPlayer: number): void {
  const { enemy, player } = state;
  const enemyIntactRatio = enemy.hexes.filter((h) => h.state !== 'BROKEN').length / Math.max(1, enemy.hexes.length);
  const playerIntactRatio = player.hexes.filter((h) => h.state !== 'BROKEN').length / Math.max(1, player.hexes.length);
  const playerStance = getActiveStance(player);
  const playerSpec = player.specialActive?.type ?? null;

  let targetForm: FormKey = enemy.form;
  let targetScale: ScaleTier = enemy.targetScale;
  let targetRot: 'normal' | 'random' | undefined;
  let tactic: BotTactic = 'poke';

  if (playerSpec === 'defense') {
    // NEVER mirror Pháo Đài! Kite outside blast or flank behind shield using ranged pierce / loose pincer.
    const pick = pickNonMirrorForm(enemy, ['ranged', 'loose', 'melee'], 'defense');
    targetForm = pick.form;
    targetRot = pick.rotMode ?? 'normal';
    targetScale = targetForm === 'loose' ? 1.0 : 0.6;
    tactic = isPointShieldedByPlayer(player, enemy.x, enemy.y) ? 'flank' : 'kite';
  } else if (playerSpec === 'melee') {
    // NEVER mirror Phản Chém Tước Mảnh! Kite at range so melee cannot disarm Bot hexes.
    const pick = pickNonMirrorForm(enemy, ['ranged', 'loose'], 'melee');
    targetForm = pick.form;
    targetRot = 'random';
    targetScale = enemyIntactRatio < 0.6 ? 1.0 : 0.6;
    tactic = 'kite';
  } else if (playerSpec === 'ranged') {
    // Punish player's exposed body if Ngự Thương spear is far away; otherwise deflect with Loose tumble!
    const spearDistFromPlayer =
      player.attackAnim?.type === 'ranged' ? dist(player.x, player.y, player.attackAnim.anchorX, player.attackAnim.anchorY) : 0;
    if (spearDistFromPlayer > 170 && dToPlayer < 265) {
      const pick = pickNonMirrorForm(enemy, ['melee', 'loose'], 'ranged');
      targetForm = pick.form;
      targetScale = 0.6;
      tactic = 'rush';
    } else {
      targetForm = 'loose';
      targetRot = 'random';
      targetScale = 1.0;
      tactic = 'flank';
    }
  } else if (playerSpec === 'loose') {
    // Stay outside enlarged sawblade ring and poke with ranged armor-pierce
    const pick = pickNonMirrorForm(enemy, ['ranged', 'melee'], 'loose');
    targetForm = pick.form;
    targetScale = 0.6;
    tactic = 'kite';
  } else if (enemyIntactRatio <= 0.40) {
    // Recovery defense posture with random tumble deflection
    targetForm = 'loose';
    targetRot = 'random';
    targetScale = 1.0;
    tactic = 'kite';
  } else if (playerIntactRatio <= 0.45) {
    // Punish crippled player
    const prefer: CombatStance[] = dToPlayer < 270 ? ['melee', 'ranged'] : ['ranged', 'melee'];
    const pick = pickNonMirrorForm(enemy, prefer, playerStance);
    targetForm = pick.form;
    targetScale = 0.6;
    tactic = 'rush';
  } else if (playerStance === 'defense') {
    // Against normal defense shield: trap with Xayah recall, flank with melee, or pierce from angle
    const order: Array<'loose' | CombatStance> =
      dToPlayer < 235 ? ['loose', 'melee', 'ranged'] : ['ranged', 'loose', 'melee'];
    const pick = pickNonMirrorForm(enemy, order, 'defense');
    targetForm = pick.form;
    targetRot = 'normal';
    targetScale = targetForm === 'loose' ? 1.0 : 0.6;
    tactic = targetForm === 'loose' ? 'trap' : 'flank';
  } else if (playerStance === 'ranged') {
    const order: Array<'loose' | CombatStance> =
      dToPlayer < 290 ? ['melee', 'loose'] : ['loose', 'melee'];
    const pick = pickNonMirrorForm(enemy, order, 'ranged');
    targetForm = pick.form;
    targetRot = 'random';
    targetScale = targetForm === 'loose' ? 1.0 : 0.6;
    tactic = dToPlayer < 290 ? 'rush' : 'flank';
  } else if (playerStance === 'melee') {
    // Counter melee with kiting ranged or planted hex barriers (never mirror melee)
    const order: Array<'loose' | CombatStance> =
      dToPlayer < 165 ? ['loose', 'defense', 'ranged'] : ['ranged', 'loose'];
    const pick = pickNonMirrorForm(enemy, order, 'melee');
    targetForm = pick.form;
    targetRot = 'normal';
    targetScale = targetForm === 'loose' ? 1.0 : pick.form === findSlotByStance(enemy, 'defense') ? 1.5 : 0.6;
    tactic = 'kite';
  } else {
    // Against loose: rush with melee / pierce with ranged — avoid copying loose
    const order: Array<'loose' | CombatStance> =
      dToPlayer < 250 ? ['melee', 'ranged', 'defense'] : ['ranged', 'melee'];
    const pick = pickNonMirrorForm(enemy, order, null);
    targetForm = pick.form;
    targetScale = targetForm === findSlotByStance(enemy, 'defense') ? 1.5 : 0.6;
    tactic = dToPlayer < 250 ? 'rush' : 'poke';
  }

  brain.tactic = tactic;

  if (targetForm !== enemy.form) {
    // Hold off form switch only if we are actively steering a live Ranged spear unless facing Pháo Đài
    const activeGuided =
      enemy.specialActive?.type === 'ranged' &&
      enemy.attackAnim?.type === 'ranged' &&
      enemy.attackAnim.phase === 'guided';
    if (!activeGuided || playerSpec === 'defense') {
      setFighterForm(state, enemy, targetForm);
      brain.formLockTimer = playerSpec ? 0.65 : 1.65;
    }
  }

  if (enemy.form === 'loose') {
    if (targetRot) setFighterRotMode(state, enemy, targetRot);
    enemy.fireMode = brain.tactic === 'trap' ? 'xayah' : dToPlayer < 250 ? 'volley' : 'xayah';
  }

  if (enemy.specialActive?.type !== 'defense' && Math.abs(enemy.targetScale - targetScale) > 0.05) {
    setFighterScale(state, enemy, targetScale);
  }
}

function computeLeadAngle(enemy: Fighter, player: Fighter, projSpeed: number): number {
  const d = dist(enemy.x, enemy.y, player.x, player.y);
  const travelT = clamp(d / Math.max(180, projSpeed), 0, 0.52);
  const predX = player.x + player.vx * travelT * 0.72;
  const predY = player.y + player.vy * travelT * 0.72;
  return Math.atan2(predY - enemy.y, predX - enemy.x);
}

function hasRecallLineThroughPlayer(enemy: Fighter, player: Fighter): boolean {
  for (const h of enemy.hexes) {
    if (h.state !== 'PLANTED') continue;
    if (distPointToSegment(player.x, player.y, h.x, h.y, enemy.x, enemy.y) <= 72) {
      return true;
    }
  }
  return false;
}

function steerGuidedSpear(state: MatchState, enemy: Fighter, player: Fighter, brain: BotBrain, dt: number): void {
  const anim = enemy.attackAnim;
  if (!anim || anim.type !== 'ranged' || anim.phase !== 'guided') return;
  brain.guidedWaypointTimer -= dt;
  if (brain.guidedWaypointTimer > 0) return;
  brain.guidedWaypointTimer = 0.16;

  const R = BASE_HEX_RADIUS * enemy.currentScale;
  const obsBlocked = segmentIntersectsAnyObstacle(state.obstacles, anim.anchorX, anim.anchorY, player.x, player.y, R * 0.8);
  const shieldBlocked = isPointShieldedByPlayer(player, anim.anchorX, anim.anchorY);

  let wx = player.x + player.vx * 0.22;
  let wy = player.y + player.vy * 0.22;

  if (shieldBlocked) {
    // Curve behind opponent's shield!
    const backAng = player.facing + Math.PI;
    const flankSide = angleDiff(backAng, Math.atan2(anim.anchorY - player.y, anim.anchorX - player.x)) >= 0 ? 1 : -1;
    const targetAng = backAng + flankSide * 0.45;
    wx = player.x + Math.cos(targetAng) * 95;
    wy = player.y + Math.sin(targetAng) * 95;
  } else if (obsBlocked) {
    const toP = Math.atan2(player.y - anim.anchorY, player.x - anim.anchorX);
    const perp = chooseBestPerpAngle(anim.anchorX, anim.anchorY, toP, 110, state.obstacles);
    wx = anim.anchorX + Math.cos(perp) * 115;
    wy = anim.anchorY + Math.sin(perp) * 115;
  }

  issueGuidedWaypoint(state, enemy, wx, wy, false);
}

export function updateBotAI(state: MatchState, dt: number): void {
  if (state.matchOver) return;
  const { enemy, player, obstacles } = state;
  const brain = getBrain(enemy);

  const dToPlayer = dist(enemy.x, enemy.y, player.x, player.y);
  const angToPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);

  enemy.aiTimer -= dt;
  enemy.aiActionTimer -= dt;
  brain.formLockTimer = Math.max(0, brain.formLockTimer - dt);
  brain.strafeFlipTimer -= dt;
  if (brain.strafeFlipTimer <= 0) {
    brain.strafeFlipTimer = 1.8 + Math.random() * 1.4;
    enemy.aiStrafeDir = Math.random() < 0.5 ? -1 : 1;
    brain.shieldTiltSign = Math.random() < 0.5 ? 1 : -1;
  }

  const playerSpec = player.specialActive?.type ?? null;
  if (playerSpec !== brain.lastPlayerSpecial) {
    brain.lastPlayerSpecial = playerSpec;
    if (playerSpec !== null) {
      // Immediate counter-reassessment when player pops an Ulti (prevent stale posture)
      brain.formLockTimer = 0;
      enemy.aiTimer = 0;
    }
  }

  // 1. Tactical Plan & Anti-Mirroring Counter-Play
  if (enemy.aiTimer <= 0 && brain.formLockTimer <= 0) {
    enemy.aiTimer = 0.85 + Math.random() * 0.75;
    chooseCounterPlan(state, brain, dToPlayer);
  }

  const playerStance = getActiveStance(player);
  const enemyStance = getActiveStance(enemy);
  const threat = findNearestIncomingThreat(enemy, player);

  // 2. Smart Facing + Shield Glancing Angle (Rule 4 deflection when holding normal Defense)
  if (!enemy.attackAnim) {
    let desiredFacing = angToPlayer;
    if (threat) {
      desiredFacing = Math.atan2(threat.ty - enemy.y, threat.tx - enemy.x);
    }
    if (enemyStance === 'defense' && enemy.specialActive?.type !== 'defense') {
      if (threat || (playerStance === 'melee' && dToPlayer < 220)) {
        // Tilt ~38° off incoming line so hits deflect cleanly off the shield edge!
        desiredFacing += brain.shieldTiltSign * 0.66;
      }
    }
    const diff = angleDiff(enemy.facing, desiredFacing);
    if (enemy.specialActive?.type === 'defense') {
      enemy.facing += clamp(diff, -3.4 * dt, 3.4 * dt);
    } else {
      enemy.facing += diff * Math.min(1, dt * 11);
    }
  }

  // 3. Tactical Evasive / Flanking Dash (real vector-aware dash!)
  if (enemy.dashCooldown <= 0 && enemy.dashTimer <= 0 && enemy.specialActive?.type !== 'defense') {
    const dashDist = DASH_SPEED * DASH_DURATION;
    if (threat && threat.dist < 185) {
      const evadeAng = chooseBestPerpAngle(enemy.x, enemy.y, threat.threatAngle, dashDist, obstacles);
      executeFighterDash(state, enemy, evadeAng);
      enemy.dashCooldown = DASH_COOLDOWN + 1.1;
    } else if (
      (player.specialActive?.type === 'defense' || player.specialActive?.type === 'melee' || playerStance === 'melee') &&
      brain.tactic === 'kite' &&
      dToPlayer < 195
    ) {
      const awayAng = angToPlayer + Math.PI + enemy.aiStrafeDir * 0.35;
      executeFighterDash(state, enemy, awayAng);
      enemy.dashCooldown = DASH_COOLDOWN + 1.2;
    } else if (brain.tactic === 'flank' && isPointShieldedByPlayer(player, enemy.x, enemy.y) && dToPlayer < 280) {
      const flankAng = chooseBestPerpAngle(enemy.x, enemy.y, angToPlayer, dashDist, obstacles);
      executeFighterDash(state, enemy, flankAng);
      enemy.dashCooldown = DASH_COOLDOWN + 1.4;
    }
  }

  // 4. Smart Movement, Flanking & Cover Navigation
  const minSafeDist =
    player.specialActive?.type === 'defense'
      ? 295
      : player.specialActive?.type === 'melee'
        ? 360
        : player.specialActive?.type === 'loose'
          ? Math.max(255, getLooseGravityFieldRadius(player) + PLAYER_RADIUS + 75)
          : enemyStance === 'ranged'
            ? 355
            : enemy.form === 'loose'
              ? 275
              : enemyStance === 'melee'
                ? 135
                : 155;

  let moveX = 0;
  let moveY = 0;

  if (dToPlayer > minSafeDist + 35 && brain.tactic !== 'kite') {
    moveX += Math.cos(angToPlayer);
    moveY += Math.sin(angToPlayer);
  } else if (dToPlayer < minSafeDist - 25) {
    moveX -= Math.cos(angToPlayer);
    moveY -= Math.sin(angToPlayer);
  }

  // Tangential strafe + stronger flank push around player's front shield
  const shieldedFront = isPointShieldedByPlayer(player, enemy.x, enemy.y);
  let strafeDir = enemy.aiStrafeDir;
  if (shieldedFront) {
    const backSide = angleDiff(player.facing, angToPlayer) >= 0 ? 1 : -1;
    strafeDir = backSide;
  }
  const strafeWeight = shieldedFront ? 1.25 : 0.85;
  moveX += Math.cos(angToPlayer + (Math.PI / 2) * strafeDir) * strafeWeight;
  moveY += Math.sin(angToPlayer + (Math.PI / 2) * strafeDir) * strafeWeight;

  // Avoid arena wall boundary cleanly
  const rDist = Math.hypot(enemy.x, enemy.y);
  if (rDist > ARENA_RADIUS * 0.72) {
    const inward = Math.atan2(-enemy.y, -enemy.x);
    const w = clamp((rDist - ARENA_RADIUS * 0.72) / 140, 0.3, 1.8);
    moveX += Math.cos(inward) * w;
    moveY += Math.sin(inward) * w;
  }

  // Obstacle avoidance & LOS-clearing strafe
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
    if (ph.state !== 'PLANTED' && ph.state !== 'STOLEN_FLOOR') continue;
    const pd = dist(enemy.x, enemy.y, ph.x, ph.y);
    if (pd < PLAYER_RADIUS + pHexR + 38) {
      const away = Math.atan2(enemy.y - ph.y, enemy.x - ph.x);
      moveX += Math.cos(away) * 1.35;
      moveY += Math.sin(away) * 1.35;
    }
  }

  const mLen = Math.hypot(moveX, moveY);
  if (mLen > 0.05) {
    const aiSpeed = 192;
    enemy.vx = (moveX / mLen) * aiSpeed;
    enemy.vy = (moveY / mLen) * aiSpeed;
  } else {
    enemy.vx *= 0.85;
    enemy.vy *= 0.85;
  }

  // 5. Contextual Non-Copycat Special Skill Activation & Guided Steering
  const losClear = !segmentIntersectsAnyObstacle(obstacles, enemy.x, enemy.y, player.x, player.y, BASE_HEX_RADIUS * 0.6);
  const playerHasPhaiDai = player.specialActive?.type === 'defense';

  if (enemy.specialCooldown <= 0 && !enemy.specialActive) {
    const shouldPopMelee =
      enemyStance === 'melee' &&
      !playerHasPhaiDai &&
      ((threat !== null && threat.dist < 240) || dToPlayer < 205);
    const shouldPopRanged =
      enemyStance === 'ranged' && dToPlayer >= 210 && dToPlayer <= 500 && !playerHasPhaiDai;
    const shouldPopDefense =
      enemyStance === 'defense' && !playerHasPhaiDai && ((threat !== null && threat.dist < 230) || dToPlayer < 205);
    const shouldPopLoose =
      enemy.form === 'loose' &&
      !playerHasPhaiDai &&
      enemy.hexes.filter((h) => h.state === 'ORBIT').length >= 4 &&
      dToPlayer <= Math.max(245, getLooseGravityFieldRadius(enemy) + PLAYER_RADIUS + 85);

    if (shouldPopMelee || shouldPopRanged || shouldPopDefense || shouldPopLoose) {
      triggerFighterSpecial(state, enemy, applyHexDurabilityLoss);
      enemy.specialCooldown += 2.0;
    }
  }

  // Steer Ngự Thương Độc Lập around shields & obstacles via issueGuidedWaypoint
  steerGuidedSpear(state, enemy, player, brain, dt);

  // 6. Smart Attack Timing, Xayah Pincer Recall & Counter-Pulse Release
  if (enemy.form === 'loose' && hasRecallLineThroughPlayer(enemy, player)) {
    // Immediate pincer slice whenever player crosses the return path of a planted hex!
    if (triggerSmartRecall(state, enemy)) {
      enemy.aiActionTimer = 0.65;
      return;
    }
  }

  if (enemy.aiActionTimer <= 0) {
    if (enemy.form === 'loose') {
      const planted = enemy.hexes.filter((h) => h.state === 'PLANTED');
      const orbiting = enemy.hexes.filter((h) => h.state === 'ORBIT');
      if (planted.length >= 3 || (planted.length >= 1 && orbiting.length === 0)) {
        triggerSmartRecall(state, enemy);
        enemy.aiActionTimer = 0.72 + Math.random() * 0.3;
      } else if (orbiting.length > 0 && dToPlayer < 520 && losClear) {
        // Hold firing straight into Pháo Đài shield unless flanked or trapping behind it
        const aimBase = computeLeadAngle(enemy, player, 640);
        const trapOffset = playerHasPhaiDai || (brain.tactic === 'trap' && shieldedFront)
          ? strafeDir * 0.44
          : (Math.random() - 0.5) * 0.07;
        const str = clamp((dToPlayer - 95) / 340 + (brain.tactic === 'trap' ? 0.18 : 0), 0.28, 0.96);
        executeFighterAttack(state, enemy, aimBase + trapOffset, str, applyHexDurabilityLoss);
        enemy.aiActionTimer = 0.40 + Math.random() * 0.28;
      } else {
        enemy.aiActionTimer = 0.25;
      }
    } else if (enemyStance === 'ranged') {
      const canThrow = !enemy.attackAnim && dToPlayer < 560 && losClear && !(playerHasPhaiDai && shieldedFront);
      if (canThrow) {
        const aim = computeLeadAngle(enemy, player, 680 * Math.pow(enemy.currentScale, -0.5));
        const str = clamp((dToPlayer - 190) / 310, 0.45, 1.0);
        executeFighterAttack(state, enemy, aim + (Math.random() - 0.5) * 0.05, str, applyHexDurabilityLoss);
        enemy.aiActionTimer = 0.85 + Math.random() * 0.45;
      } else {
        enemy.aiActionTimer = 0.24;
      }
    } else if (enemyStance === 'melee') {
      if (dToPlayer < 208 && losClear) {
        const aim = computeLeadAngle(enemy, player, 520);
        executeFighterAttack(state, enemy, aim, 1.0, applyHexDurabilityLoss);
        enemy.aiActionTimer = 0.65 + Math.random() * 0.35;
      } else {
        enemy.aiActionTimer = 0.22;
      }
    } else if (enemyStance === 'defense') {
      // Pure defense stance: only detonate Pháo Đài Counter-Pulse when charged or timer almost up
      const stored = enemy.specialActive?.storedEnergy ?? 0;
      const timer = enemy.specialActive?.timer ?? 99;
      if (
        enemy.specialActive?.type === 'defense' &&
        dToPlayer < 235 &&
        (stored >= 75 || timer < 0.45)
      ) {
        executeFighterAttack(state, enemy, angToPlayer, 1.0, applyHexDurabilityLoss);
        enemy.aiActionTimer = 0.85;
      } else {
        enemy.aiActionTimer = 0.28;
      }
    }
  }
}
