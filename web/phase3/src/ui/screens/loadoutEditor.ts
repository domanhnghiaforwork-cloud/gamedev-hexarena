import { canvasFont } from '@config/typography';
import {
  AXIAL_DIRS,
  BASE_HEX_RADIUS,
  MATERIAL_LIST,
  MATERIALS,
  MAX_HEX_COUNT,
  MIN_HEX_COUNT,
  PLAYER_RADIUS,
  SCALE_TIERS,
  SQRT3,
  createDefaultLoadout,
  createSampleTemplates,
} from '@core/constants';
import { STANCE_META } from '@attacks/index';
import {
  autoConnectBlueprint,
  cloneLoadout,
  computeBlueprintMetrics,
  normalizeBlueprint,
  resizeLoadoutHexCount,
  validateBlueprint,
} from '@core/world/blueprint';
import { axialKey, axialToLocal, clamp, localToAxial } from '@core/math/hexMath';
import type { CombatStance, MaterialId, PlayerLoadout, ScaleTier, SlotKey } from '@core/types';
import { drawHexPolygon } from '@render/world/arenaRenderer';

const SLOT_KEYS: SlotKey[] = ['slot1', 'slot2', 'slot3'];

const MATERIAL_ROLES: Record<MaterialId, string> = {
  base: 'Cân bằng toàn diện, ổn định ở thân vũ khí và đánh đơn lẻ.',
  heavy: 'Độ bền và độ cứng cao nhất. Tối ưu làm Gốc neo hoặc mặt khiên chịu lực.',
  sharp: 'Độ sắc cao nhất. Tối ưu đặt ở Mũi/Lưỡi xuyên giáp, dễ vỡ nếu bị đỡ cứng.',
  light: 'Cơ động cao nhất. Bay nhanh, dễ kéo gọng kìm và đổi góc linh hoạt.',
};

export interface PvPPrepConfig {
  roomCode: string;
  lockedHexCount: number;
  remainingSec: number;
  selfReady: boolean;
  oppReady: boolean;
  oppName: string;
  onDraftChange: (loadout: PlayerLoadout) => void;
  onToggleReady: (ready: boolean, loadout: PlayerLoadout) => void;
  onLeaveRoom: () => void;
}

export class LoadoutEditorModal {
  private mount: HTMLElement;
  private draft: PlayerLoadout;
  private activeSlot: SlotKey;
  private selectedHexIdx = 0;
  private previewScale: ScaleTier = 1.0;
  private mobileTab: 'builder' | 'guide' = 'builder';
  private openedFromLobby: boolean;
  private pvpPrep: PvPPrepConfig | null;

  private canvas: HTMLCanvasElement | null = null;
  private resizeHandler: () => void;
  private dragHexIdx: number | null = null;
  private dragWorldX = 0;
  private dragWorldY = 0;
  private dragHoverQ = 0;
  private dragHoverR = 0;

  private onSave: (loadout: PlayerLoadout, startMatch: boolean) => void;
  private onClose: () => void;

  constructor(opts: {
    mount: HTMLElement;
    initialLoadout: PlayerLoadout;
    initialSlot?: SlotKey;
    openedFromLobby: boolean;
    pvpPrep?: PvPPrepConfig;
    onSave: (loadout: PlayerLoadout, startMatch: boolean) => void;
    onClose: () => void;
  }) {
    this.mount = opts.mount;
    this.pvpPrep = opts.pvpPrep ? { ...opts.pvpPrep } : null;
    const baseDraft = cloneLoadout(opts.initialLoadout);
    this.draft =
      this.pvpPrep && baseDraft.hexMaterials.length !== this.pvpPrep.lockedHexCount
        ? resizeLoadoutHexCount(baseDraft, this.pvpPrep.lockedHexCount)
        : baseDraft;
    this.activeSlot = opts.initialSlot ?? 'slot1';
    this.previewScale = this.draft.blueprints[this.activeSlot].defaultScale;
    this.openedFromLobby = opts.openedFromLobby;
    this.onSave = opts.onSave;
    this.onClose = opts.onClose;

    this.resizeHandler = () => {
      if (this.canvas) {
        this.syncCanvasResolution();
        this.drawBlueprintCanvas();
      }
    };
    window.addEventListener('resize', this.resizeHandler);
    this.renderDOM();
  }

  public destroy(): void {
    window.removeEventListener('resize', this.resizeHandler);
    this.mount.innerHTML = '';
    this.canvas = null;
  }

  /**
   * Live in-place header update for 1-minute PvP Prep timer & ready pills (never interrupts canvas drag!).
   */
  public updatePvPPrep(remainingSec: number, selfReady: boolean, oppReady: boolean): void {
    if (!this.pvpPrep) return;
    this.pvpPrep.remainingSec = remainingSec;
    this.pvpPrep.selfReady = selfReady;
    this.pvpPrep.oppReady = oppReady;

    const timerEl = this.mount.querySelector<HTMLElement>('#prepTimerVal');
    if (timerEl) {
      const m = Math.floor(remainingSec / 60);
      const s = remainingSec % 60;
      timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      timerEl.classList.toggle('warn', remainingSec <= 15 && remainingSec > 5);
      timerEl.classList.toggle('danger', remainingSec <= 5);
    }

    const selfBadge = this.mount.querySelector<HTMLElement>('#prepSelfBadge');
    if (selfBadge) {
      selfBadge.textContent = selfReady ? 'Bạn: Sẵn sàng' : 'Bạn: Đang chỉnh';
      selfBadge.className = `prep-ready-chip ${selfReady ? 'ok' : 'wait'}`;
    }

    const oppBadge = this.mount.querySelector<HTMLElement>('#prepOppBadge');
    if (oppBadge) {
      oppBadge.textContent = oppReady
        ? `${this.pvpPrep.oppName}: Sẵn sàng`
        : `${this.pvpPrep.oppName}: Đang chỉnh`;
      oppBadge.className = `prep-ready-chip ${oppReady ? 'ok' : 'wait'}`;
    }

    const readyBtn = this.mount.querySelector<HTMLButtonElement>('#lePrepReadyBtn');
    if (readyBtn) {
      readyBtn.textContent = selfReady ? 'Hủy sẵn sàng' : 'Sẵn sàng chiến';
      readyBtn.className = `btn sm ${selfReady ? 'amber' : 'primary'}`;
    }
  }

  private notifyPrepDraftChanged(): void {
    if (!this.pvpPrep) return;
    const hexCount = this.draft.hexMaterials.length;
    const allValid = SLOT_KEYS.every((k) => validateBlueprint(this.draft.blueprints[k], hexCount).valid);
    if (!allValid) {
      if (this.pvpPrep.selfReady) {
        this.pvpPrep.selfReady = false;
        this.pvpPrep.onToggleReady(false, cloneLoadout(this.draft));
      }
      return;
    }
    const clean = cloneLoadout(this.draft);
    for (const sk of SLOT_KEYS) {
      clean.blueprints[sk] = normalizeBlueprint(clean.blueprints[sk]);
    }
    if (this.pvpPrep.selfReady) {
      this.pvpPrep.selfReady = false;
      this.pvpPrep.onToggleReady(false, clean);
    } else {
      this.pvpPrep.onDraftChange(clean);
    }
  }

  private get bp() {
    return this.draft.blueprints[this.activeSlot];
  }

  private renderDOM(): void {
    const bp = this.bp;
    const hexCount = this.draft.hexMaterials.length;
    const validation = validateBlueprint(bp, hexCount);
    const metrics = computeBlueprintMetrics(bp, this.draft.hexMaterials);
    const allValid = SLOT_KEYS.every((k) => validateBlueprint(this.draft.blueprints[k], hexCount).valid);
    const templates = createSampleTemplates();
    const selMat = this.draft.hexMaterials[this.selectedHexIdx] ?? 'base';

    const prep = this.pvpPrep;
    const prepMins = prep ? Math.floor(prep.remainingSec / 60) : 0;
    const prepSecs = prep ? prep.remainingSec % 60 : 0;
    const prepTimerStr = `${String(prepMins).padStart(2, '0')}:${String(prepSecs).padStart(2, '0')}`;

    this.mount.innerHTML = `
      <div class="workshop-screen" id="loadoutOverlay">
        <!-- FULL-WIDTH WORKSHOP HEADER -->
        <header class="workshop-header">
          <div class="workshop-header-left">
            <button class="btn sm ${prep ? 'danger' : 'ghost'}" id="leCancel">${prep ? 'Rời phòng' : 'Quay lại'}</button>
            <span class="workshop-title">${prep ? `Tinh chỉnh PvP · ${this.escapeHtml(prep.roomCode)}` : 'Cấu hình vũ khí'}</span>
            ${
              prep
                ? `
                  <div class="prep-status-inline">
                    <span class="prep-timer-pill ${prep.remainingSec <= 5 ? 'danger' : prep.remainingSec <= 15 ? 'warn' : ''}" id="prepTimerVal">${prepTimerStr}</span>
                    <span class="prep-ready-chip ${prep.selfReady ? 'ok' : 'wait'}" id="prepSelfBadge">${prep.selfReady ? 'Bạn: Sẵn sàng' : 'Bạn: Đang chỉnh'}</span>
                    <span class="prep-ready-chip ${prep.oppReady ? 'ok' : 'wait'}" id="prepOppBadge">${this.escapeHtml(prep.oppName)}: ${prep.oppReady ? 'Sẵn sàng' : 'Đang chỉnh'}</span>
                  </div>
                `
                : ''
            }
          </div>

          <!-- Clean 2-Tab Switcher on Mobile / Tablet (< 1020px) -->
          <div class="workshop-mobile-tabs">
            <button class="workshop-tab-btn ${this.mobileTab === 'builder' ? 'active' : ''}" data-mtab="builder">Tạo vũ khí</button>
            <button class="workshop-tab-btn ${this.mobileTab === 'guide' ? 'active' : ''}" data-mtab="guide">Đặc tính &amp; Mảnh</button>
          </div>

          <div class="workshop-header-actions">
            <button class="btn sm danger" id="leResetDefault">Đặt lại</button>
            ${
              prep
                ? `
                  <button class="btn sm ${prep.selfReady ? 'amber' : 'primary'}" id="lePrepReadyBtn" ${allValid ? '' : 'disabled'}>
                    ${prep.selfReady ? 'Hủy sẵn sàng' : 'Sẵn sàng chiến'}
                  </button>
                `
                : `
                  <button class="btn sm ${this.openedFromLobby ? '' : 'primary'}" id="leSave" ${allValid ? '' : 'disabled'}>
                    ${this.openedFromLobby ? 'Lưu' : 'Lưu & Áp dụng'}
                  </button>
                  ${
                    this.openedFromLobby
                      ? `<button class="btn sm primary" id="leSavePlay" ${allValid ? '' : 'disabled'}>Lưu &amp; Vào trận</button>`
                      : ''
                  }
                `
            }
          </div>
        </header>

        <!-- MAIN 2-SECTION WORKSPACE -->
        <div class="workshop-body">
          <!-- PHẦN 1: GIẢI THÍCH ĐẶC TÍNH & CÁC LOẠI MẢNH -->
          <aside class="workshop-guide-col ${this.mobileTab === 'guide' ? '' : 'mobile-hidden'}">
            <div class="col-heading">
              <span>1. Đặc tính &amp; Các loại mảnh</span>
              <span style="color:#94a3b8;font-size:10px;text-transform:none;">400đ / mảnh</span>
            </div>

            <div class="guide-block">
              <div class="guide-subhead">4 loại mảnh lục giác</div>
              <div class="mat-guide-list">
                ${MATERIAL_LIST.map((id) => {
                  const m = MATERIALS[id];
                  return `
                    <div class="mat-guide-card">
                      <div class="mat-guide-head">
                        <span class="mat-tag mat-${id}">Mảnh ${m.name}</span>
                        <span style="font-size:10px;color:#94a3b8;">Ngân sách 400</span>
                      </div>
                      <div class="mat-guide-stats">
                        <span>Bền <strong>${m.dur}</strong></span>
                        <span>Cứng <strong>${m.hard}</strong></span>
                        <span>Sắc <strong>${m.sharp}</strong></span>
                        <span>CĐ <strong>${m.agil}</strong></span>
                      </div>
                      <div class="mat-guide-desc">${MATERIAL_ROLES[id]}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="guide-block">
              <div class="guide-subhead">3 trạng thái tấn công kế thừa</div>
              <div class="guide-rule-list">
                <div class="guide-rule-item">
                  <strong style="color:#c084fc;">Đánh xa:</strong> Phi thẳng cả khối theo hướng ngắm rồi tự bay về 2× tốc độ (50% sát thương). Chiêu đặc biệt: <strong>Ngự Thương Độc Lập</strong> (bay tự do, click bay xuyên qua điểm).
                </div>
                <div class="guide-rule-item">
                  <strong style="color:#fbbf24;">Đánh gần:</strong> Vung chém vòng cung rộng trước mặt. Chiêu đặc biệt: <strong>Phản Chém Tước Mảnh</strong> (bật ngược và tước mảnh đối thủ).
                </div>
                <div class="guide-rule-item">
                  <strong style="color:#34d399;">Phòng thủ:</strong> Thuần phòng thủ — không thể bấm đánh thường, chỉ xoay góc che chắn và làm trượt đòn. Chiêu đặc biệt: <strong>Pháo Đài Phản Xung</strong> (phóng to 150%, giữ độ cứng 60%, kích hoạt lại hoặc hết giờ để phóng sóng phản xung gây sát thương).
                </div>
              </div>
            </div>

            <div class="guide-block">
              <div class="guide-subhead">Co giãn &amp; liên kết cạnh</div>
              <div class="guide-rule-list">
                <div class="guide-rule-item">
                  <strong>60% Nhỏ:</strong> Cứng 215%, xuyên 167%, nhanh 129%, vùng đánh hẹp.<br/>
                  <strong>100% Chuẩn:</strong> Cân bằng toàn diện.<br/>
                  <strong>150% To:</strong> Vùng chắn 150%, cứng 54%, chậm hơn.
                </div>
                <div class="guide-rule-item">
                  <strong>Liên kết cạnh:</strong> Mỗi cạnh nối mảnh đồng đội cộng <strong>+10% độ cứng</strong> và khi cầm sẽ chia <strong>30% sát thương</strong> sang các mảnh kề. Góc tới &gt; 35° trượt lệch hướng.
                </div>
              </div>
            </div>
          </aside>

          <!-- PHẦN 2: TẠO VŨ KHÍ (LƯỚI TỔ ONG LẤP ĐẦY 100%) -->
          <main class="workshop-builder-col ${this.mobileTab === 'builder' ? '' : 'mobile-hidden'}">
            <!-- Top Bar: 3 Blueprint Slots + Shared Hex Count + Sample Templates -->
            <div class="builder-top-strip">
              <div class="slot-tabs-inline">
                ${SLOT_KEYS.map((sk, idx) => {
                  const b = this.draft.blueprints[sk];
                  const v = validateBlueprint(b, hexCount);
                  const st = STANCE_META[b.stance];
                  return `
                    <button class="slot-tab ${sk === this.activeSlot ? 'active' : ''}" data-slot="${sk}">
                      <span class="slot-tab-name">Ô ${idx + 1}: ${this.escapeHtml(b.name)}${v.valid ? '' : ' (Rời)'}</span>
                      <span class="slot-tab-sub" style="color:${st.color};">${st.label} · ${Math.round(b.defaultScale * 100)}%</span>
                    </button>
                  `;
                }).join('')}
              </div>

              <div class="pool-controls">
                ${
                  prep
                    ? `<div class="count-stepper locked" title="Số lượng mảnh đã được chủ phòng cố định">
                         <span class="count-badge">Luật phòng: ${hexCount} mảnh</span>
                       </div>`
                    : `<div class="count-stepper">
                         <button class="btn sm" id="leDecCount" ${hexCount <= MIN_HEX_COUNT ? 'disabled' : ''}>-</button>
                         <span class="count-badge">${hexCount} mảnh</span>
                         <button class="btn sm" id="leIncCount" ${hexCount >= MAX_HEX_COUNT ? 'disabled' : ''}>+</button>
                       </div>`
                }
                <select id="leTemplateSelect" class="template-select" title="Nạp nhanh mẫu vũ khí">
                  <option value="">Nạp mẫu nhanh...</option>
                  ${templates.map((t) => `<option value="${t.id}">${t.label}</option>`).join('')}
                </select>
              </div>
            </div>

            <!-- Workspace: Full-Fill Honeycomb Canvas + Compact Inspector Tray -->
            <div class="builder-workspace">
              <div class="blueprint-canvas-wrap">
                <canvas id="blueprintCanvas"></canvas>

                <!-- Floating Clean Top Overlay inside Canvas -->
                <div class="canvas-hud-top">
                  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                    <span class="status-badge ${validation.valid ? 'ok' : 'err'}">
                      ${validation.valid ? 'Liên thông hợp lệ' : validation.errorMessage}
                    </span>
                    ${!validation.valid ? '<button class="btn xs primary" id="leAutoConnect">Tự ghép liền</button>' : ''}
                  </div>
                  <div class="canvas-pill-group">
                    <button class="btn xs amber" id="leSetRoot">Đặt #${this.selectedHexIdx + 1} làm Gốc</button>
                  </div>
                </div>

                <!-- Floating Clean Bottom Overlay inside Canvas -->
                <div class="canvas-hud-bottom">
                  <span class="canvas-hint-pill">Kéo thả mảnh để xếp hình (thả đè sẽ hoán đổi) · Nhấp đúp để đặt làm Gốc</span>
                  <div class="canvas-pill-group">
                    ${SCALE_TIERS.map(
                      (sc) =>
                        `<button class="btn xs ${this.previewScale === sc ? 'primary' : 'ghost'}" data-preview-scale="${sc}">${Math.round(sc * 100)}%</button>`,
                    ).join('')}
                  </div>
                </div>
              </div>

              <!-- Compact Bottom/Side Inspector Tray -->
              <div class="builder-bottom-tray">
                <div class="hex-tray-row">
                  <div class="hex-chip-bar">
                    ${this.draft.hexMaterials
                      .map((matId, idx) => {
                        const isSel = idx === this.selectedHexIdx;
                        const isRoot = idx === bp.rootHexIndex;
                        return `
                          <button class="hex-chip ${isSel ? 'selected' : ''} ${isRoot ? 'is-root' : ''}" data-hex-idx="${idx}">
                            <span>#${idx + 1}${isRoot ? ' Gốc' : ''}</span>
                            <span class="mat-tag mat-${matId}">${MATERIALS[matId].name}</span>
                          </button>
                        `;
                      })
                      .join('')}
                  </div>

                  <div class="mat-picker-inline">
                    <span style="font-size:10px;color:#94a3b8;font-weight:700;">Chất liệu #${this.selectedHexIdx + 1}:</span>
                    ${MATERIAL_LIST.map(
                      (id) =>
                        `<button class="btn xs ${selMat === id ? 'primary' : ''}" data-set-mat="${id}">${MATERIALS[id].name}</button>`,
                    ).join('')}
                  </div>
                </div>

                <div class="bp-config-bar">
                  <div class="field-group">
                    <span class="field-label">Tên cấu hình</span>
                    <input id="leNameInput" class="text-input" maxlength="16" value="${this.escapeHtml(bp.name)}" />
                  </div>
                  <div class="field-group">
                    <span class="field-label">Trạng thái kế thừa</span>
                    <div class="seg-group">
                      ${(['ranged', 'melee', 'defense'] as CombatStance[])
                        .map(
                          (st) =>
                            `<button class="seg-btn ${bp.stance === st ? 'active' : ''}" data-stance="${st}">${STANCE_META[st].label}</button>`,
                        )
                        .join('')}
                    </div>
                  </div>
                  <div class="field-group">
                    <span class="field-label">Cỡ mặc định</span>
                    <div class="seg-group">
                      ${SCALE_TIERS.map(
                        (sc) =>
                          `<button class="seg-btn ${bp.defaultScale === sc ? 'active' : ''}" data-def-scale="${sc}">${Math.round(sc * 100)}%</button>`,
                      ).join('')}
                    </div>
                  </div>
                  <div class="metrics-compact-grid">
                    ${this.renderCompactMetric('Tầm vươn', metrics.reachScore, '#38bdf8')}
                    ${this.renderCompactMetric('Góc chắn', metrics.coverageScore, '#34d399')}
                    ${this.renderCompactMetric('Độ cứng', metrics.hardnessScore, '#94a3b8')}
                    ${this.renderCompactMetric('Xuyên mũi', metrics.pierceScore, '#fbbf24')}
                    ${this.renderCompactMetric('Cơ động', metrics.agilityScore, '#c084fc')}
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    `;

    this.bindDOMEvents();
    this.setupBlueprintCanvas();
    this.drawBlueprintCanvas();
  }

  private renderCompactMetric(label: string, value: number, color: string): string {
    return `
      <div class="metric-mini">
        <div class="metric-mini-head">
          <span>${label}</span>
          <strong style="color:${color};">${value}</strong>
        </div>
        <div class="metric-track">
          <div class="metric-fill" style="width:${value}%;background:${color};"></div>
        </div>
      </div>
    `;
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private bindDOMEvents(): void {
    this.mount.querySelector('#leCancel')?.addEventListener('click', () => {
      if (this.pvpPrep) this.pvpPrep.onLeaveRoom();
      else this.onClose();
    });

    this.mount.querySelectorAll<HTMLElement>('[data-mtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.mobileTab = btn.dataset.mtab as 'builder' | 'guide';
        this.renderDOM();
      });
    });

    this.mount.querySelector('#leDecCount')?.addEventListener('click', () => {
      if (this.pvpPrep) return;
      this.draft = resizeLoadoutHexCount(this.draft, this.draft.hexMaterials.length - 1);
      if (this.selectedHexIdx >= this.draft.hexMaterials.length) {
        this.selectedHexIdx = this.draft.hexMaterials.length - 1;
      }
      this.renderDOM();
    });

    this.mount.querySelector('#leIncCount')?.addEventListener('click', () => {
      if (this.pvpPrep) return;
      this.draft = resizeLoadoutHexCount(this.draft, this.draft.hexMaterials.length + 1);
      this.renderDOM();
    });

    this.mount.querySelectorAll<HTMLElement>('[data-hex-idx]').forEach((el) => {
      el.addEventListener('click', () => {
        this.selectedHexIdx = parseInt(el.dataset.hexIdx || '0', 10);
        this.renderDOM();
      });
    });

    this.mount.querySelectorAll<HTMLElement>('[data-set-mat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.draft.hexMaterials[this.selectedHexIdx] = btn.dataset.setMat as MaterialId;
        this.notifyPrepDraftChanged();
        this.renderDOM();
      });
    });

    const tplSelect = this.mount.querySelector<HTMLSelectElement>('#leTemplateSelect');
    const templates = createSampleTemplates();
    tplSelect?.addEventListener('change', () => {
      const found = templates.find((t) => t.id === tplSelect.value);
      if (found) {
        const cloned = cloneLoadout(found.loadout);
        this.draft = this.pvpPrep ? resizeLoadoutHexCount(cloned, this.pvpPrep.lockedHexCount) : cloned;
        this.selectedHexIdx = 0;
        this.previewScale = this.bp.defaultScale;
        this.notifyPrepDraftChanged();
        this.renderDOM();
      }
    });

    this.mount.querySelectorAll<HTMLElement>('[data-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeSlot = btn.dataset.slot as SlotKey;
        this.previewScale = this.bp.defaultScale;
        this.renderDOM();
      });
    });

    this.mount.querySelector('#leSetRoot')?.addEventListener('click', () => {
      this.bp.rootHexIndex = this.selectedHexIdx;
      this.draft.blueprints[this.activeSlot] = normalizeBlueprint(this.bp);
      this.notifyPrepDraftChanged();
      this.renderDOM();
    });

    this.mount.querySelector('#leAutoConnect')?.addEventListener('click', () => {
      this.draft.blueprints[this.activeSlot] = autoConnectBlueprint(this.bp);
      this.notifyPrepDraftChanged();
      this.renderDOM();
    });

    this.mount.querySelectorAll<HTMLElement>('[data-preview-scale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.previewScale = parseFloat(btn.dataset.previewScale || '1') as ScaleTier;
        this.renderDOM();
      });
    });

    const nameInput = this.mount.querySelector<HTMLInputElement>('#leNameInput');
    nameInput?.addEventListener('input', () => {
      this.bp.name = nameInput.value.slice(0, 16) || 'Cấu hình';
      const activeTabName = this.mount.querySelector(`.slot-tab[data-slot="${this.activeSlot}"] .slot-tab-name`);
      if (activeTabName) {
        const idx = SLOT_KEYS.indexOf(this.activeSlot) + 1;
        activeTabName.textContent = `Ô ${idx}: ${this.bp.name}`;
      }
      this.notifyPrepDraftChanged();
    });

    this.mount.querySelectorAll<HTMLElement>('[data-stance]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.bp.stance = btn.dataset.stance as CombatStance;
        this.notifyPrepDraftChanged();
        this.renderDOM();
      });
    });

    this.mount.querySelectorAll<HTMLElement>('[data-def-scale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.bp.defaultScale = parseFloat(btn.dataset.defScale || '1') as ScaleTier;
        this.previewScale = this.bp.defaultScale;
        this.notifyPrepDraftChanged();
        this.renderDOM();
      });
    });

    this.mount.querySelector('#leResetDefault')?.addEventListener('click', () => {
      const def = createDefaultLoadout();
      this.draft = this.pvpPrep ? resizeLoadoutHexCount(def, this.pvpPrep.lockedHexCount) : def;
      this.selectedHexIdx = 0;
      this.activeSlot = 'slot1';
      this.previewScale = this.bp.defaultScale;
      this.notifyPrepDraftChanged();
      this.renderDOM();
    });

    const commitSave = (startMatch: boolean) => {
      for (const sk of SLOT_KEYS) {
        this.draft.blueprints[sk] = normalizeBlueprint(this.draft.blueprints[sk]);
      }
      this.onSave(cloneLoadout(this.draft), startMatch);
    };

    this.mount.querySelector('#leSave')?.addEventListener('click', () => commitSave(false));
    this.mount.querySelector('#leSavePlay')?.addEventListener('click', () => commitSave(true));

    this.mount.querySelector('#lePrepReadyBtn')?.addEventListener('click', () => {
      if (!this.pvpPrep) return;
      for (const sk of SLOT_KEYS) {
        this.draft.blueprints[sk] = normalizeBlueprint(this.draft.blueprints[sk]);
      }
      const nextReady = !this.pvpPrep.selfReady;
      this.pvpPrep.selfReady = nextReady;
      this.pvpPrep.onToggleReady(nextReady, cloneLoadout(this.draft));
      this.updatePvPPrep(this.pvpPrep.remainingSec, this.pvpPrep.selfReady, this.pvpPrep.oppReady);
    });
  }

  /**
   * Computes optimal hex radius R & origin (originX, originY) so that:
   * 1. The honeycomb grid fills 100% of the canvas edge-to-edge.
   * 2. Even long 10-hex weapons + the non-overlapping NHÂN VẬT hitbox circle always fit comfortably centered.
   */
  private getGridMetrics() {
    const canvas = this.canvas!;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(260, rect.width);
    const h = Math.max(180, rect.height);
    const metrics = computeBlueprintMetrics(this.bp, this.draft.hexMaterials);

    let minUX = Infinity;
    let maxUX = -Infinity;
    let minUY = Infinity;
    let maxUY = -Infinity;
    for (const s of this.bp.slots) {
      const loc = axialToLocal(s.q, s.r, 1);
      minUX = Math.min(minUX, loc.x - 1.1);
      maxUX = Math.max(maxUX, loc.x + 1.1);
      minUY = Math.min(minUY, loc.y - 1.1);
      maxUY = Math.max(maxUY, loc.y + 1.1);
    }

    // Account for realistic non-overlapping NHÂN VẬT ring to the left of Root (0, 0)
    const playerUnitR = clamp(PLAYER_RADIUS / (BASE_HEX_RADIUS * this.previewScale), 1.25, 2.25);
    const ghostUnitX = -(playerUnitR + metrics.anchorDistFactor);
    minUX = Math.min(minUX, ghostUnitX - playerUnitR - 0.4);
    maxUX = Math.max(maxUX, 4.5);

    const spanX = Math.max(8.5, maxUX - minUX + 2.6);
    const spanY = Math.max(5.5, maxUY - minUY + 2.6);

    // Base comfortable hex radius scaled by preview tier, capped to always fit the entire weapon inside canvas
    const desiredR = clamp(Math.min(w, h) * 0.088, 17, 29) * (0.76 + 0.24 * this.previewScale);
    const fitR = Math.min((w - 56) / spanX, (h - 76) / spanY);
    const R = clamp(Math.min(desiredR, fitR), 14, 31);

    const contentMidUX = (minUX + maxUX) * 0.5;
    const contentMidUY = (minUY + maxUY) * 0.5;
    const originX = w * 0.5 - contentMidUX * R;
    const originY = h * 0.5 - contentMidUY * R;

    return { w, h, R, originX, originY, playerUnitR, ghostUnitX, metrics };
  }

  private syncCanvasResolution(): void {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
  }

  private setupBlueprintCanvas(): void {
    const canvas = this.mount.querySelector<HTMLCanvasElement>('#blueprintCanvas');
    if (!canvas) return;
    this.canvas = canvas;
    this.syncCanvasResolution();

    const getPos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    canvas.addEventListener('pointerdown', (e) => {
      const { x, y } = getPos(e);
      const { R, originX, originY } = this.getGridMetrics();
      const clickedAxial = localToAxial(x - originX, y - originY, R);
      const hitSlot = this.bp.slots.find((s) => s.q === clickedAxial.q && s.r === clickedAxial.r);

      if (hitSlot) {
        this.selectedHexIdx = hitSlot.hexIndex;
        this.dragHexIdx = hitSlot.hexIndex;
        this.dragWorldX = x;
        this.dragWorldY = y;
        this.dragHoverQ = hitSlot.q;
        this.dragHoverR = hitSlot.r;
        canvas.setPointerCapture(e.pointerId);
        this.drawBlueprintCanvas();
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (this.dragHexIdx === null) return;
      const { x, y } = getPos(e);
      const { w, h, R, originX, originY } = this.getGridMetrics();
      this.dragWorldX = x;
      this.dragWorldY = y;
      const axial = localToAxial(x - originX, y - originY, R);
      const snapped = axialToLocal(axial.q, axial.r, R);
      const sx = originX + snapped.x;
      const sy = originY + snapped.y;
      // Allow dragging cleanly to ANY visible cell inside the full-bleed honeycomb board!
      if (
        sx >= R * 0.8 &&
        sx <= w - R * 0.8 &&
        sy >= R * 0.8 &&
        sy <= h - R * 0.8 &&
        Math.abs(axial.q) <= 10 &&
        Math.abs(axial.r) <= 8
      ) {
        this.dragHoverQ = axial.q;
        this.dragHoverR = axial.r;
      }
      this.drawBlueprintCanvas();
    });

    const finishDrag = () => {
      if (this.dragHexIdx === null) return;
      const dragged = this.bp.slots.find((s) => s.hexIndex === this.dragHexIdx);
      if (dragged) {
        const occupant = this.bp.slots.find(
          (s) => s.hexIndex !== dragged.hexIndex && s.q === this.dragHoverQ && s.r === this.dragHoverR,
        );
        if (occupant) {
          const oldQ = dragged.q;
          const oldR = dragged.r;
          dragged.q = occupant.q;
          dragged.r = occupant.r;
          occupant.q = oldQ;
          occupant.r = oldR;
        } else {
          dragged.q = this.dragHoverQ;
          dragged.r = this.dragHoverR;
        }
        this.draft.blueprints[this.activeSlot] = normalizeBlueprint(this.bp);
        this.notifyPrepDraftChanged();
      }
      this.dragHexIdx = null;
      this.renderDOM();
    };

    canvas.addEventListener('pointerup', finishDrag);
    canvas.addEventListener('pointercancel', finishDrag);

    canvas.addEventListener('dblclick', (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const { R, originX, originY } = this.getGridMetrics();
      const clickedAxial = localToAxial(x - originX, y - originY, R);
      const hitSlot = this.bp.slots.find((s) => s.q === clickedAxial.q && s.r === clickedAxial.r);
      if (hitSlot) {
        this.selectedHexIdx = hitSlot.hexIndex;
        this.bp.rootHexIndex = hitSlot.hexIndex;
        this.draft.blueprints[this.activeSlot] = normalizeBlueprint(this.bp);
        this.notifyPrepDraftChanged();
        this.renderDOM();
      }
    });
  }

  private drawBlueprintCanvas(): void {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { w, h, R, originX, originY, playerUnitR, ghostUnitX, metrics } = this.getGridMetrics();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Rich subtle radial slate canvas backdrop
    const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, R * 1.5, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    bgGrad.addColorStop(0, '#222a3a');
    bgGrad.addColorStop(1, '#141a26');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const bp = this.bp;
    const hexCount = this.draft.hexMaterials.length;
    const validation = validateBlueprint(bp, hexCount);
    const disconnectedSet = new Set(validation.disconnectedIndices);

    // 1. FULL-BLEED HONEYCOMB GRID (Covers 100% of the entire canvas width & height!)
    const rMin = Math.floor((-originY - R * 2) / (1.5 * R)) - 1;
    const rMax = Math.ceil((h - originY + R * 2) / (1.5 * R)) + 1;

    ctx.save();
    for (let r = rMin; r <= rMax; r++) {
      const qMin = Math.floor((-originX - R * 2) / (SQRT3 * R) - r * 0.5) - 1;
      const qMax = Math.ceil((w - originX + R * 2) / (SQRT3 * R) - r * 0.5) + 1;
      for (let q = qMin; q <= qMax; q++) {
        const loc = axialToLocal(q, r, R);
        const gx = originX + loc.x;
        const gy = originY + loc.y;
        if (gx < -R * 1.2 || gx > w + R * 1.2 || gy < -R * 1.2 || gy > h + R * 1.2) continue;

        drawHexPolygon(ctx, gx, gy, R * 0.96, Math.PI / 6);
        const isOrigin = q === 0 && r === 0;
        ctx.fillStyle = isOrigin ? 'rgba(251, 191, 36, 0.06)' : 'rgba(255, 255, 255, 0.012)';
        ctx.fill();
        ctx.strokeStyle = isOrigin ? 'rgba(251, 191, 36, 0.45)' : 'rgba(148, 163, 184, 0.13)';
        ctx.lineWidth = isOrigin ? 1.8 : 1;
        ctx.stroke();
      }
    }
    ctx.restore();

    // 2. Non-overlapping NHÂN VẬT Ground Hitbox Reference Ring + Forward Direction Axis (+X)
    const ghostX = originX + ghostUnitX * R;
    const playerR = playerUnitR * R;
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ghostX, originY, playerR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Subtle inner core dot of player
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.beginPath();
    ctx.arc(ghostX, originY, playerR * 0.48, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(186, 230, 253, 0.85)';
    ctx.font = canvasFont(700, Math.max(8, Math.round(R * 0.36)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NHÂN VẬT', ghostX, originY);

    // Forward attack axis arrow (+X)
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.34)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(ghostX + playerR + 4, originY);
    ctx.lineTo(w - 24, originY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.70)';
    ctx.beginPath();
    ctx.moveTo(w - 14, originY);
    ctx.lineTo(w - 26, originY - 5.5);
    ctx.lineTo(w - 26, originY + 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 3. Drag Target Highlight Cell
    if (this.dragHexIdx !== null) {
      const tLoc = axialToLocal(this.dragHoverQ, this.dragHoverR, R);
      ctx.save();
      drawHexPolygon(ctx, originX + tLoc.x, originY + tLoc.y, R * 0.97, Math.PI / 6);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.26)';
      ctx.fill();
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.restore();
    }

    // 4. Edge-Weld Connections between adjacent hexes
    const slotMap = new Map(bp.slots.map((s) => [axialKey(s.q, s.r), s]));
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
    ctx.lineWidth = Math.max(2.5, R * 0.16);
    for (const s of bp.slots) {
      if (s.hexIndex === this.dragHexIdx) continue;
      const a = axialToLocal(s.q, s.r, R);
      for (let i = 0; i < 3; i++) {
        const d = AXIAL_DIRS[i * 2];
        const nb = slotMap.get(axialKey(s.q + d.q, s.r + d.r));
        if (nb && nb.hexIndex !== this.dragHexIdx) {
          const b = axialToLocal(nb.q, nb.r, R);
          ctx.beginPath();
          ctx.moveTo(originX + a.x, originY + a.y);
          ctx.lineTo(originX + b.x, originY + b.y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // 5. Placed Hex Slots
    const drawSlotHex = (hexIndex: number, cx: number, cy: number, isDragged: boolean) => {
      const matId = this.draft.hexMaterials[hexIndex] ?? 'base';
      const isRoot = hexIndex === bp.rootHexIndex;
      const isSel = hexIndex === this.selectedHexIdx;
      const isDisc = disconnectedSet.has(hexIndex);
      const role = metrics.roles[hexIndex];

      const matColor =
        matId === 'heavy'
          ? '#cbd5e1'
          : matId === 'sharp'
            ? '#fbbf24'
            : matId === 'light'
              ? '#34d399'
              : '#38bdf8';
      const matFill =
        matId === 'heavy'
          ? 'rgba(148, 163, 184, 0.34)'
          : matId === 'sharp'
            ? 'rgba(251, 191, 36, 0.24)'
            : matId === 'light'
              ? 'rgba(52, 211, 153, 0.24)'
              : 'rgba(56, 189, 248, 0.26)';

      ctx.save();
      drawHexPolygon(ctx, cx, cy, R * (isDragged ? 1.05 : 0.94), Math.PI / 6);
      ctx.fillStyle = isDisc ? 'rgba(225, 29, 72, 0.36)' : matFill;
      ctx.fill();
      ctx.strokeStyle = isDisc ? '#fb7185' : isSel ? '#ffffff' : matColor;
      ctx.lineWidth = isSel ? 2.7 : matId === 'heavy' ? 2.5 : 2.0;
      if (isDisc) ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Inner white hex ring marks Root without overriding true material color
      if (isRoot && !isDisc) {
        drawHexPolygon(ctx, cx, cy, R * (isDragged ? 0.88 : 0.78), Math.PI / 6);
        ctx.strokeStyle = 'rgba(248, 250, 252, 0.62)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = canvasFont(800, Math.max(9, Math.round(R * 0.48)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${hexIndex + 1}`, cx, cy - R * 0.16);

      const tag = isRoot ? 'GỐC' : role === 'tip' ? 'MŨI' : role === 'front' ? 'CHẮN' : MATERIALS[matId].name;
      ctx.fillStyle = isRoot ? '#f8fafc' : role === 'tip' ? '#fde68a' : '#cbd5e1';
      ctx.font = canvasFont(700, Math.max(8, Math.round(R * 0.32)));
      ctx.fillText(tag, cx, cy + R * 0.32);
      ctx.restore();
    };

    for (const s of bp.slots) {
      if (s.hexIndex === this.dragHexIdx) continue;
      const loc = axialToLocal(s.q, s.r, R);
      drawSlotHex(s.hexIndex, originX + loc.x, originY + loc.y, false);
    }

    if (this.dragHexIdx !== null) {
      drawSlotHex(this.dragHexIdx, this.dragWorldX, this.dragWorldY, true);
    }
  }
}
