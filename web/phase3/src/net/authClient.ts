import type { PlayerCosmetics } from '@config/cosmetics';
import type { PlayerLoadout } from '@core/types';
import type { MobileHUDConfig, PCControlConfig } from '@storage/profiles';
import type { FriendPresenceItem } from './protocol';

export interface AuthUser {
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

export interface FriendsApiPayload {
  friends: FriendRecord[];
  incoming: FriendRequestRecord[];
  outgoing: FriendRequestRecord[];
  presence: FriendPresenceItem[];
}

const KEY_AUTH_TOKEN = 'hex_arena_p3_auth_token_v1';

export class AuthClient {
  public token: string | null = null;
  public user: AuthUser | null = null;

  constructor() {
    try {
      this.token = localStorage.getItem(KEY_AUTH_TOKEN);
    } catch {
      this.token = null;
    }
  }

  private saveToken(token: string | null): void {
    this.token = token;
    try {
      if (token) localStorage.setItem(KEY_AUTH_TOKEN, token);
      else localStorage.removeItem(KEY_AUTH_TOKEN);
    } catch {
      // Ignore storage errors
    }
  }

  public async restoreSession(): Promise<AuthUser | null> {
    if (!this.token) return null;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) {
        this.saveToken(null);
        this.user = null;
        return null;
      }
      const data = (await res.json()) as { user: AuthUser };
      this.user = data.user;
      return data.user;
    } catch {
      return null;
    }
  }

  public async register(
    username: string,
    password: string,
    currentLoadout: PlayerLoadout,
    currentMobileHud?: MobileHUDConfig,
    currentPcControls?: PCControlConfig,
    currentCosmetics?: PlayerCosmetics,
  ): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          loadout: currentLoadout,
          mobileHud: currentMobileHud,
          pcControls: currentPcControls,
          cosmetics: currentCosmetics,
        }),
      });
      const data = (await res.json()) as { token?: string; user?: AuthUser; error?: string };
      if (!res.ok || !data.token || !data.user) {
        return { ok: false, error: data.error || 'Đăng ký thất bại.' };
      }
      this.saveToken(data.token);
      this.user = data.user;
      return { ok: true, user: data.user };
    } catch {
      return { ok: false, error: 'Không thể kết nối máy chủ tài khoản.' };
    }
  }

  public async login(
    username: string,
    password: string,
  ): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { token?: string; user?: AuthUser; error?: string };
      if (!res.ok || !data.token || !data.user) {
        return { ok: false, error: data.error || 'Đăng nhập thất bại.' };
      }
      this.saveToken(data.token);
      this.user = data.user;
      return { ok: true, user: data.user };
    } catch {
      return { ok: false, error: 'Không thể kết nối máy chủ tài khoản.' };
    }
  }

  public async saveLoadoutToAccount(loadout: PlayerLoadout): Promise<boolean> {
    if (!this.token || !this.user) return false;
    try {
      const res = await fetch('/api/loadout', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ loadout }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { loadout: PlayerLoadout };
      this.user.loadout = data.loadout;
      return true;
    } catch {
      return false;
    }
  }

  public async saveControlsToAccount(
    mobileHud: MobileHUDConfig,
    pcControls: PCControlConfig,
  ): Promise<boolean> {
    if (!this.token || !this.user) return false;
    try {
      const res = await fetch('/api/controls', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ mobileHud, pcControls }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { mobileHud: MobileHUDConfig; pcControls: PCControlConfig };
      this.user.mobileHud = data.mobileHud;
      this.user.pcControls = data.pcControls;
      return true;
    } catch {
      return false;
    }
  }

  public async saveCosmeticsToAccount(cosmetics: PlayerCosmetics): Promise<boolean> {
    if (!this.token || !this.user) return false;
    try {
      const res = await fetch('/api/cosmetics', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ cosmetics }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { cosmetics: PlayerCosmetics };
      this.user.cosmetics = data.cosmetics;
      return true;
    } catch {
      return false;
    }
  }

  public async getFriends(): Promise<FriendsApiPayload | null> {
    if (!this.token || !this.user) return null;
    try {
      const res = await fetch('/api/friends', {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) return null;
      return (await res.json()) as FriendsApiPayload;
    } catch {
      return null;
    }
  }

  public async sendFriendRequest(
    username: string,
  ): Promise<{ ok: true; autoAccepted?: boolean; targetUsername?: string } | { ok: false; error: string }> {
    if (!this.token || !this.user) {
      return { ok: false, error: 'Bạn cần đăng nhập để kết bạn.' };
    }
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ username }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        autoAccepted?: boolean;
        targetUsername?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Không thể gửi lời mời kết bạn.' };
      }
      return {
        ok: true,
        autoAccepted: !!data.autoAccepted,
        targetUsername: data.targetUsername,
      };
    } catch {
      return { ok: false, error: 'Không thể kết nối máy chủ.' };
    }
  }

  public async respondFriendRequest(
    requestId: number,
    accept: boolean,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.token || !this.user) return { ok: false, error: 'Chưa đăng nhập.' };
    try {
      const res = await fetch('/api/friends/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ requestId, accept }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Không thể xử lý lời mời.' };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'Không thể kết nối máy chủ.' };
    }
  }

  public async removeFriend(friendUserId: number): Promise<boolean> {
    if (!this.token || !this.user) return false;
    try {
      const res = await fetch('/api/friends/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ friendUserId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public logout(): void {
    this.saveToken(null);
    this.user = null;
  }
}
