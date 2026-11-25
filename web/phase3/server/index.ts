import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { performance } from 'node:perf_hooks';
import { WebSocketServer, WebSocket } from 'ws';
import { resizeLoadoutHexCount, sanitizeLoadout } from '../src/core/world/blueprint';
import { UserStore } from './db';
import { applyHexDurabilityLoss } from '../src/core/physics/combat';
import { FIXED_DT, MAX_HEX_COUNT, MIN_HEX_COUNT, PLAYER_MOVE_SPEED } from '../src/core/constants';
import { clamp } from '../src/core/math/hexMath';
import { createMatchState, stepSimulation } from '../src/core/physics/simulation';
import {
  clearGuidedWaypoint,
  executeFighterAttack,
  executeFighterDash,
  issueGuidedWaypoint,
  recallSpecificHex,
  setFighterForm,
  setFighterRotMode,
  setFighterScale,
  toggleSelectAllHexes,
  triggerFighterSpecial,
  triggerSmartRecall,
} from '../src/core/attacks/index';
import type { Fighter, GuidedSteerInput, MatchState, PlayerLoadout, SimEvent } from '../src/core/types';
import {
  buildSeatSnapshot,
  type ClientMsg,
  type ContinuousInputPacket,
  type PvPAction,
  type RoomPhase,
  type RoomStatePayload,
  type SeatId,
  type ServerMsg,
} from '../src/net/protocol';

const PORT = Number(process.env.PVP_PORT || 3001);
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PREP_DURATION_MS = 60_000;
const COUNTDOWN_DURATION_SEC = 3.0;
const userStore = new UserStore();

interface PeerSlot {
  ws: WebSocket;
  seat: SeatId;
  name: string;
  loadout: PlayerLoadout;
  input: ContinuousInputPacket;
  lastAckSeq: number;
  roomReady: boolean;
  prepReady: boolean;
  rematchReady: boolean;
}

interface Room {
  code: string;
  phase: RoomPhase;
  hexCount: number;
  prepEndsAt: number;
  lastPrepBroadcastSec: number;
  countdownRemaining: number;
  lastCountdownInt: number;
  host: PeerSlot;
  guest: PeerSlot | null;
  state: MatchState | null;
  tick: number;
  pendingEvents: SimEvent[];
  createdAt: number;
}

const rooms = new Map<string, Room>();
const peerRoomMap = new Map<WebSocket, { room: Room; seat: SeatId }>();

function defaultInput(): ContinuousInputPacket {
  return {
    seq: 0,
    mx: 0,
    my: 0,
    facing: 0,
    aimAngle: 0,
    aimStrength: 0,
    isAiming: false,
    isAimingDash: false,
    dashAimAngle: 0,
    guidedInput: {
      mode: 'desktop',
      touchHoldingAttack: false,
      touchAimAngle: 0,
      touchAimStrength: 0,
      desktopHoldingGuided: false,
    },
  };
}

function sendMsg(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function generateRoomCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

function enforceRoomLoadout(rawLoadout: unknown, hexCount: number): PlayerLoadout {
  const clean = sanitizeLoadout(rawLoadout);
  const clampedCount = clamp(Math.round(hexCount), MIN_HEX_COUNT, MAX_HEX_COUNT);
  return clean.hexMaterials.length === clampedCount ? clean : resizeLoadoutHexCount(clean, clampedCount);
}

function sanitizePlayerName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim().slice(0, 20);
  return trimmed.length > 0 ? trimmed : fallback;
}

function buildRoomStatePayload(room: Room, seat: SeatId, nowWall = Date.now()): RoomStatePayload {
  const prepRemainingSec =
    room.phase === 'prep' ? Math.max(0, Math.ceil((room.prepEndsAt - nowWall) / 1000)) : 0;
  return {
    code: room.code,
    seat,
    phase: room.phase,
    hexCount: room.hexCount,
    prepRemainingSec,
    countdownSec: room.phase === 'countdown' ? Math.max(0, Math.ceil(room.countdownRemaining)) : 0,
    host: {
      name: room.host.name,
      connected: room.host.ws.readyState === WebSocket.OPEN,
      roomReady: room.host.roomReady,
      prepReady: room.host.prepReady,
    },
    guest: room.guest
      ? {
          name: room.guest.name,
          connected: room.guest.ws.readyState === WebSocket.OPEN,
          roomReady: room.guest.roomReady,
          prepReady: room.guest.prepReady,
        }
      : null,
  };
}

function broadcastRoomState(room: Room, nowWall = Date.now()): void {
  sendMsg(room.host.ws, {
    type: 'room_state',
    room: buildRoomStatePayload(room, 'player', nowWall),
  });
  if (room.guest) {
    sendMsg(room.guest.ws, {
      type: 'room_state',
      room: buildRoomStatePayload(room, 'enemy', nowWall),
    });
  }
}

function startPrepPhase(room: Room): void {
  if (!room.guest) return;
  room.phase = 'prep';
  const nowWall = Date.now();
  room.prepEndsAt = nowWall + PREP_DURATION_MS;
  room.lastPrepBroadcastSec = 60;
  room.host.prepReady = false;
  room.guest.prepReady = false;
  room.host.loadout = enforceRoomLoadout(room.host.loadout, room.hexCount);
  room.guest.loadout = enforceRoomLoadout(room.guest.loadout, room.hexCount);
  broadcastRoomState(room, nowWall);
}

function startRoomMatch(room: Room): void {
  if (!room.guest) return;
  room.host.loadout = enforceRoomLoadout(room.host.loadout, room.hexCount);
  room.guest.loadout = enforceRoomLoadout(room.guest.loadout, room.hexCount);
  room.host.rematchReady = false;
  room.guest.rematchReady = false;
  room.host.lastAckSeq = room.host.input.seq;
  room.guest.lastAckSeq = room.guest.input.seq;
  room.tick = 0;
  room.pendingEvents = [];
  room.phase = 'countdown';
  room.countdownRemaining = COUNTDOWN_DURATION_SEC;
  room.lastCountdownInt = 3;

  const state = createMatchState(room.host.loadout, room.guest.loadout, Math.random, false);
  room.state = state;
  const now = performance.now();

  const hostSnap = buildSeatSnapshot(state, 'player', 0, now, room.host.lastAckSeq, []);
  const guestSnap = buildSeatSnapshot(state, 'enemy', 0, now, room.guest.lastAckSeq, []);

  sendMsg(room.host.ws, {
    type: 'match_start',
    code: room.code,
    seat: 'player',
    selfLoadout: room.host.loadout,
    oppLoadout: room.guest.loadout,
    obstacles: state.obstacles,
    snapshot: hostSnap,
    countdownSec: 3,
    hostName: room.host.name,
    guestName: room.guest.name,
  });

  sendMsg(room.guest.ws, {
    type: 'match_start',
    code: room.code,
    seat: 'enemy',
    selfLoadout: room.guest.loadout,
    oppLoadout: room.host.loadout,
    obstacles: state.obstacles,
    snapshot: guestSnap,
    countdownSec: 3,
    hostName: room.host.name,
    guestName: room.guest.name,
  });

  sendMsg(room.host.ws, { type: 'countdown_tick', value: 3 });
  sendMsg(room.guest.ws, { type: 'countdown_tick', value: 3 });
}

function applyContinuousInput(fighter: Fighter, peer: PeerSlot, dt: number): GuidedSteerInput {
  const input = peer.input;
  peer.lastAckSeq = input.seq;

  const mLen = Math.hypot(input.mx, input.my);
  if (mLen > 0.04) {
    const norm = Math.min(1, mLen);
    fighter.vx = (input.mx / mLen) * PLAYER_MOVE_SPEED * norm;
    fighter.vy = (input.my / mLen) * PLAYER_MOVE_SPEED * norm;
  } else {
    fighter.vx = 0;
    fighter.vy = 0;
  }

  fighter.isAiming = input.isAiming;
  fighter.aimAngle = input.aimAngle;
  fighter.aimStrength = clamp(input.aimStrength, 0, 1);
  fighter.isAimingDash = input.isAimingDash;
  fighter.dashAimAngle = input.dashAimAngle;

  if (fighter.specialActive?.type === 'defense') {
    let diff = (input.facing - fighter.facing + Math.PI) % (Math.PI * 2);
    if (diff < 0) diff += Math.PI * 2;
    diff -= Math.PI;
    fighter.facing += clamp(diff, -3.4 * dt, 3.4 * dt);
  } else if (!fighter.attackAnim || fighter.attackAnim.type === 'ranged') {
    fighter.facing = input.facing;
  }

  return input.guidedInput;
}

function applyAction(state: MatchState, fighter: Fighter, action: PvPAction): void {
  switch (action.kind) {
    case 'set_form':
      setFighterForm(state, fighter, action.form);
      break;
    case 'set_scale':
      setFighterScale(state, fighter, action.scale);
      break;
    case 'set_rot':
      setFighterRotMode(state, fighter, action.rotMode);
      break;
    case 'set_fire_mode':
      if (fighter.form === 'loose') {
        fighter.fireMode = action.fireMode;
      }
      break;
    case 'set_hex_selected': {
      const hex = fighter.hexes[action.hexId];
      if (hex && hex.state !== 'BROKEN') {
        hex.selected = action.selected;
      }
      break;
    }
    case 'select_all':
      toggleSelectAllHexes(state, fighter);
      break;
    case 'attack':
      executeFighterAttack(state, fighter, action.angle, action.strength, applyHexDurabilityLoss);
      break;
    case 'dash':
      executeFighterDash(state, fighter, action.angle);
      break;
    case 'special':
      triggerFighterSpecial(state, fighter, applyHexDurabilityLoss);
      break;
    case 'smart_recall':
      triggerSmartRecall(state, fighter);
      break;
    case 'recall_hex': {
      const hex = fighter.hexes[action.hexId];
      if (hex) recallSpecificHex(state, fighter, hex);
      break;
    }
    case 'guided_waypoint':
      issueGuidedWaypoint(state, fighter, action.wx, action.wy, action.withRipple);
      break;
    case 'guided_clear':
      clearGuidedWaypoint(state, fighter);
      break;
  }
}

function cleanupPeer(ws: WebSocket): void {
  const entry = peerRoomMap.get(ws);
  if (!entry) return;
  peerRoomMap.delete(ws);

  const { room, seat } = entry;
  // If Guest leaves while still in the Room Lobby, keep Host's room open!
  if (seat === 'enemy' && room.phase === 'room') {
    room.guest = null;
    if (room.host.ws.readyState === WebSocket.OPEN) {
      broadcastRoomState(room);
    } else {
      rooms.delete(room.code);
    }
    return;
  }

  const other = seat === 'player' ? room.guest : room.host;
  if (other && other.ws.readyState === WebSocket.OPEN) {
    peerRoomMap.delete(other.ws);
    sendMsg(other.ws, {
      type: 'opponent_left',
      message: seat === 'player' ? 'Chủ phòng đã đóng phòng đấu.' : 'Đối thủ đã rời phòng đấu.',
    });
  }
  rooms.delete(room.code);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > 256 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function getBearerUser(req: IncomingMessage): { uid: number; username: string } | null {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  return userStore.verifyToken(auth.slice(7).trim());
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0];
  const method = req.method || 'GET';

  try {
    if (method === 'POST' && url === '/api/auth/register') {
      const body = await readJsonBody(req);
      const result = userStore.register(
        String(body.username || ''),
        String(body.password || ''),
        body.loadout,
        body.mobileHud,
        body.pcControls,
        body.cosmetics,
      );
      if (!result.ok) {
        sendJson(res, 400, { error: result.error });
        return;
      }
      sendJson(res, 200, { token: result.token, user: result.user });
      return;
    }

    if (method === 'POST' && url === '/api/auth/login') {
      const body = await readJsonBody(req);
      const result = userStore.login(String(body.username || ''), String(body.password || ''));
      if (!result.ok) {
        sendJson(res, 401, { error: result.error });
        return;
      }
      sendJson(res, 200, { token: result.token, user: result.user });
      return;
    }

    if (method === 'GET' && url === '/api/auth/me') {
      const claim = getBearerUser(req);
      if (!claim) {
        sendJson(res, 401, { error: 'Chưa đăng nhập.' });
        return;
      }
      const user = userStore.getById(claim.uid);
      if (!user) {
        sendJson(res, 401, { error: 'Tài khoản không tồn tại.' });
        return;
      }
      sendJson(res, 200, { user });
      return;
    }

    if (method === 'PUT' && url === '/api/loadout') {
      const claim = getBearerUser(req);
      if (!claim) {
        sendJson(res, 401, { error: 'Chưa đăng nhập.' });
        return;
      }
      const body = await readJsonBody(req);
      const saved = userStore.updateLoadout(claim.uid, body.loadout);
      if (!saved) {
        sendJson(res, 404, { error: 'Không tìm thấy tài khoản.' });
        return;
      }
      sendJson(res, 200, { loadout: saved });
      return;
    }

    if (method === 'PUT' && url === '/api/controls') {
      const claim = getBearerUser(req);
      if (!claim) {
        sendJson(res, 401, { error: 'Chưa đăng nhập.' });
        return;
      }
      const body = await readJsonBody(req);
      const saved = userStore.updateControls(claim.uid, body.mobileHud, body.pcControls);
      if (!saved) {
        sendJson(res, 404, { error: 'Không tìm thấy tài khoản.' });
        return;
      }
      sendJson(res, 200, saved);
      return;
    }

    if (method === 'PUT' && url === '/api/cosmetics') {
      const claim = getBearerUser(req);
      if (!claim) {
        sendJson(res, 401, { error: 'Chưa đăng nhập.' });
        return;
      }
      const body = await readJsonBody(req);
      const saved = userStore.updateCosmetics(claim.uid, body.cosmetics);
      if (!saved) {
        sendJson(res, 404, { error: 'Không tìm thấy tài khoản.' });
        return;
      }
      sendJson(res, 200, { cosmetics: saved });
      return;
    }

    sendJson(res, 200, { ok: true, activeRooms: rooms.size });
  } catch {
    sendJson(res, 400, { error: 'Dữ liệu yêu cầu không hợp lệ.' });
  }
});

// Disable Nagle algorithm on every TCP connection -> zero 40ms packet-coalescing lag!
server.on('connection', (socket: Socket) => {
  socket.setNoDelay(true);
});

interface AliveWebSocket extends WebSocket {
  isAlive?: boolean;
}

const wss = new WebSocketServer({
  server,
  path: '/ws',
  perMessageDeflate: false, // Zero compression latency on tiny real-time packets
});

wss.on('connection', (ws: AliveWebSocket, req) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  req.socket?.setNoDelay?.(true);

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw)) as ClientMsg;
    } catch {
      return;
    }

    if (msg.type === 'ping') {
      sendMsg(ws, { type: 'pong', t: msg.t });
      return;
    }

    if (msg.type === 'create_room') {
      cleanupPeer(ws);
      const code = generateRoomCode();
      const loadout = sanitizeLoadout(msg.loadout);
      const hexCount = clamp(loadout.hexMaterials.length, MIN_HEX_COUNT, MAX_HEX_COUNT);
      const host: PeerSlot = {
        ws,
        seat: 'player',
        name: sanitizePlayerName(msg.playerName, 'Chủ phòng'),
        loadout,
        input: defaultInput(),
        lastAckSeq: 0,
        roomReady: true,
        prepReady: false,
        rematchReady: false,
      };
      const room: Room = {
        code,
        phase: 'room',
        hexCount,
        prepEndsAt: 0,
        lastPrepBroadcastSec: 0,
        countdownRemaining: 0,
        lastCountdownInt: 0,
        host,
        guest: null,
        state: null,
        tick: 0,
        pendingEvents: [],
        createdAt: Date.now(),
      };
      rooms.set(code, room);
      peerRoomMap.set(ws, { room, seat: 'player' });
      sendMsg(ws, { type: 'room_created', code });
      broadcastRoomState(room);
      return;
    }

    if (msg.type === 'join_room') {
      cleanupPeer(ws);
      const code = String(msg.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        sendMsg(ws, { type: 'room_error', message: `Không tìm thấy phòng "${code}".` });
        return;
      }
      if (room.guest || room.phase !== 'room') {
        sendMsg(ws, { type: 'room_error', message: `Phòng "${code}" đã đủ 2 người hoặc đang thi đấu.` });
        return;
      }
      const loadout = enforceRoomLoadout(msg.loadout, room.hexCount);
      room.guest = {
        ws,
        seat: 'enemy',
        name: sanitizePlayerName(msg.playerName, 'Đối thủ'),
        loadout,
        input: defaultInput(),
        lastAckSeq: 0,
        roomReady: false,
        prepReady: false,
        rematchReady: false,
      };
      peerRoomMap.set(ws, { room, seat: 'enemy' });
      broadcastRoomState(room);
      return;
    }

    if (msg.type === 'leave_room') {
      cleanupPeer(ws);
      return;
    }

    const entry = peerRoomMap.get(ws);
    if (!entry) return;
    const { room, seat } = entry;
    const peer = seat === 'player' ? room.host : room.guest;
    if (!peer) return;

    if (msg.type === 'set_room_hex_count') {
      if (seat !== 'player' || room.phase !== 'room') return;
      const nextCount = clamp(Math.round(Number(msg.hexCount) || 7), MIN_HEX_COUNT, MAX_HEX_COUNT);
      if (nextCount !== room.hexCount) {
        room.hexCount = nextCount;
        room.host.loadout = enforceRoomLoadout(room.host.loadout, nextCount);
        if (room.guest) {
          room.guest.loadout = enforceRoomLoadout(room.guest.loadout, nextCount);
          room.guest.roomReady = false;
        }
        broadcastRoomState(room);
      }
      return;
    }

    if (msg.type === 'room_ready') {
      if (seat !== 'enemy' || room.phase !== 'room' || !room.guest) return;
      room.guest.roomReady = !!msg.ready;
      broadcastRoomState(room);
      return;
    }

    if (msg.type === 'start_prep') {
      if (seat !== 'player' || room.phase !== 'room') return;
      if (!room.guest || !room.guest.roomReady) {
        sendMsg(ws, { type: 'room_error', message: 'Cần đối thủ vào phòng và bấm Sẵn sàng trước.' });
        return;
      }
      startPrepPhase(room);
      return;
    }

    if (msg.type === 'prep_update_loadout') {
      if (room.phase !== 'prep') return;
      peer.loadout = enforceRoomLoadout(msg.loadout, room.hexCount);
      return;
    }

    if (msg.type === 'prep_ready') {
      if (room.phase !== 'prep' || !room.guest) return;
      peer.loadout = enforceRoomLoadout(msg.loadout, room.hexCount);
      peer.prepReady = !!msg.ready;
      if (room.host.prepReady && room.guest.prepReady) {
        startRoomMatch(room);
      } else {
        broadcastRoomState(room);
      }
      return;
    }

    if (msg.type === 'input_state') {
      if (msg.input.seq >= peer.input.seq) {
        peer.input = msg.input;
      }
      return;
    }

    if (msg.type === 'action' && room.state && room.phase === 'playing') {
      const fighter = seat === 'player' ? room.state.player : room.state.enemy;
      applyAction(room.state, fighter, msg.action);
      if (room.state.events.length > 0) {
        room.pendingEvents.push(...room.state.events.splice(0, room.state.events.length));
      }
      return;
    }

    if (msg.type === 'rematch_request' && room.guest && room.phase === 'playing') {
      peer.rematchReady = true;
      const readyCount = (room.host.rematchReady ? 1 : 0) + (room.guest.rematchReady ? 1 : 0);
      if (readyCount === 2) {
        startRoomMatch(room);
      } else {
        sendMsg(room.host.ws, { type: 'rematch_status', readyCount });
        sendMsg(room.guest.ws, { type: 'rematch_status', readyCount });
      }
    }
  });

  ws.on('close', () => cleanupPeer(ws));
  ws.on('error', () => cleanupPeer(ws));
});

// High-precision Fixed-Timestep 60Hz Accumulator Loop (eliminates Windows setInterval timer wobble!)
let lastServerMs = performance.now();
let serverAccumSec = 0;

function tickServerLoop(): void {
  const nowPerf = performance.now();
  const elapsedSec = Math.min(0.1, Math.max(0, (nowPerf - lastServerMs) / 1000));
  lastServerMs = nowPerf;
  serverAccumSec += elapsedSec;

  const nowWall = Date.now();
  let steps = 0;
  while (serverAccumSec >= FIXED_DT && steps < 4) {
    serverAccumSec -= FIXED_DT;
    steps++;

    const snapTime = performance.now();
    for (const room of rooms.values()) {
      if (!room.guest && nowWall - room.createdAt > 30 * 60 * 1000) {
        cleanupPeer(room.host.ws);
        continue;
      }

      // 1-minute Prep Phase authoritative timer
      if (room.phase === 'prep' && room.guest) {
        const remSec = Math.max(0, Math.ceil((room.prepEndsAt - nowWall) / 1000));
        if (nowWall >= room.prepEndsAt) {
          startRoomMatch(room);
        } else if (remSec !== room.lastPrepBroadcastSec) {
          room.lastPrepBroadcastSec = remSec;
          broadcastRoomState(room, nowWall);
        }
        continue;
      }

      // 3-2-1 Pre-Match Countdown (fighters visible on arena, combat frozen until 0!)
      if (room.phase === 'countdown' && room.state && room.guest) {
        room.countdownRemaining = Math.max(0, room.countdownRemaining - FIXED_DT);
        const curInt = Math.ceil(room.countdownRemaining);
        if (room.countdownRemaining <= 0) {
          room.phase = 'playing';
          room.lastCountdownInt = 0;
          sendMsg(room.host.ws, { type: 'countdown_tick', value: 0 });
          sendMsg(room.guest.ws, { type: 'countdown_tick', value: 0 });
        } else if (curInt < room.lastCountdownInt && curInt >= 1) {
          room.lastCountdownInt = curInt;
          sendMsg(room.host.ws, { type: 'countdown_tick', value: curInt });
          sendMsg(room.guest.ws, { type: 'countdown_tick', value: curInt });
        }
        continue;
      }

      if (room.phase !== 'playing' || !room.state || !room.guest) continue;

      const hostGuided = applyContinuousInput(room.state.player, room.host, FIXED_DT);
      const guestGuided = applyContinuousInput(room.state.enemy, room.guest, FIXED_DT);

      stepSimulation(room.state, FIXED_DT, hostGuided, undefined, guestGuided);
      room.tick++;

      if (room.state.events.length > 0) {
        room.pendingEvents.push(...room.state.events.splice(0, room.state.events.length));
      }

      // Broadcast lean snapshots at full 60Hz (zero trail bloat + TCP_NODELAY -> ultra-smooth!)
      const batchEvents = room.pendingEvents.splice(0, room.pendingEvents.length);
      sendMsg(room.host.ws, {
        type: 'snapshot',
        snapshot: buildSeatSnapshot(room.state, 'player', room.tick, snapTime, room.host.lastAckSeq, batchEvents),
      });
      sendMsg(room.guest.ws, {
        type: 'snapshot',
        snapshot: buildSeatSnapshot(room.state, 'enemy', room.tick, snapTime, room.guest.lastAckSeq, batchEvents),
      });
    }
  }

  // Schedule next poll tightly (~4ms sleep) for crisp 60Hz cadence on Windows
  const remainingMs = Math.max(1, (FIXED_DT - serverAccumSec) * 1000);
  setTimeout(tickServerLoop, Math.min(4, Math.floor(remainingMs)));
}

// Clean up dead half-open WebSocket connections (e.g. mobile Safari backgrounded or dropped Wi-Fi)
setInterval(() => {
  for (const client of wss.clients as Set<AliveWebSocket>) {
    if (client.isAlive === false) {
      cleanupPeer(client);
      client.terminate();
      continue;
    }
    client.isAlive = false;
    try {
      client.ping();
    } catch {
      cleanupPeer(client);
      client.terminate();
    }
  }
}, 25_000);

server.listen(PORT, () => {
  console.log(`[HexArena PvP Server] High-precision 60Hz Authoritative WS (TCP_NODELAY) on ws://localhost:${PORT}/ws`);
  tickServerLoop();
});
