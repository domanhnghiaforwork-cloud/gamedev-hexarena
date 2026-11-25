import {
  DASH_TRAILS,
  NEON_THEME_LIST,
  SHATTER_STYLES,
  getNeonTheme,
  type DashTrailId,
  type NeonThemeId,
  type PlayerCosmetics,
  type ShatterStyleId,
} from '@config/cosmetics';
import { BASE_HEX_RADIUS, PLAYER_RADIUS } from '@core/constants';
import { createMatchState } from '@core/physics/simulation';
import { setFighterForm } from '@attacks/index';
import type { MatchState } from '@core/types';
import { renderFighterBody, renderFighterHexLayer } from '@render/world/entityRenderer';
import { VFXManager } from '@render/effects/vfxRenderer';

export class CosmeticsModal {
  private mount: HTMLElement;
  private draft: PlayerCosmetics;
  private onSave: (next: PlayerCosmetics) => Promise<void> | void;
  private onClose: () => void;

  private previewCanvas: HTMLCanvasElement | null = null;
  private previewState: MatchState;
  private previewVfx = new VFXManager();
  private rafId: number | null = null;
  private lastTs = 0;

  constructor(opts: {
    mount: HTMLElement;
    initial: PlayerCosmetics;
    onSave: (next: PlayerCosmetics) => Promise<void> | void;
    onClose: () => void;
  }) {
    this.mount = opts.mount;
    this.draft = { ...opts.initial };
    this.onSave = opts.onSave;
    this.onClose = opts.onClose;

    this.previewState = createMatchState();
    setFighterForm(this.previewState, this.previewState.player, 'slot2');
    this.previewState.player.x = 0;
    this.previewState.player.y = 0;
    this.previewState.player.facing = -0.35;

    this.render();
    this.startLoop();
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.mount.innerHTML = '';
  }

  private triggerDashDemo(): void {
    const p = this.previewState.player;
    p.dashAfterimages = [];
    for (let i = 0; i < 6; i++) {
      p.dashAfterimages.push({
        x: -115 + i * 22,
        y: 12 - i * 2.5,
        life: 0.35 + i * 0.04,
        maxLife: 0.60,
      });
    }
  }

  private triggerShatterDemo(): void {
    const theme = getNeonTheme(this.draft.neonTheme);
    this.previewVfx.spawnShatterEffect(52, -16, theme.main, BASE_HEX_RADIUS * 1.15, this.draft.shatterStyle);
  }

  private startLoop(): void {
    this.lastTs = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTs) / 1000));
      this.lastTs = now;

      const p = this.previewState.player;
      p.facing = -0.35 + Math.sin(now * 0.0016) * 0.45;

      // Keep preview hexes smoothly positioned around fighter
      for (const h of p.hexes) {
        if (h.state === 'ASSEMBLED') {
          const R = BASE_HEX_RADIUS * p.currentScale;
          const distOffset = PLAYER_RADIUS + R * 1.6;
          const locX = R * Math.sqrt(3) * (h.q + h.r * 0.5);
          const locY = R * 1.5 * h.r;
          const cosF = Math.cos(p.facing);
          const sinF = Math.sin(p.facing);
          const wx = distOffset + locX;
          h.x = p.x + wx * cosF - locY * sinF;
          h.y = p.y + wx * sinF + locY * cosF;
          h.spinAngle = p.facing;
        }
      }

      for (let i = p.dashAfterimages.length - 1; i >= 0; i--) {
        p.dashAfterimages[i].life -= dt;
        if (p.dashAfterimages[i].life <= 0) p.dashAfterimages.splice(i, 1);
      }

      this.previewVfx.update(dt);
      this.drawPreview(now / 1000);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private drawPreview(nowSec: number): void {
    const canvas = this.previewCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 16, w * 0.5, h * 0.5, w * 0.65);
    grad.addColorStop(0, '#222b3b');
    grad.addColorStop(1, '#141a25');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w * 0.5 + 16, h * 0.54);
    ctx.scale(1.15, 1.15);
    renderFighterHexLayer(ctx, this.previewState.player, false, nowSec, -1, this.draft);
    renderFighterBody(ctx, this.previewState.player, nowSec, false, this.draft);
    this.previewVfx.render(ctx);
    ctx.restore();
  }

  private render(): void {
    this.mount.innerHTML = `
      <div class="overlay">
        <div class="modal-card cosmetics-modal-card">
          <div class="modal-header">
            <div class="modal-title">Ngoại hình &amp; Hiệu ứng</div>
            <button class="btn sm" id="cosCloseBtn" type="button">Đóng</button>
          </div>

          <div class="modal-body cosmetics-body">
            <div class="cosmetics-preview-col">
              <canvas id="cosPreviewCanvas" class="cosmetics-preview-canvas" width="320" height="190"></canvas>
              <div class="cosmetics-demo-row">
                <button class="btn sm" id="cosDemoDash" type="button">Thử Lướt</button>
                <button class="btn sm amber" id="cosDemoShatter" type="button">Thử Vỡ mảnh</button>
              </div>
              <p class="cosmetics-note">
                Phe địch luôn giữ màu Đỏ san hô để đảm bảo nhận diện phe tức thì trong PvP.
              </p>
            </div>

            <div class="cosmetics-options-col">
              <div class="cos-section">
                <div class="cos-label">1. Bộ màu Neon</div>
                <div class="cos-theme-row">
                  ${NEON_THEME_LIST.map(
                    (t) => `
                      <button
                        type="button"
                        class="cos-swatch ${this.draft.neonTheme === t.id ? 'active' : ''}"
                        data-theme="${t.id}"
                        title="${t.name}"
                      >
                        <span class="cos-swatch-dot" style="background:${t.main};box-shadow:0 0 10px ${t.main};"></span>
                        <span>${t.name}</span>
                      </button>
                    `,
                  ).join('')}
                </div>
              </div>

              <div class="cos-section">
                <div class="cos-label">2. Kiểu hạt vỡ mảnh</div>
                <div class="cos-grid">
                  ${SHATTER_STYLES.map(
                    (s) => `
                      <button
                        type="button"
                        class="cos-card ${this.draft.shatterStyle === s.id ? 'active' : ''}"
                        data-shatter="${s.id}"
                      >
                        <strong>${s.name}</strong>
                        <span>${s.desc}</span>
                      </button>
                    `,
                  ).join('')}
                </div>
              </div>

              <div class="cos-section">
                <div class="cos-label">3. Hiệu ứng Lướt (Dash)</div>
                <div class="cos-grid">
                  ${DASH_TRAILS.map(
                    (d) => `
                      <button
                        type="button"
                        class="cos-card ${this.draft.dashTrail === d.id ? 'active' : ''}"
                        data-dash="${d.id}"
                      >
                        <strong>${d.name}</strong>
                        <span>${d.desc}</span>
                      </button>
                    `,
                  ).join('')}
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <span style="font-size:11px;color:#94a3b8;">Tự động đồng bộ tài khoản nếu đã đăng nhập</span>
            <div style="display:flex;gap:8px;">
              <button class="btn" id="cosCancelBtn" type="button">Hủy</button>
              <button class="btn primary" id="cosSaveBtn" type="button">Lưu &amp; Áp dụng</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.previewCanvas = this.mount.querySelector<HTMLCanvasElement>('#cosPreviewCanvas');

    this.mount.querySelector('#cosCloseBtn')?.addEventListener('click', () => this.onClose());
    this.mount.querySelector('#cosCancelBtn')?.addEventListener('click', () => this.onClose());
    this.mount.querySelector('#cosDemoDash')?.addEventListener('click', () => this.triggerDashDemo());
    this.mount.querySelector('#cosDemoShatter')?.addEventListener('click', () => this.triggerShatterDemo());
    this.mount.querySelector('#cosSaveBtn')?.addEventListener('click', () => {
      void this.onSave({ ...this.draft });
    });

    this.mount.querySelectorAll<HTMLElement>('[data-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.draft.neonTheme = btn.dataset.theme as NeonThemeId;
        this.render();
      });
    });

    this.mount.querySelectorAll<HTMLElement>('[data-shatter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.draft.shatterStyle = btn.dataset.shatter as ShatterStyleId;
        this.render();
        this.triggerShatterDemo();
      });
    });

    this.mount.querySelectorAll<HTMLElement>('[data-dash]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.draft.dashTrail = btn.dataset.dash as DashTrailId;
        this.render();
        this.triggerDashDemo();
      });
    });
  }
}
