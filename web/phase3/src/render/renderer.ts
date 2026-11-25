import { DEFAULT_COSMETICS, type PlayerCosmetics } from '@config/cosmetics';
import { ARENA_RADIUS, PLAYER_RADIUS } from '@core/constants';
import { clamp, lerp } from '@core/math/hexMath';
import { findPlantedHexAtWorld } from '@attacks/loose/attack';
import { getEnemyLooseSlowFactor, isRangedSniperActive } from '@core/world/structure';
import type { MatchState } from '@core/types';
import type { LiveInputState } from '@input/inputManager';
import type { MobileWidgetId, PCControlConfig } from '@storage/profiles';
import { getViewportSize } from '@ui/common/fullscreen';
import { renderArena } from './world/arenaRenderer';
import {
  renderFighterBody,
  renderFighterHexLayer,
  renderGravityField,
  renderPrismWeb,
  renderSniperStageCone,
  renderSummonedWalls,
} from './world/entityRenderer';
import { renderDesktopCanvasHUD, renderMobileCanvasHUD } from './hud/hudRenderer';
import { renderDesktopReticle, renderSkillIndicator, renderSpecialAimIndicator } from './effects/indicatorRenderer';
import { VFXManager } from './effects/vfxRenderer';

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
    const { vw, vh } = getViewportSize();
    this.vw = vw;
    this.vh = vh;
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
  }

  public updateCamera(state: MatchState, dt: number): void {
    let midX = state.player.x * 0.62 + state.enemy.x * 0.38;
    let midY = state.player.y * 0.62 + state.enemy.y * 0.38;
    const sep = Math.hypot(state.player.x - state.enemy.x, state.player.y - state.enemy.y);
    const fitMin = Math.min(this.vw, this.vh);
    const baseZoom = clamp(fitMin / (ARENA_RADIUS * 1.62), 0.42, 0.92);
    let dynamicZoom = clamp(fitMin / Math.max(660, sep * 1.55 + 320), baseZoom * 0.85, baseZoom * 1.18);

    if (isRangedSniperActive(state.player) && state.player.specialActive?.coneAngle !== undefined) {
      const ca = state.player.specialActive.coneAngle;
      midX += Math.cos(ca) * 130;
      midY += Math.sin(ca) * 130;
      dynamicZoom = Math.max(0.38, dynamicZoom * 0.86);
    }

    this.camX = lerp(this.camX, clamp(midX, -280, 280), Math.min(1, dt * 6));
    this.camY = lerp(this.camY, clamp(midY, -280, 280), Math.min(1, dt * 6));
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
    playerCosmetics: PlayerCosmetics = DEFAULT_COSMETICS,
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

    // Loose Gravity Fields, Prism Web Polygons, Sniper Stage Cones & Summoned Hex Walls beneath fighters
    renderGravityField(ctx, state.enemy, nowSec, playerCosmetics);
    renderGravityField(ctx, state.player, nowSec, playerCosmetics);
    renderPrismWeb(ctx, state.enemy, nowSec);
    renderPrismWeb(ctx, state.player, nowSec);
    renderSniperStageCone(ctx, state.enemy, state.obstacles, nowSec);
    renderSniperStageCone(ctx, state.player, state.obstacles, nowSec);
    renderSummonedWalls(ctx, state.walls, nowSec);

    // Skill Indicator under fighters (hidden in Lobby & Spectator mode)
    if (!hideHUD) {
      renderSkillIndicator(ctx, state.player, live.cancelHovered, live.mode === 'desktop');
      renderSpecialAimIndicator(ctx, state.player, live);
    }

    // Desktop Hover Target Detection for RMB Single-Hex Recall
    let hoverPlantedId = -1;
    if (!hideHUD && live.mode === 'desktop' && live.mouse.active && state.player.form === 'loose') {
      const found = findPlantedHexAtWorld(state.player, live.mouse.wx, live.mouse.wy);
      if (found) hoverPlantedId = found.id;
    }

    // Ground-level hexes
    renderFighterHexLayer(ctx, state.enemy, false, nowSec, -1, playerCosmetics);
    renderFighterHexLayer(ctx, state.player, false, nowSec, hoverPlantedId, playerCosmetics);

    // Fighter Bodies
    const enemySlowed =
      getEnemyLooseSlowFactor(state.player, state.enemy.x, state.enemy.y, PLAYER_RADIUS * 0.5) < 1.0 ||
      state.enemy.slowTimer > 0;
    const playerSlowed =
      getEnemyLooseSlowFactor(state.enemy, state.player.x, state.player.y, PLAYER_RADIUS * 0.5) < 1.0 ||
      state.player.slowTimer > 0;
    renderFighterBody(ctx, state.enemy, nowSec, enemySlowed, playerCosmetics);
    renderFighterBody(ctx, state.player, nowSec, playerSlowed, playerCosmetics);

    // High-flight recalling hexes (over obstacles & fighters)
    renderFighterHexLayer(ctx, state.enemy, true, nowSec, -1, playerCosmetics);
    renderFighterHexLayer(ctx, state.player, true, nowSec, -1, playerCosmetics);

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
