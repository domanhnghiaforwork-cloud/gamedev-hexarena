import {
  BASE_HEX_RADIUS,
  DASH_COOLDOWN,
  DASH_DURATION,
  DASH_SPEED,
  PLAYER_RADIUS,
  SPECIAL_SKILLS,
} from './constants';
import { angleDiff, clamp, dist } from './hexMath';
import { constrainToHexArena, segmentIntersectsAnyObstacle } from './obstacles';
import {
  applyBlueprintFormation,
  computeLooseKineticEnergy,
  computeRangedKineticEnergy,
  getActiveAnchorDist,
  getActiveBlueprint,
  getActiveStance,
  getEffectiveHexStats,
  isHexStolen,
  isSlotKey,
  runStructuralBFSAndReassemble,
} from './structure';
import type {
  Fighter,
  FireMode,
  FormKey,
  HexEntity,
  MatchState,
  RotMode,
  ScaleTier,
  SpecialSkillKey,
} from './types';

export function getLooseLaunchRange(strength: number): number {
  return 120 + 360 * clamp(strength, 0, 1);
}

export function setFighterScale(state: MatchState, fighter: Fighter, scaleVal: ScaleTier): void {
  if (fighter.specialActive?.type === 'defense') {
    if (!fighter.isAI) {
      state.events.push({ type: 'toast', message: 'Pháo Đài đang giữ kích thước 150%!' });
    }
    return;
  }
  fighter.targetScale = scaleVal;
  if (!fighter.isAI) {
    state.events.push({ type: 'sfx', kind: 'uiClick' });
  }
}

export function setFighterRotMode(state: MatchState, fighter: Fighter, rotMode: RotMode): void {
  if (fighter.form !== 'loose') {
    if (!fighter.isAI) {
      state.events.push({ type: 'toast', message: 'Xoay trục chỉ bật ở trạng thái Đơn lẻ!' });
    }
    return;
  }
  fighter.rotMode = rotMode;
  if (!fighter.isAI) {
    state.events.push({ type: 'sfx', kind: 'uiClick' });
  }
}

export function setFighterForm(state: MatchState, fighter: Fighter, newForm: FormKey): void {
  if (fighter.form === newForm) return;

  // Cancel any active form-specific Special Skill cleanly on form switch (prevents cross-form buff abuse)
  if (fighter.specialActive) {
    if (fighter.specialActive.type === 'defense' && fighter.specialActive.prevScale) {
      fighter.targetScale = fighter.specialActive.prevScale;
    }
    fighter.specialActive = null;
  }

  fighter.form = newForm;
  fighter.attackAnim = null;
  fighter.seqFireQueue = [];
  fighter.needsFullMorph = false;

  if (newForm === 'loose') {
    const total = fighter.hexes.length;
    fighter.hexes.forEach((h, idx) => {
      if (h.state !== 'BROKEN' && !isHexStolen(h)) {
        h.state = 'ORBIT';
        h.selected = false;
        h.altitude = 0;
        h.orbitAngle = fighter.facing + (idx / Math.max(1, total)) * Math.PI * 2;
        h.isReassembling = false;
        h.trail = [];
      }
    });
    if (!fighter.isAI) {
      state.events.push({ type: 'sfx', kind: 'snap' });
    }
  } else if (isSlotKey(newForm)) {
    const bp = fighter.loadout.blueprints[newForm];
    // Smart Default scale from Blueprint!
    fighter.targetScale = bp.defaultScale;
    applyBlueprintFormation(fighter, newForm, state.events, false);
    if (!fighter.isAI) {
      state.events.push({ type: 'sfx', kind: 'snap' });
    }
  }
}

export function launchHex(
  state: MatchState,
  fighter: Fighter,
  hex: HexEntity,
  angle: number,
  distFactor = 1.0,
  fireMode: FireMode = fighter.fireMode,
): void {
  const stats = getEffectiveHexStats(fighter, hex);
  const range = getLooseLaunchRange(distFactor);
  const looseOverdrive = fighter.specialActive?.type === 'loose' ? 1.30 : 1.0;
  const speed = 640 * stats.speedMult * looseOverdrive;

  const target = {
    x: fighter.x + Math.cos(angle) * range,
    y: fighter.y + Math.sin(angle) * range,
  };
  constrainToHexArena(target, stats.radius + 4);

  const toTx = target.x - hex.x;
  const toTy = target.y - hex.y;
  const travelDist = Math.max(8, Math.hypot(toTx, toTy));
  const flyAngle = Math.atan2(toTy, toTx);

  hex.state = 'LAUNCHED';
  hex.selected = false;
  hex.altitude = 0;
  hex.hitCooldown = 0;
  hex.autoReturn = fireMode !== 'xayah';
  hex.isAutoReturning = false;
  hex.launchSpeed = speed;
  hex.randomRoll =
    fighter.form === 'loose' && fighter.rotMode === 'random'
      ? 0.70 + Math.random() * 0.55
      : 1.0;
  const initE = computeLooseKineticEnergy(fighter, hex);
  hex.initialEnergy = initE;
  hex.energy = initE;
  hex.vx = Math.cos(flyAngle) * speed;
  hex.vy = Math.sin(flyAngle) * speed;
  hex.targetX = target.x;
  hex.targetY = target.y;
  hex.remainingDist = travelDist;
  hex.hasBounced = false;
  hex.bouncesLeft = fighter.rotMode === 'random' ? 3 : 0;
  hex.trail = [];
  state.events.push({ type: 'sfx', kind: 'launch' });
}

export function executeFighterDash(state: MatchState, fighter: Fighter, angle: number): boolean {
  if (fighter.dashCooldown > 0 || fighter.dashTimer > 0) return false;
  if (fighter.specialActive?.type === 'defense') {
    if (!fighter.isAI) {
      state.events.push({ type: 'sfx', kind: 'cancel' });
      state.events.push({ type: 'toast', message: 'Đang bật Pháo Đài — không thể Lướt!' });
    }
    return false;
  }

  fighter.dashCooldown = DASH_COOLDOWN;
  fighter.dashTimer = DASH_DURATION;
  fighter.dashVx = Math.cos(angle) * DASH_SPEED;
  fighter.dashVy = Math.sin(angle) * DASH_SPEED;
  fighter.facing = angle;
  fighter.dashAfterimages.push({ x: fighter.x, y: fighter.y, life: 0.24, maxLife: 0.24 });

  const color = fighter.id === 'player' ? '#38bdf8' : '#fb7185';
  state.events.push({ type: 'sparks', x: fighter.x, y: fighter.y, color, count: 10, speed: 180, size: 3.0 });
  state.events.push({
    type: 'shockwave',
    x: fighter.x,
    y: fighter.y,
    r: PLAYER_RADIUS * 0.7,
    maxR: PLAYER_RADIUS * 1.9,
    life: 0.20,
    color,
  });
  state.events.push({ type: 'sfx', kind: 'dash' });
  if (!fighter.isAI) state.events.push({ type: 'haptic', pattern: [12] });
  return true;
}

export function getFighterSpecialKey(fighter: Fighter): SpecialSkillKey {
  if (fighter.form === 'loose') return 'loose';
  return getActiveStance(fighter) ?? 'melee';
}

export function triggerFighterSpecial(
  state: MatchState,
  fighter: Fighter,
  applyHexDurabilityLossFn?: (
    state: MatchState,
    attacker: Fighter,
    defender: Fighter,
    defHex: HexEntity,
    amount: number,
    showNumber?: boolean,
  ) => boolean,
): boolean {
  if (state.matchOver) return false;

  // Pressing Special again while Pháo Đài Phản Xung is active unleashes Counter-Pulse early!
  if (fighter.specialActive?.type === 'defense' && applyHexDurabilityLossFn) {
    const opp = fighter.id === 'player' ? state.enemy : state.player;
    triggerShieldCounterPulse(state, fighter, opp, applyHexDurabilityLossFn);
    fighter.attackCooldown = 0.35;
    return true;
  }

  if (fighter.specialCooldown > 0) {
    if (!fighter.isAI) state.events.push({ type: 'sfx', kind: 'cancel' });
    return false;
  }

  const skillKey = getFighterSpecialKey(fighter);
  const cfg = SPECIAL_SKILLS[skillKey];
  fighter.specialCooldown = cfg.cd;
  fighter.specialMaxCooldown = cfg.cd;

  if (skillKey === 'loose') {
    fighter.specialActive = { type: 'loose', timer: cfg.dur, maxTimer: cfg.dur, duration: cfg.dur };
    state.events.push({
      type: 'floatingText',
      x: fighter.x,
      y: fighter.y - 36,
      text: 'QUÁ TẢI LY TÂM!',
      color: cfg.color,
      scale: 1.05,
    });
  } else if (skillKey === 'melee') {
    fighter.specialActive = {
      type: 'melee',
      timer: cfg.dur,
      maxTimer: cfg.dur,
      duration: cfg.dur,
      consumed: false,
    };
    state.events.push({
      type: 'floatingText',
      x: fighter.x,
      y: fighter.y - 36,
      text: 'PHẢN CHÉM TƯỚC MẢNH!',
      color: cfg.color,
      scale: 1.05,
    });
  } else if (skillKey === 'defense') {
    const prevScale = fighter.targetScale;
    fighter.targetScale = 1.5;
    fighter.specialActive = {
      type: 'defense',
      timer: cfg.dur,
      maxTimer: cfg.dur,
      duration: cfg.dur,
      storedEnergy: 0,
      prevScale,
    };
    state.events.push({
      type: 'floatingText',
      x: fighter.x,
      y: fighter.y - 36,
      text: 'PHÁO ĐÀI PHẢN XUNG!',
      color: cfg.color,
      scale: 1.05,
    });
  } else if (skillKey === 'ranged') {
    const assembled = fighter.hexes.filter((h) => h.state === 'ASSEMBLED');
    if (assembled.length === 0) {
      fighter.specialCooldown = 0;
      if (!fighter.isAI) state.events.push({ type: 'sfx', kind: 'cancel' });
      return false;
    }

    const speedScale = Math.pow(fighter.currentScale, -0.5);
    const R = BASE_HEX_RADIUS * fighter.currentScale;
    const startDist = getActiveAnchorDist(fighter, R);
    const baseOutSpeed = 680 * speedScale;
    const guidedSpeed = clamp(baseOutSpeed * 0.56, 320, 440);
    const initEnergy = computeRangedKineticEnergy(fighter) * 1.35;

    fighter.specialActive = { type: 'ranged', timer: cfg.dur, maxTimer: cfg.dur, duration: cfg.dur };
    if (fighter.attackAnim && fighter.attackAnim.type === 'ranged') {
      const anim = fighter.attackAnim;
      anim.phase = 'guided';
      anim.guidedSpeed = guidedSpeed;
      anim.retSpeed = baseOutSpeed * 2.0;
      anim.initialEnergy = initEnergy;
      anim.energy = initEnergy;
      anim.guidedHitBodyCd = 0;
      anim.guidedStunTimer = 0;
      anim.targetX = anim.anchorX + Math.cos(anim.angle) * 140;
      anim.targetY = anim.anchorY + Math.sin(anim.angle) * 140;
      anim.targetAngle = anim.angle;
      anim.hasCmd = false;
      anim.cmdX = anim.anchorX;
      anim.cmdY = anim.anchorY;
      anim.cmdHoldTimer = 0;
      anim.isManualSteer = false;
      anim.hitBody = false;
      anim.hitHexIds.clear();
    } else {
      const launchAng = fighter.facing;
      const sx = fighter.x + Math.cos(launchAng) * startDist;
      const sy = fighter.y + Math.sin(launchAng) * startDist;
      fighter.attackAnim = {
        type: 'ranged',
        phase: 'guided',
        timer: 0,
        duration: 99,
        angle: launchAng,
        outSpeed: baseOutSpeed,
        guidedSpeed,
        retSpeed: baseOutSpeed * 2.0,
        maxDist: 9999,
        traveled: 0,
        initialEnergy: initEnergy,
        energy: initEnergy,
        ricochetTimer: 0,
        guidedHitBodyCd: 0,
        guidedStunTimer: 0,
        anchorX: sx,
        anchorY: sy,
        targetX: sx + Math.cos(launchAng) * 140,
        targetY: sy + Math.sin(launchAng) * 140,
        targetAngle: launchAng,
        hasCmd: false,
        cmdX: sx,
        cmdY: sy,
        cmdHoldTimer: 0,
        isManualSteer: false,
        altitude: 0,
        hitBody: false,
        hitHexIds: new Set(),
      };
    }

    state.events.push({
      type: 'floatingText',
      x: fighter.x,
      y: fighter.y - 36,
      text: 'NGỰ THƯƠNG!',
      color: cfg.color,
      scale: 1.05,
    });
  }

  state.events.push({
    type: 'shockwave',
    x: fighter.x,
    y: fighter.y,
    r: PLAYER_RADIUS * 0.8,
    maxR: PLAYER_RADIUS * 2.8,
    life: 0.28,
    color: cfg.color,
  });
  state.events.push({
    type: 'sparks',
    x: fighter.x,
    y: fighter.y,
    color: cfg.color,
    count: 14,
    speed: 240,
    size: 3.4,
  });
  state.events.push({ type: 'sfx', kind: 'special' });
  if (!fighter.isAI) state.events.push({ type: 'haptic', pattern: [16, 12, 16] });
  return true;
}

export function triggerShieldCounterPulse(
  state: MatchState,
  fighter: Fighter,
  opponent: Fighter,
  applyHexDurabilityLossFn: (
    state: MatchState,
    attacker: Fighter,
    defender: Fighter,
    defHex: HexEntity,
    amount: number,
    showNumber?: boolean,
  ) => boolean,
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

  const dOpp = dist(fighter.x, fighter.y, opponent.x, opponent.y);
  const angToOpp = Math.atan2(opponent.y - fighter.y, opponent.x - fighter.x);
  if (dOpp < range && Math.abs(angleDiff(ang, angToOpp)) <= halfArc) {
    if (!segmentIntersectsAnyObstacle(state.obstacles, fighter.x, fighter.y, opponent.x, opponent.y, 0)) {
      const kb = 390 + stored * 1.4;
      opponent.kbX += Math.cos(angToOpp) * kb;
      opponent.kbY += Math.sin(angToOpp) * kb;

      opponent.hp = Math.max(0, opponent.hp - pulseDmg);
      opponent.damageFlash = 0.24;
      if (fighter.id === 'player') state.stats.dmgDealt += pulseDmg;
      else state.stats.enemyDmg += pulseDmg;

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

export function performMeleeParrySteal(
  state: MatchState,
  att: Fighter,
  def: Fighter,
  dh: HexEntity,
): boolean {
  const anim = att.attackAnim;
  if (!anim || anim.type !== 'melee' || !anim.empoweredParry) return false;
  const disarmDur = SPECIAL_SKILLS.melee.disarmDur ?? 4.5;

  if (dh.state === 'ASSEMBLED') {
    if (anim.stolenCount >= 1) return false;
    const assembled = def.hexes.filter((h) => h.state === 'ASSEMBLED');
    if (assembled.length === 0) return false;
    const nonRoot = assembled.filter((h) => h.id !== def.rootHexId);
    const pool = nonRoot.length > 0 ? nonRoot : assembled;
    const victim = pool[Math.floor(Math.random() * pool.length)];

    const knockAng = Math.atan2(victim.y - att.y, victim.x - att.x) + (Math.random() - 0.5) * 0.35;
    victim.state = 'STOLEN_FLY';
    victim.stolenById = att.id;
    victim.stolenTimer = disarmDur;
    victim.selected = false;
    victim.altitude = 0;
    victim.vx = Math.cos(knockAng) * 560;
    victim.vy = Math.sin(knockAng) * 560;
    victim.remainingDist = 195;
    victim.hitCooldown = 0.08;
    victim.trail = [];

    anim.stolenCount++;
    runStructuralBFSAndReassemble(def, state.events, true);
    state.events.push({ type: 'sparks', x: victim.x, y: victim.y, color: '#fbbf24', count: 16, speed: 300, size: 3.6 });
    state.events.push({ type: 'shockwave', x: victim.x, y: victim.y, r: 12, maxR: 68, life: 0.25, color: '#fbbf24' });
    state.events.push({ type: 'floatingText', x: victim.x, y: victim.y - 24, text: 'TƯỚC MẢNH!', color: '#fbbf24', scale: 1.15 });
    state.hitStopTimer = Math.max(state.hitStopTimer, 0.048);
    state.events.push({ type: 'hitStop', duration: 0.048 });
    state.events.push({ type: 'shake', amount: 8 });
    state.events.push({ type: 'sfx', kind: 'pierce' });
    if (!att.isAI) state.events.push({ type: 'haptic', pattern: [20, 14, 22] });
    return true;
  } else {
    if (anim.stolenCount >= 3 || isHexStolen(dh)) return false;
    const reflAng = Math.atan2(def.y - dh.y, def.x - dh.x) + (Math.random() - 0.5) * 0.28;
    dh.state = 'STOLEN_FLY';
    dh.stolenById = att.id;
    dh.stolenTimer = disarmDur;
    dh.selected = false;
    dh.altitude = 0;
    dh.vx = Math.cos(reflAng) * 640;
    dh.vy = Math.sin(reflAng) * 640;
    dh.remainingDist = 250;
    dh.hitCooldown = 0.06;
    dh.trail = [];

    anim.stolenCount++;
    state.events.push({ type: 'sparks', x: dh.x, y: dh.y, color: '#fbbf24', count: 14, speed: 280, size: 3.4 });
    state.events.push({ type: 'shockwave', x: dh.x, y: dh.y, r: 10, maxR: 58, life: 0.22, color: '#fbbf24' });
    state.events.push({ type: 'floatingText', x: dh.x, y: dh.y - 20, text: 'PHẢN TƯỚC!', color: '#fbbf24', scale: 1.1 });
    state.hitStopTimer = Math.max(state.hitStopTimer, 0.042);
    state.events.push({ type: 'hitStop', duration: 0.042 });
    state.events.push({ type: 'shake', amount: 7 });
    state.events.push({ type: 'sfx', kind: 'pierce' });
    if (!att.isAI) state.events.push({ type: 'haptic', pattern: [18, 12, 18] });
    return true;
  }
}

export function recallSpecificHex(state: MatchState, fighter: Fighter, hex: HexEntity): boolean {
  if (fighter.form !== 'loose') return false;
  if (hex.state !== 'PLANTED' && hex.state !== 'LAUNCHED') return false;
  hex.state = 'RECALLING';
  hex.isAutoReturning = false;
  hex.selected = true;
  hex.hitCooldown = 0;
  hex.trail = [];
  state.events.push({
    type: 'shockwave',
    x: hex.x,
    y: hex.y,
    r: BASE_HEX_RADIUS * fighter.currentScale * 0.7,
    maxR: BASE_HEX_RADIUS * fighter.currentScale * 2.4,
    life: 0.22,
    color: '#fbbf24',
  });
  state.events.push({ type: 'sfx', kind: 'recall' });
  return true;
}

export function findPlantedHexAtWorld(fighter: Fighter, wx: number, wy: number): HexEntity | null {
  if (fighter.form !== 'loose') return null;
  const hitR = BASE_HEX_RADIUS * fighter.currentScale * 1.5 + 10;
  let best: HexEntity | null = null;
  let bestD = Infinity;
  for (const h of fighter.hexes) {
    if (h.state !== 'PLANTED' && h.state !== 'LAUNCHED') continue;
    const d = dist(wx, wy, h.x, h.y);
    if (d <= hitR && d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

export function triggerSmartRecall(state: MatchState, fighter: Fighter): boolean {
  if (fighter.form !== 'loose') return false;
  const planted = fighter.hexes.filter((h) => h.state === 'PLANTED' || h.state === 'LAUNCHED');
  if (planted.length === 0) return false;

  const selectedPlanted = planted.filter((h) => h.selected);
  const toRecall = selectedPlanted.length > 0 ? selectedPlanted : planted;

  for (const h of toRecall) {
    h.state = 'RECALLING';
    h.isAutoReturning = false;
    h.selected = true;
    h.hitCooldown = 0;
    h.trail = [];
  }
  state.events.push({ type: 'sfx', kind: 'recall' });
  return true;
}

export function toggleSelectAllHexes(state: MatchState, fighter: Fighter): void {
  if (fighter.form !== 'loose') return;
  const selectable = fighter.hexes.filter((h) => h.state === 'ORBIT');
  if (selectable.length === 0) return;
  const allSelected = selectable.every((h) => h.selected);
  for (const h of selectable) {
    h.selected = !allSelected;
  }
  state.events.push({ type: 'sfx', kind: 'uiClick' });
}

export function issueGuidedWaypoint(
  state: MatchState,
  fighter: Fighter,
  wx: number,
  wy: number,
  withRipple = true,
): boolean {
  const anim = fighter.attackAnim;
  if (!anim || anim.type !== 'ranged' || anim.phase !== 'guided') return false;
  const R = BASE_HEX_RADIUS * fighter.currentScale;
  const pt = { x: wx, y: wy };
  constrainToHexArena(pt, R * 1.6 + 8);
  anim.hasCmd = true;
  anim.cmdX = pt.x;
  anim.cmdY = pt.y;
  anim.cmdHoldTimer = 0;

  if (withRipple) {
    state.events.push({
      type: 'shockwave',
      x: pt.x,
      y: pt.y,
      r: 8,
      maxR: 38,
      life: 0.24,
      color: '#c084fc',
    });
    state.events.push({ type: 'sfx', kind: 'uiClick' });
  }
  return true;
}

export function clearGuidedWaypoint(state: MatchState, fighter: Fighter): boolean {
  const anim = fighter.attackAnim;
  if (!anim || anim.type !== 'ranged' || anim.phase !== 'guided' || !anim.hasCmd) return false;
  anim.hasCmd = false;
  state.events.push({ type: 'sfx', kind: 'uiClick' });
  return true;
}

export function executeFighterAttack(
  state: MatchState,
  fighter: Fighter,
  angle: number,
  strength = 1.0,
  applyHexDurabilityLossFn?: (
    state: MatchState,
    attacker: Fighter,
    defender: Fighter,
    defHex: HexEntity,
    amount: number,
    showNumber?: boolean,
  ) => boolean,
): void {
  if (fighter.attackCooldown > 0 || state.matchOver) return;
  fighter.facing = angle;

  if (fighter.form === 'loose') {
    let pool = fighter.hexes.filter((h) => h.state === 'ORBIT' && h.selected);
    if (pool.length === 0 && fighter.isAI) {
      pool = fighter.hexes.filter((h) => h.state === 'ORBIT');
    }
    if (pool.length === 0) {
      if (!fighter.isAI) {
        state.events.push({ type: 'sfx', kind: 'cancel' });
        const hasOrbit = fighter.hexes.some((h) => h.state === 'ORBIT');
        if (hasOrbit) {
          state.events.push({
            type: 'toast',
            message: `Chọn mảnh (1–${fighter.hexes.length}) hoặc bấm Chọn hết để phóng!`,
          });
        }
      }
      return;
    }

    if (fighter.fireMode === 'xayah') {
      launchHex(state, fighter, pool[0], angle, strength, 'xayah');
      fighter.attackCooldown = 0.14;
    } else if (fighter.fireMode === 'seq') {
      fighter.seqFireQueue = pool.map((h) => ({ hexId: h.id, angle, strength, fireMode: 'seq' }));
      fighter.seqFireTimer = 0;
      fighter.attackCooldown = 0.25;
    } else {
      const n = pool.length;
      const spread = Math.min(0.55, (n - 1) * 0.10);
      pool.forEach((h, i) => {
        const offset = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
        launchHex(state, fighter, h, angle + offset, strength, 'volley');
      });
      fighter.attackCooldown = 0.32;
    }
    return;
  }

  const bp = getActiveBlueprint(fighter);
  if (!bp) return;

  if (bp.stance === 'ranged') {
    if (fighter.attackAnim) return;
    const speedScale = Math.pow(fighter.currentScale, -0.5);
    const R = BASE_HEX_RADIUS * fighter.currentScale;
    const startDist = getActiveAnchorDist(fighter, R);
    const outSpeed = 680 * speedScale;
    const maxDist = 320 + 260 * clamp(strength, 0.35, 1.0);
    const initEnergy = computeRangedKineticEnergy(fighter);
    const ax = fighter.x + Math.cos(angle) * startDist;
    const ay = fighter.y + Math.sin(angle) * startDist;

    fighter.attackAnim = {
      type: 'ranged',
      phase: 'out',
      timer: 0,
      duration: 99,
      angle,
      outSpeed,
      retSpeed: outSpeed * 2.0,
      maxDist,
      traveled: 0,
      initialEnergy: initEnergy,
      energy: initEnergy,
      ricochetTimer: 0,
      guidedHitBodyCd: 0,
      guidedStunTimer: 0,
      anchorX: ax,
      anchorY: ay,
      targetX: ax,
      targetY: ay,
      targetAngle: angle,
      hasCmd: false,
      cmdX: ax,
      cmdY: ay,
      cmdHoldTimer: 0,
      isManualSteer: false,
      altitude: 0,
      hitBody: false,
      hitHexIds: new Set(),
    };
    fighter.attackCooldown = 0.25;
    state.events.push({ type: 'sfx', kind: 'launch' });
  } else if (bp.stance === 'melee') {
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
  } else {
    // Defense Stance is PURE DEFENSE: cannot execute a normal attack!
    // Only when Pháo Đài Phản Xung (Defense Special) is active can the player unleash the damaging Counter-Pulse.
    if (fighter.specialActive?.type === 'defense' && applyHexDurabilityLossFn) {
      const opp = fighter.id === 'player' ? state.enemy : state.player;
      triggerShieldCounterPulse(state, fighter, opp, applyHexDurabilityLossFn);
      fighter.attackCooldown = 0.35;
    }
    return;
  }
}
