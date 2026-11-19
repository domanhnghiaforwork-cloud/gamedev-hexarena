import type { InputMode } from '@input/inputManager';
import type { AuthUser } from '@net/authClient';

export class AuthModal {
  private mount: HTMLElement;
  private tab: 'login' | 'register';
  private errorMsg: string | null = null;
  private busy = false;
  private usernameDraft = '';

  private onLogin: (username: string, password: string) => Promise<string | null>;
  private onRegister: (username: string, password: string) => Promise<string | null>;
  private onClose: () => void;

  constructor(opts: {
    mount: HTMLElement;
    initialTab?: 'login' | 'register';
    onLogin: (username: string, password: string) => Promise<string | null>;
    onRegister: (username: string, password: string) => Promise<string | null>;
    onClose: () => void;
  }) {
    this.mount = opts.mount;
    this.tab = opts.initialTab ?? 'login';
    this.onLogin = opts.onLogin;
    this.onRegister = opts.onRegister;
    this.onClose = opts.onClose;
    this.render();
  }

  public destroy(): void {
    this.mount.innerHTML = '';
  }

  private render(): void {
    const isReg = this.tab === 'register';
    this.mount.innerHTML = `
      <div class="overlay">
        <div class="modal-card compact-auth">
          <div class="modal-header">
            <div class="modal-title">${isReg ? 'Đăng ký tài khoản' : 'Đăng nhập'}</div>
            <button class="btn sm" id="authClose">Đóng</button>
          </div>
          <div class="modal-body">
            <div class="lobby-mode-tabs" style="margin-bottom:14px;">
              <button class="lobby-mode-tab ${!isReg ? 'active' : ''}" data-auth-tab="login">Đăng nhập</button>
              <button class="lobby-mode-tab ${isReg ? 'active' : ''}" data-auth-tab="register">Đăng ký</button>
            </div>

            ${this.errorMsg ? `<div class="pvp-error-msg" style="margin-bottom:10px;">${this.escapeHtml(this.errorMsg)}</div>` : ''}

            <form id="authForm" class="auth-form">
              <div class="field-group">
                <label class="field-label" for="authUser">Tên đăng nhập</label>
                <input id="authUser" class="text-input auth-input" autocomplete="username" maxlength="20" placeholder="VD: player_01" value="${this.escapeHtml(this.usernameDraft)}" required />
              </div>
              <div class="field-group">
                <label class="field-label" for="authPass">Mật khẩu</label>
                <input id="authPass" type="password" class="text-input auth-input" autocomplete="${isReg ? 'new-password' : 'current-password'}" maxlength="64" placeholder="Tối thiểu 4 ký tự" required />
              </div>
              ${
                isReg
                  ? `
                <div class="field-group">
                  <label class="field-label" for="authPass2">Nhập lại mật khẩu</label>
                  <input id="authPass2" type="password" class="text-input auth-input" autocomplete="new-password" maxlength="64" placeholder="Xác nhận mật khẩu" required />
                </div>
              `
                  : ''
              }
              <p class="auth-note">
                ${
                  isReg
                    ? 'Bộ vũ khí bạn đang lắp hiện tại sẽ tự động được lưu vào tài khoản mới.'
                    : 'Đăng nhập để đồng bộ bộ cấu hình vũ khí của riêng bạn giữa PC và Điện thoại.'
                }
              </p>
              <button type="submit" class="btn-play-primary auth-submit" ${this.busy ? 'disabled' : ''}>
                ${this.busy ? 'Đang xử lý...' : isReg ? 'Tạo tài khoản' : 'Đăng nhập'}
              </button>
            </form>
          </div>
        </div>
      </div>
    `;

    this.mount.querySelector('#authClose')?.addEventListener('click', () => this.onClose());
    this.mount.querySelectorAll<HTMLElement>('[data-auth-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userEl = this.mount.querySelector<HTMLInputElement>('#authUser');
        if (userEl) this.usernameDraft = userEl.value;
        this.tab = btn.dataset.authTab as 'login' | 'register';
        this.errorMsg = null;
        this.render();
      });
    });

    const form = this.mount.querySelector<HTMLFormElement>('#authForm');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (this.busy) return;
      const u = this.mount.querySelector<HTMLInputElement>('#authUser')?.value.trim() || '';
      const p = this.mount.querySelector<HTMLInputElement>('#authPass')?.value || '';
      this.usernameDraft = u;

      if (isReg) {
        const p2 = this.mount.querySelector<HTMLInputElement>('#authPass2')?.value || '';
        if (p !== p2) {
          this.errorMsg = 'Mật khẩu xác nhận không khớp.';
          this.render();
          return;
        }
      }

      this.busy = true;
      this.errorMsg = null;
      this.render();

      const err = isReg ? await this.onRegister(u, p) : await this.onLogin(u, p);
      if (err) {
        this.busy = false;
        this.errorMsg = err;
        this.render();
      }
    });
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

export function renderSettingsModal(opts: {
  mount: HTMLElement;
  user: AuthUser | null;
  mode: InputMode;
  soundEnabled: boolean;
  onOpenControls: () => void;
  onToggleMode: () => void;
  onToggleSound: () => void;
  onOpenHelp: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  onClose: () => void;
}): void {
  opts.mount.innerHTML = `
    <div class="overlay">
      <div class="modal-card compact-auth">
        <div class="modal-header">
          <div class="modal-title">Cài đặt</div>
          <button class="btn sm" id="setClose">Đóng</button>
        </div>
        <div class="modal-body">
          <div class="settings-list">
            <div class="settings-row">
              <div>
                <div class="settings-name">Tùy chỉnh điều khiển</div>
                <div class="settings-sub">Gán phím tắt PC, cỡ Dock &amp; kéo thả HUD Mobile (4/3/2 ngón)</div>
              </div>
              <button class="btn sm primary" id="setControls">Mở</button>
            </div>

            <div class="settings-row">
              <div>
                <div class="settings-name">Chế độ thiết bị</div>
                <div class="settings-sub">Đang dùng: <strong>${opts.mode === 'desktop' ? 'Máy tính (PC)' : 'Điện thoại (Mobile)'}</strong></div>
              </div>
              <button class="btn sm" id="setMode">Đổi sang ${opts.mode === 'desktop' ? 'Mobile' : 'PC'}</button>
            </div>

            <div class="settings-row">
              <div>
                <div class="settings-name">Âm thanh hiệu ứng</div>
                <div class="settings-sub">Trạng thái: <strong>${opts.soundEnabled ? 'Đang bật' : 'Đang tắt'}</strong></div>
              </div>
              <button class="btn sm" id="setSound">${opts.soundEnabled ? 'Tắt âm' : 'Bật âm'}</button>
            </div>

            <div class="settings-row">
              <div>
                <div class="settings-name">Hướng dẫn &amp; Luật chơi</div>
                <div class="settings-sub">4 Quy tắc Vật lý Va chạm &amp; 4 Kỹ năng Đặc biệt</div>
              </div>
              <button class="btn sm" id="setHelp">Xem</button>
            </div>

            <div class="settings-row">
              <div>
                <div class="settings-name">Tài khoản lưu vũ khí</div>
                <div class="settings-sub">${
                  opts.user
                    ? `Đang đăng nhập: <strong>${opts.user.username}</strong>`
                    : 'Đang chơi dạng Khách (chỉ lưu trên trình duyệt này)'
                }</div>
              </div>
              ${
                opts.user
                  ? '<button class="btn sm danger" id="setLogout">Đăng xuất</button>'
                  : '<button class="btn sm primary" id="setAuth">Đăng nhập</button>'
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  opts.mount.querySelector('#setClose')?.addEventListener('click', opts.onClose);
  opts.mount.querySelector('#setControls')?.addEventListener('click', opts.onOpenControls);
  opts.mount.querySelector('#setMode')?.addEventListener('click', opts.onToggleMode);
  opts.mount.querySelector('#setSound')?.addEventListener('click', opts.onToggleSound);
  opts.mount.querySelector('#setHelp')?.addEventListener('click', opts.onOpenHelp);
  opts.mount.querySelector('#setAuth')?.addEventListener('click', opts.onOpenAuth);
  opts.mount.querySelector('#setLogout')?.addEventListener('click', opts.onLogout);
}
