import { listAttackModes, STANCE_META } from '@attacks/index';
import { getActiveBlueprint } from '@core/world/structure';
import type { MatchState, RotMode, ScaleTier } from '@core/types';
import type { InputMode } from '@input/inputManager';
import { formatKeyLabel, type PCControlConfig } from '@storage/profiles';
import {
  FULLSCREEN_CHANGE_EVENT,
  getViewportSize,
  isDocumentFullscreen,
  toggleFullscreenLandscape,
} from '@ui/common/fullscreen';

export class TopBarController {
  private topBarEl = document.getElementById('topBar')!;
  private playerLabelEl = document.querySelector<HTMLElement>('.hp-player .hp-label')!;
  private playerHpText = document.getElementById('playerHpText')!;
  private playerHpBar = document.getElementById('playerHpBar')!;
  private playerStanceTag = document.getElementById('playerStanceTag')!;
  private enemyLabelEl = document.querySelector<HTMLElement>('.hp-enemy .hp-label')!;
  private enemyHpText = document.getElementById('enemyHpText')!;
  private enemyHpBar = document.getElementById('enemyHpBar')!;
  private enemyStanceTag = document.getElementById('enemyStanceTag')!;
  private matchTimer = document.getElementById('matchTimer')!;
  private pingBadge = document.getElementById('pingBadge')!;
  private pcQuickPanels = document.getElementById('pcQuickPanels')!;
  private pcRotBox = document.getElementById('pcRotBox')!;
  private kbdRotHint = document.getElementById('kbdRotHint')!;
  private kbdScaleHint = document.getElementById('kbdScaleHint')!;
  private btnModeToggle = document.getElementById('btnModeToggle')!;
  private btnFullscreen = document.getElementById('btnFullscreen')!;
  private btnSound = document.getElementById('btnSound')!;
  private btnLoadout = document.getElementById('btnLoadout')!;
  private btnRestart = document.getElementById('btnRestart')!;
  private btnPlayAgain = document.getElementById('btnPlayAgain')!;
  private btnOverLoadout = document.getElementById('btnOverLoadout')!;
  private toastBanner = document.getElementById('toastBanner')!;
  private portraitHintBar = document.getElementById('portraitHintBar')!;
  private countdownOverlay = document.getElementById('matchCountdownOverlay')!;
  private countdownNumber = document.getElementById('countdownNumber')!;
  private countdownSub = document.getElementById('countdownSub')!;
  private matchOverOverlay = document.getElementById('matchOverOverlay')!;
  private matchOverTitle = document.getElementById('matchOverTitle')!;
  private matchOverDesc = document.getElementById('matchOverDesc')!;

  private toastTimeout: number | null = null;
  private countdownHideTimeout: number | null = null;
  private portraitDismissed = false;
  private onShowIOSGuide?: () => void;

  constructor(opts: {
    getState: () => MatchState;
    onOpenLobby: () => void;
    onOpenLoadout: () => void;
    onOpenCustomize: () => void;
    onOpenSettings: () => void;
    onToggleMode: () => void;
    onToggleSound: () => boolean;
    onOpenHelp: () => void;
    onShowIOSGuide?: () => void;
    onRestart: () => void;
    onSetRot: (rot: RotMode) => void;
    onSetScale: (scale: ScaleTier) => void;
  }) {
    this.onShowIOSGuide = opts.onShowIOSGuide;
    document.getElementById('btnLobby')?.addEventListener('click', opts.onOpenLobby);
    this.btnLoadout.addEventListener('click', opts.onOpenLoadout);
    document.getElementById('btnCustomize')?.addEventListener('click', opts.onOpenCustomize);
    document.getElementById('btnMatchSettings')?.addEventListener('click', opts.onOpenSettings);
    document.getElementById('btnDismissPortrait')?.addEventListener('click', () => {
      this.portraitDismissed = true;
      this.portraitHintBar.classList.add('hidden');
    });
    this.btnModeToggle.addEventListener('click', opts.onToggleMode);
    this.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
    this.btnSound.addEventListener('click', () => {
      const enabled = opts.onToggleSound();
      this.btnSound.textContent = enabled ? 'Âm: Bật' : 'Âm: Tắt';
    });
    document.getElementById('btnHelp')?.addEventListener('click', opts.onOpenHelp);
    this.btnRestart.addEventListener('click', opts.onRestart);
    this.btnPlayAgain.addEventListener('click', () => {
      opts.onRestart();
    });
    this.btnOverLoadout.addEventListener('click', () => {
      this.hideMatchOver();
      opts.onOpenLoadout();
    });
    document.getElementById('btnOverLobby')?.addEventListener('click', () => {
      this.hideMatchOver();
      opts.onOpenLobby();
    });

    document.querySelectorAll<HTMLElement>('[data-rot]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        opts.onSetRot(btn.dataset.rot as RotMode);
      });
    });

    document.querySelectorAll<HTMLElement>('[data-scale]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        opts.onSetScale(parseFloat(btn.dataset.scale || '1') as ScaleTier);
      });
    });

    document.addEventListener('fullscreenchange', () => this.syncFullscreenBtn());
    document.addEventListener('webkitfullscreenchange', () => this.syncFullscreenBtn());
    document.addEventListener(FULLSCREEN_CHANGE_EVENT, () => this.syncFullscreenBtn());
    this.syncFullscreenBtn();
  }

  public setPlayerName(name: string | null): void {
    this.playerLabelEl.textContent = name ? name.toUpperCase() : 'BẠN';
  }

  public setMatchModeLabel(isPvP: boolean, roomCode?: string | null, oppName?: string | null): void {
    const oppDisplay = oppName ? oppName.toUpperCase() : `ĐỐI THỦ · ${roomCode ?? 'PvP'}`;
    this.enemyLabelEl.textContent = isPvP ? oppDisplay : 'BOT AI';
    this.btnLoadout.classList.toggle('hidden', isPvP);
    this.btnOverLoadout.classList.toggle('hidden', isPvP);
    this.pingBadge.classList.toggle('hidden', !isPvP);
    this.btnRestart.textContent = isPvP ? 'Tái đấu' : 'Đấu lại';
    this.btnPlayAgain.textContent = isPvP ? 'Tái đấu PvP' : 'Đấu lại';
  }

  public showCountdown(value: number): void {
    if (this.countdownHideTimeout !== null) {
      window.clearTimeout(this.countdownHideTimeout);
      this.countdownHideTimeout = null;
    }
    this.countdownOverlay.classList.remove('hidden', 'go');
    if (value <= 0) {
      this.countdownOverlay.classList.add('go');
      this.countdownNumber.textContent = 'CHIẾN!';
      this.countdownSub.textContent = 'TRẬN ĐẤU BẮT ĐẦU';
      // Retrigger pop animation
      this.countdownNumber.classList.remove('pop');
      void this.countdownNumber.offsetWidth;
      this.countdownNumber.classList.add('pop');
      this.countdownHideTimeout = window.setTimeout(() => {
        this.hideCountdown();
      }, 680);
    } else {
      this.countdownNumber.textContent = String(value);
      this.countdownSub.textContent = 'CHUẨN BỊ GIAO CHIẾN';
      this.countdownNumber.classList.remove('pop');
      void this.countdownNumber.offsetWidth;
      this.countdownNumber.classList.add('pop');
    }
  }

  public hideCountdown(): void {
    if (this.countdownHideTimeout !== null) {
      window.clearTimeout(this.countdownHideTimeout);
      this.countdownHideTimeout = null;
    }
    this.countdownOverlay.classList.add('hidden');
    this.countdownOverlay.classList.remove('go');
  }

  public setPing(rttMs: number): void {
    this.pingBadge.textContent = `${rttMs} ms`;
    this.pingBadge.classList.remove('mid', 'high');
    if (rttMs >= 120) this.pingBadge.classList.add('high');
    else if (rttMs >= 60) this.pingBadge.classList.add('mid');
  }

  public setRematchStatus(readyCount: number): void {
    this.btnPlayAgain.textContent = readyCount > 0 ? `Chờ đối thủ (${readyCount}/2)...` : 'Tái đấu PvP';
  }

  public setVisible(visible: boolean): void {
    this.topBarEl.classList.toggle('hidden', !visible);
  }

  public syncMode(mode: InputMode): void {
    this.btnModeToggle.textContent = mode === 'desktop' ? 'Chế độ: PC' : 'Chế độ: Mobile';
    this.pcQuickPanels.classList.toggle('hidden-mobile', mode === 'touch');
    this.topBarEl.classList.toggle('compact-touch', mode === 'touch');
  }

  public syncPortraitHint(inLobby: boolean, mode: InputMode): void {
    const { vw, vh } = getViewportSize();
    const isPortrait = vh > vw;
    const show = !inLobby && mode === 'touch' && isPortrait && !this.portraitDismissed;
    this.portraitHintBar.classList.toggle('hidden', !show);
  }

  public syncFrame(state: MatchState, pcConfig: PCControlConfig): void {
    const { player, enemy } = state;

    this.playerHpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    this.playerHpBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
    const pBp = getActiveBlueprint(player);
    this.playerStanceTag.textContent = pBp
      ? `${pBp.name} (${STANCE_META[pBp.stance].label}) · ${Math.round(player.targetScale * 100)}%`
      : `Đơn lẻ · ${player.hexes.length} mảnh · ${Math.round(player.targetScale * 100)}%`;

    this.enemyHpText.textContent = `${Math.ceil(enemy.hp)} / ${enemy.maxHp}`;
    this.enemyHpBar.style.width = `${(enemy.hp / enemy.maxHp) * 100}%`;
    const eBp = getActiveBlueprint(enemy);
    this.enemyStanceTag.textContent = eBp
      ? `${eBp.name} (${STANCE_META[eBp.stance].label})`
      : `Đơn lẻ · ${enemy.hexes.length} mảnh`;

    const mins = Math.floor(state.timeRemaining / 60);
    const secs = Math.floor(state.timeRemaining % 60);
    this.matchTimer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    this.kbdRotHint.textContent = formatKeyLabel(pcConfig.keybinds.cycleRot);
    this.kbdScaleHint.textContent = formatKeyLabel(pcConfig.keybinds.cycleScale);
    this.pcRotBox.classList.toggle('hidden', player.form !== 'loose');

    document.querySelectorAll<HTMLElement>('[data-rot]').forEach((btn) => {
      const id = btn.dataset.rot;
      btn.classList.remove('active-cyan', 'active-amber', 'active-purple');
      if (player.rotMode === id) {
        btn.classList.add(id === 'static' ? 'active-cyan' : id === 'normal' ? 'active-amber' : 'active-purple');
      }
    });

    document.querySelectorAll<HTMLElement>('[data-scale]').forEach((btn) => {
      const val = parseFloat(btn.dataset.scale || '1');
      btn.classList.remove('active-cyan', 'active-amber', 'active-emerald');
      if (Math.abs(player.targetScale - val) < 0.05) {
        btn.classList.add(val === 0.6 ? 'active-amber' : val === 1.5 ? 'active-emerald' : 'active-cyan');
      }
    });
  }

  public showToast(msg: string): void {
    this.toastBanner.textContent = msg;
    this.toastBanner.classList.remove('hidden');
    if (this.toastTimeout !== null) window.clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => {
      this.toastBanner.classList.add('hidden');
    }, 2400);
  }

  public showMatchOver(state: MatchState, playerWon: boolean | null): void {
    this.matchOverOverlay.classList.remove('hidden');
    if (playerWon === true) {
      this.matchOverTitle.textContent = 'CHIẾN THẮNG';
      this.matchOverTitle.style.color = '#38bdf8';
    } else if (playerWon === false) {
      this.matchOverTitle.textContent = 'THẤT BẠI';
      this.matchOverTitle.style.color = '#fb7185';
    } else {
      this.matchOverTitle.textContent = 'HÒA TRẬN';
      this.matchOverTitle.style.color = '#fbbf24';
    }
    const mins = Math.floor(state.stats.elapsed / 60);
    const secs = Math.floor(state.stats.elapsed % 60);
    this.matchOverDesc.textContent = `Sát thương gây ra: ${state.stats.dmgDealt} · Mảnh địch đã phá: ${state.stats.hexBroken} · Thời gian: ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  public hideMatchOver(): void {
    this.matchOverOverlay.classList.add('hidden');
  }

  private toggleFullscreen(): void {
    void toggleFullscreenLandscape((msg) => this.showToast(msg), this.onShowIOSGuide);
  }

  private syncFullscreenBtn(): void {
    const isFs = isDocumentFullscreen();
    this.btnFullscreen.textContent = isFs ? 'Thoát FS' : 'Toàn màn hình';
    this.btnFullscreen.classList.toggle('active', isFs);
  }
}

export function renderHelpModal(mount: HTMLElement, pcConfig: PCControlConfig, onClose: () => void): void {
  const kb = pcConfig.keybinds;
  const modes = listAttackModes();
  const totalSpecials = modes.reduce((acc, m) => acc + m.specialSkills.length, 0);
  const baseDur = modes[0]?.specialSkills[0]?.dur ?? 8;
  const specialItemsHtml = modes
    .map(
      (mode) =>
        `<li><strong>${mode.label}:</strong> ${mode.specialSkills.map((s) => s.name).join(' · ')}</li>`,
    )
    .join('');

  mount.innerHTML = `
    <div class="overlay">
      <div class="modal-card medium">
        <div class="modal-header">
          <div class="modal-title">Hướng dẫn &amp; Luật chơi</div>
          <button class="btn sm" id="helpClose">Đóng</button>
        </div>
        <div class="modal-body">
          <div class="help-grid">
            <div class="help-card">
              <h4>Điều khiển PC</h4>
              <ul>
                <li><strong>${formatKeyLabel(kb.moveUp)}${formatKeyLabel(kb.moveLeft)}${formatKeyLabel(kb.moveDown)}${formatKeyLabel(kb.moveRight)}</strong>: Di chuyển · <strong>${formatKeyLabel(kb.dash)}</strong>: Lướt (3.5s)</li>
                <li><strong>${formatKeyLabel(kb.formLoose)} / ${formatKeyLabel(kb.formSlot1)} / ${formatKeyLabel(kb.formSlot2)} / ${formatKeyLabel(kb.formSlot3)}</strong> hoặc <strong>${formatKeyLabel(kb.cycleForm)}</strong>: Đổi Đơn lẻ &amp; 3 Cấu hình</li>
                <li><strong>${formatKeyLabel(kb.cycleRot)}</strong>: Đổi Xoay trục · <strong>${formatKeyLabel(kb.cycleScale)}</strong> ${pcConfig.mouseWheelScale ? '/ Cuộn chuột' : ''}: Đổi Co giãn</li>
                <li><strong>${formatKeyLabel(kb.cycleFire)}</strong>: Kiểu phóng · <strong>${formatKeyLabel(kb.selectAll)}</strong>: Chọn/Bỏ hết mảnh · <strong>${formatKeyLabel(kb.special)}</strong>: Chiêu Đặc biệt</li>
                <li><strong>Chuột trái</strong>: Đánh / Click bay qua (Ngự Thương) · <strong>Chuột phải</strong>: Thu hồi / Thu mảnh dưới chuột / Hủy ngắm</li>
              </ul>
            </div>
            <div class="help-card">
              <h4>Điều khiển Mobile</h4>
              <ul>
                <li>Vào <strong>Tùy chỉnh điều khiển</strong> để đổi nhanh mẫu <strong>4 Ngón / 3 Ngón / 2 Ngón</strong> hoặc kéo thả tự do vị trí và kích thước nút.</li>
                <li>Lia tay qua <strong>Vòng cung chọn mảnh (5–10 mảnh)</strong> để chọn nhanh; kéo nút Đánh vào vùng <strong>HỦY</strong> để hủy chiêu.</li>
              </ul>
            </div>
            <div class="help-card">
              <h4>4 Quy tắc Vật lý Va chạm</h4>
              <ul>
                <li><strong>Ưu tiên Mảnh–Mảnh:</strong> Đòn đánh không thể xuyên qua mảnh chắn để trừ máu trực tiếp.</li>
                <li><strong>Điểm tựa &amp; Chia tải:</strong> Khối đang cầm tăng +40% sức cản, +10% mỗi cạnh nối và chia 30% lực đỡ sang mảnh kề.</li>
                <li><strong>Động năng xuyên:</strong> Chặn đứng, Chặn tầng 2 hoặc Đục thủng suy hao theo tỷ lệ năng lượng dư.</li>
                <li><strong>Góc lệch &gt; 35°:</strong> Gặp cạnh vát hoặc khiên nghiêng sẽ trượt văng lệch hướng ra ngoài.</li>
              </ul>
            </div>
            <div class="help-card">
              <h4>${totalSpecials} Kỹ năng Đặc biệt (${baseDur}s · Chung hồi chiêu)</h4>
              <ul>
                ${specialItemsHtml}
              </ul>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <span style="font-size:11px;color:#94a3b8;">Hex Arena · Fixed Timestep 60Hz</span>
          <button class="btn primary" id="helpOk">Đã hiểu</button>
        </div>
      </div>
    </div>
  `;
  mount.querySelector('#helpClose')?.addEventListener('click', onClose);
  mount.querySelector('#helpOk')?.addEventListener('click', onClose);
}
