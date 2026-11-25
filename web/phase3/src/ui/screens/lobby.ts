import { AXIAL_DIRS, MATERIAL_LIST, MATERIALS } from '@core/constants';
import { STANCE_META } from '@attacks/index';
import { axialKey, axialToLocal } from '@core/math/hexMath';
import type { MaterialId, PlayerLoadout, SlotKey, WeaponBlueprint } from '@core/types';
import type { InputMode } from '@input/inputManager';
import type { AuthUser } from '@net/authClient';
import { drawHexPolygon } from '@render/world/arenaRenderer';
import { FULLSCREEN_CHANGE_EVENT, isDocumentFullscreen, toggleFullscreenLandscape } from '@ui/common/fullscreen';

const SLOT_KEYS: SlotKey[] = ['slot1', 'slot2', 'slot3'];

const SVG_ENTER_FS = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
    <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
    <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
    <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
  </svg>
`;

const SVG_EXIT_FS = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 14h6v6"/>
    <path d="M20 10h-6V4"/>
    <path d="M14 10l7-7"/>
    <path d="M3 21l7-7"/>
  </svg>
`;

export interface LobbyPvPState {
  tab: 'bot' | 'pvp';
  waitingCode: string | null;
  joinCodeDraft: string;
  errorMessage: string | null;
  busy: boolean;
}

export class LobbyScreen {
  private mount: HTMLElement;
  private onPlayBot: () => void;
  private onCreateRoom: () => void;
  private onJoinRoom: (code: string) => void;
  private onCancelRoom: () => void;
  private onOpenWeapons: (slot?: SlotKey) => void;
  private onOpenSettings: () => void;
  private onOpenAuth: () => void;
  private onNotify: (msg: string) => void;
  private onShowIOSGuide?: () => void;
  private onPvPTabChange: (tab: 'bot' | 'pvp') => void;
  private onJoinCodeInput: (code: string) => void;

  constructor(opts: {
    mount: HTMLElement;
    onPlayBot: () => void;
    onCreateRoom: () => void;
    onJoinRoom: (code: string) => void;
    onCancelRoom: () => void;
    onOpenWeapons: (slot?: SlotKey) => void;
    onOpenSettings: () => void;
    onOpenAuth: () => void;
    onNotify: (msg: string) => void;
    onShowIOSGuide?: () => void;
    onPvPTabChange: (tab: 'bot' | 'pvp') => void;
    onJoinCodeInput: (code: string) => void;
  }) {
    this.mount = opts.mount;
    this.onPlayBot = opts.onPlayBot;
    this.onCreateRoom = opts.onCreateRoom;
    this.onJoinRoom = opts.onJoinRoom;
    this.onCancelRoom = opts.onCancelRoom;
    this.onOpenWeapons = opts.onOpenWeapons;
    this.onOpenSettings = opts.onOpenSettings;
    this.onOpenAuth = opts.onOpenAuth;
    this.onNotify = opts.onNotify;
    this.onShowIOSGuide = opts.onShowIOSGuide;
    this.onPvPTabChange = opts.onPvPTabChange;
    this.onJoinCodeInput = opts.onJoinCodeInput;

    document.addEventListener(FULLSCREEN_CHANGE_EVENT, () => {
      const fsBtn = this.mount.querySelector<HTMLButtonElement>('#lobbyFsBtn');
      if (!fsBtn) return;
      const isFs = isDocumentFullscreen();
      fsBtn.classList.toggle('active', isFs);
      fsBtn.title = isFs ? 'Thoát toàn màn hình' : 'Toàn màn hình';
      fsBtn.setAttribute('aria-label', fsBtn.title);
      fsBtn.innerHTML = isFs ? SVG_EXIT_FS : SVG_ENTER_FS;
    });
  }

  public show(loadout: PlayerLoadout, mode: InputMode, pvp: LobbyPvPState, user: AuthUser | null): void {
    const n = loadout.hexMaterials.length;
    const isFs = isDocumentFullscreen();

    // Count material composition for Row 1 (Các mảnh lục giác)
    const matCounts: Record<MaterialId, number> = { heavy: 0, base: 0, light: 0, sharp: 0 };
    for (const m of loadout.hexMaterials) matCounts[m]++;

    const matSummaryChips = MATERIAL_LIST.filter((id) => matCounts[id] > 0)
      .map(
        (id) =>
          `<span class="mat-tag mat-${id}">${MATERIALS[id].name} ×${matCounts[id]}</span>`,
      )
      .join('');

    const rightBody =
      pvp.tab === 'bot'
        ? `
          <div class="lobby-right-content">
            <div class="mode-heading-block">
              <span class="mode-kicker">Chế độ luyện tập</span>
              <div class="mode-name">Đối kháng 1v1 · Bot AI</div>
            </div>
            <div class="mode-specs">
              <div class="mode-spec-item">
                <span class="mode-spec-label">Thời lượng</span>
                <span class="mode-spec-val">10 phút</span>
              </div>
              <div class="mode-spec-item">
                <span class="mode-spec-label">Tài nguyên</span>
                <span class="mode-spec-val">${n} mảnh lục giác</span>
              </div>
              <div class="mode-spec-item">
                <span class="mode-spec-label">Điều khiển</span>
                <span class="mode-spec-val">${mode === 'desktop' ? 'PC (Chuột & Phím)' : 'Mobile (Cảm ứng)'}</span>
              </div>
              <div class="mode-spec-item">
                <span class="mode-spec-label">Đấu trường</span>
                <span class="mode-spec-val">Vật cản ngẫu nhiên</span>
              </div>
            </div>
          </div>
          <button id="lobbyPlayBtn" class="btn-lobby-cta primary">Vào trận</button>
        `
        : pvp.waitingCode
          ? `
            <div class="lobby-right-content">
              <div class="mode-heading-block">
                <span class="mode-kicker">Phòng PvP 1v1 đang mở</span>
                <div class="mode-name">Chờ đối thủ vào phòng</div>
              </div>
              <div class="pvp-waiting-card">
                <span class="mode-spec-label">Mã phòng</span>
                <div class="pvp-code-display">${this.escapeHtml(pvp.waitingCode)}</div>
                <div class="pvp-wait-status">Gửi mã hoặc link mời cho bạn bè để bắt đầu ngay.</div>
              </div>
            </div>
            <div class="pvp-wait-actions">
              <button id="pvpCopyLinkBtn" class="btn-lobby-cta primary">Sao chép link mời</button>
              <button id="pvpCancelRoomBtn" class="btn danger">Hủy</button>
            </div>
          `
          : `
            <div class="lobby-right-content">
              <div class="mode-heading-block">
                <span class="mode-kicker">Đối kháng trực tuyến</span>
                <div class="mode-name">Phòng PvP 1v1</div>
              </div>
              ${pvp.errorMessage ? `<div class="pvp-error-msg">${this.escapeHtml(pvp.errorMessage)}</div>` : ''}
              <div class="pvp-room-box">
                <div class="pvp-join-card">
                  <span class="mode-spec-label">Vào phòng bằng mã từ bạn bè</span>
                  <div class="pvp-join-row">
                    <input id="pvpCodeInput" class="pvp-code-input" maxlength="6" placeholder="MÃ PHÒNG" value="${this.escapeHtml(pvp.joinCodeDraft)}" />
                    <button id="pvpJoinBtn" class="btn primary" ${pvp.busy ? 'disabled' : ''}>Vào phòng</button>
                  </div>
                </div>
                <div class="pvp-divider">Hoặc tự làm chủ phòng gửi link mời</div>
              </div>
            </div>
            <button id="pvpCreateBtn" class="btn-lobby-cta primary" ${pvp.busy ? 'disabled' : ''}>
              ${pvp.busy ? 'Đang kết nối...' : 'Tạo phòng 1v1'}
            </button>
          `;

    this.mount.innerHTML = `
      <div class="lobby-shell">
        <header class="lobby-topbar">
          <div class="lobby-brand">
            <h1 class="lobby-wordmark">HEX ARENA</h1>
            <span class="lobby-tagline">Đấu trường Lục giác</span>
          </div>

          <!-- ĐÚNG 3 MỤC GÓC TRÊN PHẢI: 1. Xin chào username · 2. Cài đặt · 3. Biểu tượng Toàn màn hình -->
          <div class="lobby-top-actions">
            <button id="lobbyUserBtn" class="top-user-btn ${user ? 'logged-in' : ''}" title="${user ? 'Quản lý tài khoản' : 'Đăng nhập / Đăng ký để lưu vũ khí'}">
              ${user ? `Xin chào, <strong>${this.escapeHtml(user.username)}</strong>` : 'Đăng nhập / Đăng ký'}
            </button>
            <button id="lobbySettingsBtn" class="btn sm ghost">Cài đặt</button>
            <button id="lobbyFsBtn" class="btn-fs-icon ${isFs ? 'active' : ''}" title="${isFs ? 'Thoát toàn màn hình' : 'Toàn màn hình'}" aria-label="${isFs ? 'Thoát toàn màn hình' : 'Toàn màn hình'}">
              ${isFs ? SVG_EXIT_FS : SVG_ENTER_FS}
            </button>
          </div>
        </header>

        <!-- 2 KHỐI BẰNG NHAU TUYỆT ĐỐI (1:1 WIDTH & 100% EQUAL HEIGHT) -->
        <main class="lobby-stage equal-two-col">
          <!-- BÊN TRÁI: KHO VŨ KHÍ (4 DÒNG: CÁC MẢNH + Ô 1 + Ô 2 + Ô 3) -->
          <section class="lobby-card">
            <div class="lobby-panel-head">
              <span class="lobby-panel-title">Kho vũ khí</span>
              <span class="lobby-panel-meta">${n} mảnh · 3 cấu hình</span>
            </div>

            <div class="lobby-weapon-list four-rows">
              <!-- DÒNG 1: BỘ MẢNH LỤC GIÁC -->
              <div class="lobby-hexes-row" id="lobbyHexesRow">
                <div class="lobby-hexes-top">
                  <span class="lobby-weapon-slot">Bộ mảnh chung</span>
                  <span class="lobby-hexes-count">${n} / 10 mảnh</span>
                </div>
                <div class="lobby-hexes-chips">${matSummaryChips}</div>
              </div>

              <!-- DÒNG 2, 3, 4: 3 Ô CẤU HÌNH VŨ KHÍ -->
              ${SLOT_KEYS.map((sk, idx) => {
                const bp = loadout.blueprints[sk];
                const st = STANCE_META[bp.stance];
                return `
                  <div class="lobby-weapon-row" data-lobby-slot="${sk}">
                    <canvas class="lobby-weapon-mini" data-preview-slot="${sk}"></canvas>
                    <div class="lobby-weapon-info">
                      <div class="lobby-weapon-top">
                        <span class="lobby-weapon-slot">Ô ${idx + 1}</span>
                        <span class="lobby-weapon-stance" style="color:${st.color};border-color:${st.color}55;">${st.label}</span>
                      </div>
                      <span class="lobby-weapon-name">${this.escapeHtml(bp.name)}</span>
                      <span class="lobby-weapon-sub">Cỡ mặc định ${Math.round(bp.defaultScale * 100)}%</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <button id="lobbyWeaponsBtn" class="btn-lobby-cta armory">Cấu hình vũ khí</button>
          </section>

          <!-- BÊN PHẢI: VÀO TRẬN (CÙNG KÍCH THƯỚC VỚI KHO VŨ KHÍ) -->
          <section class="lobby-card">
            <div class="lobby-mode-tabs">
              <button class="lobby-mode-tab ${pvp.tab === 'bot' ? 'active' : ''}" data-mode-tab="bot">Đấu với Bot</button>
              <button class="lobby-mode-tab ${pvp.tab === 'pvp' ? 'active' : ''}" data-mode-tab="pvp">Đấu PvP 1v1</button>
            </div>
            ${rightBody}
          </section>
        </main>
      </div>
    `;

    this.mount.querySelector('#lobbyPlayBtn')?.addEventListener('click', () => this.onPlayBot());
    this.mount.querySelector('#lobbyWeaponsBtn')?.addEventListener('click', () => this.onOpenWeapons());
    this.mount.querySelector('#lobbyHexesRow')?.addEventListener('click', () => this.onOpenWeapons());
    this.mount.querySelector('#lobbySettingsBtn')?.addEventListener('click', () => this.onOpenSettings());
    this.mount.querySelector('#lobbyUserBtn')?.addEventListener('click', () => this.onOpenAuth());
    this.mount.querySelector('#lobbyFsBtn')?.addEventListener('click', () => {
      void toggleFullscreenLandscape(this.onNotify, this.onShowIOSGuide);
    });

    this.mount.querySelectorAll<HTMLElement>('[data-mode-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.modeTab as 'bot' | 'pvp';
        this.onPvPTabChange(next);
      });
    });

    this.mount.querySelector('#pvpCreateBtn')?.addEventListener('click', () => this.onCreateRoom());
    this.mount.querySelector('#pvpCancelRoomBtn')?.addEventListener('click', () => this.onCancelRoom());

    this.mount.querySelector('#pvpCopyLinkBtn')?.addEventListener('click', () => {
      if (!pvp.waitingCode) return;
      const inviteUrl = `${window.location.origin}/?room=${pvp.waitingCode}`;
      navigator.clipboard?.writeText(inviteUrl).then(
        () => this.onNotify(`Đã sao chép link mời phòng ${pvp.waitingCode}`),
        () => this.onNotify(`Link mời: ${inviteUrl}`),
      );
    });

    const codeInput = this.mount.querySelector<HTMLInputElement>('#pvpCodeInput');
    codeInput?.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      this.onJoinCodeInput(codeInput.value);
    });
    codeInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && codeInput.value.trim().length >= 3) {
        this.onJoinRoom(codeInput.value);
      }
    });

    this.mount.querySelector('#pvpJoinBtn')?.addEventListener('click', () => {
      this.onJoinRoom(codeInput?.value ?? pvp.joinCodeDraft);
    });

    this.mount.querySelectorAll<HTMLElement>('[data-lobby-slot]').forEach((card) => {
      card.addEventListener('click', () => {
        const sk = card.dataset.lobbySlot as SlotKey;
        this.onOpenWeapons(sk);
      });
    });

    for (const sk of SLOT_KEYS) {
      const cvs = this.mount.querySelector<HTMLCanvasElement>(`[data-preview-slot="${sk}"]`);
      if (cvs) {
        this.drawBlueprintPreview(cvs, loadout.blueprints[sk], loadout);
      }
    }
  }

  public hide(): void {
    this.mount.innerHTML = '';
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private drawBlueprintPreview(canvas: HTMLCanvasElement, bp: WeaponBlueprint, loadout: PlayerLoadout): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(72, rect.width || 96);
    const h = Math.max(38, rect.height || 50);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const unitPts = bp.slots.map((s) => ({ slot: s, loc: axialToLocal(s.q, s.r, 1) }));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of unitPts) {
      minX = Math.min(minX, p.loc.x - 1);
      maxX = Math.max(maxX, p.loc.x + 1);
      minY = Math.min(minY, p.loc.y - 1);
      maxY = Math.max(maxY, p.loc.y + 1);
    }

    const spanX = Math.max(2.6, maxX - minX);
    const spanY = Math.max(2.6, maxY - minY);
    const R = Math.min((w - 14) / spanX, (h - 10) / spanY, 9.5);
    const midX = (minX + maxX) * 0.5;
    const midY = (minY + maxY) * 0.5;
    const cx = w * 0.5 - midX * R;
    const cy = h * 0.5 - midY * R;

    const slotMap = new Map(bp.slots.map((s) => [axialKey(s.q, s.r), s]));
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.50)';
    ctx.lineWidth = 1.6;
    for (const s of bp.slots) {
      const a = axialToLocal(s.q, s.r, R);
      for (let i = 0; i < 3; i++) {
        const d = AXIAL_DIRS[i * 2];
        const nb = slotMap.get(axialKey(s.q + d.q, s.r + d.r));
        if (nb) {
          const b = axialToLocal(nb.q, nb.r, R);
          ctx.beginPath();
          ctx.moveTo(cx + a.x, cy + a.y);
          ctx.lineTo(cx + b.x, cy + b.y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    for (const s of bp.slots) {
      const loc = axialToLocal(s.q, s.r, R);
      const matId = loadout.hexMaterials[s.hexIndex] ?? 'base';
      const isRoot = s.hexIndex === bp.rootHexIndex;
      const stroke =
        matId === 'heavy'
          ? '#cbd5e1'
          : matId === 'sharp'
            ? '#fbbf24'
            : matId === 'light'
              ? '#34d399'
              : '#38bdf8';
      const fill =
        matId === 'heavy'
          ? 'rgba(148, 163, 184, 0.34)'
          : matId === 'sharp'
            ? 'rgba(251, 191, 36, 0.24)'
            : matId === 'light'
              ? 'rgba(52, 211, 153, 0.24)'
              : 'rgba(56, 189, 248, 0.26)';

      ctx.save();
      drawHexPolygon(ctx, cx + loc.x, cy + loc.y, R * 0.88, Math.PI / 6);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = matId === 'heavy' ? 1.7 : 1.25;
      ctx.stroke();

      // Subtle white center marker for Root hex (preserves true material color!)
      if (isRoot) {
        ctx.beginPath();
        ctx.arc(cx + loc.x, cy + loc.y, Math.max(1.8, R * 0.24), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(248, 250, 252, 0.92)';
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
