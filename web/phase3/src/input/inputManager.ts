import { PLAYER_MOVE_SPEED, SCALE_TIERS } from '@core/constants';
import { applyHexDurabilityLoss } from '@core/physics/combat';
import { clamp, dist } from '@core/math/hexMath';
import {
  clearGuidedWaypoint,
  executeFighterAttack,
  executeFighterDash,
  findPlantedHexAtWorld,
  issueGuidedWaypoint,
  recallSpecificHex,
  setFighterForm,
  setFighterRotMode,
  setFighterScale,
  toggleSelectAllHexes,
  triggerFighterSpecial,
  triggerSmartRecall,
} from '@attacks/index';
import { getActiveStance } from '@core/world/structure';
import type { FireMode, FormKey, GuidedSteerInput, MatchState, RotMode } from '@core/types';
import type { ContinuousInputPacket, PvPAction } from '@net/protocol';
import type { MobileHUDConfig, PCControlConfig } from '@storage/profiles';
import { getViewportSize } from '@ui/common/fullscreen';
import {
  computeDesktopDockLayout,
  computeSmartMobileLayout,
  type MobileComputedLayout,
  type PCComputedDock,
  type Rect,
  type SafeInsets,
} from './hudPresets';

export type InputMode = 'desktop' | 'touch';

export interface FormRadialOption {
  id: FormKey;
  angle: number;
}

export interface LiveInputState {
  mode: InputMode;
  manualLock: boolean;
  vw: number;
  vh: number;
  mobileLayout: MobileComputedLayout;
  pcLayout: PCComputedDock;
  mouse: { px: number; py: number; wx: number; wy: number; active: boolean; idleTimer: number };
  joy: { pointerId: number | null; knobX: number; knobY: number; dx: number; dy: number };
  atk: { pointerId: number | null; knobX: number; knobY: number };
  dash: { pointerId: number | null; knobX: number; knobY: number };
  arc: { pointerId: number | null; paintValue: boolean; lastSeg: number };
  formRadial: { pointerId: number | null; hoverIdx: number; options: FormRadialOption[] };
  pcPaint: { pointerId: number | null; paintValue: boolean; lastSeg: number };
  desktopAimPointerId: number | null;
  desktopGuidedPointerId: number | null;
  cancelHovered: boolean;
}

export function pointInRect(px: number, py: number, rect: Rect): boolean {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

export function pointInRectPadded(px: number, py: number, rect: Rect, pad = 5): boolean {
  return px >= rect.x - pad && px <= rect.x + rect.w + pad && py >= rect.y - pad && py <= rect.y + rect.h + pad;
}

function findNearestRect<T extends Rect>(px: number, py: number, items: T[], pad = 5): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const item of items) {
    if (!pointInRectPadded(px, py, item, pad)) continue;
    const cx = item.x + item.w * 0.5;
    const cy = item.y + item.h * 0.5;
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return best;
}

export class InputManager {
  public live: LiveInputState;
  private keys = new Set<string>();
  private paused = false;
  private wheelCooldown = 0;
  private inputSeq = 0;
  private safeAreaProbe: HTMLDivElement | null = null;

  private canvas: HTMLCanvasElement;
  private getState: () => MatchState;
  private getMobileConfig: () => MobileHUDConfig;
  private getPCConfig: () => PCControlConfig;
  private screenToWorld: (px: number, py: number) => { wx: number; wy: number };
  private onModeChanged: (mode: InputMode) => void;
  private onAudioUnlock: () => void;
  private isPvPActive: () => boolean;
  private onPvPAction: (action: PvPAction) => void;

  constructor(opts: {
    canvas: HTMLCanvasElement;
    getState: () => MatchState;
    getMobileConfig: () => MobileHUDConfig;
    getPCConfig: () => PCControlConfig;
    screenToWorld: (px: number, py: number) => { wx: number; wy: number };
    onModeChanged: (mode: InputMode) => void;
    onAudioUnlock: () => void;
    isPvPActive?: () => boolean;
    onPvPAction?: (action: PvPAction) => void;
  }) {
    this.canvas = opts.canvas;
    this.getState = opts.getState;
    this.getMobileConfig = opts.getMobileConfig;
    this.getPCConfig = opts.getPCConfig;
    this.screenToWorld = opts.screenToWorld;
    this.onModeChanged = opts.onModeChanged;
    this.onAudioUnlock = opts.onAudioUnlock;
    this.isPvPActive = opts.isPvPActive ?? (() => false);
    this.onPvPAction = opts.onPvPAction ?? (() => {});

    const isCoarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    const { vw, vh } = getViewportSize();
    const initMode: InputMode = isCoarse ? 'touch' : 'desktop';
    const state = this.getState();

    this.live = {
      mode: initMode,
      manualLock: false,
      vw,
      vh,
      mobileLayout: computeSmartMobileLayout(vw, vh, state.player.hexes.length, this.getMobileConfig(), this.readSafeInsets()),
      pcLayout: computeDesktopDockLayout(vw, vh, state.player.hexes.length, state.player.form === 'loose', this.getPCConfig()),
      mouse: { px: vw * 0.5, py: vh * 0.5, wx: 0, wy: 0, active: false, idleTimer: 0 },
      joy: { pointerId: null, knobX: 0, knobY: 0, dx: 0, dy: 0 },
      atk: { pointerId: null, knobX: 0, knobY: 0 },
      dash: { pointerId: null, knobX: 0, knobY: 0 },
      arc: { pointerId: null, paintValue: true, lastSeg: -1 },
      formRadial: {
        pointerId: null,
        hoverIdx: -1,
        options: [
          { id: 'loose', angle: -Math.PI * 0.80 },
          { id: 'slot1', angle: -Math.PI * 0.60 },
          { id: 'slot2', angle: -Math.PI * 0.40 },
          { id: 'slot3', angle: -Math.PI * 0.20 },
        ],
      },
      pcPaint: { pointerId: null, paintValue: true, lastSeg: -1 },
      desktopAimPointerId: null,
      desktopGuidedPointerId: null,
      cancelHovered: false,
    };

    this.recomputeLayouts();
    this.bindEvents();
  }

  public setPaused(p: boolean): void {
    this.paused = p;
    if (p) this.clearAllInputs();
  }

  public setMode(mode: InputMode, manual = false): void {
    if (manual) this.live.manualLock = true;
    if (this.live.mode === mode) return;
    this.live.mode = mode;
    this.clearAllInputs();
    this.recomputeLayouts();
    this.onModeChanged(mode);
  }

  public readSafeInsets(): SafeInsets {
    if (typeof document === 'undefined' || !document.body) {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    if (!this.safeAreaProbe) {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText =
        'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
      document.body.appendChild(el);
      this.safeAreaProbe = el;
    }
    const cs = getComputedStyle(this.safeAreaProbe);
    const parse = (v: string) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    return {
      top: parse(cs.paddingTop),
      right: parse(cs.paddingRight),
      bottom: parse(cs.paddingBottom),
      left: parse(cs.paddingLeft),
    };
  }

  public recomputeLayouts(): void {
    const { vw, vh } = getViewportSize();
    this.live.vw = vw;
    this.live.vh = vh;
    const state = this.getState();
    const hexCount = state.player.hexes.length;
    this.live.mobileLayout = computeSmartMobileLayout(vw, vh, hexCount, this.getMobileConfig(), this.readSafeInsets());
    this.live.pcLayout = computeDesktopDockLayout(
      vw,
      vh,
      hexCount,
      state.player.form === 'loose',
      this.getPCConfig(),
    );

    if (this.live.joy.pointerId === null) {
      this.live.joy.knobX = this.live.mobileLayout.joy.cx;
      this.live.joy.knobY = this.live.mobileLayout.joy.cy;
    }
    if (this.live.atk.pointerId === null) {
      this.live.atk.knobX = this.live.mobileLayout.atk.cx;
      this.live.atk.knobY = this.live.mobileLayout.atk.cy;
    }
    if (this.live.dash.pointerId === null) {
      this.live.dash.knobX = this.live.mobileLayout.dash.cx;
      this.live.dash.knobY = this.live.mobileLayout.dash.cy;
    }
  }

  public getFormRadialOptionPos(opt: FormRadialOption): { x: number; y: number; r: number } {
    const f = this.live.mobileLayout.form;
    const s = this.live.mobileLayout.baseScale;
    const distR = 82 * s;
    const ang = opt.angle + this.live.mobileLayout.formRotRad;
    return {
      x: f.cx + Math.cos(ang) * distR,
      y: f.cy + Math.sin(ang) * distR,
      r: 23 * s,
    };
  }

  public hitTestArcSegment(px: number, py: number): number {
    const arc = this.live.mobileLayout.arc;
    const d = dist(px, py, arc.cx, arc.cy);
    if (d < arc.innerR - 6 || d > arc.outerR + 8) return -1;
    const ang = Math.atan2(py - arc.cy, px - arc.cx);
    const sweep = arc.endAng - arc.startAng;
    let rel = (ang - arc.startAng) % (Math.PI * 2);
    if (rel < 0) rel += Math.PI * 2;
    if (rel > sweep) return -1;
    const frac = rel / sweep;
    return clamp(Math.floor(frac * arc.hexCount), 0, arc.hexCount - 1);
  }

  public clearAllInputs(): void {
    this.keys.clear();
    this.live.joy.pointerId = null;
    this.live.joy.dx = 0;
    this.live.joy.dy = 0;
    this.live.atk.pointerId = null;
    this.live.dash.pointerId = null;
    this.live.arc.pointerId = null;
    this.live.formRadial.pointerId = null;
    this.live.formRadial.hoverIdx = -1;
    this.live.pcPaint.pointerId = null;
    this.live.desktopAimPointerId = null;
    this.live.desktopGuidedPointerId = null;
    this.live.cancelHovered = false;

    const state = this.getState();
    state.player.isAiming = false;
    state.player.isAimingDash = false;
    this.recomputeLayouts();
  }

  /**
   * Dispatches a discrete player combat action either directly to local core (Bot mode)
   * or reliably to the Authoritative PvP Server (PvP mode).
   */
  public dispatchAction(action: PvPAction): void {
    const state = this.getState();
    const { player } = state;

    if (this.isPvPActive()) {
      // Optimistic local UI/audio feedback for 0ms responsiveness before server echo!
      switch (action.kind) {
        case 'set_hex_selected': {
          const h = player.hexes[action.hexId];
          if (h && h.state !== 'BROKEN') {
            h.selected = action.selected;
            state.events.push({ type: 'sfx', kind: 'uiClick' });
          }
          break;
        }
        case 'select_all':
          toggleSelectAllHexes(state, player);
          break;
        case 'set_fire_mode':
          player.fireMode = action.fireMode;
          state.events.push({ type: 'sfx', kind: 'uiClick' });
          break;
        case 'set_rot':
          if (player.form === 'loose') {
            player.rotMode = action.rotMode;
            state.events.push({ type: 'sfx', kind: 'uiClick' });
          }
          break;
        case 'set_scale':
          if (player.specialActive?.type !== 'defense') {
            player.targetScale = action.scale;
            state.events.push({ type: 'sfx', kind: 'uiClick' });
          }
          break;
        case 'set_form':
          player.form = action.form;
          this.recomputeLayouts();
          state.events.push({ type: 'sfx', kind: 'snap' });
          break;
        default:
          break;
      }
      this.onPvPAction(action);
      return;
    }

    switch (action.kind) {
      case 'set_form':
        setFighterForm(state, player, action.form);
        this.recomputeLayouts();
        break;
      case 'set_scale':
        setFighterScale(state, player, action.scale);
        break;
      case 'set_rot':
        setFighterRotMode(state, player, action.rotMode);
        break;
      case 'set_fire_mode':
        player.fireMode = action.fireMode;
        state.events.push({ type: 'sfx', kind: 'uiClick' });
        break;
      case 'set_hex_selected': {
        const hex = player.hexes[action.hexId];
        if (hex && hex.state !== 'BROKEN') {
          hex.selected = action.selected;
          state.events.push({ type: 'sfx', kind: 'uiClick' });
        }
        break;
      }
      case 'select_all':
        toggleSelectAllHexes(state, player);
        break;
      case 'attack':
        executeFighterAttack(state, player, action.angle, action.strength, applyHexDurabilityLoss);
        break;
      case 'dash':
        executeFighterDash(state, player, action.angle);
        break;
      case 'special':
        triggerFighterSpecial(state, player, applyHexDurabilityLoss);
        break;
      case 'smart_recall':
        triggerSmartRecall(state, player);
        break;
      case 'recall_hex': {
        const hex = player.hexes[action.hexId];
        if (hex) recallSpecificHex(state, player, hex);
        break;
      }
      case 'guided_waypoint':
        issueGuidedWaypoint(state, player, action.wx, action.wy, action.withRipple);
        break;
      case 'guided_clear':
        clearGuidedWaypoint(state, player);
        break;
    }
  }

  /**
   * Builds continuous input snapshot for PvP networking (movement, aiming, facing, guided steer).
   */
  public sampleContinuousInput(dt: number): ContinuousInputPacket {
    const guidedInput = this.applyTickInputs(dt);
    const state = this.getState();
    const { player } = state;
    const kb = this.getPCConfig().keybinds;
    let mx = this.live.joy.dx;
    let my = this.live.joy.dy;
    if (this.keys.has(kb.moveUp) || this.keys.has('arrowup')) my -= 1;
    if (this.keys.has(kb.moveDown) || this.keys.has('arrowdown')) my += 1;
    if (this.keys.has(kb.moveLeft) || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has(kb.moveRight) || this.keys.has('arrowright')) mx += 1;

    this.inputSeq++;
    return {
      seq: this.inputSeq,
      mx: this.paused ? 0 : mx,
      my: this.paused ? 0 : my,
      facing: player.facing,
      aimAngle: player.aimAngle,
      aimStrength: player.aimStrength,
      isAiming: player.isAiming,
      isAimingDash: player.isAimingDash,
      dashAimAngle: player.dashAimAngle,
      guidedInput,
    };
  }

  /**
   * Called once per simulation tick to apply keyboard/joystick velocity & desktop live facing.
   */
  public applyTickInputs(dt: number): GuidedSteerInput {
    const state = this.getState();
    const { player } = state;
    if (this.wheelCooldown > 0) this.wheelCooldown = Math.max(0, this.wheelCooldown - dt);

    if (this.paused || state.matchOver) {
      player.vx = 0;
      player.vy = 0;
      return {
        mode: this.live.mode,
        touchHoldingAttack: false,
        touchAimAngle: player.aimAngle,
        touchAimStrength: player.aimStrength,
        desktopHoldingGuided: false,
      };
    }

    const kb = this.getPCConfig().keybinds;
    let mx = this.live.joy.dx;
    let my = this.live.joy.dy;
    if (this.keys.has(kb.moveUp) || this.keys.has('arrowup')) my -= 1;
    if (this.keys.has(kb.moveDown) || this.keys.has('arrowdown')) my += 1;
    if (this.keys.has(kb.moveLeft) || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has(kb.moveRight) || this.keys.has('arrowright')) mx += 1;

    const mLen = Math.hypot(mx, my);
    if (mLen > 0.04) {
      const norm = Math.min(1, mLen);
      player.vx = (mx / mLen) * PLAYER_MOVE_SPEED * norm;
      player.vy = (my / mLen) * PLAYER_MOVE_SPEED * norm;
      if (!player.isAiming && this.live.atk.pointerId === null && this.live.mode === 'touch') {
        player.facing = Math.atan2(my, mx);
      }
    } else {
      player.vx = 0;
      player.vy = 0;
    }

    // Desktop live cursor tracking -> continuous Shield/Sword/Spear facing & world coords
    if (this.live.mode === 'desktop' && this.live.mouse.active) {
      this.live.mouse.idleTimer += dt;
      const world = this.screenToWorld(this.live.mouse.px, this.live.mouse.py);
      this.live.mouse.wx = world.wx;
      this.live.mouse.wy = world.wy;
      const dx = world.wx - player.x;
      const dy = world.wy - player.y;
      if (Math.hypot(dx, dy) > 4) {
        const cursorAng = Math.atan2(dy, dx);
        if (player.specialActive?.type === 'defense') {
          let diff = (cursorAng - player.facing + Math.PI) % (Math.PI * 2);
          if (diff < 0) diff += Math.PI * 2;
          diff -= Math.PI;
          player.facing += clamp(diff, -3.4 * dt, 3.4 * dt);
        } else if (!player.attackAnim || player.attackAnim.type === 'ranged') {
          player.facing = cursorAng;
        }
        if (this.live.desktopAimPointerId !== null) {
          player.aimAngle = cursorAng;
          player.aimStrength = clamp((Math.hypot(dx, dy) - 120) / 360, 0, 1);
        }
      }
    }

    return {
      mode: this.live.mode,
      touchHoldingAttack: this.live.atk.pointerId !== null,
      touchAimAngle: player.aimAngle,
      touchAimStrength: player.aimStrength,
      desktopHoldingGuided: this.live.desktopGuidedPointerId !== null,
    };
  }

  private updateCancelHover(px: number, py: number): void {
    const cancel = this.live.mode === 'desktop' ? this.live.pcLayout.cancel : this.live.mobileLayout.cancel;
    this.live.cancelHovered = dist(px, py, cancel.cx, cancel.cy) <= cancel.r * 1.45;
  }

  private cancelActiveAim(): void {
    const state = this.getState();
    state.player.isAiming = false;
    state.player.isAimingDash = false;
    this.live.atk.pointerId = null;
    this.live.dash.pointerId = null;
    this.live.desktopAimPointerId = null;
    this.live.cancelHovered = false;
    this.recomputeLayouts();
    state.events.push({ type: 'sfx', kind: 'cancel' });
  }

  private updateJoystickDrag(px: number, py: number): void {
    const joy = this.live.mobileLayout.joy;
    const dx = px - joy.cx;
    const dy = py - joy.cy;
    const d = Math.hypot(dx, dy);
    const maxR = joy.r;
    if (d > maxR) {
      this.live.joy.knobX = joy.cx + (dx / d) * maxR;
      this.live.joy.knobY = joy.cy + (dy / d) * maxR;
    } else {
      this.live.joy.knobX = px;
      this.live.joy.knobY = py;
    }
    const strength = clamp(d / maxR, 0, 1);
    if (strength > 0.12 && d > 1e-4) {
      this.live.joy.dx = (dx / d) * strength;
      this.live.joy.dy = (dy / d) * strength;
    } else {
      this.live.joy.dx = 0;
      this.live.joy.dy = 0;
    }
  }

  private updateAttackDrag(px: number, py: number): void {
    const state = this.getState();
    const atk = this.live.mobileLayout.atk;
    const dx = px - atk.cx;
    const dy = py - atk.cy;
    const d = Math.hypot(dx, dy);
    const maxR = atk.r * 1.2;
    this.live.atk.knobX = d > maxR ? atk.cx + (dx / d) * maxR : px;
    this.live.atk.knobY = d > maxR ? atk.cy + (dy / d) * maxR : py;
    if (d > 8) {
      state.player.aimAngle = Math.atan2(dy, dx);
      if (state.player.specialActive?.type !== 'defense') {
        state.player.facing = state.player.aimAngle;
      }
      state.player.aimStrength = clamp(d / (maxR * 1.25), 0.12, 1.0);
    } else {
      state.player.aimAngle = state.player.facing;
      state.player.aimStrength = 0.5;
    }
    const isPureDefense =
      getActiveStance(state.player) === 'defense' && state.player.specialActive?.type !== 'defense';
    if (isPureDefense) {
      this.live.cancelHovered = false;
    } else {
      this.updateCancelHover(px, py);
    }
  }

  private updateDashDrag(px: number, py: number): void {
    const state = this.getState();
    const dash = this.live.mobileLayout.dash;
    const dx = px - dash.cx;
    const dy = py - dash.cy;
    const d = Math.hypot(dx, dy);
    const maxR = dash.r * 1.3;
    this.live.dash.knobX = d > maxR ? dash.cx + (dx / d) * maxR : px;
    this.live.dash.knobY = d > maxR ? dash.cy + (dy / d) * maxR : py;
    if (d > 10) {
      state.player.dashAimAngle = Math.atan2(dy, dx);
    } else if (Math.hypot(this.live.joy.dx, this.live.joy.dy) > 0.15) {
      state.player.dashAimAngle = Math.atan2(this.live.joy.dy, this.live.joy.dx);
    } else {
      state.player.dashAimAngle = state.player.facing;
    }
    this.updateCancelHover(px, py);
  }

  private updateDesktopAim(px: number, py: number): void {
    const state = this.getState();
    const world = this.screenToWorld(px, py);
    this.live.mouse.px = px;
    this.live.mouse.py = py;
    this.live.mouse.wx = world.wx;
    this.live.mouse.wy = world.wy;
    const dx = world.wx - state.player.x;
    const dy = world.wy - state.player.y;
    state.player.aimAngle = Math.atan2(dy, dx);
    if (state.player.specialActive?.type !== 'defense') {
      state.player.facing = state.player.aimAngle;
    }
    state.player.aimStrength = clamp((Math.hypot(dx, dy) - 120) / 360, 0, 1);
    const isPureDefense =
      getActiveStance(state.player) === 'defense' && state.player.specialActive?.type !== 'defense';
    if (isPureDefense) {
      this.live.cancelHovered = false;
    } else {
      this.updateCancelHover(px, py);
    }
  }

  private triggerKeyboardDash(): void {
    const state = this.getState();
    const kb = this.getPCConfig().keybinds;
    let dx = 0;
    let dy = 0;
    if (this.keys.has(kb.moveUp) || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has(kb.moveDown) || this.keys.has('arrowdown')) dy += 1;
    if (this.keys.has(kb.moveLeft) || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has(kb.moveRight) || this.keys.has('arrowright')) dx += 1;
    const ang = Math.hypot(dx, dy) > 0.1 ? Math.atan2(dy, dx) : state.player.facing;
    this.dispatchAction({ kind: 'dash', angle: ang });
  }

  private bindEvents(): void {
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.paused) return;
      this.onAudioUnlock();
      const state = this.getState();
      if (state.matchOver) return;

      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (!this.live.manualLock) {
        if (e.pointerType === 'touch' && this.live.mode !== 'touch') this.setMode('touch', false);
        else if (e.pointerType === 'mouse' && this.live.mode !== 'desktop') this.setMode('desktop', false);
      }

      if (this.live.mode === 'desktop') {
        this.handleDesktopPointerDown(e, px, py);
      } else {
        this.handleTouchPointerDown(e, px, py);
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.paused) return;
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const state = this.getState();

      if (e.pointerType === 'mouse') {
        if (Math.hypot(px - this.live.mouse.px, py - this.live.mouse.py) > 1.5) {
          this.live.mouse.idleTimer = 0;
        }
        this.live.mouse.px = px;
        this.live.mouse.py = py;
        this.live.mouse.active = true;
        if (!this.live.manualLock && this.live.mode !== 'desktop') {
          this.setMode('desktop', false);
        }
        if (this.live.mode === 'desktop' && state.player.form === 'loose' && this.live.pcPaint.pointerId === null) {
          for (const slot of this.live.pcLayout.hexSlots) {
            if (pointInRect(px, py, slot)) {
              state.player.pingHexId = slot.id;
              state.player.pingTimer = 0.25;
              break;
            }
          }
        }
      }

      if (e.pointerId === this.live.joy.pointerId) {
        this.updateJoystickDrag(px, py);
      } else if (e.pointerId === this.live.atk.pointerId) {
        this.updateAttackDrag(px, py);
      } else if (e.pointerId === this.live.dash.pointerId) {
        this.updateDashDrag(px, py);
      } else if (e.pointerId === this.live.desktopAimPointerId) {
        this.updateDesktopAim(px, py);
      } else if (e.pointerId === this.live.desktopGuidedPointerId) {
        const w = this.screenToWorld(px, py);
        this.dispatchAction({ kind: 'guided_waypoint', wx: w.wx, wy: w.wy, withRipple: false });
      } else if (e.pointerId === this.live.pcPaint.pointerId) {
        for (const slot of this.live.pcLayout.hexSlots) {
          if (pointInRect(px, py, slot)) {
            state.player.pingHexId = slot.id;
            state.player.pingTimer = 0.75;
            if (slot.id !== this.live.pcPaint.lastSeg) {
              this.dispatchAction({ kind: 'set_hex_selected', hexId: slot.id, selected: this.live.pcPaint.paintValue });
              this.live.pcPaint.lastSeg = slot.id;
            }
            break;
          }
        }
      } else if (e.pointerId === this.live.arc.pointerId) {
        const seg = this.hitTestArcSegment(px, py);
        if (seg !== -1) {
          state.player.pingHexId = seg;
          state.player.pingTimer = 0.75;
          if (seg !== this.live.arc.lastSeg) {
            this.dispatchAction({ kind: 'set_hex_selected', hexId: seg, selected: this.live.arc.paintValue });
            this.live.arc.lastSeg = seg;
          }
        }
      } else if (e.pointerId === this.live.formRadial.pointerId) {
        const f = this.live.mobileLayout.form;
        let hovered = -1;
        if (dist(px, py, f.cx, f.cy) > f.r * 0.85) {
          let bestD = Infinity;
          this.live.formRadial.options.forEach((opt, idx) => {
            const pos = this.getFormRadialOptionPos(opt);
            const d = dist(px, py, pos.x, pos.y);
            if (d < bestD && d < pos.r * 2.2) {
              bestD = d;
              hovered = idx;
            }
          });
        }
        this.live.formRadial.hoverIdx = hovered;
      }
    });

    const onPointerEnd = (e: PointerEvent) => this.handlePointerEnd(e);
    this.canvas.addEventListener('pointerup', onPointerEnd);
    this.canvas.addEventListener('pointercancel', onPointerEnd);

    // Optional Mouse Wheel Scale Cycling on PC!
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.paused || this.live.mode !== 'desktop') return;
        const pcCfg = this.getPCConfig();
        if (!pcCfg.mouseWheelScale || this.wheelCooldown > 0) return;
        e.preventDefault();
        const state = this.getState();
        const curIdx = SCALE_TIERS.findIndex((v) => Math.abs(v - state.player.targetScale) < 0.05);
        const idx = curIdx === -1 ? 1 : curIdx;
        const dir = e.deltaY < 0 ? 1 : -1;
        const nextIdx = clamp(idx + dir, 0, SCALE_TIERS.length - 1);
        if (nextIdx !== idx) {
          this.dispatchAction({ kind: 'set_scale', scale: SCALE_TIERS[nextIdx] });
          this.wheelCooldown = 0.12;
        }
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (this.paused) return;
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.onAudioUnlock();

      const state = this.getState();
      if (state.matchOver) return;
      if (!this.live.manualLock && this.live.mode !== 'desktop') this.setMode('desktop', false);

      if (k === 'escape' && (state.player.isAiming || state.player.isAimingDash)) {
        this.cancelActiveAim();
        return;
      }

      const kb = this.getPCConfig().keybinds;
      if (k === kb.dash) {
        e.preventDefault();
        this.triggerKeyboardDash();
        return;
      }
      if (k === kb.cycleRot) {
        const order: RotMode[] = ['static', 'normal', 'random'];
        this.dispatchAction({
          kind: 'set_rot',
          rotMode: order[(order.indexOf(state.player.rotMode) + 1) % order.length],
        });
      } else if (k === kb.cycleScale) {
        const curIdx = SCALE_TIERS.findIndex((v) => Math.abs(v - state.player.targetScale) < 0.05);
        this.dispatchAction({
          kind: 'set_scale',
          scale: SCALE_TIERS[((curIdx === -1 ? 1 : curIdx) + 1) % SCALE_TIERS.length],
        });
      } else if (k === kb.special) {
        this.dispatchAction({ kind: 'special' });
      } else if (k === kb.cycleFire && state.player.form === 'loose') {
        const order: FireMode[] = ['xayah', 'seq', 'volley'];
        this.dispatchAction({
          kind: 'set_fire_mode',
          fireMode: order[(order.indexOf(state.player.fireMode) + 1) % order.length],
        });
      } else if (k === kb.selectAll) {
        e.preventDefault();
        if (state.player.form === 'loose') this.dispatchAction({ kind: 'select_all' });
      } else if (k === kb.cycleForm || k === 'tab') {
        e.preventDefault();
        const order: FormKey[] = ['loose', 'slot1', 'slot2', 'slot3'];
        const next = order[(order.indexOf(state.player.form) + 1) % order.length];
        this.dispatchAction({ kind: 'set_form', form: next });
      } else if (k === kb.formLoose) {
        this.dispatchAction({ kind: 'set_form', form: 'loose' });
      } else if (k === kb.formSlot1) {
        this.dispatchAction({ kind: 'set_form', form: 'slot1' });
      } else if (k === kb.formSlot2) {
        this.dispatchAction({ kind: 'set_form', form: 'slot2' });
      } else if (k === kb.formSlot3) {
        this.dispatchAction({ kind: 'set_form', form: 'slot3' });
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });

    window.addEventListener('blur', () => this.clearAllInputs());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clearAllInputs();
    });
  }

  private handleDesktopPointerDown(e: PointerEvent, px: number, py: number): void {
    const state = this.getState();
    const { player } = state;
    const pc = this.live.pcLayout;

    // Right-click: cancel active aim, clear guided waypoint, recall targeted hex, or smart recall
    if (e.button === 2) {
      if (player.isAiming || player.isAimingDash) {
        this.cancelActiveAim();
        return;
      }
      if (player.attackAnim?.type === 'ranged' && player.attackAnim.phase === 'guided' && player.attackAnim.hasCmd) {
        this.dispatchAction({ kind: 'guided_clear' });
        return;
      }
      const world = this.screenToWorld(px, py);
      const targeted = findPlantedHexAtWorld(player, world.wx, world.wy);
      if (targeted) {
        this.dispatchAction({ kind: 'recall_hex', hexId: targeted.id });
      } else {
        this.dispatchAction({ kind: 'smart_recall' });
      }
      return;
    }

    if (e.button !== 0) return;

    // Check PC Dock hits first
    for (const b of pc.formBtns) {
      if (pointInRect(px, py, b)) {
        this.dispatchAction({ kind: 'set_form', form: b.id });
        return;
      }
    }
    if (pointInRect(px, py, pc.dashBtn)) {
      this.triggerKeyboardDash();
      return;
    }
    if (pointInRect(px, py, pc.specialBtn)) {
      this.dispatchAction({ kind: 'special' });
      return;
    }

    if (player.form === 'loose') {
      if (pointInRect(px, py, pc.btnAll)) {
        this.dispatchAction({ kind: 'select_all' });
        return;
      }
      if (pointInRect(px, py, pc.btnRecall)) {
        this.dispatchAction({ kind: 'smart_recall' });
        return;
      }
      for (const tab of pc.fireTabs) {
        if (pointInRect(px, py, tab)) {
          this.dispatchAction({ kind: 'set_fire_mode', fireMode: tab.id });
          return;
        }
      }
      for (const slot of pc.hexSlots) {
        if (pointInRect(px, py, slot)) {
          const hex = player.hexes[slot.id];
          this.live.pcPaint.pointerId = e.pointerId;
          this.live.pcPaint.paintValue = !hex.selected;
          this.dispatchAction({ kind: 'set_hex_selected', hexId: slot.id, selected: this.live.pcPaint.paintValue });
          this.live.pcPaint.lastSeg = slot.id;
          player.pingHexId = slot.id;
          player.pingTimer = 0.75;
          this.canvas.setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    // Guided Spear Click-to-Command (fly-through!)
    if (getActiveStance(player) === 'ranged' && player.attackAnim?.type === 'ranged' && player.attackAnim.phase === 'guided') {
      this.live.desktopGuidedPointerId = e.pointerId;
      const world = this.screenToWorld(px, py);
      this.dispatchAction({ kind: 'guided_waypoint', wx: world.wx, wy: world.wy, withRipple: true });
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    // Pure Defense Stance cannot trigger normal attacks (only Pháo Đài Phản Xung special can detonate)
    if (getActiveStance(player) === 'defense' && player.specialActive?.type !== 'defense') {
      return;
    }

    // Normal desktop canvas aim & attack
    this.live.desktopAimPointerId = e.pointerId;
    player.isAiming = true;
    this.updateDesktopAim(px, py);
    this.canvas.setPointerCapture(e.pointerId);
  }

  private handleTouchPointerDown(e: PointerEvent, px: number, py: number): void {
    const state = this.getState();
    const { player } = state;
    const m = this.live.mobileLayout;

    // 1. Scale Cluster (always active, forgiving +5px hit padding with nearest-center tie-breaker)
    const hitScale = findNearestRect(px, py, m.scaleBtns, 5);
    if (hitScale) {
      this.dispatchAction({ kind: 'set_scale', scale: hitScale.id });
      return;
    }

    // 2. Rotation Cluster (Loose only — completely hidden & non-interactive in assembled forms)
    if (player.form === 'loose') {
      const hitRot = findNearestRect(px, py, m.rotBtns, 5);
      if (hitRot) {
        this.dispatchAction({ kind: 'set_rot', rotMode: hitRot.id });
        return;
      }
    }

    // 3. Special Skill Button (Ulti)
    if (dist(px, py, m.special.cx, m.special.cy) <= m.special.r + 8) {
      this.dispatchAction({ kind: 'special' });
      return;
    }

    // 4. Dash Button (Tap or drag to aim)
    if (dist(px, py, m.dash.cx, m.dash.cy) <= m.dash.r + 8) {
      this.live.dash.pointerId = e.pointerId;
      player.isAimingDash = true;
      this.updateDashDrag(px, py);
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    // 5. Form Switch Radial Button
    if (dist(px, py, m.form.cx, m.form.cy) <= m.form.r + 8) {
      this.live.formRadial.pointerId = e.pointerId;
      this.live.formRadial.hoverIdx = -1;
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    // 6. Loose-only buttons (Recall, Select All, Fire Tabs, Arc-Selector 1..N)
    if (player.form === 'loose') {
      if (pointInRectPadded(px, py, m.btnRecall, 5)) {
        this.dispatchAction({ kind: 'smart_recall' });
        return;
      }
      if (pointInRectPadded(px, py, m.btnAll, 5)) {
        this.dispatchAction({ kind: 'select_all' });
        return;
      }
      const hitFire = findNearestRect(px, py, m.fireTabs, 5);
      if (hitFire) {
        this.dispatchAction({ kind: 'set_fire_mode', fireMode: hitFire.id });
        return;
      }
      const seg = this.hitTestArcSegment(px, py);
      if (seg !== -1) {
        this.live.arc.pointerId = e.pointerId;
        const hex = player.hexes[seg];
        this.live.arc.paintValue = !hex.selected;
        this.dispatchAction({ kind: 'set_hex_selected', hexId: seg, selected: this.live.arc.paintValue });
        this.live.arc.lastSeg = seg;
        player.pingHexId = seg;
        player.pingTimer = 0.75;
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
    }

    // 7. Attack / Shield-Aim Pad
    if (dist(px, py, m.atk.cx, m.atk.cy) <= m.atk.r + 14) {
      const isPureDefense = getActiveStance(player) === 'defense' && player.specialActive?.type !== 'defense';
      this.live.atk.pointerId = e.pointerId;
      player.isAiming = !isPureDefense;
      this.updateAttackDrag(px, py);
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    // 8. Left-side generous Joystick zone
    if (px < this.live.vw * 0.45 && py > m.safeTop + 10 && this.live.joy.pointerId === null) {
      this.live.joy.pointerId = e.pointerId;
      this.updateJoystickDrag(px, py);
      this.canvas.setPointerCapture(e.pointerId);
    }
  }

  private handlePointerEnd(e: PointerEvent): void {
    const state = this.getState();
    const { player } = state;
    const isCancel = e.type === 'pointercancel';

    if (e.pointerId === this.live.joy.pointerId) {
      this.live.joy.pointerId = null;
      this.live.joy.dx = 0;
      this.live.joy.dy = 0;
      this.live.joy.knobX = this.live.mobileLayout.joy.cx;
      this.live.joy.knobY = this.live.mobileLayout.joy.cy;
    } else if (e.pointerId === this.live.atk.pointerId) {
      this.live.atk.pointerId = null;
      const canceled = isCancel || this.live.cancelHovered;
      this.live.cancelHovered = false;
      player.isAiming = false;
      this.live.atk.knobX = this.live.mobileLayout.atk.cx;
      this.live.atk.knobY = this.live.mobileLayout.atk.cy;

      const isPureDefense = getActiveStance(player) === 'defense' && player.specialActive?.type !== 'defense';
      const isGuidedRanged =
        getActiveStance(player) === 'ranged' &&
        player.attackAnim?.type === 'ranged' &&
        player.attackAnim.phase === 'guided';
      if (isPureDefense) {
        // Pure defense pad only rotates the shield; releasing never triggers an attack.
      } else if (canceled) {
        state.events.push({ type: 'sfx', kind: 'cancel' });
      } else if (!isGuidedRanged) {
        this.dispatchAction({ kind: 'attack', angle: player.aimAngle, strength: player.aimStrength });
      }
    } else if (e.pointerId === this.live.dash.pointerId) {
      this.live.dash.pointerId = null;
      const canceled = isCancel || this.live.cancelHovered;
      this.live.cancelHovered = false;
      player.isAimingDash = false;
      this.live.dash.knobX = this.live.mobileLayout.dash.cx;
      this.live.dash.knobY = this.live.mobileLayout.dash.cy;
      if (canceled) {
        state.events.push({ type: 'sfx', kind: 'cancel' });
      } else {
        this.dispatchAction({ kind: 'dash', angle: player.dashAimAngle });
      }
    } else if (e.pointerId === this.live.desktopAimPointerId) {
      this.live.desktopAimPointerId = null;
      const canceled = isCancel || this.live.cancelHovered;
      this.live.cancelHovered = false;
      player.isAiming = false;
      if (canceled) {
        state.events.push({ type: 'sfx', kind: 'cancel' });
      } else {
        this.dispatchAction({ kind: 'attack', angle: player.aimAngle, strength: player.aimStrength });
      }
    } else if (e.pointerId === this.live.desktopGuidedPointerId) {
      this.live.desktopGuidedPointerId = null;
    } else if (e.pointerId === this.live.arc.pointerId) {
      this.live.arc.pointerId = null;
      this.live.arc.lastSeg = -1;
    } else if (e.pointerId === this.live.pcPaint.pointerId) {
      this.live.pcPaint.pointerId = null;
      this.live.pcPaint.lastSeg = -1;
    } else if (e.pointerId === this.live.formRadial.pointerId) {
      this.live.formRadial.pointerId = null;
      if (!isCancel) {
        if (this.live.formRadial.hoverIdx !== -1) {
          const opt = this.live.formRadial.options[this.live.formRadial.hoverIdx];
          this.dispatchAction({ kind: 'set_form', form: opt.id });
        } else {
          // Quick tap cycles through forms
          const order: FormKey[] = ['loose', 'slot1', 'slot2', 'slot3'];
          const next = order[(order.indexOf(player.form) + 1) % order.length];
          this.dispatchAction({ kind: 'set_form', form: next });
        }
      }
      this.live.formRadial.hoverIdx = -1;
    }
  }
}
