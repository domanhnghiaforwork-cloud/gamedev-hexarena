import { BASE_HEX_RADIUS, PLAYER_MOVE_SPEED, PLAYER_RADIUS } from '@core/constants';
import { axialToLocal, clamp, lerp } from '@core/math/hexMath';
import { constrainToHexArena, resolveCircleObstacle } from '@core/world/obstacles';
import {
  getActiveAnchorDist,
  getEnemyLooseSlowFactor,
  isDefenseFortressActive,
  isHexStolen,
  isRangedSniperActive,
} from '@core/world/structure';
import type { Fighter, HexEntity, MatchState, Obstacle, SummonedWall } from '@core/types';
import {
  lerpAngle,
  type MatchSnapshot,
  type SerializedFighter,
  type SerializedHex,
} from './protocol';

interface TimedSnapshot {
  recvTime: number;
  serverTime: number;
  snap: MatchSnapshot;
}

interface PendingMoveInput {
  seq: number;
  dt: number;
  mx: number;
  my: number;
  moveMult: number;
}

/**
 * High-performance Client Netcode Controller:
 * 1. Client-Side Prediction + Smooth Error Reconciliation for Local Player (0ms movement lag!)
 * 2. Adaptive Timeline Snapshot Interpolation Buffer for Opponent & Remote Hexes (buttery 60/120fps!)
 * 3. Local 60/120fps Trail & Dash Afterimage synthesis (zero trail network bloat!)
 */
export class PvPInterpolator {
  private buffer: TimedSnapshot[] = [];
  private pendingMoves: PendingMoveInput[] = [];

  // Smooth error offset applied to predicted local player position (decays smoothly to 0)
  private predErrX = 0;
  private predErrY = 0;
  private predX = 0;
  private predY = 0;
  private initializedPred = false;

  // Adaptive jitter buffer delay (ms)
  private lastRecvTime = 0;
  private jitterEwma = 8;
  private interpDelayMs = 42;
  private clockOffsetMs: number | null = null;

  public reset(initialSnap?: MatchSnapshot, nowMs = performance.now()): void {
    this.buffer = [];
    this.pendingMoves = [];
    this.predErrX = 0;
    this.predErrY = 0;
    this.initializedPred = false;
    this.lastRecvTime = 0;
    this.jitterEwma = 8;
    this.interpDelayMs = 42;
    this.clockOffsetMs = null;

    if (initialSnap) {
      this.pushSnapshot(initialSnap, nowMs, []);
    }
  }

  public getInterpDelayMs(): number {
    return Math.round(this.interpDelayMs);
  }

  /**
   * Records a local movement step immediately for 0ms Client-Side Prediction.
   */
  public predictLocalMovement(
    state: MatchState,
    seq: number,
    dt: number,
    mx: number,
    my: number,
  ): void {
    const p = state.player;
    if (!this.initializedPred) {
      this.predX = p.x;
      this.predY = p.y;
      this.initializedPred = true;
    }

    const bodySlowMult = getEnemyLooseSlowFactor(state.enemy, this.predX, this.predY, PLAYER_RADIUS * 0.5);
    const hitSlowMult = p.slowTimer > 0 ? p.slowFactor : 1.0;
    const moveMult = isRangedSniperActive(p)
      ? 0
      : (isDefenseFortressActive(p) ? 0.60 : 1.0) * bodySlowMult * hitSlowMult;
    this.pendingMoves.push({ seq, dt, mx, my, moveMult });
    if (this.pendingMoves.length > 90) {
      this.pendingMoves.shift();
    }

    // Only predict normal walking (server owns dash & knockback bursts seamlessly via reconciliation)
    if (p.dashTimer <= 0) {
      const next = this.simulateSingleStep(this.predX, this.predY, mx, my, moveMult, dt, state.obstacles, state.walls);
      this.predX = next.x;
      this.predY = next.y;
    }
  }

  private simulateSingleStep(
    x: number,
    y: number,
    mx: number,
    my: number,
    moveMult: number,
    dt: number,
    obstacles: Obstacle[],
    walls: SummonedWall[] = [],
  ): { x: number; y: number } {
    const pos = { x, y };
    const mLen = Math.hypot(mx, my);
    if (mLen > 0.04) {
      const norm = Math.min(1, mLen);
      pos.x += (mx / mLen) * PLAYER_MOVE_SPEED * norm * moveMult * dt;
      pos.y += (my / mLen) * PLAYER_MOVE_SPEED * norm * moveMult * dt;
    }
    constrainToHexArena(pos, PLAYER_RADIUS + 4);
    for (const obs of obstacles) {
      const hit = resolveCircleObstacle(pos.x, pos.y, PLAYER_RADIUS, obs);
      if (hit) {
        pos.x += hit.nx * hit.push;
        pos.y += hit.ny * hit.push;
      }
    }
    const minWD = PLAYER_RADIUS + BASE_HEX_RADIUS * 0.92;
    for (const w of walls) {
      for (const wh of w.hexes) {
        if (wh.broken) continue;
        const wdx = pos.x - wh.x;
        const wdy = pos.y - wh.y;
        const wd = Math.hypot(wdx, wdy);
        if (wd < minWD && wd > 1e-4) {
          const push = minWD - wd;
          pos.x += (wdx / wd) * push;
          pos.y += (wdy / wd) * push;
        }
      }
    }
    return pos;
  }

  /**
   * Pushes an authoritative Server (or relayed Bot) snapshot into the timeline buffer.
   * When `isSpectator` is true, skips local prediction reconciliation and tunes the buffer
   * to the expected stream interval (~33ms PvP / ~50ms Bot).
   */
  public pushSnapshot(
    snap: MatchSnapshot,
    nowMs: number,
    obstacles: Obstacle[],
    isSpectator = false,
    expectedIntervalMs = 1000 / 60,
  ): void {
    // Track inter-arrival jitter to adapt interpolation buffer automatically
    if (this.lastRecvTime > 0) {
      const delta = nowMs - this.lastRecvTime;
      const jitter = Math.abs(delta - expectedIntervalMs);
      this.jitterEwma = lerp(this.jitterEwma, jitter, 0.15);
      const targetDelay = isSpectator
        ? clamp(expectedIntervalMs * 1.35 + this.jitterEwma * 1.6, 32, 120)
        : clamp(24 + this.jitterEwma * 2.2, 28, 85);
      this.interpDelayMs = lerp(this.interpDelayMs, targetDelay, 0.12);
    }
    this.lastRecvTime = nowMs;

    // Smooth server-to-client clock offset tracking
    const sampleOffset = nowMs - snap.serverTime;
    if (this.clockOffsetMs === null) {
      this.clockOffsetMs = sampleOffset;
    } else {
      this.clockOffsetMs = lerp(this.clockOffsetMs, sampleOffset, 0.05);
    }

    this.buffer.push({ recvTime: nowMs, serverTime: snap.serverTime, snap });
    if (this.buffer.length > 14) {
      this.buffer.shift();
    }

    if (isSpectator) {
      return;
    }

    // Reconcile local player prediction against authoritative server position
    this.pendingMoves = this.pendingMoves.filter((m) => m.seq > snap.ackSeq);

    if (!this.initializedPred) {
      this.predX = snap.self.x;
      this.predY = snap.self.y;
      this.predErrX = 0;
      this.predErrY = 0;
      this.initializedPred = true;
      return;
    }

    // Replay only unacknowledged local walking inputs on top of server's authoritative (x, y)
    let reconX = snap.self.x;
    let reconY = snap.self.y;
    if (snap.self.dashTimer <= 0) {
      for (const m of this.pendingMoves) {
        const step = this.simulateSingleStep(reconX, reconY, m.mx, m.my, m.moveMult, m.dt, obstacles);
        reconX = step.x;
        reconY = step.y;
      }
    }

    const dx = reconX - this.predX;
    const dy = reconY - this.predY;
    const errDist = Math.hypot(dx, dy);

    if (errDist > 115) {
      // Large correction (e.g., match reset or heavy dash/knockback) -> clean immediate sync
      this.predX = reconX;
      this.predY = reconY;
      this.predErrX = 0;
      this.predErrY = 0;
    } else if (errDist > 2.2) {
      // Preserve current visual position by absorbing delta into predErr, then decay smoothly over ~75ms!
      const prevVisualX = this.predX + this.predErrX;
      const prevVisualY = this.predY + this.predErrY;
      this.predX = reconX;
      this.predY = reconY;
      this.predErrX = prevVisualX - this.predX;
      this.predErrY = prevVisualY - this.predY;
    }
  }

  /**
   * Renders smooth 60/120fps state into `state` every display frame!
   */
  public applyFrame(state: MatchState, nowMs: number, frameDt: number, isSpectator = false): boolean {
    if (this.buffer.length === 0) return false;

    const latest = this.buffer[this.buffer.length - 1].snap;
    const prevForm = state.player.form;

    // Update global match metadata from latest authoritative snapshot
    state.timeRemaining = latest.timeRemaining;
    state.matchOver = latest.matchOver;
    state.winner = latest.winner;
    if (latest.stats) {
      state.stats = {
        ...latest.stats,
        playerDmgByMode: { ...latest.stats.playerDmgByMode },
        enemyDmgByMode: { ...latest.stats.enemyDmgByMode },
        playerSpecialUses: { ...latest.stats.playerSpecialUses },
        enemySpecialUses: { ...latest.stats.enemySpecialUses },
      };
    } else {
      state.stats.dmgDealt = latest.dmgDealt;
      state.stats.hexBroken = latest.hexBroken;
      state.stats.elapsed = latest.elapsed;
    }

    if (latest.walls) {
      state.walls = latest.walls.map((w) => ({
        ...w,
        hexes: w.hexes.map((wh) => ({ ...wh })),
      }));
    } else if (state.walls.length > 0) {
      state.walls = [];
    }
    const offset = this.clockOffsetMs ?? (nowMs - latest.serverTime);
    const renderServerTime = nowMs - offset - this.interpDelayMs;

    let idxB = this.buffer.length - 1;
    while (idxB > 0 && this.buffer[idxB - 1].serverTime >= renderServerTime) {
      idxB--;
    }
    const entryB = this.buffer[idxB];
    const entryA = idxB > 0 ? this.buffer[idxB - 1] : entryB;

    let alpha = 1;
    let extrapSec = 0;
    if (entryA !== entryB) {
      const span = Math.max(1, entryB.serverTime - entryA.serverTime);
      alpha = clamp((renderServerTime - entryA.serverTime) / span, 0, 1);
    } else if (renderServerTime > entryB.serverTime) {
      // Brief bounded extrapolation (max 35ms) to bridge minor Wi-Fi jitter cleanly without freezing!
      extrapSec = clamp((renderServerTime - entryB.serverTime) / 1000, 0, 0.035);
    }

    // 1. Apply Opponent (pure smooth timeline interpolation + bounded extrapolation)
    this.applyFighterInterpolated(state.enemy, entryA.snap.opp, entryB.snap.opp, latest.opp, alpha, extrapSec, frameDt, false);

    // 2. Apply Watched Friend (Spectator) OR Local Player (Prediction + Smooth Error Decay)
    if (isSpectator) {
      this.applyFighterInterpolated(state.player, entryA.snap.self, entryB.snap.self, latest.self, alpha, extrapSec, frameDt, false);
      return state.player.form !== prevForm;
    }

    const decay = Math.exp(-frameDt * 16);
    this.predErrX *= decay;
    this.predErrY *= decay;
    if (Math.hypot(this.predErrX, this.predErrY) < 0.25) {
      this.predErrX = 0;
      this.predErrY = 0;
    }

    this.applyFighterInterpolated(state.player, entryA.snap.self, entryB.snap.self, latest.self, alpha, extrapSec, frameDt, true);

    if (this.initializedPred && latest.self.dashTimer <= 0) {
      state.player.x = this.predX + this.predErrX;
      state.player.y = this.predY + this.predErrY;
    } else if (latest.self.dashTimer > 0) {
      // Keep prediction anchored during server dash burst
      this.predX = state.player.x;
      this.predY = state.player.y;
      this.predErrX = 0;
      this.predErrY = 0;
    }

    // Keep player's own held (non-attacking-ranged, non-mid-melee-swing) assembled hexes locked 1:1 to predicted body!
    if (
      state.player.form !== 'loose' &&
      !latest.self.isAttacking &&
      !latest.self.rangedAnim
    ) {
      const R = BASE_HEX_RADIUS * state.player.currentScale;
      const anchorDist = getActiveAnchorDist(state.player, R);
      const weaponAngle = state.player.isAiming ? state.player.aimAngle : state.player.facing;
      const cosA = Math.cos(weaponAngle);
      const sinA = Math.sin(weaponAngle);
      for (const h of state.player.hexes) {
        if (h.state !== 'ASSEMBLED') continue;
        const loc = axialToLocal(h.animQ, h.animR, R);
        const wx = anchorDist + loc.x;
        const wy = loc.y;
        h.x = state.player.x + wx * cosA - wy * sinA;
        h.y = state.player.y + wx * sinA + wy * cosA;
        h.spinAngle = weaponAngle;
      }
    }

    return state.player.form !== prevForm;
  }

  private applyFighterInterpolated(
    target: Fighter,
    a: SerializedFighter,
    b: SerializedFighter,
    latest: SerializedFighter,
    t: number,
    extrapSec: number,
    frameDt: number,
    isSelf: boolean,
  ): void {
    const snapJump = Math.hypot(b.x - a.x, b.y - a.y) > 180;
    const baseX = snapJump ? b.x : lerp(a.x, b.x, t);
    const baseY = snapJump ? b.y : lerp(a.y, b.y, t);
    target.x = baseX + b.vx * extrapSec;
    target.y = baseY + b.vy * extrapSec;

    // Keep local player's facing immediate when aiming or mouse-tracking; smooth-interpolate opponent facing!
    if (!isSelf) {
      target.facing = lerpAngle(a.facing, b.facing, t);
    }

    target.hp = latest.hp;
    target.maxHp = latest.maxHp;
    target.damageFlash = latest.damageFlash;
    target.slowTimer = latest.slowTimer ?? 0;
    target.slowFactor = latest.slowFactor ?? 1.0;
    target.recoilTimer = latest.recoilTimer ?? 0;
    target.recoilAngle = latest.recoilAngle ?? target.facing;
    target.recoilAmp = latest.recoilAmp ?? 0;
    target.form = latest.form;
    target.rootHexId = latest.rootHexId;
    target.targetScale = latest.targetScale;
    target.currentScale = lerp(a.currentScale, b.currentScale, t);
    target.rotMode = latest.rotMode;
    target.fireMode = latest.fireMode;
    target.attackCooldown = latest.attackCooldown;
    target.dashCooldown = latest.dashCooldown;
    target.dashTimer = latest.dashTimer;
    target.specialCooldown = latest.specialCooldown;
    target.specialMaxCooldown = latest.specialMaxCooldown;
    target.specialActive = latest.specialActive;
    if (latest.selectedSpecialByMode) {
      target.selectedSpecialByMode = { ...latest.selectedSpecialByMode };
    }

    // Synthesize smooth local Dash afterimages at display refresh rate!
    for (let i = target.dashAfterimages.length - 1; i >= 0; i--) {
      target.dashAfterimages[i].life -= frameDt;
      if (target.dashAfterimages[i].life <= 0) target.dashAfterimages.splice(i, 1);
    }
    if (latest.dashTimer > 0 && Math.random() < Math.min(1, frameDt * 42)) {
      target.dashAfterimages.push({ x: target.x, y: target.y, life: 0.22, maxLife: 0.22 });
    }

    // Ranged Attack / Guided Spear Smooth Interpolation
    if (b.rangedAnim) {
      const raA = a.rangedAnim ?? b.rangedAnim;
      const raB = b.rangedAnim;
      const anchorX = lerp(raA.anchorX, raB.anchorX, t);
      const anchorY = lerp(raA.anchorY, raB.anchorY, t);
      target.attackAnim = {
        type: 'ranged',
        phase: raB.phase,
        timer: 0,
        duration: 99,
        angle: lerpAngle(raA.angle, raB.angle, t),
        outSpeed: 680,
        retSpeed: 1360,
        maxDist: 500,
        traveled: 0,
        initialEnergy: 100,
        energy: 100,
        ricochetTimer: 0,
        guidedHitBodyCd: 0,
        guidedStunTimer: 0,
        anchorX,
        anchorY,
        targetX: lerp(raA.targetX, raB.targetX, t),
        targetY: lerp(raA.targetY, raB.targetY, t),
        targetAngle: lerpAngle(raA.targetAngle, raB.targetAngle, t),
        hasCmd: raB.hasCmd,
        cmdX: raB.cmdX,
        cmdY: raB.cmdY,
        cmdHoldTimer: 0,
        isManualSteer: raB.isManualSteer,
        altitude: lerp(raA.altitude, raB.altitude, t),
        hitBody: false,
        hitHexIds: new Set(),
      };
    } else if (target.attackAnim?.type === 'ranged') {
      target.attackAnim = null;
    }

    // Interpolate all 5..10 hexes & synthesize silky 60/120fps trails locally!
    for (let i = 0; i < b.hexes.length && i < target.hexes.length; i++) {
      const ha: SerializedHex = a.hexes[i] ?? b.hexes[i];
      const hb: SerializedHex = b.hexes[i];
      const hl: SerializedHex = latest.hexes[i] ?? hb;
      const th: HexEntity = target.hexes[i];

      const hexJump = Math.hypot(hb.x - ha.x, hb.y - ha.y) > 160 || ha.state !== hb.state;
      th.hp = hl.hp;
      th.maxHp = hl.maxHp;
      th.state = hl.state;
      th.selected = hl.selected;
      th.cooldown = hl.cooldown;
      th.flashTimer = hl.flashTimer;
      th.x = hexJump ? hb.x : lerp(ha.x, hb.x, t);
      th.y = hexJump ? hb.y : lerp(ha.y, hb.y, t);
      th.altitude = lerp(ha.altitude, hb.altitude, t);
      th.spinAngle = lerpAngle(ha.spinAngle, hb.spinAngle, t);
      th.tumblePhaseX = lerp(ha.tumblePhaseX, hb.tumblePhaseX, t);
      th.tumblePhaseY = lerp(ha.tumblePhaseY, hb.tumblePhaseY, t);
      th.q = hl.q;
      th.r = hl.r;
      th.animQ = lerp(ha.animQ, hb.animQ, t);
      th.animR = lerp(ha.animR, hb.animR, t);
      th.adjCount = hl.adjCount;
      th.role = hl.role;
      th.stolenById = hl.stolenById;
      th.stolenTimer = hl.stolenTimer;
      th.sniperEmpowered = Boolean(hl.sniperEmpowered);

      // Local smooth trail generation (zero network overhead!)
      const wantsTrail =
        th.state === 'LAUNCHED' ||
        th.state === 'RECALLING' ||
        th.state === 'STOLEN_FLY' ||
        th.state === 'STOLEN_RETURN' ||
        th.state === 'SNIPER_SHOT' ||
        th.state === 'SNIPER_RETURN' ||
        (th.state === 'ASSEMBLED' && latest.isAttacking && (th.role === 'tip' || th.role === 'front' || th.role === 'spine'));

      if (
        (wantsTrail && !hexJump && !isHexStolen(th)) ||
        th.state === 'STOLEN_FLY' ||
        th.state === 'STOLEN_RETURN' ||
        th.state === 'SNIPER_SHOT' ||
        th.state === 'SNIPER_RETURN'
      ) {
        const lastPt = th.trail[th.trail.length - 1];
        if (!lastPt || Math.hypot(th.x - lastPt.x, th.y - lastPt.y) > 4) {
          th.trail.push({ x: th.x, y: th.y });
          const maxLen = th.state === 'SNIPER_SHOT' ? 16 : th.state === 'SNIPER_RETURN' ? 12 : 9;
          if (th.trail.length > maxLen) th.trail.shift();
        }
      } else if (th.trail.length > 0) {
        th.trail.shift();
      }
    }
  }
}
