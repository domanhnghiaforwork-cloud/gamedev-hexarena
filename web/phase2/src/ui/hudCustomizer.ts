import { clamp, dist } from '@core/hexMath';
import { pointInRect } from '@input/inputManager';
import {
  getRotateHandlePos,
  getWidgetRotateStep,
  isWidgetRotatable,
  type MobileComputedLayout,
} from '@input/hudPresets';
import {
  createDefaultPCConfig,
  createMobileHUDPreset,
  formatKeyLabel,
  MOBILE_WIDGET_LABELS,
  PC_ACTION_LABELS,
  type MobileHUDConfig,
  type MobilePresetId,
  type MobileWidgetId,
  type PCActionKey,
  type PCControlConfig,
  type ReticleStyle,
} from '@storage/profiles';

export type CustomizerTab = 'mobile' | 'pc';

export class HUDCustomizerController {
  private mount: HTMLElement;
  private canvas: HTMLCanvasElement;
  public activeTab: CustomizerTab;
  public draftMobile: MobileHUDConfig;
  public draftPC: PCControlConfig;
  public selectedWidget: MobileWidgetId = 'atk';

  private draggingWidget: MobileWidgetId | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private listeningAction: PCActionKey | null = null;

  // Draggable Mobile HUD Toolbar position (preserved across re-renders)
  private toolbarPos: { x: number; y: number } | null = null;
  private toolbarDrag: { pointerId: number; offsetX: number; offsetY: number } | null = null;

  private getMobileLayout: () => MobileComputedLayout;
  private onDraftChanged: (mobile: MobileHUDConfig, pc: PCControlConfig) => void;
  private onSave: (mobile: MobileHUDConfig, pc: PCControlConfig) => void;
  private onCancel: () => void;

  private boundKeyListener: (e: KeyboardEvent) => void;
  private boundPtrDown: (e: PointerEvent) => void;
  private boundPtrMove: (e: PointerEvent) => void;
  private boundPtrUp: () => void;
  private boundResize: () => void;

  constructor(opts: {
    mount: HTMLElement;
    canvas: HTMLCanvasElement;
    initialTab: CustomizerTab;
    mobileConfig: MobileHUDConfig;
    pcConfig: PCControlConfig;
    getMobileLayout: () => MobileComputedLayout;
    onDraftChanged: (mobile: MobileHUDConfig, pc: PCControlConfig) => void;
    onSave: (mobile: MobileHUDConfig, pc: PCControlConfig) => void;
    onCancel: () => void;
  }) {
    this.mount = opts.mount;
    this.canvas = opts.canvas;
    this.activeTab = opts.initialTab;
    this.draftMobile = JSON.parse(JSON.stringify(opts.mobileConfig)) as MobileHUDConfig;
    this.draftPC = JSON.parse(JSON.stringify(opts.pcConfig)) as PCControlConfig;
    this.getMobileLayout = opts.getMobileLayout;
    this.onDraftChanged = opts.onDraftChanged;
    this.onSave = opts.onSave;
    this.onCancel = opts.onCancel;

    this.boundKeyListener = (e) => this.handleKeyRemap(e);
    this.boundPtrDown = (e) => this.handleCanvasDown(e);
    this.boundPtrMove = (e) => this.handleCanvasMove(e);
    this.boundPtrUp = () => {
      this.draggingWidget = null;
      this.toolbarDrag = null;
      this.mount.querySelector('.mobile-hud-toolbar')?.classList.remove('dragging');
    };
    this.boundResize = () => this.clampToolbarToViewport();

    window.addEventListener('keydown', this.boundKeyListener, true);
    this.canvas.addEventListener('pointerdown', this.boundPtrDown);
    this.canvas.addEventListener('pointermove', this.boundPtrMove);
    window.addEventListener('pointerup', this.boundPtrUp);
    window.addEventListener('pointercancel', this.boundPtrUp);
    window.addEventListener('resize', this.boundResize);

    this.render();
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.boundKeyListener, true);
    this.canvas.removeEventListener('pointerdown', this.boundPtrDown);
    this.canvas.removeEventListener('pointermove', this.boundPtrMove);
    window.removeEventListener('pointerup', this.boundPtrUp);
    window.removeEventListener('pointercancel', this.boundPtrUp);
    window.removeEventListener('resize', this.boundResize);
    this.mount.innerHTML = '';
  }

  private clampToolbarToViewport(): void {
    const toolbar = this.mount.querySelector<HTMLElement>('.mobile-hud-toolbar');
    if (!toolbar || !this.toolbarPos) return;
    const rect = toolbar.getBoundingClientRect();
    const maxX = Math.max(6, window.innerWidth - rect.width - 6);
    const maxY = Math.max(6, window.innerHeight - rect.height - 6);
    this.toolbarPos.x = clamp(this.toolbarPos.x, 6, maxX);
    this.toolbarPos.y = clamp(this.toolbarPos.y, 6, maxY);
    toolbar.style.left = `${this.toolbarPos.x}px`;
    toolbar.style.top = `${this.toolbarPos.y}px`;
    toolbar.style.transform = 'none';
  }

  private rotateSelectedWidget(): void {
    const wid = this.selectedWidget;
    if (!isWidgetRotatable(wid)) return;
    const w = this.draftMobile.widgets[wid];
    const step = getWidgetRotateStep(wid);
    const cur = w.rotation ?? 0;
    w.rotation = (cur + step) % 360;
    this.onDraftChanged(this.draftMobile, this.draftPC);
    this.renderMobileOverlayToolbar();
  }

  private render(): void {
    this.onDraftChanged(this.draftMobile, this.draftPC);

    if (this.activeTab === 'mobile') {
      this.renderMobileOverlayToolbar();
    } else {
      this.renderPCModal();
    }
  }

  private renderMobileOverlayToolbar(): void {
    const w = this.draftMobile.widgets[this.selectedWidget];
    const canRotate = isWidgetRotatable(this.selectedWidget);
    const rotDeg = ((Math.round(w.rotation ?? 0) % 360) + 360) % 360;
    const posStyle = this.toolbarPos
      ? `left:${this.toolbarPos.x}px;top:${this.toolbarPos.y}px;transform:none;`
      : '';

    this.mount.innerHTML = `
      <div class="mobile-hud-editor-overlay">
        <div class="mobile-hud-toolbar" id="mobHudToolbar" style="${posStyle}">
          <div class="toolbar-drag-bar" id="mobToolbarDragHandle" title="Kéo để di chuyển thanh công cụ">
            <span class="toolbar-grip-pill"></span>
            <span class="toolbar-drag-hint">Kéo để di chuyển</span>
          </div>

          <div class="toolbar-row">
            <div class="tab-bar">
              <button class="tab-pill active" id="tabMob">HUD Điện thoại</button>
              <button class="tab-pill" id="tabPC">Điều khiển PC</button>
            </div>
            <div style="display:flex;gap:5px;">
              <button class="btn sm ${this.draftMobile.preset === '4-finger' ? 'primary' : ''}" data-preset="4-finger">4 Ngón</button>
              <button class="btn sm ${this.draftMobile.preset === '3-finger' ? 'primary' : ''}" data-preset="3-finger">3 Ngón</button>
              <button class="btn sm ${this.draftMobile.preset === '2-finger' ? 'primary' : ''}" data-preset="2-finger">2 Ngón</button>
            </div>
          </div>

          <div class="toolbar-row">
            <span style="font-size:11px;color:#7dd3fc;font-weight:700;">
              Đang chọn: ${MOBILE_WIDGET_LABELS[this.selectedWidget]}
            </span>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
              <label class="slider-group">
                Cỡ <input id="mobScale" type="range" min="0.7" max="1.4" step="0.05" value="${w.scale.toFixed(2)}" />
                <span>${Math.round(w.scale * 100)}%</span>
              </label>
              <label class="slider-group">
                Mờ <input id="mobOpacity" type="range" min="0.35" max="1.0" step="0.05" value="${w.opacity.toFixed(2)}" />
                <span>${Math.round(w.opacity * 100)}%</span>
              </label>
              <button
                class="btn sm btn-rotate-icon"
                id="mobRotate"
                ${canRotate ? '' : 'disabled'}
                title="${canRotate ? 'Xoay hướng cụm phím đang chọn' : 'Nút tròn không cần xoay'}"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <polyline points="21 3 21 9 15 9" />
                </svg>
                <span>Xoay${canRotate ? ` ${rotDeg}°` : ''}</span>
              </button>
              <label class="slider-group" style="cursor:pointer;">
                <input id="mobSnap" type="checkbox" ${this.draftMobile.snapGrid ? 'checked' : ''} /> Lưới
              </label>
            </div>
          </div>

          <div class="toolbar-row">
            <span style="font-size:10px;color:#94a3b8;">Kéo cụm nút trên màn hình · Bấm biểu tượng xoay để đổi hướng.</span>
            <div style="display:flex;gap:6px;">
              <button class="btn sm danger" id="mobReset">Đặt lại mẫu</button>
              <button class="btn sm" id="custCancel">Hủy</button>
              <button class="btn sm primary" id="custSave">Lưu HUD</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const toolbarEl = this.mount.querySelector<HTMLElement>('#mobHudToolbar');
    if (toolbarEl) {
      const startToolbarDrag = (e: PointerEvent) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button, input, label, select, textarea')) return;
        e.preventDefault();
        const rect = toolbarEl.getBoundingClientRect();
        this.toolbarPos = { x: rect.left, y: rect.top };
        this.toolbarDrag = {
          pointerId: e.pointerId,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
        };
        toolbarEl.style.left = `${rect.left}px`;
        toolbarEl.style.top = `${rect.top}px`;
        toolbarEl.style.transform = 'none';
        toolbarEl.classList.add('dragging');
        try {
          toolbarEl.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      };

      toolbarEl.addEventListener('pointerdown', startToolbarDrag);
      toolbarEl.addEventListener('pointermove', (e) => {
        if (!this.toolbarDrag || e.pointerId !== this.toolbarDrag.pointerId) return;
        const rect = toolbarEl.getBoundingClientRect();
        const maxX = Math.max(6, window.innerWidth - rect.width - 6);
        const maxY = Math.max(6, window.innerHeight - rect.height - 6);
        const nx = clamp(e.clientX - this.toolbarDrag.offsetX, 6, maxX);
        const ny = clamp(e.clientY - this.toolbarDrag.offsetY, 6, maxY);
        this.toolbarPos = { x: nx, y: ny };
        toolbarEl.style.left = `${nx}px`;
        toolbarEl.style.top = `${ny}px`;
      });
      toolbarEl.addEventListener('pointerup', (e) => {
        if (this.toolbarDrag && e.pointerId === this.toolbarDrag.pointerId) {
          this.toolbarDrag = null;
          toolbarEl.classList.remove('dragging');
        }
      });
      toolbarEl.addEventListener('pointercancel', () => {
        this.toolbarDrag = null;
        toolbarEl.classList.remove('dragging');
      });

      this.clampToolbarToViewport();
    }

    this.mount.querySelector('#tabPC')?.addEventListener('click', () => {
      this.activeTab = 'pc';
      this.render();
    });

    this.mount.querySelectorAll<HTMLElement>('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset as MobilePresetId;
        this.draftMobile = createMobileHUDPreset(preset);
        this.render();
      });
    });

    const scaleInput = this.mount.querySelector<HTMLInputElement>('#mobScale');
    scaleInput?.addEventListener('input', () => {
      this.draftMobile.widgets[this.selectedWidget].scale = parseFloat(scaleInput.value);
      const valSpan = scaleInput.nextElementSibling;
      if (valSpan) valSpan.textContent = `${Math.round(parseFloat(scaleInput.value) * 100)}%`;
      this.onDraftChanged(this.draftMobile, this.draftPC);
    });

    const opInput = this.mount.querySelector<HTMLInputElement>('#mobOpacity');
    opInput?.addEventListener('input', () => {
      this.draftMobile.widgets[this.selectedWidget].opacity = parseFloat(opInput.value);
      const valSpan = opInput.nextElementSibling;
      if (valSpan) valSpan.textContent = `${Math.round(parseFloat(opInput.value) * 100)}%`;
      this.onDraftChanged(this.draftMobile, this.draftPC);
    });

    this.mount.querySelector('#mobRotate')?.addEventListener('click', () => {
      this.rotateSelectedWidget();
    });

    const snapInput = this.mount.querySelector<HTMLInputElement>('#mobSnap');
    snapInput?.addEventListener('change', () => {
      this.draftMobile.snapGrid = snapInput.checked;
      this.onDraftChanged(this.draftMobile, this.draftPC);
    });

    this.mount.querySelector('#mobReset')?.addEventListener('click', () => {
      this.draftMobile = createMobileHUDPreset(this.draftMobile.preset);
      this.render();
    });
    this.mount.querySelector('#custCancel')?.addEventListener('click', () => this.onCancel());
    this.mount.querySelector('#custSave')?.addEventListener('click', () => this.onSave(this.draftMobile, this.draftPC));
  }

  private renderPCModal(): void {
    const actions = Object.keys(PC_ACTION_LABELS) as PCActionKey[];
    this.mount.innerHTML = `
      <div class="overlay">
        <div class="modal-card medium">
          <div class="modal-header">
            <div class="tab-bar">
              <button class="tab-pill" id="tabMob">HUD Điện thoại</button>
              <button class="tab-pill active" id="tabPC">Điều khiển PC</button>
            </div>
            <button class="btn sm" id="custCancelTop">Đóng</button>
          </div>
          <div class="modal-body">
            <div class="section-label" style="margin-bottom:8px;">
              <span>Gán phím tắt PC (Bấm vào phím để đổi · Tự hoán đổi nếu trùng)</span>
            </div>
            <div class="keybind-grid">
              ${actions
                .map((act) => {
                  const isListen = this.listeningAction === act;
                  return `
                    <div class="keybind-item">
                      <span>${PC_ACTION_LABELS[act]}</span>
                      <button class="keybind-btn ${isListen ? 'listening' : ''}" data-act="${act}">
                        ${isListen ? 'Nhấn phím...' : formatKeyLabel(this.draftPC.keybinds[act])}
                      </button>
                    </div>
                  `;
                })
                .join('')}
            </div>

            <div class="pc-options-grid">
              <div class="option-card">
                <div class="section-label"><span>Tiện ích chuột</span></div>
                <label class="toggle-row" style="cursor:pointer;">
                  <span>Cuộn chuột đổi Co giãn (60/100/150%)</span>
                  <input id="pcWheel" type="checkbox" ${this.draftPC.mouseWheelScale ? 'checked' : ''} />
                </label>
                <div style="font-size:11px;color:#94a3b8;">
                  Chuột trái: Tấn công / Click bay xuyên qua (Ngự Thương).<br/>
                  Chuột phải: Thu hồi / Thu mảnh dưới chuột / Hủy ngắm.
                </div>
              </div>

              <div class="option-card">
                <div class="section-label"><span>Thanh Dock &amp; Tâm ngắm PC</span></div>
                <label class="slider-group" style="justify-content:space-between;">
                  <span>Cỡ Dock PC</span>
                  <input id="pcDockScale" type="range" min="0.8" max="1.25" step="0.05" value="${this.draftPC.dockScale.toFixed(2)}" />
                  <span>${Math.round(this.draftPC.dockScale * 100)}%</span>
                </label>
                <label class="slider-group" style="justify-content:space-between;">
                  <span>Độ mờ Dock</span>
                  <input id="pcDockOp" type="range" min="0.5" max="1.0" step="0.05" value="${this.draftPC.dockOpacity.toFixed(2)}" />
                  <span>${Math.round(this.draftPC.dockOpacity * 100)}%</span>
                </label>
                <div class="seg-group" style="margin-top:4px;">
                  ${(['neon', 'minimal', 'crosshair'] as ReticleStyle[])
                    .map(
                      (st) =>
                        `<button class="seg-btn ${this.draftPC.reticleStyle === st ? 'active' : ''}" data-reticle="${st}">${
                          st === 'neon' ? 'Tâm Neon' : st === 'minimal' ? 'Tối giản' : 'Chữ thập'
                        }</button>`,
                    )
                    .join('')}
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn danger" id="pcReset">Mặc định PC</button>
            <div class="modal-actions">
              <button class="btn" id="custCancel">Hủy</button>
              <button class="btn primary" id="custSave">Lưu cài đặt</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.mount.querySelector('#tabMob')?.addEventListener('click', () => {
      this.listeningAction = null;
      this.activeTab = 'mobile';
      this.render();
    });

    this.mount.querySelectorAll<HTMLElement>('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act as PCActionKey;
        this.listeningAction = this.listeningAction === act ? null : act;
        this.render();
      });
    });

    const wheelChk = this.mount.querySelector<HTMLInputElement>('#pcWheel');
    wheelChk?.addEventListener('change', () => {
      this.draftPC.mouseWheelScale = wheelChk.checked;
      this.onDraftChanged(this.draftMobile, this.draftPC);
    });

    const dockScale = this.mount.querySelector<HTMLInputElement>('#pcDockScale');
    dockScale?.addEventListener('input', () => {
      this.draftPC.dockScale = parseFloat(dockScale.value);
      const valSpan = dockScale.nextElementSibling;
      if (valSpan) valSpan.textContent = `${Math.round(this.draftPC.dockScale * 100)}%`;
      this.onDraftChanged(this.draftMobile, this.draftPC);
    });

    const dockOp = this.mount.querySelector<HTMLInputElement>('#pcDockOp');
    dockOp?.addEventListener('input', () => {
      this.draftPC.dockOpacity = parseFloat(dockOp.value);
      const valSpan = dockOp.nextElementSibling;
      if (valSpan) valSpan.textContent = `${Math.round(this.draftPC.dockOpacity * 100)}%`;
      this.onDraftChanged(this.draftMobile, this.draftPC);
    });

    this.mount.querySelectorAll<HTMLElement>('[data-reticle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.draftPC.reticleStyle = btn.dataset.reticle as ReticleStyle;
        this.render();
      });
    });

    this.mount.querySelector('#pcReset')?.addEventListener('click', () => {
      this.listeningAction = null;
      this.draftPC = createDefaultPCConfig();
      this.render();
    });

    this.mount.querySelector('#custCancelTop')?.addEventListener('click', () => this.onCancel());
    this.mount.querySelector('#custCancel')?.addEventListener('click', () => this.onCancel());
    this.mount.querySelector('#custSave')?.addEventListener('click', () => this.onSave(this.draftMobile, this.draftPC));
  }

  private handleKeyRemap(e: KeyboardEvent): void {
    if (this.activeTab !== 'pc' || !this.listeningAction) return;
    e.preventDefault();
    e.stopPropagation();

    const k = e.key.toLowerCase();
    if (k === 'escape') {
      this.listeningAction = null;
      this.render();
      return;
    }
    if (k === 'meta' || k === 'capslock' || k === 'numlock' || k === 'scrolllock' || (k.startsWith('f') && k.length > 1)) {
      return;
    }

    const act = this.listeningAction;
    const oldKey = this.draftPC.keybinds[act];
    (Object.keys(this.draftPC.keybinds) as PCActionKey[]).forEach((other) => {
      if (other !== act && this.draftPC.keybinds[other] === k) {
        this.draftPC.keybinds[other] = oldKey;
      }
    });
    this.draftPC.keybinds[act] = k;
    this.listeningAction = null;
    this.render();
  }

  private handleCanvasDown(e: PointerEvent): void {
    if (this.activeTab !== 'mobile') return;
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const layout = this.getMobileLayout();

    // 1. Tap on Rotate Icon Handle of the currently selected widget
    const rotHandle = getRotateHandlePos(layout, this.selectedWidget);
    if (rotHandle && dist(px, py, rotHandle.cx, rotHandle.cy) <= rotHandle.r + 10) {
      this.rotateSelectedWidget();
      return;
    }

    const order: MobileWidgetId[] = [
      'cancel',
      'special',
      'form',
      'dash',
      'recall',
      'fireTabs',
      'rotCluster',
      'scaleCluster',
      'atk',
      'joy',
    ];
    for (const wid of order) {
      const b = layout.widgetBounds[wid];
      if (pointInRect(px, py, { x: b.x - 6, y: b.y - 6, w: b.w + 12, h: b.h + 12 })) {
        this.selectedWidget = wid;
        this.draggingWidget = wid;
        const cx = wid === 'atk' ? layout.atk.cx : b.x + b.w * 0.5;
        const cy = wid === 'atk' ? layout.atk.cy : b.y + b.h * 0.5;
        this.dragOffsetX = px - cx;
        this.dragOffsetY = py - cy;
        this.renderMobileOverlayToolbar();
        return;
      }
    }
  }

  private handleCanvasMove(e: PointerEvent): void {
    if (this.activeTab !== 'mobile' || !this.draggingWidget) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left - this.dragOffsetX;
    const py = e.clientY - rect.top - this.dragOffsetY;
    const layout = this.getMobileLayout();

    const usableW = Math.max(240, rect.width - layout.safeLeft - layout.safeRight);
    const usableH = Math.max(200, rect.height - layout.safeTop - layout.safeBottom);
    let nx = clamp((px - layout.safeLeft) / usableW, 0.05, 0.95);
    let ny = clamp((py - layout.safeTop) / usableH, 0.14, 0.94);

    if (this.draftMobile.snapGrid) {
      nx = Math.round(nx * 40) / 40;
      ny = Math.round(ny * 32) / 32;
    }

    this.draftMobile.widgets[this.draggingWidget].nx = nx;
    this.draftMobile.widgets[this.draggingWidget].ny = ny;
    this.onDraftChanged(this.draftMobile, this.draftPC);
  }
}
