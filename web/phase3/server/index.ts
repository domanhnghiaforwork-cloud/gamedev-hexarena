import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { performance } from 'node:perf_hooks';
import { WebSocketServer, WebSocket } from 'ws';
import { resizeLoadoutHexCount, sanitizeLoadout } from '../src/core/world/blueprint';
import { UserStore } from './db';
import { applyHexDurabilityLoss } from '../src/core/physics/combat';
import { clampAngleToSniperCone, isDefenseFortressActive, isRangedSniperActive } from '../src/core/world/structure';
import { FIXED_DT, MAX_HEX_COUNT, MIN_HEX_COUNT, PLAYER_MOVE_SPEED } from '../src/core/constants';
import { clamp } from '../src/core/math/hexMath';
import { createMatchState, stepSimulation } from '../src/core/physics/simulation';
import {
  executeFighterAttack,
  executeFighterDash,
  recallSpecificHex,
  setFighterForm,
  setFighterRotMode,
  setFighterScale,
  setFighterSpecialSkill,
  toggleSelectAllHexes,
  triggerFighterSpecial,
  triggerSmartRecall,
} from '../src/core/attacks/index';
import type {
  Fighter,
  GuidedSteerInput,
  MatchState,
  Obstacle,
  PlayerLoadout,
  SimEvent,
} from '../src/core/types';
import {
  buildSeatSnapshot,
  type ClientMsg,
  type ContinuousInputPacket,
  type FriendPresenceItem,
  type FriendStatus,
  type MatchSnapshot,
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
  spectators: Map<WebSocket, { seat: SeatId; targetUserId: number }>;
  state: MatchState | null;
  tick: number;
  pendingEvents: SimEvent[];
  createdAt: number;
}

interface BotStreamMeta {
  selfLoadout: PlayerLoadout;
  oppLoadout: PlayerLoadout;
  obstacles: Obstacle[];
  lastSnapshot: MatchSnapshot;
}

interface OnlineSession {
  userId: number;
  username: string;
  ws: WebSocket;
  clientStatus: 'lobby' | 'playing_bot';
  spectating:
    | { mode: 'pvp'; roomCode: string; targetUserId: number }
    | { mode: 'bot'; targetUserId: number }
    | null;
  botStreamMeta: BotStreamMeta | null;
  botSpectators: Set<WebSocket>;
}

const rooms = new Map<string, Room>();
const peerRoomMap = new Map<WebSocket, { room: Room; seat: SeatId }>();
const wsAuthMap = new Map<WebSocket, number>();
const onlineSessions = new Map<number, OnlineSession>();

function getSessionByWs(ws: WebSocket): OnlineSession | null {
  const uid = wsAuthMap.get(ws);
  if (uid === undefined) return null;
  return onlineSessions.get(uid) ?? null;
}

function getSpectatorCountForUser(userId: number): number {
  const session = onlineSessions.get(userId);
  if (!session) return 0;
  const peer = peerRoomMap.get(session.ws);
  if (peer) {
    let cnt = 0;
    for (const s of peer.room.spectators.values()) {
      if (s.targetUserId === userId) cnt++;
    }
    return cnt;
  }
  return session.botSpectators.size;
}

function computeUserPresence(userId: number, usernameFallback = ''): FriendPresenceItem {
  const session = onlineSessions.get(userId);
  if (!session || session.ws.readyState !== WebSocket.OPEN) {
    return {
      userId,
      username: usernameFallback,
      status: 'offline',
      roomCode: null,
      canSpectate: false,
      spectatorCount: 0,
    };
  }

  let status: FriendStatus = session.clientStatus;
  let roomCode: string | null = null;
  let canSpectate = false;

  const peer = peerRoomMap.get(session.ws);
  if (peer) {
    roomCode = peer.room.code;
    if ((peer.room.phase === 'playing' || peer.room.phase === 'countdown') && peer.room.state) {
      status = 'playing_pvp';
      canSpectate = true;
    } else {
      status = 'in_room';
    }
  } else if (session.spectating) {
    status = 'spectating';
  } else if (session.clientStatus === 'playing_bot') {
    status = 'playing_bot';
    canSpectate = true;
  } else {
    status = 'lobby';
  }

  return {
    userId,
    username: session.username,
    status,
    roomCode,
    canSpectate,
    spectatorCount: getSpectatorCountForUser(userId),
  };
}

function notifyFriendsPresence(userId: number): void {
  const user = userStore.getById(userId);
  const item = computeUserPresence(userId, user?.username ?? '');
  const friendIds = userStore.getAcceptedFriendIds(userId);
  for (const fid of friendIds) {
    const fSession = onlineSessions.get(fid);
    if (fSession && fSession.ws.readyState === WebSocket.OPEN) {
      sendMsg(fSession.ws, { type: 'friend_presence_update', item });
    }
  }
}

function notifyUserFriendsPresence(ws: WebSocket, uid?: number): void {
  const targetUid = uid ?? wsAuthMap.get(ws);
  if (targetUid !== undefined) notifyFriendsPresence(targetUid);
}

function notifyViewerCount(targetUserId: number): void {
  const target = onlineSessions.get(targetUserId);
  if (!target || target.ws.readyState !== WebSocket.OPEN) return;
  const count = getSpectatorCountForUser(targetUserId);
  sendMsg(target.ws, { type: 'viewer_count_update', count });
}

function sendFriendsPresenceSnapshot(session: OnlineSession): void {
  const data = userStore.listFriends(session.userId);
  const items = data.friends.map((f) => computeUserPresence(f.userId, f.username));
  sendMsg(session.ws, { type: 'friends_presence_snapshot', items });
}

function stopSpectating(ws: WebSocket, silent = false): void {
  const session = getSessionByWs(ws);
  if (!session || !session.spectating) return;

  const prev = session.spectating;
  session.spectating = null;

  if (prev.mode === 'pvp') {
    const room = rooms.get(prev.roomCode);
    if (room) {
      room.spectators.delete(ws);
    }
  } else {
    const target = onlineSessions.get(prev.targetUserId);
    if (target) {
      target.botSpectators.delete(ws);
      if (target.botSpectators.size === 0) {
        target.botStreamMeta = null;
        sendMsg(target.ws, { type: 'bot_stream_toggle', active: false, spectatorCount: 0 });
      } else {
        sendMsg(target.ws, {
          type: 'bot_stream_toggle',
          active: true,
          spectatorCount: target.botSpectators.size,
        });
      }
    }
  }

  notifyViewerCount(prev.targetUserId);
  notifyFriendsPresence(prev.targetUserId);
  if (!silent) {
    notifyFriendsPresence(session.userId);
  }
}

function endBotSpectators(hostSession: OnlineSession, reason: string): void {
  if (hostSession.botSpectators.size === 0 && !hostSession.botStreamMeta) return;
  const specs = Array.from(hostSession.botSpectators);
  hostSession.botSpectators.clear();
  hostSession.botStreamMeta = null;
  for (const specWs of specs) {
    const specSession = getSessionByWs(specWs);
    if (specSession) {
      specSession.spectating = null;
    }
    sendMsg(specWs, { type: 'spectate_ended', reason });
    if (specSession) {
      notifyFriendsPresence(specSession.userId);
    }
  }
  sendMsg(hostSession.ws, { type: 'bot_stream_toggle', active: false, spectatorCount: 0 });
  notifyViewerCount(hostSession.userId);
}

function cleanupSession(ws: WebSocket, notifyOffline: boolean): void {
  const session = getSessionByWs(ws);
  if (!session) return;
  stopSpectating(ws, true);
  endBotSpectators(session, 'Bạn bè đã thoát hoặc mất kết nối.');
  wsAuthMap.delete(ws);
  if (onlineSessions.get(session.userId)?.ws === ws) {
    onlineSessions.delete(session.userId);
    if (notifyOffline) {
      notifyFriendsPresence(session.userId);
    }
  }
}

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

  // Notify any attached PvP spectators (e.g. during rematch)
  for (const [specWs, specInfo] of room.spectators.entries()) {
    const targetSeat = specInfo.seat;
    const isHostTarget = targetSeat === 'player';
    sendMsg(specWs, {
      type: 'spectate_start',
      mode: 'pvp',
      targetUserId: specInfo.targetUserId,
      targetName: isHostTarget ? room.host.name : room.guest.name,
      oppName: isHostTarget ? room.guest.name : room.host.name,
      selfLoadout: isHostTarget ? room.host.loadout : room.guest.loadout,
      oppLoadout: isHostTarget ? room.guest.loadout : room.host.loadout,
      obstacles: state.obstacles,
      snapshot: isHostTarget ? hostSnap : guestSnap,
      spectatorCount: getSpectatorCountForUser(specInfo.targetUserId),
    });
  }

  notifyUserFriendsPresence(room.host.ws);
  notifyUserFriendsPresence(room.guest.ws);
}

function applyContinuousInput(fighter: Fighter, peer: PeerSlot, dt: number): GuidedSteerInput {
  const input = peer.input;
  peer.lastAckSeq = input.seq;

  const mLen = Math.hypot(input.mx, input.my);
  if (isRangedSniperActive(fighter)) {
    fighter.vx = 0;
    fighter.vy = 0;
  } else if (mLen > 0.04) {
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

  if (isDefenseFortressActive(fighter)) {
    let diff = (input.facing - fighter.facing + Math.PI) % (Math.PI * 2);
    if (diff < 0) diff += Math.PI * 2;
    diff -= Math.PI;
    fighter.facing += clamp(diff, -3.4 * dt, 3.4 * dt);
  } else if (isRangedSniperActive(fighter)) {
    fighter.facing = clampAngleToSniperCone(fighter, input.facing);
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
      triggerFighterSpecial(state, fighter, applyHexDurabilityLoss, action.skillId, {
        angle: action.angle,
        strength: action.strength,
      });
      break;
    case 'set_special_skill':
      setFighterSpecialSkill(state, fighter, action.skillId, action.modeId);
      break;
    case 'smart_recall':
      triggerSmartRecall(state, fighter);
      break;
    case 'recall_hex': {
      const hex = fighter.hexes[action.hexId];
      if (hex) recallSpecificHex(state, fighter, hex);
      break;
    }
  }
}

function detachRoomSpectators(room: Room, reason: string): void {
  if (room.spectators.size === 0) return;
  const entries = Array.from(room.spectators.entries());
  room.spectators.clear();
  for (const [specWs] of entries) {
    const specSession = getSessionByWs(specWs);
    if (specSession) {
      specSession.spectating = null;
    }
    sendMsg(specWs, { type: 'spectate_ended', reason });
    if (specSession) {
      notifyFriendsPresence(specSession.userId);
    }
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
      detachRoomSpectators(room, 'Phòng đấu đã đóng.');
      rooms.delete(room.code);
    }
    notifyUserFriendsPresence(ws);
    return;
  }

  const other = seat === 'player' ? room.guest : room.host;
  if (other && other.ws.readyState === WebSocket.OPEN) {
    peerRoomMap.delete(other.ws);
    sendMsg(other.ws, {
      type: 'opponent_left',
      message: seat === 'player' ? 'Chủ phòng đã đóng phòng đấu.' : 'Đối thủ đã rời phòng đấu.',
    });
    notifyUserFriendsPresence(other.ws);
  }
  detachRoomSpectators(room, 'Trận đấu PvP đã kết thúc.');
  rooms.delete(room.code);
  notifyUserFriendsPresence(ws);
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

    if (method === 'GET' && url === '/api/friends') {
      const claim = getBearerUser(req);
      if (!claim) {
        sendJson(res, 401, { error: 'Chưa đăng nhập.' });
        return;
      }
      const data = userStore.listFriends(claim.uid);
      const presence = data.friends.map((f) => computeUserPresence(f.userId, f.username));
      sendJson(res, 200, { ...data, presence });
      return;
    }

    if (method === 'POST' && url === '/api/friends/request') {
      const claim = getBearerUser(req);
      if (!claim) {
        sendJson(res, 401, { error: 'Chưa đăng nhập.' });
        return;
      }
      const body = await readJsonBody(req);
      const result = userStore.sendFriendRequest(claim.uid, String(body.username || ''));
      if (!result.ok) {
        sendJson(res, 400, { error: result.error });
        return;
      }
      const selfSession = onlineSessions.get(claim.uid);
      const targetSession = onlineSessions.get(result.targetUserId);
      if (selfSession) sendMsg(selfSession.ws, { type: 'friends_list_dirty' });
      if (targetSession) sendMsg(targetSession.ws, { type: 'friends_list_dirty' });
      if (result.autoAccepted) {
        notifyFriendsPresence(claim.uid);
        notifyFriendsPresence(result.targetUserId);
      }
      sendJson(res, 200, result);
      return;
    }

    if (method === 'POST' && url === '/api/friends/respond') {
      const claim = getBearerUser(req);
      if (!claim) {
        sendJson(res, 401, { error: 'Chưa đăng nhập.' });
        return;
      }
      const body = await readJsonBody(req);
      const result = userStore.respondFriendRequest(claim.uid, Number(body.requestId), !!body.accept);
      if (!result.ok) {
        sendJson(res, 400, { error: result.error });
        return;
      }
      const selfSession = onlineSessions.get(claim.uid);
      const otherSession = onlineSessions.get(result.otherUserId);
      if (selfSession) sendMsg(selfSession.ws, { type: 'friends_list_dirty' });
      if (otherSession) sendMsg(otherSession.ws, { type: 'friends_list_dirty' });
      if (result.accepted) {
        notifyFriendsPresence(claim.uid);
        notifyFriendsPresence(result.otherUserId);
      }
      sendJson(res, 200, { ok: true, accepted: result.accepted });
      return;
    }

    if (method === 'POST' && url === '/api/friends/remove') {
      const claim = getBearerUser(req);
      if (!claim) {
        sendJson(res, 401, { error: 'Chưa đăng nhập.' });
        return;
      }
      const body = await readJsonBody(req);
      const otherId = Number(body.friendUserId);
      const removed = userStore.removeFriend(claim.uid, otherId);
      const selfSession = onlineSessions.get(claim.uid);
      const otherSession = onlineSessions.get(otherId);
      if (selfSession?.spectating?.targetUserId === otherId) {
        stopSpectating(selfSession.ws);
        sendMsg(selfSession.ws, { type: 'spectate_ended', reason: 'Đã hủy kết bạn.' });
      }
      if (otherSession?.spectating?.targetUserId === claim.uid) {
        stopSpectating(otherSession.ws);
        sendMsg(otherSession.ws, { type: 'spectate_ended', reason: 'Đã hủy kết bạn.' });
      }
      if (selfSession) sendMsg(selfSession.ws, { type: 'friends_list_dirty' });
      if (otherSession) sendMsg(otherSession.ws, { type: 'friends_list_dirty' });
      sendJson(res, 200, { ok: removed });
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

    if (msg.type === 'auth_ws') {
      const claim = userStore.verifyToken(String(msg.token || ''));
      if (!claim) return;
      const existing = onlineSessions.get(claim.uid);
      if (existing && existing.ws !== ws) {
        cleanupSession(existing.ws, false);
      }
      wsAuthMap.set(ws, claim.uid);
      const session: OnlineSession = {
        userId: claim.uid,
        username: claim.username,
        ws,
        clientStatus: 'lobby',
        spectating: null,
        botStreamMeta: null,
        botSpectators: new Set(),
      };
      onlineSessions.set(claim.uid, session);
      sendMsg(ws, { type: 'auth_ok', userId: claim.uid, username: claim.username });
      sendFriendsPresenceSnapshot(session);
      notifyFriendsPresence(claim.uid);
      return;
    }

    if (msg.type === 'logout_ws') {
      cleanupSession(ws, true);
      return;
    }

    if (msg.type === 'presence_update') {
      const session = getSessionByWs(ws);
      if (!session) return;
      const prevStatus = session.clientStatus;
      session.clientStatus = msg.status === 'playing_bot' ? 'playing_bot' : 'lobby';
      if (prevStatus === 'playing_bot' && session.clientStatus !== 'playing_bot') {
        endBotSpectators(session, 'Bạn bè đã rời trận đấu Bot.');
      }
      notifyFriendsPresence(session.userId);
      return;
    }

    if (msg.type === 'invite_friend') {
      const sender = getSessionByWs(ws);
      if (!sender) {
        sendMsg(ws, { type: 'invite_error', message: 'Bạn cần đăng nhập để gửi lời mời.' });
        return;
      }
      if (!userStore.areFriends(sender.userId, msg.friendUserId)) {
        sendMsg(ws, { type: 'invite_error', message: 'Hai bạn chưa kết bạn.' });
        return;
      }
      const code = String(msg.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      const peerEntry = peerRoomMap.get(ws);
      if (!room || !peerEntry || peerEntry.room !== room || peerEntry.seat !== 'player' || room.phase !== 'room') {
        sendMsg(ws, { type: 'invite_error', message: 'Phòng hiện không ở trạng thái chờ người chơi.' });
        return;
      }
      if (room.guest) {
        sendMsg(ws, { type: 'invite_error', message: 'Phòng đã đủ 2 người chơi.' });
        return;
      }
      const target = onlineSessions.get(msg.friendUserId);
      if (!target || target.ws.readyState !== WebSocket.OPEN) {
        sendMsg(ws, { type: 'invite_error', message: 'Người chơi này hiện đang ngoại tuyến.' });
        return;
      }
      const targetPresence = computeUserPresence(target.userId, target.username);
      if (targetPresence.status !== 'lobby') {
        sendMsg(ws, { type: 'invite_error', message: `${target.username} đang bận (${targetPresence.status}).` });
        return;
      }
      sendMsg(target.ws, {
        type: 'pvp_invite',
        invite: {
          fromUserId: sender.userId,
          fromUsername: sender.username,
          roomCode: room.code,
          hexCount: room.hexCount,
        },
      });
      sendMsg(ws, { type: 'invite_sent', targetUsername: target.username });
      return;
    }

    if (msg.type === 'decline_invite') {
      const sender = getSessionByWs(ws);
      const inviter = onlineSessions.get(msg.fromUserId);
      if (sender && inviter && inviter.ws.readyState === WebSocket.OPEN) {
        sendMsg(inviter.ws, { type: 'invite_declined', byUsername: sender.username });
      }
      return;
    }

    if (msg.type === 'spectate_friend') {
      const watcher = getSessionByWs(ws);
      if (!watcher) {
        sendMsg(ws, { type: 'spectate_error', message: 'Bạn cần đăng nhập để xem trận đấu của bạn bè.' });
        return;
      }
      if (!userStore.areFriends(watcher.userId, msg.friendUserId)) {
        sendMsg(ws, { type: 'spectate_error', message: 'Chỉ có thể xem trận đấu của bạn bè đã kết bạn.' });
        return;
      }
      const target = onlineSessions.get(msg.friendUserId);
      if (!target || target.ws.readyState !== WebSocket.OPEN) {
        sendMsg(ws, { type: 'spectate_error', message: 'Người chơi này hiện đang ngoại tuyến.' });
        return;
      }

      const targetPeer = peerRoomMap.get(target.ws);
      if (
        targetPeer &&
        targetPeer.room.state &&
        targetPeer.room.guest &&
        (targetPeer.room.phase === 'playing' || targetPeer.room.phase === 'countdown')
      ) {
        if (targetPeer.room.host.ws === ws || targetPeer.room.guest.ws === ws) {
          sendMsg(ws, { type: 'spectate_error', message: 'Bạn đang trực tiếp thi đấu trong trận này.' });
          return;
        }
        cleanupPeer(ws);
        stopSpectating(ws, true);
        const room = targetPeer.room;
        const guest = room.guest;
        const roomState = room.state;
        if (!guest || !roomState) return;
        const targetSeat = targetPeer.seat;
        const isHostTarget = targetSeat === 'player';
        room.spectators.set(ws, { seat: targetSeat, targetUserId: target.userId });
        watcher.spectating = { mode: 'pvp', roomCode: room.code, targetUserId: target.userId };
        const count = getSpectatorCountForUser(target.userId);
        sendMsg(ws, {
          type: 'spectate_start',
          mode: 'pvp',
          targetUserId: target.userId,
          targetName: isHostTarget ? room.host.name : guest.name,
          oppName: isHostTarget ? guest.name : room.host.name,
          selfLoadout: isHostTarget ? room.host.loadout : guest.loadout,
          oppLoadout: isHostTarget ? guest.loadout : room.host.loadout,
          obstacles: roomState.obstacles,
          snapshot: buildSeatSnapshot(roomState, targetSeat, room.tick, performance.now(), 0, []),
          spectatorCount: count,
        });
        notifyViewerCount(target.userId);
        notifyFriendsPresence(target.userId);
        notifyFriendsPresence(watcher.userId);
        return;
      }

      if (target.clientStatus === 'playing_bot') {
        cleanupPeer(ws);
        stopSpectating(ws, true);
        target.botSpectators.add(ws);
        watcher.spectating = { mode: 'bot', targetUserId: target.userId };
        const count = target.botSpectators.size;
        sendMsg(target.ws, { type: 'bot_stream_toggle', active: true, spectatorCount: count });
        if (target.botStreamMeta) {
          sendMsg(ws, {
            type: 'spectate_start',
            mode: 'bot',
            targetUserId: target.userId,
            targetName: target.username,
            oppName: 'BOT AI',
            selfLoadout: target.botStreamMeta.selfLoadout,
            oppLoadout: target.botStreamMeta.oppLoadout,
            obstacles: target.botStreamMeta.obstacles,
            snapshot: target.botStreamMeta.lastSnapshot,
            spectatorCount: count,
          });
        }
        notifyViewerCount(target.userId);
        notifyFriendsPresence(target.userId);
        notifyFriendsPresence(watcher.userId);
        return;
      }

      sendMsg(ws, { type: 'spectate_error', message: `${target.username} hiện không ở trong trận đấu nào.` });
      return;
    }

    if (msg.type === 'stop_spectate') {
      stopSpectating(ws);
      return;
    }

    if (msg.type === 'bot_stream_init') {
      const session = getSessionByWs(ws);
      if (!session || session.clientStatus !== 'playing_bot') return;
      session.botStreamMeta = {
        selfLoadout: msg.selfLoadout,
        oppLoadout: msg.oppLoadout,
        obstacles: msg.obstacles,
        lastSnapshot: msg.snapshot,
      };
      const count = session.botSpectators.size;
      for (const specWs of session.botSpectators) {
        sendMsg(specWs, {
          type: 'spectate_start',
          mode: 'bot',
          targetUserId: session.userId,
          targetName: session.username,
          oppName: 'BOT AI',
          selfLoadout: msg.selfLoadout,
          oppLoadout: msg.oppLoadout,
          obstacles: msg.obstacles,
          snapshot: msg.snapshot,
          spectatorCount: count,
        });
      }
      return;
    }

    if (msg.type === 'bot_stream_snapshot') {
      const session = getSessionByWs(ws);
      if (!session || session.clientStatus !== 'playing_bot') return;
      if (session.botStreamMeta) {
        session.botStreamMeta.lastSnapshot = msg.snapshot;
      }
      for (const specWs of session.botSpectators) {
        sendMsg(specWs, { type: 'spectate_snapshot', snapshot: msg.snapshot });
      }
      return;
    }

    if (msg.type === 'bot_stream_end') {
      const session = getSessionByWs(ws);
      if (!session) return;
      endBotSpectators(session, msg.reason || 'Trận đấu Bot đã kết thúc.');
      return;
    }

    if (msg.type === 'create_room') {
      stopSpectating(ws, true);
      const creatorSession = getSessionByWs(ws);
      if (creatorSession && creatorSession.clientStatus === 'playing_bot') {
        creatorSession.clientStatus = 'lobby';
        endBotSpectators(creatorSession, 'Bạn bè đã chuyển sang phòng PvP.');
      }
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
        spectators: new Map(),
        state: null,
        tick: 0,
        pendingEvents: [],
        createdAt: Date.now(),
      };
      rooms.set(code, room);
      peerRoomMap.set(ws, { room, seat: 'player' });
      sendMsg(ws, { type: 'room_created', code });
      broadcastRoomState(room);
      notifyUserFriendsPresence(ws);
      return;
    }

    if (msg.type === 'join_room') {
      stopSpectating(ws, true);
      const joinerSession = getSessionByWs(ws);
      if (joinerSession && joinerSession.clientStatus === 'playing_bot') {
        joinerSession.clientStatus = 'lobby';
        endBotSpectators(joinerSession, 'Bạn bè đã vào phòng PvP.');
      }
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
      notifyUserFriendsPresence(ws);
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

  ws.on('close', () => {
    cleanupPeer(ws);
    cleanupSession(ws, true);
  });
  ws.on('error', () => {
    cleanupPeer(ws);
    cleanupSession(ws, true);
  });
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
      const hostSnap = buildSeatSnapshot(
        room.state,
        'player',
        room.tick,
        snapTime,
        room.host.lastAckSeq,
        batchEvents,
      );
      const guestSnap = buildSeatSnapshot(
        room.state,
        'enemy',
        room.tick,
        snapTime,
        room.guest.lastAckSeq,
        batchEvents,
      );
      sendMsg(room.host.ws, { type: 'snapshot', snapshot: hostSnap });
      sendMsg(room.guest.ws, { type: 'snapshot', snapshot: guestSnap });

      // Live 30Hz (or instant event) fan-out to PvP spectators watching from friend's perspective
      if (room.spectators.size > 0 && (room.tick % 2 === 0 || batchEvents.length > 0)) {
        for (const [specWs, specInfo] of room.spectators.entries()) {
          sendMsg(specWs, {
            type: 'spectate_snapshot',
            snapshot: specInfo.seat === 'player' ? hostSnap : guestSnap,
          });
        }
      }
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
      cleanupSession(client, true);
      client.terminate();
      continue;
    }
    client.isAlive = false;
    try {
      client.ping();
    } catch {
      cleanupPeer(client);
      cleanupSession(client, true);
      client.terminate();
    }
  }
}, 25_000);

server.listen(PORT, () => {
  console.log(`[HexArena PvP Server] High-precision 60Hz Authoritative WS (TCP_NODELAY) on ws://localhost:${PORT}/ws`);
  tickServerLoop();
});
