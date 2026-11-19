import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { sanitizeLoadout } from '../src/core/blueprint';
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
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Backward-compatible migration for existing SQLite files created before control-config columns
    const cols = this.db.prepare('PRAGMA table_info(users)').all() as Array<{ name?: unknown }>;
    const colNames = new Set(cols.map((c) => String(c.name ?? '')));
    if (!colNames.has('mobile_hud_json')) {
      this.db.exec('ALTER TABLE users ADD COLUMN mobile_hud_json TEXT;');
    }
    if (!colNames.has('pc_controls_json')) {
      this.db.exec('ALTER TABLE users ADD COLUMN pc_controls_json TEXT;');
    }
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

    return {
      id: Number(row.id),
      username: String(row.username),
      loadout,
      mobileHud,
      pcControls,
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
    const passHash = hashPassword(password);
    const res = this.db
      .prepare(
        'INSERT INTO users (username, password_hash, loadout_json, mobile_hud_json, pc_controls_json) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        username,
        passHash,
        JSON.stringify(cleanLoadout),
        cleanMobileHud ? JSON.stringify(cleanMobileHud) : null,
        cleanPcControls ? JSON.stringify(cleanPcControls) : null,
      );

    const id = Number(res.lastInsertRowid);
    const user: UserRecord = {
      id,
      username,
      loadout: cleanLoadout,
      mobileHud: cleanMobileHud,
      pcControls: cleanPcControls,
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
      .prepare('SELECT id, username, password_hash, loadout_json, mobile_hud_json, pc_controls_json FROM users WHERE username = ?')
      .get(username);

    if (!row || typeof row.password_hash !== 'string' || !verifyPassword(password, row.password_hash)) {
      return { ok: false, error: 'Sai tên đăng nhập hoặc mật khẩu.' };
    }

    const user = this.parseRowToUser(row);
    return { ok: true, user, token: this.createToken(user.id, user.username) };
  }

  public getById(id: number): UserRecord | null {
    const row = this.db
      .prepare('SELECT id, username, loadout_json, mobile_hud_json, pc_controls_json FROM users WHERE id = ?')
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
}
