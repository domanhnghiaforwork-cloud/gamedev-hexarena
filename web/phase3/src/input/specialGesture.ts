import { clamp, dist } from '@core/math/hexMath';
import type { AttackModeId, SpecialSkillId } from '@core/types';
import { getMobileSpecialRadialPos, type MobileComputedLayout } from './hudPresets';

export type SpecialGesturePhase = 'idle' | 'pending' | 'selecting' | 'aiming' | 'reselect_armed';

export interface SpecialRadialState {
  active: boolean;
  phase: SpecialGesturePhase;
  source: 'touch' | 'pc' | null;
  pointerId: number | null;
  originX: number;
  originY: number;
  pressTimeMs: number;
  reselectUnlockMs: number;
  hoverIdx: number;
  lockedIdx: number;
  lockedSkillId: SpecialSkillId | null;
  pivotX: number;
  pivotY: number;
  knobX: number;
  knobY: number;
  aimAngle: number;
  aimStrength: number;
  aimMoved: boolean;
  modeId: AttackModeId;
}

export const SPECIAL_HOLD_MS = 165;

export function createIdleSpecialRadialState(): SpecialRadialState {
  return {
    active: false,
    phase: 'idle',
    source: null,
    pointerId: null,
    originX: 0,
    originY: 0,
    pressTimeMs: 0,
    reselectUnlockMs: 0,
    hoverIdx: -1,
    lockedIdx: -1,
    lockedSkillId: null,
    pivotX: 0,
    pivotY: 0,
    knobX: 0,
    knobY: 0,
    aimAngle: 0,
    aimStrength: 0.65,
    aimMoved: false,
    modeId: 'loose',
  };
}

export function resetSpecialRadialState(sr: SpecialRadialState): void {
  sr.active = false;
  sr.phase = 'idle';
  sr.source = null;
  sr.pointerId = null;
  sr.reselectUnlockMs = 0;
  sr.hoverIdx = -1;
  sr.lockedIdx = -1;
  sr.lockedSkillId = null;
  sr.aimMoved = false;
}

export function isSpecialSelectorLocked(selectorLocked: boolean, skillCount: number): boolean {
  return selectorLocked || skillCount <= 1;
}

export function startMobileSpecialPress(
  sr: SpecialRadialState,
  opts: {
    pointerId: number;
    layout: MobileComputedLayout;
    modeId: AttackModeId;
    selectedIndex: number;
    selectedSkillId: SpecialSkillId;
    skillCount: number;
    selectorLocked: boolean;
    defaultFacing: number;
    nowMs: number;
  },
): void {
  const lockedMode = isSpecialSelectorLocked(opts.selectorLocked, opts.skillCount);
  sr.active = false;
  sr.phase = 'pending';
  sr.source = 'touch';
  sr.pointerId = opts.pointerId;
  sr.originX = opts.layout.special.cx;
  sr.originY = opts.layout.special.cy;
  sr.pressTimeMs = opts.nowMs;
  sr.reselectUnlockMs = 0;
  sr.hoverIdx = -1;
  sr.lockedIdx = opts.selectedIndex;
  sr.lockedSkillId = lockedMode ? opts.selectedSkillId : null;
  sr.pivotX = opts.layout.special.cx;
  sr.pivotY = opts.layout.special.cy;
  sr.knobX = opts.layout.special.cx;
  sr.knobY = opts.layout.special.cy;
  sr.aimAngle = opts.defaultFacing;
  sr.aimStrength = 0.65;
  sr.aimMoved = false;
  sr.modeId = opts.modeId;
}

export function advanceMobileSpecialHold(
  sr: SpecialRadialState,
  opts: {
    layout: MobileComputedLayout;
    selectedIndex: number;
    selectedSkillId: SpecialSkillId;
    skillCount: number;
    selectorLocked: boolean;
    nowMs: number;
  },
): boolean {
  if (sr.source !== 'touch' || sr.phase !== 'pending') return false;
  if (opts.nowMs - sr.pressTimeMs < SPECIAL_HOLD_MS) return false;

  if (isSpecialSelectorLocked(opts.selectorLocked, opts.skillCount)) {
    sr.phase = 'aiming';
    sr.active = true;
    sr.pivotX = opts.layout.special.cx;
    sr.pivotY = opts.layout.special.cy;
    sr.lockedIdx = opts.selectedIndex;
    sr.lockedSkillId = opts.selectedSkillId;
  } else {
    sr.phase = 'selecting';
    sr.active = true;
  }
  return true;
}

export interface SpecialMoveStepResult {
  cancelHovered: boolean;
  lockedNow: boolean;
  unlockedToSelect: boolean;
  nextFacing?: number;
}

function applyDynamicPivotAim(
  sr: SpecialRadialState,
  px: number,
  py: number,
  baseScale: number,
  canRotateFacing: boolean,
): number | undefined {
  const dx = px - sr.pivotX;
  const dy = py - sr.pivotY;
  const d = Math.hypot(dx, dy);
  const maxR = 44 * baseScale;
  sr.knobX = d > maxR ? sr.pivotX + (dx / d) * maxR : px;
  sr.knobY = d > maxR ? sr.pivotY + (dy / d) * maxR : py;
  if (d > 10 * baseScale) {
    sr.aimMoved = true;
    sr.aimAngle = Math.atan2(dy, dx);
    sr.aimStrength = clamp(d / (maxR * 1.15), 0.15, 1.0);
    if (canRotateFacing) return sr.aimAngle;
  }
  return undefined;
}

export function stepMobileSpecialMove(
  sr: SpecialRadialState,
  opts: {
    px: number;
    py: number;
    nowMs: number;
    layout: MobileComputedLayout;
    skills: ReadonlyArray<{ id: SpecialSkillId }>;
    selectedIndex: number;
    selectedSkillId: SpecialSkillId;
    selectorLocked: boolean;
    defaultFacing: number;
    canRotateFacing: boolean;
  },
): SpecialMoveStepResult {
  const { px, py, nowMs, layout, skills, selectorLocked } = opts;
  const lockedMode = isSpecialSelectorLocked(selectorLocked, skills.length);
  const inCancel = dist(px, py, layout.cancel.cx, layout.cancel.cy) <= layout.cancel.r * 1.45;

  if (sr.phase === 'pending') {
    const dCenter = dist(px, py, layout.special.cx, layout.special.cy);
    if (lockedMode) {
      if (dCenter <= 10) {
        return { cancelHovered: false, lockedNow: false, unlockedToSelect: false };
      }
      sr.phase = 'aiming';
      sr.active = true;
      sr.pivotX = layout.special.cx;
      sr.pivotY = layout.special.cy;
      sr.lockedIdx = opts.selectedIndex;
      sr.lockedSkillId = opts.selectedSkillId;
      sr.aimAngle = opts.defaultFacing;
      sr.aimStrength = 0.65;
      sr.aimMoved = false;
    } else {
      if (dCenter <= layout.special.r * 0.55) {
        return { cancelHovered: false, lockedNow: false, unlockedToSelect: false };
      }
      sr.phase = 'selecting';
      sr.active = true;
    }
  }

  if (sr.phase === 'selecting') {
    if (dist(px, py, layout.special.cx, layout.special.cy) <= layout.special.r * 0.72) {
      sr.hoverIdx = -1;
      return { cancelHovered: inCancel, lockedNow: false, unlockedToSelect: false };
    }

    let hovered = -1;
    let bestD = Infinity;
    let bestPos: { x: number; y: number; r: number } | null = null;
    for (let idx = 0; idx < skills.length; idx++) {
      const pos = getMobileSpecialRadialPos(layout.special, layout.baseScale, layout.specialRotRad, idx, skills.length);
      const d = dist(px, py, pos.x, pos.y);
      if (d < bestD && d < pos.r * 1.9) {
        bestD = d;
        hovered = idx;
        bestPos = pos;
      }
    }
    sr.hoverIdx = hovered;

    if (nowMs >= sr.reselectUnlockMs && hovered !== -1 && bestPos && bestD <= bestPos.r * 1.15) {
      sr.phase = 'aiming';
      sr.lockedIdx = hovered;
      sr.lockedSkillId = skills[hovered].id;
      sr.pivotX = bestPos.x;
      sr.pivotY = bestPos.y;
      sr.knobX = px;
      sr.knobY = py;
      sr.aimAngle = opts.defaultFacing;
      sr.aimStrength = 0.65;
      sr.aimMoved = false;
      return { cancelHovered: inCancel, lockedNow: true, unlockedToSelect: false };
    }

    return { cancelHovered: inCancel, lockedNow: false, unlockedToSelect: false };
  }

  if (sr.phase === 'aiming') {
    const nextFacing = applyDynamicPivotAim(sr, px, py, layout.baseScale, opts.canRotateFacing);
    if (inCancel) {
      sr.phase = 'reselect_armed';
    }
    return { cancelHovered: inCancel, lockedNow: false, unlockedToSelect: false, nextFacing };
  }

  if (sr.phase === 'reselect_armed') {
    const exitCancel = dist(px, py, layout.cancel.cx, layout.cancel.cy) > layout.cancel.r * 1.65;
    if (!exitCancel) {
      return { cancelHovered: true, lockedNow: false, unlockedToSelect: false };
    }
    if (!lockedMode) {
      sr.phase = 'selecting';
      sr.lockedIdx = -1;
      sr.lockedSkillId = null;
      sr.hoverIdx = -1;
      sr.aimMoved = false;
      sr.reselectUnlockMs = nowMs + 120;
      return { cancelHovered: false, lockedNow: false, unlockedToSelect: true };
    }
    sr.phase = 'aiming';
    const nextFacing = applyDynamicPivotAim(sr, px, py, layout.baseScale, opts.canRotateFacing);
    return { cancelHovered: false, lockedNow: false, unlockedToSelect: false, nextFacing };
  }

  return { cancelHovered: false, lockedNow: false, unlockedToSelect: false };
}
