import {
  BASE_HEX_RADIUS,
  HEX_REGEN_RATE,
  MATCH_DURATION,
  PLAYER_RADIUS,
  SPAWN_OFFSET_X,
  createDefaultLoadout,
} from './constants';
import { applyHexDurabilityLoss, damageFighterBody, resolveCombatCollisions } from './combat';
import { angleDiff, axialToLocal, clamp, dist, lerp } from './hexMath';
import {
  constrainToHexArena,
  generateObstacles,
  isCircleBlockedByObstacle,
  placePlantedHexSafely,
  resolveCircleObstacle,
  segmentIntersectsAnyObstacle,
  segmentIntersectsObstacle,
} from './obstacles';
import { launchHex, setFighterForm, triggerShieldCounterPulse } from './skills';
import {
  applyBlueprintFormation,
  createFighter,
  getActiveAnchorDist,
  getActiveStance,
  insertRecoveredHexIntoCluster,
  isSlotKey,
} from './structure';
import type { Fighter, GuidedSteerInput, MatchState, PlayerLoadout } from './types';

export function createMatchState(
  playerLoadout: PlayerLoadout = createDefaultLoadout(),
  enemyLoadout: PlayerLoadout = createDefaultLoadout(),
  rng: () => number = Math.random,
  enemyIsAI = true,
): MatchState {
  const player = createFighter('player', -SPAWN_OFFSET_X, 0, playerLoadout, false);
  const enemy = createFighter('enemy', SPAWN_OFFSET_X, 0, enemyLoadout, enemyIsAI);
  const obstacles = generateObstacles(rng);

  const state: MatchState = {
    player,
    enemy,
    obstacles,
    timeRemaining: MATCH_DURATION,
    hitStopTimer: 0,
    matchOver: false,
    winner: null,
    stats: {
      dmgDealt: 0,
      enemyDmg: 0,
      hexBroken: 0,
      elapsed: 0,
    },
    events: [],
  };

  if (enemyIsAI) {
    // AI starts assembled in Slot 1 for immediate readable sparring
    setFighterForm(state, enemy, 'slot1');
    state.events.length = 0;
  }
  return state;
}

function checkAssembledWallHit(
  state: MatchState,
  fighter: Fighter,
  originX: number,
  originY: number,
  testAngle: number,
  distOffset: number,
  R: number,
): { hx: number; hy: number; nx: number; ny: number } | null {
  const cosT = Math.cos(testAngle);
  const sinT = Math.sin(testAngle);
  for (const h of fighter.hexes) {
    if (h.state !== 'ASSEMBLED') continue;
    const loc = axialToLocal(h.animQ, h.animR, R);
    const wx = distOffset + loc.x;
    const wy = loc.y;
    const hx = originX + wx * cosT - wy * sinT;
    const hy = originY + wx * sinT + wy * cosT;
    const obsHit = isCircleBlockedByObstacle(state.obstacles, hx, hy, R * 0.80);
    if (obsHit) return { hx, hy, nx: obsHit.nx, ny: obsHit.ny };
    const segHit = segmentIntersectsAnyObstacle(state.obstacles, originX, originY, hx, hy, R * 0.20);
    if (segHit) return { hx, hy, nx: segHit.nx, ny: segHit.ny };
  }
  return null;
}

export function updateFighter(
  state: MatchState,
  fighter: Fighter,
  opponent: Fighter,
  dt: number,
  guidedInput?: GuidedSteerInput,
): void {
  // Smooth scale interpolation preserving exact edge-locking every frame
  fighter.currentScale = lerp(fighter.currentScale, fighter.targetScale, Math.min(1, dt * 13));
  if (Math.abs(fighter.currentScale - fighter.targetScale) < 0.002) {
    fighter.currentScale = fighter.targetScale;
  }

  if (fighter.attackCooldown > 0) fighter.attackCooldown = Math.max(0, fighter.attackCooldown - dt);
  if (fighter.dashCooldown > 0) fighter.dashCooldown = Math.max(0, fighter.dashCooldown - dt);
  if (fighter.specialCooldown > 0) fighter.specialCooldown = Math.max(0, fighter.specialCooldown - dt);
  if (fighter.damageFlash > 0) fighter.damageFlash = Math.max(0, fighter.damageFlash - dt);
  if (fighter.pingTimer > 0) {
    fighter.pingTimer = Math.max(0, fighter.pingTimer - dt);
    if (fighter.pingTimer === 0) fighter.pingHexId = -1;
  }

  // Update active Special Skill timer
  if (fighter.specialActive) {
    fighter.specialActive.timer -= dt;
    if (fighter.specialActive.type === 'defense') {
      fighter.targetScale = 1.5;
    }
    if (fighter.specialActive.timer <= 0) {
      const ended = fighter.specialActive;
      if (ended.type === 'defense') {
        triggerShieldCounterPulse(state, fighter, opponent, applyHexDurabilityLoss);
      } else if (ended.type === 'ranged') {
        fighter.specialActive = null;
        if (fighter.attackAnim && fighter.attackAnim.type === 'ranged' && fighter.attackAnim.phase === 'guided') {
          fighter.attackAnim.phase = 'return';
          fighter.attackAnim.energy = fighter.attackAnim.initialEnergy * 0.5;
          fighter.attackAnim.hitBody = false;
          fighter.attackAnim.hitHexIds.clear();
          state.events.push({ type: 'sfx', kind: 'recall' });
        }
      } else {
        fighter.specialActive = null;
      }
    }
  }

  // Decay dash afterimages
  for (let i = fighter.dashAfterimages.length - 1; i >= 0; i--) {
    fighter.dashAfterimages[i].life -= dt;
    if (fighter.dashAfterimages[i].life <= 0) fighter.dashAfterimages.splice(i, 1);
  }

  // Sequential fire queue (Loose mode)
  if (fighter.seqFireQueue.length > 0 && fighter.form === 'loose') {
    fighter.seqFireTimer -= dt;
    if (fighter.seqFireTimer <= 0) {
      const job = fighter.seqFireQueue.shift()!;
      const hex = fighter.hexes[job.hexId];
      if (hex && hex.state === 'ORBIT') {
        launchHex(state, fighter, hex, job.angle, job.strength, job.fireMode);
      }
      fighter.seqFireTimer = fighter.specialActive?.type === 'loose' ? 0.068 : 0.085;
    }
  }

  // Movement & Dash (Defense Fortress reduces move speed by -40%)
  const moveMult = fighter.specialActive?.type === 'defense' ? 0.60 : 1.0;
  if (fighter.dashTimer > 0) {
    fighter.dashTimer = Math.max(0, fighter.dashTimer - dt);
    fighter.x += fighter.dashVx * dt;
    fighter.y += fighter.dashVy * dt;
    if (Math.random() < 0.65) {
      fighter.dashAfterimages.push({ x: fighter.x, y: fighter.y, life: 0.22, maxLife: 0.22 });
    }
  } else {
    fighter.x += (fighter.vx * moveMult + fighter.kbX) * dt;
    fighter.y += (fighter.vy * moveMult + fighter.kbY) * dt;
  }
  fighter.kbX *= Math.pow(0.015, dt);
  fighter.kbY *= Math.pow(0.015, dt);

  constrainToHexArena(fighter, PLAYER_RADIUS + 4);
  for (const obs of state.obstacles) {
    const hit = resolveCircleObstacle(fighter.x, fighter.y, PLAYER_RADIUS, obs);
    if (hit) {
      fighter.x += hit.nx * hit.push;
      fighter.y += hit.ny * hit.push;
    }
  }

  // Solid physical barrier collision with PLANTED & STOLEN_FLOOR hexes
  for (const owner of [opponent, fighter]) {
    const pr = BASE_HEX_RADIUS * owner.currentScale * 0.88;
    const minPD = PLAYER_RADIUS + pr;
    for (const ph of owner.hexes) {
      if (ph.state !== 'PLANTED' && ph.state !== 'STOLEN_FLOOR') continue;
      const pdx = fighter.x - ph.x;
      const pdy = fighter.y - ph.y;
      const pd = Math.hypot(pdx, pdy);
      if (pd < minPD) {
        const nx = pd > 1e-4 ? pdx / pd : Math.cos(fighter.facing + Math.PI);
        const ny = pd > 1e-4 ? pdy / pd : Math.sin(fighter.facing + Math.PI);
        const push = minPD - pd;
        fighter.x += nx * push;
        fighter.y += ny * push;
        if (fighter.dashTimer > 0) {
          const dashDot = fighter.dashVx * nx + fighter.dashVy * ny;
          if (dashDot < 0) {
            fighter.dashVx -= dashDot * nx;
            fighter.dashVy -= dashDot * ny;
          }
        }
        const isHostile =
          ph.state === 'STOLEN_FLOOR' ? ph.stolenById !== fighter.id : owner.id !== fighter.id;
        if (isHostile && ph.hitCooldown <= 0) {
          const dmgSource =
            ph.state === 'STOLEN_FLOOR'
              ? ph.stolenById === 'player'
                ? state.player
                : state.enemy
              : owner;
          const contactMult =
            ph.state === 'STOLEN_FLOOR' ? 0.50 : owner.rotMode === 'normal' ? 0.55 : 0.45;
          damageFighterBody(state, dmgSource, ph, fighter, contactMult);
          ph.hitCooldown = 0.45;
        }
      }
    }
  }

  constrainToHexArena(fighter, PLAYER_RADIUS + 4);
  for (const obs of state.obstacles) {
    const hit = resolveCircleObstacle(fighter.x, fighter.y, PLAYER_RADIUS, obs);
    if (hit) {
      fighter.x += hit.nx * hit.push;
      fighter.y += hit.ny * hit.push;
    }
  }

  // Prevent fighters overlapping
  const fdx = fighter.x - opponent.x;
  const fdy = fighter.y - opponent.y;
  const fd = Math.hypot(fdx, fdy);
  const minFD = PLAYER_RADIUS * 2.05;
  if (fd < minFD && fd > 0.001) {
    const push = (minFD - fd) * 0.5;
    fighter.x += (fdx / fd) * push;
    fighter.y += (fdy / fd) * push;
  }

  const R = BASE_HEX_RADIUS * fighter.currentScale;
  const baseAnchorDist = getActiveAnchorDist(fighter, R);
  let weaponAngle = fighter.isAiming ? fighter.aimAngle : fighter.facing;
  let forwardOffset = 0;

  // Advance active weapon animation
  if (fighter.attackAnim) {
    const anim = fighter.attackAnim;
    anim.timer += dt;

    if (anim.type === 'ranged') {
      if (anim.phase === 'out') {
        const prevX = anim.anchorX;
        const prevY = anim.anchorY;
        const energyRatio = anim.initialEnergy > 0 ? clamp(anim.energy / anim.initialEnergy, 0.25, 1.0) : 1.0;
        const step = anim.outSpeed * energyRatio * dt;
        anim.anchorX += Math.cos(anim.angle) * step;
        anim.anchorY += Math.sin(anim.angle) * step;
        anim.traveled += step;
        weaponAngle = anim.angle;

        let wallHitPos: { x: number; y: number } | null = null;
        const segHit = segmentIntersectsAnyObstacle(state.obstacles, prevX, prevY, anim.anchorX, anim.anchorY, R * 0.72);
        if (segHit) {
          wallHitPos = {
            x: lerp(prevX, anim.anchorX, segHit.t),
            y: lerp(prevY, anim.anchorY, segHit.t),
          };
        } else {
          const cosA = Math.cos(anim.angle);
          const sinA = Math.sin(anim.angle);
          for (const h of fighter.hexes) {
            if (h.state !== 'ASSEMBLED') continue;
            const loc = axialToLocal(h.animQ, h.animR, R);
            const hx = anim.anchorX + loc.x * cosA - loc.y * sinA;
            const hy = anim.anchorY + loc.x * sinA + loc.y * cosA;
            if (isCircleBlockedByObstacle(state.obstacles, hx, hy, R * 0.78)) {
              wallHitPos = { x: hx, y: hy };
              break;
            }
            const probe = { x: hx, y: hy };
            if (constrainToHexArena(probe, R + 4)) {
              wallHitPos = { x: probe.x, y: probe.y };
              break;
            }
          }
        }

        if (wallHitPos) {
          anim.anchorX = prevX;
          anim.anchorY = prevY;
          anim.phase = 'return';
          anim.energy = anim.initialEnergy * 0.5;
          anim.hitBody = false;
          anim.hitHexIds.clear();
          state.events.push({ type: 'sparks', x: wallHitPos.x, y: wallHitPos.y, color: '#fbbf24', count: 10, speed: 220, size: 3.0 });
          state.events.push({ type: 'sfx', kind: 'bounce' });
        } else if (anim.traveled >= anim.maxDist) {
          anim.phase = 'return';
          anim.energy = anim.initialEnergy * 0.5;
          anim.hitBody = false;
          anim.hitHexIds.clear();
          state.events.push({ type: 'sfx', kind: 'recall' });
        }
      } else if (anim.phase === 'guided') {
        if (anim.guidedHitBodyCd > 0) anim.guidedHitBodyCd = Math.max(0, anim.guidedHitBodyCd - dt);
        if (anim.guidedStunTimer > 0) anim.guidedStunTimer = Math.max(0, anim.guidedStunTimer - dt);

        let targetX = opponent.x;
        let targetY = opponent.y;
        let isManual = false;
        let isPointSeek = false;

        if (!fighter.isAI && guidedInput?.mode === 'desktop') {
          if (anim.hasCmd) {
            isManual = true;
            isPointSeek = true;
            targetX = anim.cmdX;
            targetY = anim.cmdY;
          }
        } else if (!fighter.isAI && guidedInput?.mode === 'touch' && guidedInput.touchHoldingAttack) {
          isManual = true;
          const projDist = 90 + 210 * clamp(guidedInput.touchAimStrength, 0.25, 1.0);
          const clampedPt = {
            x: anim.anchorX + Math.cos(guidedInput.touchAimAngle) * projDist,
            y: anim.anchorY + Math.sin(guidedInput.touchAimAngle) * projDist,
          };
          constrainToHexArena(clampedPt, R * 1.6 + 8);
          targetX = clampedPt.x;
          targetY = clampedPt.y;
        }

        const dToTarget = dist(anim.anchorX, anim.anchorY, targetX, targetY);
        if (isPointSeek && anim.hasCmd && dToTarget <= 28) {
          // Fly straight THROUGH the clicked waypoint without braking or stopping (100% Mobile parity!)
          if (!guidedInput?.desktopHoldingGuided) {
            anim.hasCmd = false;
            isManual = false;
            isPointSeek = false;
          }
        }

        let desiredAng = anim.angle;
        if (isManual && !isPointSeek && guidedInput) {
          desiredAng = guidedInput.touchAimAngle;
        } else if (isPointSeek) {
          // If cursor is still held right on top of the weapon, keep flying straight through instead of spinning/stopping
          desiredAng = dToTarget > 28
            ? Math.atan2(targetY - anim.anchorY, targetX - anim.anchorX)
            : anim.angle;
        } else if (dToTarget > 14) {
          desiredAng = Math.atan2(targetY - anim.anchorY, targetX - anim.anchorX);
        } else {
          desiredAng = Math.atan2(opponent.y - anim.anchorY, opponent.x - anim.anchorX);
        }

        anim.targetX = isManual ? targetX : opponent.x;
        anim.targetY = isManual ? targetY : opponent.y;
        anim.targetAngle = desiredAng;
        anim.isManualSteer = isManual;

        const turnRate = anim.guidedStunTimer > 0 ? 2.4 : 7.0;
        const diff = angleDiff(anim.angle, desiredAng);
        anim.angle += clamp(diff, -turnRate * dt, turnRate * dt);
        weaponAngle = anim.angle;

        // Constant full guidedSpeed on BOTH PC & Mobile (no PC hover/braking advantage!)
        const baseGuidedSpd = anim.guidedSpeed ?? clamp(anim.outSpeed * 0.56, 320, 440);
        const speedFactor = anim.guidedStunTimer > 0 ? 0.50 : 1.0;
        const spd = baseGuidedSpd * speedFactor;
        anim.anchorX += Math.cos(anim.angle) * spd * dt;
        anim.anchorY += Math.sin(anim.angle) * spd * dt;
        anim.altitude = lerp(anim.altitude, 0, Math.min(1, dt * 10));

        if (anim.energy < anim.initialEnergy) {
          anim.energy = Math.min(anim.initialEnergy, anim.energy + anim.initialEnergy * 0.85 * dt);
        }

        for (const obs of state.obstacles) {
          const col = resolveCircleObstacle(anim.anchorX, anim.anchorY, R * 1.4, obs);
          if (col) {
            anim.anchorX += col.nx * col.push;
            anim.anchorY += col.ny * col.push;
            const vx = Math.cos(anim.angle);
            const vy = Math.sin(anim.angle);
            const dot = vx * col.nx + vy * col.ny;
            if (dot < 0) {
              anim.angle = Math.atan2(vy - 2 * dot * col.ny, vx - 2 * dot * col.nx);
              state.events.push({ type: 'sparks', x: anim.anchorX, y: anim.anchorY, color: '#c084fc', count: 6, speed: 170, size: 2.5 });
              state.events.push({ type: 'sfx', kind: 'bounce' });
            }
          }
        }
        const pt = { x: anim.anchorX, y: anim.anchorY };
        const wallB = constrainToHexArena(pt, R * 1.6 + 8);
        anim.anchorX = pt.x;
        anim.anchorY = pt.y;
        if (wallB) {
          const vx = Math.cos(anim.angle);
          const vy = Math.sin(anim.angle);
          const dot = vx * wallB.nx + vy * wallB.ny;
          if (dot < 0) {
            anim.angle = Math.atan2(vy - 2 * dot * wallB.ny, vx - 2 * dot * wallB.nx);
            state.events.push({ type: 'sfx', kind: 'bounce' });
          }
        }
      } else if (anim.phase === 'ricochet') {
        anim.ricochetTimer -= dt;
        const glideStep = anim.outSpeed * 0.65 * dt;
        anim.anchorX += Math.cos(anim.angle) * glideStep;
        anim.anchorY += Math.sin(anim.angle) * glideStep;
        weaponAngle = anim.angle;
        const pt = { x: anim.anchorX, y: anim.anchorY };
        constrainToHexArena(pt, R + 8);
        anim.anchorX = pt.x;
        anim.anchorY = pt.y;
        if (anim.ricochetTimer <= 0) {
          anim.phase = 'return';
          anim.energy = anim.initialEnergy * 0.5;
          anim.hitBody = false;
          anim.hitHexIds.clear();
        }
      } else {
        // Return phase: 2x speed, 50% damage
        const dx = fighter.x - anim.anchorX;
        const dy = fighter.y - anim.anchorY;
        const d = Math.hypot(dx, dy);
        if (d <= baseAnchorDist + 24) {
          fighter.attackAnim = null;
          fighter.attackCooldown = 0.14;
          state.events.push({ type: 'sfx', kind: 'snap' });
        } else {
          const moveStep = Math.min(d, anim.retSpeed * dt);
          anim.anchorX += (dx / d) * moveStep;
          anim.anchorY += (dy / d) * moveStep;
          anim.angle = Math.atan2(dy, dx);
          weaponAngle = anim.angle;
          const overObs = isCircleBlockedByObstacle(state.obstacles, anim.anchorX, anim.anchorY, R * 1.1);
          anim.altitude = lerp(anim.altitude, overObs ? 0.85 : 0, Math.min(1, dt * 16));
        }
      }
    } else {
      const p = clamp(anim.timer / anim.duration, 0, 1);
      if (anim.type === 'melee') {
        if (!anim.wallBlocked) {
          const ease = 1 - Math.pow(1 - p, 2.5);
          const candAngle = lerp(anim.startAngle, anim.endAngle, ease);
          const candForward = Math.sin(p * Math.PI) * 26;
          const wallHit = checkAssembledWallHit(state, fighter, fighter.x, fighter.y, candAngle, baseAnchorDist + candForward, R);
          if (wallHit) {
            anim.wallBlocked = true;
            weaponAngle = anim.lastSafeAngle;
            forwardOffset = 0;
            state.events.push({ type: 'sparks', x: wallHit.hx, y: wallHit.hy, color: '#fbbf24', count: 10, speed: 210, size: 2.8 });
            state.events.push({ type: 'sfx', kind: 'bounce' });
            fighter.kbX += wallHit.nx * 110;
            fighter.kbY += wallHit.ny * 110;
          } else {
            anim.lastSafeAngle = candAngle;
            weaponAngle = candAngle;
            forwardOffset = candForward;
          }
        } else {
          weaponAngle = lerp(anim.lastSafeAngle, fighter.facing, p);
          forwardOffset = 0;
        }
      } else if (anim.type === 'defense') {
        weaponAngle = anim.angle;
        const candForward = Math.sin(p * Math.PI) * 34;
        if (
          !anim.wallBlocked &&
          checkAssembledWallHit(state, fighter, fighter.x, fighter.y, weaponAngle, baseAnchorDist + candForward, R)
        ) {
          anim.wallBlocked = true;
          forwardOffset = 0;
          state.events.push({ type: 'sfx', kind: 'bounce' });
        } else {
          forwardOffset = anim.wallBlocked ? 0 : candForward;
        }
      }
      if (p >= 1) {
        fighter.attackAnim = null;
      }
    }
  }

  // Deferred Full Recovery morph
  if (fighter.needsFullMorph && !fighter.attackAnim && isSlotKey(fighter.form)) {
    fighter.needsFullMorph = false;
    applyBlueprintFormation(fighter, fighter.form, state.events, true);
  }

  // Update each hex (5..10)
  const activeStance = getActiveStance(fighter);
  for (const h of fighter.hexes) {
    if (h.hitCooldown > 0) h.hitCooldown = Math.max(0, h.hitCooldown - dt);
    if (h.flashTimer > 0) h.flashTimer = Math.max(0, h.flashTimer - dt);

    if (h.state === 'BROKEN') {
      h.cooldown -= dt;
      if (h.cooldown <= 0) {
        h.hp = h.maxHp;
        h.regenDelay = 0;
        h.cooldown = 0;
        if (fighter.form === 'loose') {
          h.state = 'ORBIT';
          h.selected = false;
          h.x = fighter.x + Math.cos(h.orbitAngle) * (PLAYER_RADIUS + 34);
          h.y = fighter.y + Math.sin(h.orbitAngle) * (PLAYER_RADIUS + 34);
          h.flashTimer = 0.4;
          state.events.push({ type: 'sfx', kind: 'snap' });
        } else {
          insertRecoveredHexIntoCluster(fighter, h, state.events);
        }
      }
      continue;
    }

    if (h.regenDelay > 0) {
      h.regenDelay = Math.max(0, h.regenDelay - dt);
    } else if (h.hp < h.maxHp) {
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * HEX_REGEN_RATE * dt);
    }

    if (fighter.form === 'loose') {
      if (fighter.rotMode === 'normal') {
        h.spinAngle += dt * 16.5;
      } else if (fighter.rotMode === 'random') {
        h.spinAngle += dt * 9.5;
        h.tumblePhaseX += dt * 11.2;
        h.tumblePhaseY += dt * 8.7;
      } else {
        h.spinAngle = lerp(h.spinAngle, 0, Math.min(1, dt * 8));
      }
    }

    if (h.state === 'STOLEN_FLY') {
      const stepX = h.vx * dt;
      const stepY = h.vy * dt;
      h.x += stepX;
      h.y += stepY;
      h.remainingDist -= Math.hypot(stepX, stepY);
      h.spinAngle += dt * 14;
      h.trail.push({ x: h.x, y: h.y });
      if (h.trail.length > 9) h.trail.shift();

      let stopFloor = false;
      for (const obs of state.obstacles) {
        const col = resolveCircleObstacle(h.x, h.y, R * 0.82, obs);
        if (col) {
          h.x += col.nx * col.push;
          h.y += col.ny * col.push;
          stopFloor = true;
          break;
        }
      }
      if (!stopFloor && constrainToHexArena(h, R + 4)) stopFloor = true;

      if (!stopFloor && h.hitCooldown <= 0) {
        const dOwner = dist(h.x, h.y, fighter.x, fighter.y);
        if (
          dOwner < R * 0.85 + PLAYER_RADIUS &&
          !segmentIntersectsAnyObstacle(state.obstacles, h.x, h.y, fighter.x, fighter.y, 0)
        ) {
          const thief = h.stolenById === 'player' ? state.player : state.enemy;
          damageFighterBody(state, thief, h, fighter, 0.60);
          h.hitCooldown = 0.45;
          stopFloor = true;
        }
      }

      if (stopFloor || h.remainingDist <= 0) {
        h.state = 'STOLEN_FLOOR';
        h.vx = 0;
        h.vy = 0;
        placePlantedHexSafely(state.obstacles, h, R, fighter, opponent);
        state.events.push({ type: 'sparks', x: h.x, y: h.y, color: '#fbbf24', count: 6, speed: 150, size: 2.5 });
      }
    } else if (h.state === 'STOLEN_FLOOR') {
      h.altitude = lerp(h.altitude, 0, Math.min(1, dt * 10));
      if (h.trail.length > 0) h.trail.shift();
      h.stolenTimer -= dt;
      if (h.stolenTimer <= 0) {
        h.state = 'STOLEN_RETURN';
        h.trail = [];
        state.events.push({ type: 'sfx', kind: 'recall' });
      }
    } else if (h.state === 'STOLEN_RETURN') {
      h.altitude = lerp(h.altitude, 1.0, Math.min(1, dt * 12));
      const dx = fighter.x - h.x;
      const dy = fighter.y - h.y;
      const d = Math.hypot(dx, dy);
      if (d < PLAYER_RADIUS + 28) {
        h.stolenById = null;
        h.stolenTimer = 0;
        h.altitude = 0;
        h.trail.length = 0;
        if (fighter.form === 'loose') {
          h.state = 'ORBIT';
          h.selected = false;
          state.events.push({ type: 'sfx', kind: 'snap' });
        } else {
          insertRecoveredHexIntoCluster(fighter, h, state.events);
        }
      } else {
        h.x += (dx / d) * 840 * dt;
        h.y += (dy / d) * 840 * dt;
        h.trail.push({ x: h.x, y: h.y });
        if (h.trail.length > 10) h.trail.shift();
      }
    } else if (h.state === 'ORBIT') {
      const isLooseOverdrive = fighter.specialActive?.type === 'loose';
      const orbitSpeed = 1.65 * Math.pow(fighter.currentScale, -0.35) * (isLooseOverdrive ? 1.30 : 1.0);
      h.orbitAngle += dt * orbitSpeed;
      const orbitR = (PLAYER_RADIUS + 24 + R * 1.15) * (isLooseOverdrive ? 1.20 : 1.0);
      const goalX = fighter.x + Math.cos(h.orbitAngle) * orbitR;
      const goalY = fighter.y + Math.sin(h.orbitAngle) * orbitR;
      h.x = lerp(h.x, goalX, Math.min(1, dt * 14));
      h.y = lerp(h.y, goalY, Math.min(1, dt * 14));
      h.altitude = lerp(h.altitude, 0, Math.min(1, dt * 10));
      h.trail.length = 0;
    } else if (h.state === 'LAUNCHED') {
      const prevX = h.x;
      const prevY = h.y;
      let curSpd = Math.hypot(h.vx, h.vy);
      if (!h.hasBounced && h.remainingDist < 65 && curSpd > 140) {
        const targetSpd = Math.max(180, h.launchSpeed * clamp(h.remainingDist / 65, 0.35, 1.0));
        const scaleSpd = targetSpd / curSpd;
        h.vx *= scaleSpd;
        h.vy *= scaleSpd;
        curSpd = targetSpd;
      }

      const stepX = h.vx * dt;
      const stepY = h.vy * dt;
      const stepDist = Math.hypot(stepX, stepY);

      if (stepDist >= h.remainingDist && !h.hasBounced) {
        h.x = h.targetX;
        h.y = h.targetY;
        h.remainingDist = 0;
      } else {
        h.x += stepX;
        h.y += stepY;
        h.remainingDist -= stepDist;
      }
      h.trail.push({ x: h.x, y: h.y });
      if (h.trail.length > 9) h.trail.shift();

      let hitObs = false;
      for (const obs of state.obstacles) {
        let col = resolveCircleObstacle(h.x, h.y, R * 0.82, obs);
        if (!col) {
          const seg = segmentIntersectsObstacle(prevX, prevY, h.x, h.y, obs, R * 0.65);
          if (seg) {
            h.x = lerp(prevX, h.x, Math.max(0, seg.t - 0.02));
            h.y = lerp(prevY, h.y, Math.max(0, seg.t - 0.02));
            col = { nx: seg.nx, ny: seg.ny, push: 1.5 };
          }
        }
        if (col) {
          h.x += col.nx * col.push;
          h.y += col.ny * col.push;
          hitObs = true;
          if (fighter.rotMode === 'random' && h.bouncesLeft > 0) {
            const dot = h.vx * col.nx + h.vy * col.ny;
            h.vx -= 2 * dot * col.nx;
            h.vy -= 2 * dot * col.ny;
            h.bouncesLeft--;
            h.hasBounced = true;
            h.remainingDist = Math.max(h.remainingDist, 140);
            state.events.push({ type: 'sparks', x: h.x, y: h.y, color: '#fbbf24', count: 7, speed: 200, size: 2.5 });
            state.events.push({ type: 'sfx', kind: 'bounce' });
          } else if (h.autoReturn) {
            h.state = 'RECALLING';
            h.isAutoReturning = true;
            h.hitCooldown = 0.08;
            h.vx = 0;
            h.vy = 0;
            state.events.push({ type: 'sparks', x: h.x, y: h.y, color: '#cbd5e1', count: 5, speed: 130, size: 2.2 });
            state.events.push({ type: 'sfx', kind: 'bounce' });
          } else {
            h.state = 'PLANTED';
            h.vx = 0;
            h.vy = 0;
            placePlantedHexSafely(state.obstacles, h, R, fighter, opponent);
            state.events.push({ type: 'sparks', x: h.x, y: h.y, color: '#cbd5e1', count: 5, speed: 130, size: 2.2 });
          }
          break;
        }
      }

      if (!hitObs) {
        const wallBounce = constrainToHexArena(h, R + 4);
        if (wallBounce) {
          if (fighter.rotMode === 'random' && h.bouncesLeft > 0) {
            const dot = h.vx * wallBounce.nx + h.vy * wallBounce.ny;
            h.vx -= 2 * dot * wallBounce.nx;
            h.vy -= 2 * dot * wallBounce.ny;
            h.bouncesLeft--;
            h.hasBounced = true;
            h.remainingDist = Math.max(h.remainingDist, 140);
            state.events.push({ type: 'sparks', x: h.x, y: h.y, color: '#fbbf24', count: 6, speed: 180, size: 2.5 });
            state.events.push({ type: 'sfx', kind: 'bounce' });
          } else if (h.autoReturn) {
            h.state = 'RECALLING';
            h.isAutoReturning = true;
            h.hitCooldown = 0.08;
            h.vx = 0;
            h.vy = 0;
            state.events.push({ type: 'sfx', kind: 'bounce' });
          } else {
            h.state = 'PLANTED';
            h.vx = 0;
            h.vy = 0;
            placePlantedHexSafely(state.obstacles, h, R, fighter, opponent);
          }
        }
      }

      if (h.state === 'LAUNCHED' && (h.remainingDist <= 0 || Math.hypot(h.vx, h.vy) < 40)) {
        h.vx = 0;
        h.vy = 0;
        if (h.autoReturn) {
          h.state = 'RECALLING';
          h.isAutoReturning = true;
          h.hitCooldown = 0;
          h.trail = [];
        } else {
          h.state = 'PLANTED';
          placePlantedHexSafely(state.obstacles, h, R, fighter, opponent);
        }
      }
    } else if (h.state === 'PLANTED') {
      h.altitude = lerp(h.altitude, 0, Math.min(1, dt * 10));
      if (h.trail.length > 0) h.trail.shift();
    } else if (h.state === 'RECALLING') {
      const dx = fighter.x - h.x;
      const dy = fighter.y - h.y;
      const d = Math.hypot(dx, dy);
      const looseOverdrive = fighter.specialActive?.type === 'loose' ? 1.30 : 1.0;
      let recallSpeed: number;
      if (h.isAutoReturning) {
        recallSpeed = (h.launchSpeed || 560) * 2.0;
        const overObs = isCircleBlockedByObstacle(state.obstacles, h.x, h.y, R * 0.9);
        h.altitude = lerp(h.altitude, overObs ? 0.85 : 0, Math.min(1, dt * 16));
      } else {
        h.altitude = lerp(h.altitude, 1.0, Math.min(1, dt * 12));
        recallSpeed = 760 * Math.pow(fighter.currentScale, -0.4) * looseOverdrive;
      }
      if (d < PLAYER_RADIUS + 26) {
        h.state = 'ORBIT';
        h.selected = true;
        h.altitude = 0;
        h.isAutoReturning = false;
        h.autoReturn = false;
        h.trail.length = 0;
      } else {
        h.x += (dx / d) * recallSpeed * dt;
        h.y += (dy / d) * recallSpeed * dt;
        h.trail.push({ x: h.x, y: h.y });
        if (h.trail.length > 12) h.trail.shift();
      }
    } else if (h.state === 'ASSEMBLED') {
      if (h.morphTimer > 0) {
        h.morphTimer = Math.max(0, h.morphTimer - dt);
        const t = 1 - h.morphTimer / Math.max(1e-4, h.morphDuration);
        const ease = 1 - Math.pow(1 - t, 3);
        h.animQ = lerp(h.startQ, h.q, ease);
        h.animR = lerp(h.startR, h.r, ease);
        if (h.morphTimer === 0) {
          h.animQ = h.q;
          h.animR = h.r;
          h.isReassembling = false;
        }
      } else {
        h.animQ = h.q;
        h.animR = h.r;
      }

      const local = axialToLocal(h.animQ, h.animR, R);
      const cosA = Math.cos(weaponAngle);
      const sinA = Math.sin(weaponAngle);

      if (activeStance === 'ranged' && fighter.attackAnim && fighter.attackAnim.type === 'ranged') {
        const anim = fighter.attackAnim;
        h.x = anim.anchorX + local.x * cosA - local.y * sinA;
        h.y = anim.anchorY + local.x * sinA + local.y * cosA;
        h.spinAngle = weaponAngle;
        h.altitude = anim.altitude;
        if (h.role === 'tip' || h.role === 'spine') {
          h.trail.push({ x: h.x, y: h.y });
          const maxTrail = anim.phase === 'return' ? 11 : 7;
          while (h.trail.length > maxTrail) h.trail.shift();
        }
      } else {
        const anchorDist = baseAnchorDist + forwardOffset;
        const wx = anchorDist + local.x;
        const wy = local.y;
        h.x = fighter.x + wx * cosA - wy * sinA;
        h.y = fighter.y + wx * sinA + wy * cosA;
        h.spinAngle = weaponAngle;
        h.altitude = 0;

        if (fighter.attackAnim && !fighter.attackAnim.wallBlocked && (h.role === 'tip' || h.role === 'front')) {
          h.trail.push({ x: h.x, y: h.y });
          if (h.trail.length > 7) h.trail.shift();
        } else if (h.trail.length > 0) {
          h.trail.shift();
        }
      }
    }
  }
}

/**
 * Advances the entire MatchState by one deterministic fixed timestep (e.g. 1/60s).
 * Returns SimEvents accumulated during this step (and clears state.events for next step).
 */
export function stepSimulation(
  state: MatchState,
  dt: number,
  guidedInput?: GuidedSteerInput,
  aiTick?: (state: MatchState, dt: number) => void,
  enemyGuidedInput?: GuidedSteerInput,
): void {
  if (state.matchOver) return;

  if (state.hitStopTimer > 0) {
    state.hitStopTimer = Math.max(0, state.hitStopTimer - dt);
    return;
  }

  state.timeRemaining = Math.max(0, state.timeRemaining - dt);
  state.stats.elapsed += dt;
  if (state.timeRemaining <= 0) {
    state.matchOver = true;
    const playerWon =
      state.player.hp > state.enemy.hp ? true : state.player.hp < state.enemy.hp ? false : null;
    state.winner = playerWon === true ? 'player' : playerWon === false ? 'enemy' : 'draw';
    state.events.push({ type: 'matchEnd', playerWon });
    return;
  }

  if (aiTick) aiTick(state, dt);

  updateFighter(state, state.player, state.enemy, dt, guidedInput);
  updateFighter(state, state.enemy, state.player, dt, enemyGuidedInput);
  resolveCombatCollisions(state);
}
