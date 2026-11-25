import { DASH_COOLDOWN, DASH_DURATION, DASH_SPEED, PLAYER_RADIUS } from '../constants';
import { applyBlueprintFormation, isHexStolen, isSlotKey } from '../world/structure';
import type { Fighter, FormKey, MatchState, RotMode, ScaleTier } from '../types';

export function setFighterScale(state: MatchState, fighter: Fighter, scaleVal: ScaleTier): void {
  if (fighter.specialActive?.type === 'defense') {
    if (!fighter.isAI) {
      state.events.push({ type: 'toast', message: 'Pháo Đài đang giữ kích thước 150%!', target: fighter.id });
    }
    return;
  }
  if (fighter.specialActive?.type === 'melee') {
    if (!fighter.isAI) {
      state.events.push({ type: 'toast', message: 'Phản Chém đang giữ kích thước 150%!', target: fighter.id });
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
      state.events.push({ type: 'toast', message: 'Xoay trục chỉ bật ở trạng thái Đơn lẻ!', target: fighter.id });
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
    if (fighter.specialActive.prevScale) {
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
        h.selected = true;
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

export function executeFighterDash(state: MatchState, fighter: Fighter, angle: number): boolean {
  if (fighter.dashCooldown > 0 || fighter.dashTimer > 0) return false;
  if (fighter.specialActive?.type === 'defense') {
    if (!fighter.isAI) {
      state.events.push({ type: 'sfx', kind: 'cancel' });
      state.events.push({ type: 'toast', message: 'Đang bật Pháo Đài — không thể Lướt!', target: fighter.id });
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
  if (!fighter.isAI) state.events.push({ type: 'haptic', pattern: [12], target: fighter.id });
  return true;
}
