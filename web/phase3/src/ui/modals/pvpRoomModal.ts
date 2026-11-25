import { MAX_HEX_COUNT, MIN_HEX_COUNT } from '@core/constants';
import type { FriendPresenceItem, RoomStatePayload } from '@net/protocol';

const HEX_COUNTS = Array.from({ length: MAX_HEX_COUNT - MIN_HEX_COUNT + 1 }, (_, i) => MIN_HEX_COUNT + i);

export class PvPRoomModal {
  private mount: HTMLElement;
  private room: RoomStatePayload;
  private invitableFriends: FriendPresenceItem[];
  private onSetHexCount: (count: number) => void;
  private onToggleReady: (ready: boolean) => void;
  private onStartPrep: () => void;
  private onLeaveRoom: () => void;
  private onInviteFriend?: (friendUserId: number) => void;
  private onNotify: (msg: string) => void;

  constructor(opts: {
    mount: HTMLElement;
    room: RoomStatePayload;
    invitableFriends?: FriendPresenceItem[];
    onSetHexCount: (count: number) => void;
    onToggleReady: (ready: boolean) => void;
    onStartPrep: () => void;
    onLeaveRoom: () => void;
    onInviteFriend?: (friendUserId: number) => void;
    onNotify: (msg: string) => void;
  }) {
    this.mount = opts.mount;
    this.room = opts.room;
    this.invitableFriends = opts.invitableFriends ?? [];
    this.onSetHexCount = opts.onSetHexCount;
    this.onToggleReady = opts.onToggleReady;
    this.onStartPrep = opts.onStartPrep;
    this.onLeaveRoom = opts.onLeaveRoom;
    this.onInviteFriend = opts.onInviteFriend;
    this.onNotify = opts.onNotify;
    this.render();
  }

  public update(room: RoomStatePayload, invitableFriends?: FriendPresenceItem[]): void {
    this.room = room;
    if (invitableFriends) this.invitableFriends = invitableFriends;
    this.render();
  }

  public updateInvitableFriends(invitableFriends: FriendPresenceItem[]): void {
    this.invitableFriends = invitableFriends;
    this.render();
  }

  public destroy(): void {
    this.mount.innerHTML = '';
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private render(): void {
    const r = this.room;
    const isHost = r.seat === 'player';
    const hostInitial = (r.host.name.trim()[0] || 'C').toUpperCase();
    const guestInitial = (r.guest?.name.trim()[0] || 'Đ').toUpperCase();
    const canStartPrep = isHost && !!r.guest && r.guest.roomReady;

    const ctaHtml = isHost
      ? `<button class="btn-room-cta primary" id="pvpStartPrepBtn" ${canStartPrep ? '' : 'disabled'}>
           ${!r.guest ? 'Chờ đối thủ vào phòng...' : r.guest.roomReady ? 'Bắt đầu tinh chỉnh (1 phút)' : 'Chờ đối thủ bấm Sẵn sàng...'}
         </button>`
      : `<button class="btn-room-cta ${r.guest?.roomReady ? 'ready-cancel' : 'ready-go'}" id="pvpGuestReadyBtn">
           ${r.guest?.roomReady ? 'Hủy sẵn sàng' : 'Sẵn sàng'}
         </button>`;

    this.mount.innerHTML = `
      <div class="pvp-room-screen">
        <div class="pvp-room-shell">
          <header class="pvp-room-header">
            <div class="pvp-room-head-left">
              <span class="pvp-room-kicker">PHÒNG ĐẤU 1v1</span>
              <div class="pvp-room-code-pill">
                <span>MÃ PHÒNG</span>
                <strong>${this.escapeHtml(r.code)}</strong>
              </div>
              <button class="btn sm" id="pvpRoomCopyBtn">Sao chép link mời</button>
            </div>
            <button class="btn sm danger" id="pvpRoomLeaveBtn">Rời phòng</button>
          </header>

          <div class="pvp-room-stage">
            <!-- CHỦ PHÒNG -->
            <div class="pvp-seat-card host">
              <div class="pvp-seat-top">
                <span class="pvp-seat-role host">Chủ phòng${isHost ? ' · Bạn' : ''}</span>
                <span class="pvp-ready-pill ok">Đã sẵn sàng</span>
              </div>
              <div class="pvp-seat-identity">
                <div class="pvp-seat-avatar host">${this.escapeHtml(hostInitial)}</div>
                <div class="pvp-seat-meta">
                  <div class="pvp-seat-name">${this.escapeHtml(r.host.name)}</div>
                  <div class="pvp-seat-sub">Quyền thiết lập luật phòng</div>
                </div>
              </div>
            </div>

            <div class="pvp-room-vs">VS</div>

            <!-- ĐỐI THỦ -->
            ${
              r.guest
                ? `
                  <div class="pvp-seat-card guest ${r.guest.roomReady ? 'is-ready' : ''}">
                    <div class="pvp-seat-top">
                      <span class="pvp-seat-role guest">Đối thủ${!isHost ? ' · Bạn' : ''}</span>
                      <span class="pvp-ready-pill ${r.guest.roomReady ? 'ok' : 'wait'}">
                        ${r.guest.roomReady ? 'Đã sẵn sàng' : 'Chưa sẵn sàng'}
                      </span>
                    </div>
                    <div class="pvp-seat-identity">
                      <div class="pvp-seat-avatar guest">${this.escapeHtml(guestInitial)}</div>
                      <div class="pvp-seat-meta">
                        <div class="pvp-seat-name">${this.escapeHtml(r.guest.name)}</div>
                        <div class="pvp-seat-sub">${r.guest.roomReady ? 'Đã xác nhận luật phòng' : 'Đang xem luật phòng'}</div>
                      </div>
                    </div>
                  </div>
                `
                : `
                  <div class="pvp-seat-card waiting">
                    <div class="pvp-seat-top">
                      <span class="pvp-seat-role guest">Đối thủ</span>
                      <span class="pvp-ready-pill wait">Đang chờ</span>
                    </div>
                    <div class="pvp-seat-wait-body">
                      <div class="pvp-wait-dot"></div>
                      <div class="pvp-seat-name" style="color:#94a3b8;">Chưa có đối thủ</div>
                      <div class="pvp-seat-sub">Gửi mã <strong>${this.escapeHtml(r.code)}</strong> hoặc sao chép link mời cho bạn bè.</div>
                      ${
                        isHost && this.invitableFriends.length > 0
                          ? `
                            <div class="pvp-quick-invite-wrap">
                              <span class="pvp-quick-invite-label">Mời bạn đang ở sảnh:</span>
                              <div class="pvp-quick-invite-list">
                                ${this.invitableFriends
                                  .slice(0, 6)
                                  .map(
                                    (f) =>
                                      `<button class="pvp-quick-invite-chip" data-room-invite="${f.userId}" type="button">+ ${this.escapeHtml(f.username)}</button>`,
                                  )
                                  .join('')}
                              </div>
                            </div>
                          `
                          : ''
                      }
                    </div>
                  </div>
                `
            }
          </div>

          <footer class="pvp-room-footer">
            <div class="pvp-rule-box">
              <div class="pvp-rule-head">
                <span class="pvp-rule-label">Số lượng mảnh thi đấu</span>
                <span class="pvp-rule-note">
                  ${isHost ? 'Chọn 5–10 mảnh (áp dụng cho cả 2 người)' : `Luật phòng: ${r.hexCount} mảnh · Chủ phòng thiết lập`}
                </span>
              </div>
              <div class="pvp-hex-count-bar">
                ${HEX_COUNTS.map((cnt) => {
                  const active = r.hexCount === cnt;
                  return `<button
                    class="pvp-hex-btn ${active ? 'active' : ''}"
                    data-room-hex="${cnt}"
                    ${isHost ? '' : 'disabled'}
                  >${cnt} mảnh</button>`;
                }).join('')}
              </div>
            </div>

            <div class="pvp-room-cta-wrap">
              <div class="pvp-flow-steps">
                <span class="flow-step active">1. Phòng chờ</span>
                <span class="flow-sep">→</span>
                <span class="flow-step">2. Tinh chỉnh (1 phút)</span>
                <span class="flow-sep">→</span>
                <span class="flow-step">3. Đếm ngược 3-2-1</span>
              </div>
              ${ctaHtml}
            </div>
          </footer>
        </div>
      </div>
    `;

    this.mount.querySelector('#pvpRoomCopyBtn')?.addEventListener('click', () => {
      const inviteUrl = `${window.location.origin}/?room=${this.room.code}`;
      navigator.clipboard?.writeText(inviteUrl).then(
        () => this.onNotify(`Đã sao chép link mời phòng ${this.room.code}`),
        () => this.onNotify(`Link mời: ${inviteUrl}`),
      );
    });

    this.mount.querySelector('#pvpRoomLeaveBtn')?.addEventListener('click', () => this.onLeaveRoom());

    if (isHost) {
      this.mount.querySelectorAll<HTMLElement>('[data-room-hex]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const cnt = parseInt(btn.dataset.roomHex || '7', 10);
          if (cnt !== this.room.hexCount) {
            this.onSetHexCount(cnt);
          }
        });
      });
      this.mount.querySelector('#pvpStartPrepBtn')?.addEventListener('click', () => {
        if (canStartPrep) this.onStartPrep();
      });
      this.mount.querySelectorAll<HTMLElement>('[data-room-invite]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.onInviteFriend?.(Number(btn.dataset.roomInvite));
        });
      });
    } else {
      this.mount.querySelector('#pvpGuestReadyBtn')?.addEventListener('click', () => {
        const curReady = !!this.room.guest?.roomReady;
        this.onToggleReady(!curReady);
      });
    }
  }
}
