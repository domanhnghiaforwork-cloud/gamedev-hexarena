import type { Obstacle, PlayerLoadout } from '@core/types';
import type {
  ClientMsg,
  ContinuousInputPacket,
  FriendPresenceItem,
  MatchSnapshot,
  PvPAction,
  PvPInvitePayload,
  RoomStatePayload,
  ServerMsg,
} from './protocol';

export interface PvPClientCallbacks {
  onRoomCreated?: (code: string) => void;
  onRoomState: (room: RoomStatePayload) => void;
  onRoomError: (message: string) => void;
  onMatchStart: (msg: Extract<ServerMsg, { type: 'match_start' }>) => void;
  onCountdownTick: (value: number) => void;
  onSnapshot: (msg: Extract<ServerMsg, { type: 'snapshot' }>) => void;
  onRematchStatus: (readyCount: number) => void;
  onOpponentLeft: (message: string) => void;
  onDisconnected: () => void;
  onPingUpdate?: (rttMs: number) => void;
  // Social, Invite & Live Spectate
  onAuthOk?: (userId: number, username: string) => void;
  onFriendsPresenceSnapshot?: (items: FriendPresenceItem[]) => void;
  onFriendPresenceUpdate?: (item: FriendPresenceItem) => void;
  onFriendsListDirty?: () => void;
  onPvPInvite?: (invite: PvPInvitePayload) => void;
  onInviteSent?: (targetUsername: string) => void;
  onInviteDeclined?: (byUsername: string) => void;
  onInviteError?: (message: string) => void;
  onSpectateStart?: (msg: Extract<ServerMsg, { type: 'spectate_start' }>) => void;
  onSpectateSnapshot?: (msg: Extract<ServerMsg, { type: 'spectate_snapshot' }>) => void;
  onSpectateEnded?: (reason: string) => void;
  onSpectateError?: (message: string) => void;
  onViewerCountUpdate?: (count: number) => void;
  onBotStreamToggle?: (active: boolean, spectatorCount: number) => void;
}

export class PvPClient {
  private ws: WebSocket | null = null;
  private cb: PvPClientCallbacks;
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private authToken: string | null = null;
  private currentPresence: 'lobby' | 'playing_bot' = 'lobby';
  private shouldAutoReconnect = false;
  public roomCode: string | null = null;
  public connected = false;
  public rttMs = 0;

  constructor(callbacks: PvPClientCallbacks) {
    this.cb = callbacks;
  }

  private getWsUrl(): string {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldAutoReconnect || !this.authToken || this.reconnectTimer !== null) return;
    const delayMs = Math.min(5000, 1200 * (this.reconnectAttempt + 1));
    this.reconnectAttempt++;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldAutoReconnect && this.authToken) {
        void this.ensureSocket().catch(() => {
          this.scheduleReconnect();
        });
      }
    }, delayMs);
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    const sendPing = () => this.send({ type: 'ping', t: performance.now() });
    sendPing();
    this.pingTimer = window.setInterval(sendPing, 1500);
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private ensureSocket(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.ws);
    }

    if (this.ws) {
      if (this.ws.readyState === WebSocket.CONNECTING) {
        const connecting = this.ws;
        return new Promise((resolve, reject) => {
          const onOpen = () => {
            cleanup();
            resolve(connecting);
          };
          const onErr = () => {
            cleanup();
            reject(new Error('Không thể kết nối máy chủ PvP.'));
          };
          const cleanup = () => {
            connecting.removeEventListener('open', onOpen);
            connecting.removeEventListener('error', onErr);
          };
          connecting.addEventListener('open', onOpen);
          connecting.addEventListener('error', onErr);
        });
      }
      this.ws.close();
      this.ws = null;
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.getWsUrl());
      this.ws = ws;

      const timer = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          reject(new Error('Không thể kết nối máy chủ PvP (hết thời gian chờ).'));
        }
      }, 6000);

      ws.onopen = () => {
        window.clearTimeout(timer);
        this.clearReconnectTimer();
        this.reconnectAttempt = 0;
        this.connected = true;
        this.startPingLoop();
        if (this.authToken) {
          this.send({ type: 'auth_ws', token: this.authToken });
          if (this.currentPresence !== 'lobby') {
            this.send({ type: 'presence_update', status: this.currentPresence });
          }
        }
        resolve(ws);
      };

      ws.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Không thể kết nối máy chủ PvP. Hãy chắc chắn server PvP đang chạy.'));
      };

      ws.onclose = () => {
        this.stopPingLoop();
        this.connected = false;
        if (this.ws === ws) {
          this.ws = null;
          this.roomCode = null;
          this.cb.onDisconnected();
          this.scheduleReconnect();
        }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as ServerMsg;
          this.handleServerMessage(msg);
        } catch {
          // Ignore malformed packet
        }
      };
    });
  }

  private handleServerMessage(msg: ServerMsg): void {
    switch (msg.type) {
      case 'pong': {
        const sample = Math.max(1, Math.round(performance.now() - msg.t));
        this.rttMs = this.rttMs === 0 ? sample : Math.round(this.rttMs * 0.6 + sample * 0.4);
        this.cb.onPingUpdate?.(this.rttMs);
        break;
      }
      case 'room_created':
        this.roomCode = msg.code;
        this.cb.onRoomCreated?.(msg.code);
        break;
      case 'room_state':
        this.roomCode = msg.room.code;
        this.cb.onRoomState(msg.room);
        break;
      case 'room_error':
        this.cb.onRoomError(msg.message);
        break;
      case 'match_start':
        this.roomCode = msg.code;
        this.cb.onMatchStart(msg);
        break;
      case 'countdown_tick':
        this.cb.onCountdownTick(msg.value);
        break;
      case 'snapshot':
        this.cb.onSnapshot(msg);
        break;
      case 'rematch_status':
        this.cb.onRematchStatus(msg.readyCount);
        break;
      case 'opponent_left':
        this.roomCode = null;
        this.cb.onOpponentLeft(msg.message);
        break;
      case 'auth_ok':
        this.cb.onAuthOk?.(msg.userId, msg.username);
        break;
      case 'friends_presence_snapshot':
        this.cb.onFriendsPresenceSnapshot?.(msg.items);
        break;
      case 'friend_presence_update':
        this.cb.onFriendPresenceUpdate?.(msg.item);
        break;
      case 'friends_list_dirty':
        this.cb.onFriendsListDirty?.();
        break;
      case 'pvp_invite':
        this.cb.onPvPInvite?.(msg.invite);
        break;
      case 'invite_sent':
        this.cb.onInviteSent?.(msg.targetUsername);
        break;
      case 'invite_declined':
        this.cb.onInviteDeclined?.(msg.byUsername);
        break;
      case 'invite_error':
        this.cb.onInviteError?.(msg.message);
        break;
      case 'spectate_start':
        this.cb.onSpectateStart?.(msg);
        break;
      case 'spectate_snapshot':
        this.cb.onSpectateSnapshot?.(msg);
        break;
      case 'spectate_ended':
        this.cb.onSpectateEnded?.(msg.reason);
        break;
      case 'spectate_error':
        this.cb.onSpectateError?.(msg.message);
        break;
      case 'viewer_count_update':
        this.cb.onViewerCountUpdate?.(msg.count);
        break;
      case 'bot_stream_toggle':
        this.cb.onBotStreamToggle?.(msg.active, msg.spectatorCount);
        break;
    }
  }

  private send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public async connectWithToken(token: string): Promise<void> {
    this.authToken = token;
    this.shouldAutoReconnect = true;
    this.clearReconnectTimer();
    try {
      const wasOpen = this.ws && this.ws.readyState === WebSocket.OPEN;
      await this.ensureSocket();
      if (wasOpen) {
        this.send({ type: 'auth_ws', token });
        if (this.currentPresence !== 'lobby') {
          this.send({ type: 'presence_update', status: this.currentPresence });
        }
      }
    } catch {
      this.scheduleReconnect();
    }
  }

  public clearAuth(): void {
    this.authToken = null;
    this.shouldAutoReconnect = false;
    this.clearReconnectTimer();
    this.send({ type: 'logout_ws' });
    if (!this.roomCode && this.ws) {
      this.stopPingLoop();
      const s = this.ws;
      this.ws = null;
      s.close();
      this.connected = false;
      this.rttMs = 0;
    }
  }

  public setPresence(status: 'lobby' | 'playing_bot'): void {
    this.currentPresence = status;
    this.send({ type: 'presence_update', status });
  }

  public async inviteFriend(friendUserId: number, roomCode: string): Promise<void> {
    try {
      await this.ensureSocket();
      this.send({ type: 'invite_friend', friendUserId, roomCode });
    } catch (err) {
      this.cb.onInviteError?.(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ.');
    }
  }

  public declineInvite(fromUserId: number, roomCode: string): void {
    this.send({ type: 'decline_invite', fromUserId, roomCode });
  }

  public async spectateFriend(friendUserId: number): Promise<void> {
    try {
      await this.ensureSocket();
      this.send({ type: 'spectate_friend', friendUserId });
    } catch (err) {
      this.cb.onSpectateError?.(err instanceof Error ? err.message : 'Không thể kết nối máy chủ để xem trận.');
    }
  }

  public stopSpectate(): void {
    this.send({ type: 'stop_spectate' });
  }

  public sendBotStreamInit(
    selfLoadout: PlayerLoadout,
    oppLoadout: PlayerLoadout,
    obstacles: Obstacle[],
    snapshot: MatchSnapshot,
  ): void {
    this.send({ type: 'bot_stream_init', selfLoadout, oppLoadout, obstacles, snapshot });
  }

  public sendBotStreamSnapshot(snapshot: MatchSnapshot): void {
    this.send({ type: 'bot_stream_snapshot', snapshot });
  }

  public sendBotStreamEnd(reason?: string): void {
    this.send({ type: 'bot_stream_end', reason });
  }

  public async createRoom(loadout: PlayerLoadout, playerName?: string): Promise<void> {
    try {
      await this.ensureSocket();
      this.send({ type: 'create_room', loadout, playerName });
    } catch (err) {
      this.cb.onRoomError(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ PvP.');
    }
  }

  public async joinRoom(code: string, loadout: PlayerLoadout, playerName?: string): Promise<void> {
    const clean = code.trim().toUpperCase();
    if (clean.length < 3) {
      this.cb.onRoomError('Mã phòng không hợp lệ.');
      return;
    }
    try {
      await this.ensureSocket();
      this.send({ type: 'join_room', code: clean, loadout, playerName });
    } catch (err) {
      this.cb.onRoomError(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ PvP.');
    }
  }

  public setRoomHexCount(hexCount: number): void {
    this.send({ type: 'set_room_hex_count', hexCount });
  }

  public setRoomReady(ready: boolean): void {
    this.send({ type: 'room_ready', ready });
  }

  public startPrep(): void {
    this.send({ type: 'start_prep' });
  }

  public sendPrepLoadout(loadout: PlayerLoadout): void {
    this.send({ type: 'prep_update_loadout', loadout });
  }

  public setPrepReady(ready: boolean, loadout: PlayerLoadout): void {
    this.send({ type: 'prep_ready', ready, loadout });
  }

  public sendInputState(input: ContinuousInputPacket): void {
    this.send({ type: 'input_state', input });
  }

  public sendAction(action: PvPAction): void {
    this.send({ type: 'action', action });
  }

  public requestRematch(): void {
    this.send({ type: 'rematch_request' });
  }

  public leaveRoom(): void {
    this.send({ type: 'leave_room' });
    this.roomCode = null;
    if (!this.authToken) {
      this.stopPingLoop();
      if (this.ws) {
        const s = this.ws;
        this.ws = null;
        s.close();
      }
      this.connected = false;
      this.rttMs = 0;
    }
  }
}
