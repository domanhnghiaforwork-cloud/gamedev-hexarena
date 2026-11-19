import { ARENA_RADIUS } from '@core/constants';
import { clamp, lerp } from '@core/hexMath';
import { findPlantedHexAtWorld } from '@core/skills';
import type { MatchState } from '@core/types';
import type { LiveInputState } from '@input/inputManager';
import type { MobileWidgetId, PCControlConfig } from '@storage/profiles';
import { renderArena } from './arenaRenderer';
import { renderFighterBody, renderFighterHexLayer } from './entityRenderer';
import { renderDesktopCanvasHUD, renderMobileCanvasHUD } from './hudRenderer';
import { renderDesktopReticle, renderSkillIndicator } from './indicatorRenderer';
import { VFXManager } from './vfxRenderer';

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public vfx = new VFXManager();

  public vw = 1280;
  public vh = 720;
  public dpr = 1;
  public camX = 0;
  public camY = 0;
  public camZoom = 0.72;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable');
    this.ctx = context;
    this.resize();
  }

  public resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
  }

  public updateCamera(state: MatchState, dt: number): void {
    const midX = (state.player.x * 0.62 + state.enemy.x * 0.38);
    const midY = (state.player.y * 0.62 + state.enemy.y * 0.38);
    const sep = Math.hypot(state.player.x - state.enemy.x, state.player.y - state.enemy.y);
    const fitMin = Math.min(this.vw, this.vh);
    const baseZoom = clamp(fitMin / (ARENA_RADIUS * 1.62), 0.42, 0.92);
    const dynamicZoom = clamp(fitMin / Math.max(660, sep * 1.55 + 320), baseZoom * 0.85, baseZoom * 1.18);

    this.camX = lerp(this.camX, clamp(midX, -220, 220), Math.min(1, dt * 6));
    this.camY = lerp(this.camY, clamp(midY, -220, 220), Math.min(1, dt * 6));
    this.camZoom = lerp(this.camZoom, dynamicZoom, Math.min(1, dt * 4));
  }

  public screenToWorld(px: number, py: number): { wx: number; wy: number } {
    return {
      wx: (px - this.vw * 0.5) / this.camZoom + this.camX,
      wy: (py - this.vh * 0.5) / this.camZoom + this.camY,
    };
  }

  public renderFrame(
    state: MatchState,
    live: LiveInputState,
    pcConfig: PCControlConfig,
    nowSec: number,
    mobileEditOpts?: {
      editMode: boolean;
      selectedWidget: MobileWidgetId | null;
      snapGrid: boolean;
    },
    hideHUD = false,
  ): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Outer background
    ctx.fillStyle = '#181e2a';
    ctx.fillRect(0, 0, this.vw, this.vh);

    // World Space Transform (with micro screen shake)
    ctx.save();
    const shakeX = this.vfx.screenShake > 0.2 ? (Math.random() - 0.5) * this.vfx.screenShake * 1.6 : 0;
    const shakeY = this.vfx.screenShake > 0.2 ? (Math.random() - 0.5) * this.vfx.screenShake * 1.6 : 0;
    ctx.translate(this.vw * 0.5 + shakeX, this.vh * 0.5 + shakeY);
    ctx.scale(this.camZoom, this.camZoom);
    ctx.translate(-this.camX, -this.camY);

    renderArena(ctx, state.obstacles);

    // Skill Indicator under fighters
    renderSkillIndicator(ctx, state.player, live.cancelHovered);

    // Desktop Hover Target Detection for RMB Single-Hex Recall
    let hoverPlantedId = -1;
    if (live.mode === 'desktop' && live.mouse.active && state.player.form === 'loose') {
      const found = findPlantedHexAtWorld(state.player, live.mouse.wx, live.mouse.wy);
      if (found) hoverPlantedId = found.id;
    }

    // Ground-level hexes
    renderFighterHexLayer(ctx, state.enemy, false, nowSec);
    renderFighterHexLayer(ctx, state.player, false, nowSec, hoverPlantedId);

    // Fighter Bodies
    renderFighterBody(ctx, state.enemy, nowSec);
    renderFighterBody(ctx, state.player, nowSec);

    // High-flight recalling hexes (over obstacles & fighters)
    renderFighterHexLayer(ctx, state.enemy, true, nowSec);
    renderFighterHexLayer(ctx, state.player, true, nowSec);

    // VFX Particles, Shockwaves & Floating Numbers
    this.vfx.render(ctx);

    // Desktop Aim Reticle
    if (live.mode === 'desktop' && live.mouse.active && !mobileEditOpts?.editMode && !hideHUD) {
      renderDesktopReticle(ctx, state.player, live.mouse.wx, live.mouse.wy, pcConfig.reticleStyle);
    }

    ctx.restore();

    // Screen-Space HUD Layer
    if (!hideHUD) {
      if (live.mode === 'touch' || mobileEditOpts?.editMode) {
        renderMobileCanvasHUD(ctx, state.player, live, mobileEditOpts);
      } else {
        renderDesktopCanvasHUD(ctx, state.player, live, pcConfig);
      }
    }
  }
}
