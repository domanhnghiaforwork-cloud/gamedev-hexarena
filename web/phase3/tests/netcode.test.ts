import { describe, expect, it } from 'vitest';
import { FIXED_DT, PLAYER_MOVE_SPEED } from '@core/constants';
import { createMatchState } from '@core/physics/simulation';
import { buildSeatSnapshot, lerpAngle } from '@net/protocol';
import { PvPInterpolator } from '@net/pvpInterpolator';

describe('PvP Netcode — Angle Lerp, Timeline Interpolation & Client-Side Prediction', () => {
  it('interpolates angles along the shortest path across ±PI wrap boundary', () => {
    const a = Math.PI - 0.1;
    const b = -Math.PI + 0.1;
    const mid = lerpAngle(a, b, 0.5);
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(0.01);
  });

  it('smoothly interpolates opponent position & angle between timestamped server snapshots', () => {
    const serverState = createMatchState(undefined, undefined, Math.random, false);
    const clientState = createMatchState(undefined, undefined, Math.random, false);
    const interp = new PvPInterpolator();

    serverState.enemy.x = 100;
    serverState.enemy.y = 0;
    serverState.enemy.facing = 0;
    const snapA = buildSeatSnapshot(serverState, 'player', 1, 1000, 0, []);

    serverState.enemy.x = 200;
    serverState.enemy.y = 100;
    serverState.enemy.facing = Math.PI / 2;
    const snapB = buildSeatSnapshot(serverState, 'player', 2, 1100, 0, []);

    interp.reset();
    interp.pushSnapshot(snapA, 1000, []);
    interp.pushSnapshot(snapB, 1100, []);

    // Render halfway between snapA (1000ms) and snapB (1100ms) accounting for interpDelay
    const delay = interp.getInterpDelayMs();
    interp.applyFrame(clientState, 1050 + delay, FIXED_DT);

    expect(clientState.enemy.x).toBeGreaterThan(120);
    expect(clientState.enemy.x).toBeLessThan(185);
    expect(clientState.enemy.y).toBeGreaterThan(20);
    expect(clientState.enemy.facing).toBeGreaterThan(0.3);
    expect(clientState.enemy.facing).toBeLessThan(1.3);
  });

  it('predicts local player movement immediately at 0ms and reconciles cleanly with server ackSeq', () => {
    const serverState = createMatchState(undefined, undefined, Math.random, false);
    serverState.obstacles = [];
    const clientState = createMatchState(undefined, undefined, Math.random, false);
    clientState.obstacles = [];

    const interp = new PvPInterpolator();
    const startSnap = buildSeatSnapshot(serverState, 'player', 0, 1000, 0, []);
    interp.reset(startSnap, 1000);
    const startX = startSnap.self.x;

    // Predict 3 frames moving strictly right (+X) before server responds
    interp.predictLocalMovement(clientState, 1, FIXED_DT, 1, 0);
    interp.predictLocalMovement(clientState, 2, FIXED_DT, 1, 0);
    interp.predictLocalMovement(clientState, 3, FIXED_DT, 1, 0);
    interp.applyFrame(clientState, 1050, FIXED_DT);

    const expectedDelta = PLAYER_MOVE_SPEED * FIXED_DT * 3;
    expect(clientState.player.x).toBeCloseTo(startX + expectedDelta, 1);

    // Server catches up to seq 1 -> reconciliation keeps unacked seq 2 & 3 seamlessly!
    serverState.player.x = startX + PLAYER_MOVE_SPEED * FIXED_DT;
    const ackSnap = buildSeatSnapshot(serverState, 'player', 1, 1017, 1, []);
    interp.pushSnapshot(ackSnap, 1060, []);
    interp.applyFrame(clientState, 1066, FIXED_DT);

    expect(clientState.player.x).toBeCloseTo(startX + expectedDelta, 1);
  });

  it('maps hexBroken symmetrically for Guest seat and filters private toast/haptic events by target seat', () => {
    const serverState = createMatchState(undefined, undefined, Math.random, false);
    serverState.stats.hexBroken = 2;
    serverState.stats.enemyHexBroken = 5;

    const events = [
      { type: 'toast' as const, message: 'Host-only notice', target: 'player' as const },
      { type: 'toast' as const, message: 'Guest-only notice', target: 'enemy' as const },
      { type: 'haptic' as const, pattern: [12], target: 'player' as const },
      { type: 'sfx' as const, kind: 'clash' as const },
    ];

    const hostSnap = buildSeatSnapshot(serverState, 'player', 1, 1000, 0, events);
    const guestSnap = buildSeatSnapshot(serverState, 'enemy', 1, 1000, 0, events);

    expect(hostSnap.hexBroken).toBe(2);
    expect(guestSnap.hexBroken).toBe(5);
    expect(hostSnap.events.some((e) => e.type === 'toast' && e.message === 'Guest-only notice')).toBe(false);
    expect(hostSnap.events.some((e) => e.type === 'toast' && e.message === 'Host-only notice')).toBe(true);
    expect(guestSnap.events.some((e) => e.type === 'toast' && e.message === 'Host-only notice')).toBe(false);
    expect(guestSnap.events.some((e) => e.type === 'toast' && e.message === 'Guest-only notice')).toBe(true);
    expect(guestSnap.events.some((e) => e.type === 'haptic')).toBe(false);
    expect(guestSnap.events.some((e) => e.type === 'sfx')).toBe(true);
  });
});
