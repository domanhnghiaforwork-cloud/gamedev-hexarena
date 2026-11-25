import { describe, expect, it } from 'vitest';
import { createDefaultLoadout } from '@core/constants';
import { createMatchState } from '@core/physics/simulation';
import { buildSeatSnapshot } from '@net/protocol';
import { PvPInterpolator } from '@net/pvpInterpolator';
import { UserStore } from '../server/db';

describe('Friends System, Invites & Real-Time Live Spectate', () => {
  it('supports full SQLite friendship lifecycle (request, validation, mutual auto-accept, accept/decline, remove)', () => {
    const store = new UserStore(':memory:');
    const loadout = createDefaultLoadout();

    const alice = store.register('Alice_01', 'pass1234', loadout);
    const bob = store.register('Bob_02', 'pass1234', loadout);
    const charlie = store.register('Charlie_03', 'pass1234', loadout);
    expect(alice.ok && bob.ok && charlie.ok).toBe(true);
    if (!alice.ok || !bob.ok || !charlie.ok) return;

    // Self-request & unknown target rejected
    expect(store.sendFriendRequest(alice.user.id, 'Alice_01').ok).toBe(false);
    expect(store.sendFriendRequest(alice.user.id, 'NoSuchUser').ok).toBe(false);

    // Alice -> Bob request + duplicate rejection
    const reqAB = store.sendFriendRequest(alice.user.id, 'bob_02');
    expect(reqAB.ok).toBe(true);
    if (reqAB.ok) {
      expect(reqAB.autoAccepted).toBe(false);
      expect(reqAB.targetUserId).toBe(bob.user.id);
    }
    expect(store.sendFriendRequest(alice.user.id, 'Bob_02').ok).toBe(false);

    // Mutual request Bob -> Alice auto-accepts immediately
    const mutualBA = store.sendFriendRequest(bob.user.id, 'Alice_01');
    expect(mutualBA.ok).toBe(true);
    if (mutualBA.ok) {
      expect(mutualBA.autoAccepted).toBe(true);
    }
    expect(store.areFriends(alice.user.id, bob.user.id)).toBe(true);
    expect(store.areFriends(bob.user.id, alice.user.id)).toBe(true);
    expect(store.getAcceptedFriendIds(alice.user.id)).toEqual([bob.user.id]);

    // Charlie -> Alice: decline then resend & accept
    const reqCA = store.sendFriendRequest(charlie.user.id, 'Alice_01');
    expect(reqCA.ok).toBe(true);
    if (!reqCA.ok || !reqCA.requestId) return;
    expect(store.listFriends(alice.user.id).incoming).toHaveLength(1);

    const declined = store.respondFriendRequest(alice.user.id, reqCA.requestId, false);
    expect(declined.ok).toBe(true);
    expect(store.areFriends(alice.user.id, charlie.user.id)).toBe(false);

    const reqCA2 = store.sendFriendRequest(charlie.user.id, 'Alice_01');
    expect(reqCA2.ok).toBe(true);
    if (!reqCA2.ok || !reqCA2.requestId) return;
    const accepted = store.respondFriendRequest(alice.user.id, reqCA2.requestId, true);
    expect(accepted.ok && accepted.accepted).toBe(true);
    expect(store.listFriends(alice.user.id).friends).toHaveLength(2);

    // Remove friend cleans up both directions
    expect(store.removeFriend(alice.user.id, bob.user.id)).toBe(true);
    expect(store.areFriends(alice.user.id, bob.user.id)).toBe(false);
    expect(store.listFriends(alice.user.id).friends.map((f) => f.username)).toEqual(['Charlie_03']);

    store.close();
  });

  it('interpolates both fighters cleanly in spectator mode without prediction lock or frozen facing', () => {
    const loadout = createDefaultLoadout();
    const state = createMatchState(loadout, loadout, () => 0.5, false);
    const interp = new PvPInterpolator();

    state.player.x = -120;
    state.player.y = 0;
    state.player.facing = 0.2;
    state.enemy.x = 120;
    state.enemy.y = 0;
    state.enemy.facing = 2.8;
    const snap1 = buildSeatSnapshot(state, 'player', 1, 1000, 0, []);

    state.player.x = -20;
    state.player.y = 40;
    state.player.facing = 1.0;
    state.enemy.x = 200;
    state.enemy.y = -40;
    state.enemy.facing = 2.0;
    const snap2 = buildSeatSnapshot(state, 'player', 2, 1050, 0, []);

    // Spectator receives 20Hz Bot/PvP stream snapshots
    interp.pushSnapshot(snap1, 2000, state.obstacles, true, 50);
    interp.pushSnapshot(snap2, 2050, state.obstacles, true, 50);

    // Apply frame at a render time right between snap1 & snap2 (~2092 -> renderServerTime ~1025)
    interp.applyFrame(state, 2092, 1 / 60, true);

    expect(state.player.x).toBeGreaterThan(-120);
    expect(state.player.x).toBeLessThan(-20);
    expect(state.player.facing).toBeGreaterThan(0.2);
    expect(state.player.facing).toBeLessThan(1.0);
    expect(state.enemy.x).toBeGreaterThan(120);
    expect(state.enemy.x).toBeLessThan(200);
  });

  it('maps spectated friend to self (Cyan) and opponent to opp (Rose) for both Host and Guest perspectives', () => {
    const loadout = createDefaultLoadout();
    const state = createMatchState(loadout, loadout, () => 0.5, false);
    state.player.hp = 820;
    state.enemy.hp = 410;
    state.stats.dmgDealt = 590;
    state.stats.enemyDmg = 180;

    const hostView = buildSeatSnapshot(state, 'player', 5, 500, 0, []);
    const guestView = buildSeatSnapshot(state, 'enemy', 5, 500, 0, []);

    expect(hostView.self.hp).toBe(820);
    expect(hostView.opp.hp).toBe(410);
    expect(guestView.self.hp).toBe(410);
    expect(guestView.opp.hp).toBe(820);
    expect(guestView.dmgDealt).toBe(180);
  });
});
