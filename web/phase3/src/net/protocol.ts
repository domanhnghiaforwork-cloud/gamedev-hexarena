import { angleDiff } from '@core/math/hexMath';
import type {
  AttackModeId,
  Fighter,
  FighterId,
  FireMode,
  FormKey,
  GuidedSteerInput,
  HexRole,
  HexState,
  MatchState,
  MatchStats,
  Obstacle,
  PlayerLoadout,
  RotMode,
  ScaleTier,
  SimEvent,
  SpecialActiveState,
} from '@core/types';

export type SeatId = 'player' | 'enemy';

export type RoomPhase = 'room' | 'prep' | 'countdown' | 'playing';

export interface RoomParticipantState {
  name: string;
  connected: boolean;
  roomReady: boolean;
  prepReady: boolean;
}

export interface RoomStatePayload {
  code: string;
  seat: SeatId;
  phase: RoomPhase;
  hexCount: number;
  prepRemainingSec: number;
  countdownSec: number;
  host: RoomParticipantState;
  guest: RoomParticipantState | null;
}

export type PvPAction =
  | { kind: 'set_form'; form: FormKey }
  | { kind: 'set_scale'; scale: ScaleTier }
  | { kind: 'set_rot'; rotMode: RotMode }
  | { kind: 'set_fire_mode'; fireMode: FireMode }
  | { kind: 'set_hex_selected'; hexId: number; selected: boolean }
  | { kind: 'select_all' }
  | { kind: 'attack'; angle: number; strength: number }
  | { kind: 'dash'; angle: number }
  | { kind: 'special' }
  | { kind: 'smart_recall' }
  | { kind: 'recall_hex'; hexId: number }
  | { kind: 'guided_waypoint'; wx: number; wy: number; withRipple: boolean }
  | { kind: 'guided_clear' };

export interface ContinuousInputPacket {
  seq: number;
  mx: number;
  my: number;
  facing: number;
  aimAngle: number;
  aimStrength: number;
  isAiming: boolean;
  isAimingDash: boolean;
  dashAimAngle: number;
  guidedInput: GuidedSteerInput;
}

export type ClientMsg =
  | { type: 'create_room'; loadout: PlayerLoadout; playerName?: string }
  | { type: 'join_room'; code: string; loadout: PlayerLoadout; playerName?: string }
  | { type: 'set_room_hex_count'; hexCount: number }
  | { type: 'room_ready'; ready: boolean }
  | { type: 'start_prep' }
  | { type: 'prep_update_loadout'; loadout: PlayerLoadout }
  | { type: 'prep_ready'; ready: boolean; loadout: PlayerLoadout }
  | { type: 'input_state'; input: ContinuousInputPacket }
  | { type: 'action'; action: PvPAction }
  | { type: 'rematch_request' }
  | { type: 'leave_room' }
  | { type: 'ping'; t: number };

/** Lean hex payload (trails synthesized locally at 60/120fps on client -> ~70% smaller packets!) */
export interface SerializedHex {
  id: number;
  hp: number;
  maxHp: number;
  state: HexState;
  selected: boolean;
  cooldown: number;
  flashTimer: number;
  x: number;
  y: number;
  altitude: number;
  spinAngle: number;
  tumblePhaseX: number;
  tumblePhaseY: number;
  q: number;
  r: number;
  animQ: number;
  animR: number;
  adjCount: number;
  role: HexRole;
  stolenById: FighterId | null;
  stolenTimer: number;
}

export interface SerializedRangedAnim {
  type: 'ranged';
  phase: 'out' | 'guided' | 'ricochet' | 'return';
  angle: number;
  anchorX: number;
  anchorY: number;
  targetX: number;
  targetY: number;
  targetAngle: number;
  hasCmd: boolean;
  cmdX: number;
  cmdY: number;
  isManualSteer: boolean;
  altitude: number;
}

export interface SerializedFighter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  maxHp: number;
  damageFlash: number;
  form: FormKey;
  rootHexId: number;
  targetScale: ScaleTier;
  currentScale: number;
  rotMode: RotMode;
  fireMode: FireMode;
  attackCooldown: number;
  dashCooldown: number;
  dashTimer: number;
  specialCooldown: number;
  specialMaxCooldown: number;
  specialActive: SpecialActiveState | null;
  isAttacking: boolean;
  rangedAnim: SerializedRangedAnim | null;
  hexes: SerializedHex[];
}

export interface MatchSnapshot {
  tick: number;
  serverTime: number;
  ackSeq: number;
  timeRemaining: number;
  matchOver: boolean;
  winner: 'player' | 'enemy' | 'draw' | null;
  dmgDealt: number;
  hexBroken: number;
  elapsed: number;
  stats?: MatchStats;
  self: SerializedFighter;
  opp: SerializedFighter;
  events: SimEvent[];
}

export type ServerMsg =
  | { type: 'room_created'; code: string }
  | { type: 'room_state'; room: RoomStatePayload }
  | { type: 'room_error'; message: string }
  | {
      type: 'match_start';
      code: string;
      seat: SeatId;
      selfLoadout: PlayerLoadout;
      oppLoadout: PlayerLoadout;
      obstacles: Obstacle[];
      snapshot: MatchSnapshot;
      countdownSec: number;
      hostName: string;
      guestName: string;
    }
  | { type: 'countdown_tick'; value: number }
  | { type: 'snapshot'; snapshot: MatchSnapshot }
  | { type: 'rematch_status'; readyCount: number }
  | { type: 'opponent_left'; message: string }
  | { type: 'pong'; t: number };

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDiff(a, b) * t;
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function swapId(id: FighterId | null, flip: boolean): FighterId | null {
  if (!id || !flip) return id;
  return id === 'player' ? 'enemy' : 'player';
}

function serializeFighter(f: Fighter, flipIds: boolean): SerializedFighter {
  const rangedAnim: SerializedRangedAnim | null =
    f.attackAnim && f.attackAnim.type === 'ranged'
      ? {
          type: 'ranged',
          phase: f.attackAnim.phase,
          angle: r3(f.attackAnim.angle),
          anchorX: r1(f.attackAnim.anchorX),
          anchorY: r1(f.attackAnim.anchorY),
          targetX: r1(f.attackAnim.targetX),
          targetY: r1(f.attackAnim.targetY),
          targetAngle: r3(f.attackAnim.targetAngle),
          hasCmd: f.attackAnim.hasCmd,
          cmdX: r1(f.attackAnim.cmdX),
          cmdY: r1(f.attackAnim.cmdY),
          isManualSteer: f.attackAnim.isManualSteer,
          altitude: r3(f.attackAnim.altitude),
        }
      : null;

  return {
    x: r1(f.x),
    y: r1(f.y),
    vx: r1(f.dashTimer > 0 ? f.dashVx : f.vx + f.kbX),
    vy: r1(f.dashTimer > 0 ? f.dashVy : f.vy + f.kbY),
    facing: r3(f.facing),
    hp: f.hp,
    maxHp: f.maxHp,
    damageFlash: r3(f.damageFlash),
    form: f.form,
    rootHexId: f.rootHexId,
    targetScale: f.targetScale,
    currentScale: r3(f.currentScale),
    rotMode: f.rotMode,
    fireMode: f.fireMode,
    attackCooldown: r3(f.attackCooldown),
    dashCooldown: r3(f.dashCooldown),
    dashTimer: r3(f.dashTimer),
    specialCooldown: r3(f.specialCooldown),
    specialMaxCooldown: f.specialMaxCooldown,
    specialActive: f.specialActive ? { ...f.specialActive } : null,
    isAttacking: f.attackAnim !== null,
    rangedAnim,
    hexes: f.hexes.map((h) => ({
      id: h.id,
      hp: Math.round(h.hp),
      maxHp: h.maxHp,
      state: h.state,
      selected: h.selected,
      cooldown: r1(h.cooldown),
      flashTimer: r3(h.flashTimer),
      x: r1(h.x),
      y: r1(h.y),
      altitude: r3(h.altitude),
      spinAngle: r3(h.spinAngle),
      tumblePhaseX: r3(h.tumblePhaseX),
      tumblePhaseY: r3(h.tumblePhaseY),
      q: h.q,
      r: h.r,
      animQ: r3(h.animQ),
      animR: r3(h.animR),
      adjCount: h.adjCount,
      role: h.role,
      stolenById: swapId(h.stolenById, flipIds),
      stolenTimer: r1(h.stolenTimer),
    })),
  };
}

/**
 * Serializes authoritative MatchState from the perspective of `seat` ('player' = Host, 'enemy' = Guest).
 * Always maps the receiving player to `self` (rendered Cyan) and opponent to `opp` (rendered Rose).
 */
export function buildSeatSnapshot(
  state: MatchState,
  seat: SeatId,
  tick: number,
  serverTime: number,
  ackSeq: number,
  events: SimEvent[],
): MatchSnapshot {
  const flip = seat === 'enemy';
  const selfF = flip ? state.enemy : state.player;
  const oppF = flip ? state.player : state.enemy;

  const mappedWinner =
    state.winner === 'draw' || state.winner === null
      ? state.winner
      : flip
        ? state.winner === 'enemy'
          ? 'player'
          : 'enemy'
        : state.winner;

  const mappedEvents: SimEvent[] = [];
  for (const ev of events) {
    if ((ev.type === 'toast' || ev.type === 'haptic') && ev.target && ev.target !== seat) {
      continue;
    }
    if (ev.type === 'matchEnd' && flip && ev.playerWon !== null) {
      mappedEvents.push({ type: 'matchEnd', playerWon: !ev.playerWon });
    } else {
      mappedEvents.push(ev);
    }
  }

  const copyModeMap = (m: Record<AttackModeId, number>): Record<AttackModeId, number> => ({
    loose: m.loose,
    ranged: m.ranged,
    melee: m.melee,
    defense: m.defense,
  });

  const mappedStats: MatchStats = flip
    ? {
        dmgDealt: state.stats.enemyDmg,
        enemyDmg: state.stats.dmgDealt,
        hexBroken: state.stats.enemyHexBroken,
        enemyHexBroken: state.stats.hexBroken,
        elapsed: r1(state.stats.elapsed),
        playerAttacks: state.stats.enemyAttacks,
        playerHits: state.stats.enemyHits,
        enemyAttacks: state.stats.playerAttacks,
        enemyHits: state.stats.playerHits,
        playerDmgByMode: copyModeMap(state.stats.enemyDmgByMode),
        enemyDmgByMode: copyModeMap(state.stats.playerDmgByMode),
        playerSpecialUses: copyModeMap(state.stats.enemySpecialUses),
        enemySpecialUses: copyModeMap(state.stats.playerSpecialUses),
      }
    : {
        ...state.stats,
        elapsed: r1(state.stats.elapsed),
        playerDmgByMode: copyModeMap(state.stats.playerDmgByMode),
        enemyDmgByMode: copyModeMap(state.stats.enemyDmgByMode),
        playerSpecialUses: copyModeMap(state.stats.playerSpecialUses),
        enemySpecialUses: copyModeMap(state.stats.enemySpecialUses),
      };

  return {
    tick,
    serverTime,
    ackSeq,
    timeRemaining: r1(state.timeRemaining),
    matchOver: state.matchOver,
    winner: mappedWinner,
    dmgDealt: mappedStats.dmgDealt,
    hexBroken: mappedStats.hexBroken,
    elapsed: mappedStats.elapsed,
    stats: mappedStats,
    self: serializeFighter(selfF, flip),
    opp: serializeFighter(oppF, flip),
    events: mappedEvents,
  };
}
