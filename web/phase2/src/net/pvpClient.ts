import type { PlayerLoadout } from '@core/types';
import type { ClientMsg, ContinuousInputPacket, PvPAction, RoomStatePayload, ServerMsg } from './protocol';

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
}

export class PvPClient {
  private ws: WebSocket | null = null;
  private cb: PvPClientCallbacks;
  private pingTimer: number | null = null;
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
        this.connected = true;
        this.startPingLoop();
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
    }
  }

  private send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
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
    this.stopPingLoop();
    this.send({ type: 'leave_room' });
    this.roomCode = null;
    if (this.ws) {
      const s = this.ws;
      this.ws = null;
      s.close();
    }
    this.connected = false;
    this.rttMs = 0;
  }
}
