import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { sanitizeCosmetics, type PlayerCosmetics } from '../src/config/cosmetics';
import { sanitizeLoadout } from '../src/core/world/blueprint';
import { createDefaultLoadout } from '../src/core/constants';
import type { PlayerLoadout } from '../src/core/types';
import {
  sanitizeMobileHUDConfig,
  sanitizePCControlConfig,
  type MobileHUDConfig,
  type PCControlConfig,
} from '../src/storage/profiles';

export interface UserRecord {
  id: number;
  username: string;
  loadout: PlayerLoadout;
  mobileHud: MobileHUDConfig | null;
  pcControls: PCControlConfig | null;
  cosmetics: PlayerCosmetics | null;
}

export interface FriendRecord {
  userId: number;
  username: string;
  since: string;
}

export interface FriendRequestRecord {
  requestId: number;
  userId: number;
  username: string;
  createdAt: string;
}

export interface FriendsData {
  friends: FriendRecord[];
  incoming: FriendRequestRecord[];
  outgoing: FriendRequestRecord[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

function getOrCreateSecret(secretFile: string): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  try {
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf8').trim();
      if (existing.length >= 16) return existing;
    }
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export class UserStore {
  private db: DatabaseSync;
  private secret: string;

  constructor(dbPath?: string) {
    const resolved = dbPath ?? path.join(DATA_DIR, 'hex_arena.sqlite');
    if (resolved !== ':memory:') {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
    }
    this.db = new DatabaseSync(resolved);
    this.secret = getOrCreateSecret(path.join(DATA_DIR, '.session_secret'));

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        loadout_json TEXT NOT NULL,
        mobile_hud_json TEXT,
        pc_controls_json TEXT,
        cosmetics_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Backward-compatible migration for existing SQLite files created before control-config/cosmetics columns
    const cols = this.db.prepare('PRAGMA table_info(users)').all() as Array<{ name?: unknown }>;
    const colNames = new Set(cols.map((c) => String(c.name ?? '')));
    if (!colNames.has('mobile_hud_json')) {
      this.db.exec('ALTER TABLE users ADD COLUMN mobile_hud_json TEXT;');
    }
    if (!colNames.has('pc_controls_json')) {
      this.db.exec('ALTER TABLE users ADD COLUMN pc_controls_json TEXT;');
    }
    if (!colNames.has('cosmetics_json')) {
      this.db.exec('ALTER TABLE users ADD COLUMN cosmetics_json TEXT;');
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS friendships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requester_id INTEGER NOT NULL,
        addressee_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','accepted')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(requester_id, addressee_id)
      );
      CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
      CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
    `);
  }

  private parseRowToUser(row: Record<string, unknown>): UserRecord {
    let loadout: PlayerLoadout;
    try {
      loadout = sanitizeLoadout(JSON.parse(String(row.loadout_json)));
    } catch {
      loadout = createDefaultLoadout();
    }

    let mobileHud: MobileHUDConfig | null = null;
    if (typeof row.mobile_hud_json === 'string' && row.mobile_hud_json.length > 0) {
      try {
        mobileHud = sanitizeMobileHUDConfig(JSON.parse(row.mobile_hud_json));
      } catch {
        mobileHud = null;
      }
    }

    let pcControls: PCControlConfig | null = null;
    if (typeof row.pc_controls_json === 'string' && row.pc_controls_json.length > 0) {
      try {
        pcControls = sanitizePCControlConfig(JSON.parse(row.pc_controls_json));
      } catch {
        pcControls = null;
      }
    }

    let cosmetics: PlayerCosmetics | null = null;
    if (typeof row.cosmetics_json === 'string' && row.cosmetics_json.length > 0) {
      try {
        cosmetics = sanitizeCosmetics(JSON.parse(row.cosmetics_json));
      } catch {
        cosmetics = null;
      }
    }

    return {
      id: Number(row.id),
      username: String(row.username),
      loadout,
      mobileHud,
      pcControls,
      cosmetics,
    };
  }

  public close(): void {
    this.db.close();
  }

  public createToken(userId: number, username: string): string {
    const payload = Buffer.from(JSON.stringify({ uid: userId, u: username, iat: Date.now() })).toString('base64url');
    const sig = crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  public verifyToken(token: string): { uid: number; username: string } | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    const expected = crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        uid?: number;
        u?: string;
      };
      if (typeof parsed.uid !== 'number' || typeof parsed.u !== 'string') return null;
      return { uid: parsed.uid, username: parsed.u };
    } catch {
      return null;
    }
  }

  public register(
    rawUsername: string,
    password: string,
    initialLoadout?: unknown,
    initialMobileHud?: unknown,
    initialPcControls?: unknown,
    initialCosmetics?: unknown,
  ): { ok: true; user: UserRecord; token: string } | { ok: false; error: string } {
    const username = rawUsername.trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return {
        ok: false,
        error: 'Tên đăng nhập gồm 3–20 ký tự (chữ không dấu, số hoặc dấu gạch dưới _).',
      };
    }
    if (typeof password !== 'string' || password.length < 4 || password.length > 64) {
      return { ok: false, error: 'Mật khẩu cần từ 4 đến 64 ký tự.' };
    }

    const exists = this.db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (exists) {
      return { ok: false, error: 'Tên đăng nhập này đã có người sử dụng.' };
    }

    const cleanLoadout = initialLoadout ? sanitizeLoadout(initialLoadout) : createDefaultLoadout();
    const cleanMobileHud = initialMobileHud ? sanitizeMobileHUDConfig(initialMobileHud) : null;
    const cleanPcControls = initialPcControls ? sanitizePCControlConfig(initialPcControls) : null;
    const cleanCosmetics = initialCosmetics ? sanitizeCosmetics(initialCosmetics) : null;
    const passHash = hashPassword(password);
    const res = this.db
      .prepare(
        'INSERT INTO users (username, password_hash, loadout_json, mobile_hud_json, pc_controls_json, cosmetics_json) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        username,
        passHash,
        JSON.stringify(cleanLoadout),
        cleanMobileHud ? JSON.stringify(cleanMobileHud) : null,
        cleanPcControls ? JSON.stringify(cleanPcControls) : null,
        cleanCosmetics ? JSON.stringify(cleanCosmetics) : null,
      );

    const id = Number(res.lastInsertRowid);
    const user: UserRecord = {
      id,
      username,
      loadout: cleanLoadout,
      mobileHud: cleanMobileHud,
      pcControls: cleanPcControls,
      cosmetics: cleanCosmetics,
    };
    return { ok: true, user, token: this.createToken(id, username) };
  }

  public login(
    rawUsername: string,
    password: string,
  ): { ok: true; user: UserRecord; token: string } | { ok: false; error: string } {
    const username = rawUsername.trim();
    if (!username || !password) {
      return { ok: false, error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' };
    }

    const row = this.db
      .prepare('SELECT id, username, password_hash, loadout_json, mobile_hud_json, pc_controls_json, cosmetics_json FROM users WHERE username = ?')
      .get(username);

    if (!row || typeof row.password_hash !== 'string' || !verifyPassword(password, row.password_hash)) {
      return { ok: false, error: 'Sai tên đăng nhập hoặc mật khẩu.' };
    }

    const user = this.parseRowToUser(row);
    return { ok: true, user, token: this.createToken(user.id, user.username) };
  }

  public getById(id: number): UserRecord | null {
    const row = this.db
      .prepare('SELECT id, username, loadout_json, mobile_hud_json, pc_controls_json, cosmetics_json FROM users WHERE id = ?')
      .get(id);
    if (!row) return null;
    return this.parseRowToUser(row);
  }

  public updateLoadout(id: number, rawLoadout: unknown): PlayerLoadout | null {
    const clean = sanitizeLoadout(rawLoadout);
    const res = this.db
      .prepare("UPDATE users SET loadout_json = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(clean), id);
    if (Number(res.changes) === 0) return null;
    return clean;
  }

  public updateControls(
    id: number,
    rawMobileHud: unknown,
    rawPcControls: unknown,
  ): { mobileHud: MobileHUDConfig; pcControls: PCControlConfig } | null {
    const cleanMobileHud = sanitizeMobileHUDConfig(rawMobileHud);
    const cleanPcControls = sanitizePCControlConfig(rawPcControls);
    const res = this.db
      .prepare(
        "UPDATE users SET mobile_hud_json = ?, pc_controls_json = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(JSON.stringify(cleanMobileHud), JSON.stringify(cleanPcControls), id);
    if (Number(res.changes) === 0) return null;
    return { mobileHud: cleanMobileHud, pcControls: cleanPcControls };
  }

  public updateCosmetics(id: number, rawCosmetics: unknown): PlayerCosmetics | null {
    const clean = sanitizeCosmetics(rawCosmetics);
    const res = this.db
      .prepare("UPDATE users SET cosmetics_json = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(clean), id);
    if (Number(res.changes) === 0) return null;
    return clean;
  }

  public sendFriendRequest(
    requesterId: number,
    rawTargetUsername: string,
  ):
    | { ok: true; autoAccepted: boolean; requestId?: number; targetUserId: number; targetUsername: string }
    | { ok: false; error: string } {
    const targetUsername = rawTargetUsername.trim();
    if (!targetUsername) {
      return { ok: false, error: 'Vui lòng nhập tên người chơi muốn kết bạn.' };
    }

    const target = this.db
      .prepare('SELECT id, username FROM users WHERE username = ?')
      .get(targetUsername) as { id: number; username: string } | undefined;

    if (!target) {
      return { ok: false, error: 'Không tìm thấy người chơi này.' };
    }
    const targetId = Number(target.id);
    const resolvedName = String(target.username);
    if (targetId === requesterId) {
      return { ok: false, error: 'Không thể tự kết bạn với chính mình.' };
    }

    const existing = this.db
      .prepare(
        `SELECT id, requester_id, addressee_id, status
         FROM friendships
         WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
      )
      .get(requesterId, targetId, targetId, requesterId) as
      | { id: number; requester_id: number; addressee_id: number; status: string }
      | undefined;

    if (existing) {
      if (existing.status === 'accepted') {
        return { ok: false, error: 'Hai bạn đã là bạn bè.' };
      }
      if (Number(existing.requester_id) === requesterId) {
        return { ok: false, error: 'Bạn đã gửi lời mời kết bạn cho người này rồi.' };
      }
      // Target already sent a pending request to requester -> auto-accept!
      this.db
        .prepare("UPDATE friendships SET status = 'accepted', updated_at = datetime('now') WHERE id = ?")
        .run(Number(existing.id));
      return { ok: true, autoAccepted: true, targetUserId: targetId, targetUsername: resolvedName };
    }

    const res = this.db
      .prepare("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending')")
      .run(requesterId, targetId);

    return {
      ok: true,
      autoAccepted: false,
      requestId: Number(res.lastInsertRowid),
      targetUserId: targetId,
      targetUsername: resolvedName,
    };
  }

  public respondFriendRequest(
    userId: number,
    requestId: number,
    accept: boolean,
  ): { ok: true; otherUserId: number; accepted: boolean } | { ok: false; error: string } {
    const row = this.db
      .prepare("SELECT id, requester_id FROM friendships WHERE id = ? AND addressee_id = ? AND status = 'pending'")
      .get(requestId, userId) as { id: number; requester_id: number } | undefined;

    if (!row) {
      return { ok: false, error: 'Lời mời kết bạn không tồn tại hoặc đã được xử lý.' };
    }

    const otherUserId = Number(row.requester_id);
    if (accept) {
      this.db
        .prepare("UPDATE friendships SET status = 'accepted', updated_at = datetime('now') WHERE id = ?")
        .run(Number(row.id));
    } else {
      this.db.prepare('DELETE FROM friendships WHERE id = ?').run(Number(row.id));
    }

    return { ok: true, otherUserId, accepted: accept };
  }

  public removeFriend(userId: number, otherUserId: number): boolean {
    const res = this.db
      .prepare(
        `DELETE FROM friendships
         WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
      )
      .run(userId, otherUserId, otherUserId, userId);
    return Number(res.changes) > 0;
  }

  public areFriends(uidA: number, uidB: number): boolean {
    if (uidA === uidB) return false;
    const row = this.db
      .prepare(
        `SELECT 1 FROM friendships
         WHERE status = 'accepted'
           AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
         LIMIT 1`,
      )
      .get(uidA, uidB, uidB, uidA);
    return !!row;
  }

  public getAcceptedFriendIds(userId: number): number[] {
    const rows = this.db
      .prepare(
        `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS friend_id
         FROM friendships
         WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`,
      )
      .all(userId, userId, userId) as Array<{ friend_id: number }>;
    return rows.map((r) => Number(r.friend_id));
  }

  public listFriends(userId: number): FriendsData {
    const friendRows = this.db
      .prepare(
        `SELECT u.id AS user_id, u.username AS username, f.updated_at AS since
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
         WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)
         ORDER BY u.username COLLATE NOCASE ASC`,
      )
      .all(userId, userId, userId) as Array<{ user_id: number; username: string; since: string }>;

    const incomingRows = this.db
      .prepare(
        `SELECT f.id AS request_id, u.id AS user_id, u.username AS username, f.created_at AS created_at
         FROM friendships f
         JOIN users u ON u.id = f.requester_id
         WHERE f.addressee_id = ? AND f.status = 'pending'
         ORDER BY f.id DESC`,
      )
      .all(userId) as Array<{ request_id: number; user_id: number; username: string; created_at: string }>;

    const outgoingRows = this.db
      .prepare(
        `SELECT f.id AS request_id, u.id AS user_id, u.username AS username, f.created_at AS created_at
         FROM friendships f
         JOIN users u ON u.id = f.addressee_id
         WHERE f.requester_id = ? AND f.status = 'pending'
         ORDER BY f.id DESC`,
      )
      .all(userId) as Array<{ request_id: number; user_id: number; username: string; created_at: string }>;

    return {
      friends: friendRows.map((r) => ({
        userId: Number(r.user_id),
        username: String(r.username),
        since: String(r.since),
      })),
      incoming: incomingRows.map((r) => ({
        requestId: Number(r.request_id),
        userId: Number(r.user_id),
        username: String(r.username),
        createdAt: String(r.created_at),
      })),
      outgoing: outgoingRows.map((r) => ({
        requestId: Number(r.request_id),
        userId: Number(r.user_id),
        username: String(r.username),
        createdAt: String(r.created_at),
      })),
    };
  }
}
