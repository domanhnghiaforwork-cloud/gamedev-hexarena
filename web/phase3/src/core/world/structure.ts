import {
  ANCHOR_BONUS,
  AXIAL_DIRS,
  BASE_HEX_RADIUS,
  HEX_HP_MULTIPLIER,
  MATERIALS,
  MAX_PLAYER_HP,
  MORPH_DURATION,
  PLAYER_RADIUS,
  REASSEMBLE_DURATION,
} from '../constants';
import { cloneLoadout, computeBlueprintMetrics, normalizeBlueprint } from './blueprint';
import { axialKey, axialToLocal, dist } from '../math/hexMath';
import type {
  BlueprintDerivedMetrics,
  CombatStance,
  Fighter,
  FighterId,
  FormKey,
  HexEntity,
  MaterialId,
  PlayerLoadout,
  SimEvent,
  SlotKey,
  WeaponBlueprint,
} from '../types';

export function isSlotKey(form: FormKey): form is SlotKey {
  return form === 'slot1' || form === 'slot2' || form === 'slot3';
}

export function getActiveBlueprint(fighter: Fighter): WeaponBlueprint | null {
  if (!isSlotKey(fighter.form)) return null;
  return fighter.loadout.blueprints[fighter.form];
}

export function getActiveStance(fighter: Fighter): CombatStance | null {
  const bp = getActiveBlueprint(fighter);
  return bp ? bp.stance : null;
}

export function getActiveAnchorDist(fighter: Fighter, R: number): number {
  if (!isSlotKey(fighter.form)) return PLAYER_RADIUS + R * 1.15;
  const metrics = fighter.blueprintMetrics[fighter.form];
  return PLAYER_RADIUS + R * (metrics?.anchorDistFactor ?? 1.15);
}

export function createHex(index: number, materialId: MaterialId, ownerId: FighterId, totalCount: number): HexEntity {
  const mat = MATERIALS[materialId] ?? MATERIALS.base;
  const maxHp = Math.round(mat.dur * HEX_HP_MULTIPLIER);
  return {
    id: index,
    ownerId,
    material: mat,
    hp: maxHp,
    maxHp,
    state: 'ORBIT',
    selected: false,
    cooldown: 0,
    regenDelay: 0,
    flashTimer: 0,
    hitCooldown: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    altitude: 0,
    orbitAngle: (index / Math.max(1, totalCount)) * Math.PI * 2,
    spinAngle: 0,
    tumblePhaseX: index * 1.3,
    tumblePhaseY: index * 0.9,
    targetX: 0,
    targetY: 0,
    remainingDist: 0,
    launchSpeed: 560,
    autoReturn: false,
    isAutoReturning: false,
    hasBounced: false,
    bouncesLeft: 0,
    randomRoll: 1.0,
    initialEnergy: 0,
    energy: 0,
    stolenById: null,
    stolenTimer: 0,
    q: 0,
    r: 0,
    animQ: 0,
    animR: 0,
    startQ: 0,
    startR: 0,
    morphTimer: 0,
    morphDuration: 0.25,
    isReassembling: false,
    tetherFromX: 0,
    tetherFromY: 0,
    adjCount: 0,
    role: 'spine',
    trail: [],
  };
}

export function createFighter(
  id: FighterId,
  x: number,
  y: number,
  loadout: PlayerLoadout,
  isAI = false,
): Fighter {
  const cleanLoadout = cloneLoadout(loadout);
  cleanLoadout.blueprints.slot1 = normalizeBlueprint(cleanLoadout.blueprints.slot1);
  cleanLoadout.blueprints.slot2 = normalizeBlueprint(cleanLoadout.blueprints.slot2);
  cleanLoadout.blueprints.slot3 = normalizeBlueprint(cleanLoadout.blueprints.slot3);

  const metrics: Record<SlotKey, BlueprintDerivedMetrics> = {
    slot1: computeBlueprintMetrics(cleanLoadout.blueprints.slot1, cleanLoadout.hexMaterials),
    slot2: computeBlueprintMetrics(cleanLoadout.blueprints.slot2, cleanLoadout.hexMaterials),
    slot3: computeBlueprintMetrics(cleanLoadout.blueprints.slot3, cleanLoadout.hexMaterials),
  };

  const total = cleanLoadout.hexMaterials.length;
  const hexes = cleanLoadout.hexMaterials.map((mat, idx) => createHex(idx, mat, id, total));
  for (const h of hexes) {
    h.x = x + Math.cos(h.orbitAngle) * (PLAYER_RADIUS + 34);
    h.y = y + Math.sin(h.orbitAngle) * (PLAYER_RADIUS + 34);
  }

  return {
    id,
    isAI,
    x,
    y,
    vx: 0,
    vy: 0,
    kbX: 0,
    kbY: 0,
    facing: id === 'player' ? 0 : Math.PI,
    hp: MAX_PLAYER_HP,
    maxHp: MAX_PLAYER_HP,
    damageFlash: 0,
    loadout: cleanLoadout,
    blueprintMetrics: metrics,
    form: 'loose',
    rootHexId: 0,
    targetScale: 1.0,
    currentScale: 1.0,
    rotMode: 'static',
    fireMode: 'xayah',
    isAiming: false,
    aimAngle: id === 'player' ? 0 : Math.PI,
    aimStrength: 0,
    isAimingDash: false,
    dashAimAngle: id === 'player' ? 0 : Math.PI,
    attackCooldown: 0,
    dashCooldown: 0,
    dashTimer: 0,
    dashVx: 0,
    dashVy: 0,
    dashAfterimages: [],
    specialCooldown: 0,
    specialMaxCooldown: 20,
    specialActive: null,
    attackAnim: null,
    needsFullMorph: false,
    seqFireQueue: [],
    seqFireTimer: 0,
    pingHexId: -1,
    pingTimer: 0,
    aiTimer: 0.6,
    aiActionTimer: 0.9,
    aiStrafeDir: 1,
    hexes,
  };
}

export interface EffectiveHexStats {
  radius: number;
  hardness: number;
  damage: number;
  speedMult: number;
}

/**
 * Power-Law Scaling Formula (GDD Ch. 6) + Emergent Role & Spin Modifiers:
 * Radius: S^1.0, Hardness: S^-1.5 (+10%/edge), Damage: S^-1.0, Speed: S^-0.5, MaxHP: S^0
 */
export function getEffectiveHexStats(fighter: Fighter, hex: HexEntity): EffectiveHexStats {
  const S = fighter.currentScale;
  const mat = hex.material;
  const adjBonus = fighter.form !== 'loose' ? 1 + 0.1 * hex.adjCount : 1.0;

  let roleDmgMult = 1.0;
  const stance = getActiveStance(fighter);
  if (stance === 'ranged' || stance === 'melee') {
    if (hex.role === 'tip') roleDmgMult = 1.35;
    else if (hex.role === 'spine') roleDmgMult = 1.05;
  }

  let spinMult = 1.0;
  if (fighter.form === 'loose') {
    if (fighter.rotMode === 'normal') spinMult = 1.35;
    else if (fighter.rotMode === 'random') spinMult = hex.randomRoll || 1.0;
  }

  return {
    radius: BASE_HEX_RADIUS * S,
    hardness: mat.hard * adjBonus * Math.pow(S, -1.5),
    damage: mat.sharp * 0.42 * roleDmgMult * spinMult * Math.pow(S, -1.0),
    speedMult: (mat.agil / 100) * Math.pow(S, -0.5),
  };
}

export const LOOSE_GRAVITY_SLOW_FACTOR = 0.50;

export function getLooseGravityFieldRadius(fighter: Fighter): number {
  const currentLooseRing = (PLAYER_RADIUS + 24 + BASE_HEX_RADIUS * fighter.currentScale * 1.15) * 1.20;
  return currentLooseRing * 1.30;
}

export function getLooseOrbitRadius(fighter: Fighter): number {
  const fieldR = getLooseGravityFieldRadius(fighter);
  return (PLAYER_RADIUS + fieldR) * 0.5;
}

export function isInsideLooseGravityField(
  caster: Fighter,
  x: number,
  y: number,
  entityRadius = 0
): boolean {
  if (caster.specialActive?.type !== 'loose') return false;
  return dist(caster.x, caster.y, x, y) <= getLooseGravityFieldRadius(caster) + entityRadius;
}

export function isHexStolen(hex: HexEntity): boolean {
  return hex.state === 'STOLEN_FLY' || hex.state === 'STOLEN_FLOOR' || hex.state === 'STOLEN_RETURN';
}

export function isHexAnchored(fighter: Fighter, hex: HexEntity): boolean {
  if (hex.state !== 'ASSEMBLED') return false;
  if (fighter.attackAnim && fighter.attackAnim.type === 'ranged') return false;
  return true;
}

/**
 * Rule 2.1: Structural Resistance R_chan = H_base * S^-1.5 * (1 + 0.1 * adjCount) * K_anchor.
 * Defense Special (Pháo Đài Phản Xung): 150% physical scale while compressing hardness as S = 0.6!
 */
export function getStructuralResistance(defender: Fighter, defHex: HexEntity): number {
  const isFortress =
    defender.specialActive?.type === 'defense' && isHexAnchored(defender, defHex);
  const S = isFortress ? 0.6 : defender.currentScale;
  const adjBonus = defHex.state === 'ASSEMBLED' ? 1 + 0.1 * defHex.adjCount : 1.0;
  const anchorBonus = isHexAnchored(defender, defHex) ? ANCHOR_BONUS : 1.0;
  return defHex.material.hard * Math.pow(S, -1.5) * adjBonus * anchorBonus;
}

/**
 * Rule 2.2: Intact edge-adjacent neighbors for 30% Load Sharing.
 */
export function getAnchoredNeighbors(fighter: Fighter, hex: HexEntity): HexEntity[] {
  if (!isHexAnchored(fighter, hex)) return [];
  const neighbors: HexEntity[] = [];
  for (const other of fighter.hexes) {
    if (other.id === hex.id || other.state !== 'ASSEMBLED') continue;
    const dq = other.q - hex.q;
    const dr = other.r - hex.r;
    if (AXIAL_DIRS.some((d) => d.q === dq && d.r === dr)) {
      neighbors.push(other);
    }
  }
  return neighbors;
}

/**
 * Rule 3: Initial Kinetic Energy Budget E_dam for a Ranged Thrown Weapon or Loose Projectile.
 * Uses forward-most local X projection (works for ANY user-built blueprint geometry!).
 */
export function computeRangedKineticEnergy(fighter: Fighter): number {
  const S = fighter.currentScale;
  const assembled = fighter.hexes.filter((h) => h.state === 'ASSEMBLED');
  if (assembled.length === 0) return 0;
  let tipSharp = 100;
  let maxLocalX = -Infinity;
  for (const h of assembled) {
    const locX = axialToLocal(h.q, h.r, 1).x;
    if (locX > maxLocalX + 1e-4 || (Math.abs(locX - maxLocalX) <= 1e-4 && h.material.sharp > tipSharp)) {
      maxLocalX = locX;
      tipSharp = h.material.sharp;
    }
  }
  return tipSharp * 0.78 * Math.pow(S, -1.0);
}

export function computeLooseKineticEnergy(fighter: Fighter, hex: HexEntity): number {
  const S = fighter.currentScale;
  let spinMult = 1.0;
  if (fighter.form === 'loose') {
    if (fighter.rotMode === 'normal') spinMult = 1.35;
    else if (fighter.rotMode === 'random') spinMult = hex.randomRoll || 1.0;
  }
  return hex.material.sharp * 0.52 * spinMult * Math.pow(S, -1.0);
}

export function updateAdjacencyCounts(fighter: Fighter): void {
  const occupied = new Map<string, HexEntity>();
  for (const h of fighter.hexes) {
    if (h.state === 'ASSEMBLED') {
      occupied.set(axialKey(h.q, h.r), h);
    }
  }
  for (const h of fighter.hexes) {
    if (h.state !== 'ASSEMBLED') {
      h.adjCount = 0;
      continue;
    }
    let count = 0;
    for (const d of AXIAL_DIRS) {
      if (occupied.has(axialKey(h.q + d.q, h.r + d.r))) count++;
    }
    h.adjCount = count;
  }
}

/**
 * Applies any user-built WeaponBlueprint (5..10 hexes, custom rootHexIndex) to all intact hexes.
 */
export function applyBlueprintFormation(
  fighter: Fighter,
  slotKey: SlotKey,
  events: SimEvent[],
  isFullRecovery = false,
): void {
  const bp = fighter.loadout.blueprints[slotKey];
  if (!bp) return;
  const metrics = fighter.blueprintMetrics[slotKey];
  const slotByHex = new Map(bp.slots.map((s) => [s.hexIndex, s]));

  fighter.rootHexId = bp.rootHexIndex;
  const intact = fighter.hexes.filter((h) => h.state !== 'BROKEN' && !isHexStolen(h));
  if (intact.length === 0) return;

  const instantStaticSnap = !isFullRecovery && fighter.rotMode === 'static';
  for (const h of intact) {
    const slot = slotByHex.get(h.id);
    if (!slot) continue;
    const wasAssembled = h.state === 'ASSEMBLED';
    h.q = slot.q;
    h.r = slot.r;
    h.role = metrics.roles[h.id] ?? 'spine';
    h.state = 'ASSEMBLED';
    h.altitude = 0;
    h.isReassembling = isFullRecovery;

    if (instantStaticSnap) {
      h.startQ = slot.q;
      h.startR = slot.r;
      h.animQ = slot.q;
      h.animR = slot.r;
      h.morphDuration = 0;
      h.morphTimer = 0;
    } else {
      h.startQ = wasAssembled ? h.animQ : slot.q * 1.4;
      h.startR = wasAssembled ? h.animR : slot.r * 1.4;
      h.morphDuration = isFullRecovery ? MORPH_DURATION : 0.22;
      h.morphTimer = h.morphDuration;
    }
  }

  runStructuralBFSAndReassemble(fighter, events, false);
  updateAdjacencyCounts(fighter);
}

/**
 * Core GDD Mechanic: BFS from Root/Anchor hex.
 * Handles arbitrary 5..10 hex blueprints (including when original Root shatters).
 */
export function runStructuralBFSAndReassemble(
  fighter: Fighter,
  events: SimEvent[],
  withVFX = true,
): void {
  if (fighter.form === 'loose') return;

  const assembled = fighter.hexes.filter((h) => h.state === 'ASSEMBLED');
  if (assembled.length <= 1) {
    if (assembled.length === 1) fighter.rootHexId = assembled[0].id;
    updateAdjacencyCounts(fighter);
    return;
  }

  // Verify or promote Root Anchor if original root broke
  let rootHex = assembled.find((h) => h.id === fighter.rootHexId);
  if (!rootHex) {
    assembled.sort((a, b) => {
      const la = axialToLocal(a.q, a.r, 1);
      const lb = axialToLocal(b.q, b.r, 1);
      return Math.hypot(la.x, la.y) - Math.hypot(lb.x, lb.y);
    });
    rootHex = assembled[0];
    fighter.rootHexId = rootHex.id;
  }

  const map = new Map<string, HexEntity>();
  for (const h of assembled) map.set(axialKey(h.q, h.r), h);

  const connected = new Set<number>([rootHex.id]);
  const queue: HexEntity[] = [rootHex];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const d of AXIAL_DIRS) {
      const nb = map.get(axialKey(curr.q + d.q, curr.r + d.r));
      if (nb && !connected.has(nb.id)) {
        connected.add(nb.id);
        queue.push(nb);
      }
    }
  }

  const disconnected = assembled.filter((h) => !connected.has(h.id));
  if (disconnected.length === 0) {
    updateAdjacencyCounts(fighter);
    return;
  }

  const rootCluster = assembled.filter((h) => connected.has(h.id));
  const rootMap = new Map<string, HexEntity>();
  for (const h of rootCluster) rootMap.set(axialKey(h.q, h.r), h);

  disconnected.sort((a, b) => {
    const la = axialToLocal(a.q, a.r, 1);
    const lb = axialToLocal(b.q, b.r, 1);
    const da = Math.min(
      ...rootCluster.map((rc) => {
        const lrc = axialToLocal(rc.q, rc.r, 1);
        return dist(la.x, la.y, lrc.x, lrc.y);
      }),
    );
    const db = Math.min(
      ...rootCluster.map((rc) => {
        const lrc = axialToLocal(rc.q, rc.r, 1);
        return dist(lb.x, lb.y, lrc.x, lrc.y);
      }),
    );
    return da - db;
  });

  for (const h of disconnected) {
    const candidateSlots = new Map<string, { q: number; r: number; neighbors: number }>();
    for (const rc of rootCluster) {
      for (const d of AXIAL_DIRS) {
        const cq = rc.q + d.q;
        const cr = rc.r + d.r;
        const key = axialKey(cq, cr);
        if (!rootMap.has(key)) {
          const prev = candidateSlots.get(key);
          if (prev) prev.neighbors++;
          else candidateSlots.set(key, { q: cq, r: cr, neighbors: 1 });
        }
      }
    }

    const hLoc = axialToLocal(h.q, h.r, 1);
    let bestSlot: { q: number; r: number; neighbors: number } | null = null;
    let bestScore = Infinity;
    for (const slot of candidateSlots.values()) {
      const sLoc = axialToLocal(slot.q, slot.r, 1);
      const d = dist(hLoc.x, hLoc.y, sLoc.x, sLoc.y);
      const score = d - slot.neighbors * 0.22;
      if (score < bestScore) {
        bestScore = score;
        bestSlot = slot;
      }
    }

    if (bestSlot) {
      h.startQ = h.animQ;
      h.startR = h.animR;
      h.tetherFromX = h.x;
      h.tetherFromY = h.y;
      h.q = bestSlot.q;
      h.r = bestSlot.r;
      h.isReassembling = true;
      h.morphDuration = REASSEMBLE_DURATION;
      h.morphTimer = REASSEMBLE_DURATION;
      rootCluster.push(h);
      rootMap.set(axialKey(h.q, h.r), h);
    }
  }

  if (withVFX) events.push({ type: 'sfx', kind: 'snap' });
  updateAdjacencyCounts(fighter);
}

/**
 * Inserts a recovered hex back into the assembled blueprint cluster;
 * once ALL N hexes are intact again, flags smooth morph back to original blueprint shape!
 */
export function insertRecoveredHexIntoCluster(
  fighter: Fighter,
  hex: HexEntity,
  events: SimEvent[],
): void {
  if (!isSlotKey(fighter.form)) {
    hex.state = 'ORBIT';
    return;
  }

  const bp = fighter.loadout.blueprints[fighter.form];
  const metrics = fighter.blueprintMetrics[fighter.form];
  const origSlot = bp.slots.find((s) => s.hexIndex === hex.id);
  const assembled = fighter.hexes.filter((h) => h.state === 'ASSEMBLED');
  const occupied = new Map<string, HexEntity>();
  for (const h of assembled) occupied.set(axialKey(h.q, h.r), h);

  let chosenQ = origSlot?.q ?? 0;
  let chosenR = origSlot?.r ?? 0;

  if (assembled.length === 0) {
    chosenQ = 0;
    chosenR = 0;
    fighter.rootHexId = hex.id;
  } else {
    const origKey = axialKey(chosenQ, chosenR);
    const origAdjacent =
      !occupied.has(origKey) &&
      AXIAL_DIRS.some((d) => occupied.has(axialKey(chosenQ + d.q, chosenR + d.r)));

    if (!origAdjacent) {
      const candidates = new Map<string, { q: number; r: number; neighbors: number }>();
      for (const a of assembled) {
        for (const d of AXIAL_DIRS) {
          const cq = a.q + d.q;
          const cr = a.r + d.r;
          const key = axialKey(cq, cr);
          if (!occupied.has(key)) {
            const prev = candidates.get(key);
            if (prev) prev.neighbors++;
            else candidates.set(key, { q: cq, r: cr, neighbors: 1 });
          }
        }
      }
      const origLoc = axialToLocal(chosenQ, chosenR, 1);
      let best: { q: number; r: number; neighbors: number } | null = null;
      let bestScore = Infinity;
      for (const c of candidates.values()) {
        const cLoc = axialToLocal(c.q, c.r, 1);
        const score = dist(origLoc.x, origLoc.y, cLoc.x, cLoc.y) - c.neighbors * 0.25;
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (best) {
        chosenQ = best.q;
        chosenR = best.r;
      }
    }
  }

  hex.state = 'ASSEMBLED';
  hex.role = metrics.roles[hex.id] ?? 'spine';
  hex.q = chosenQ;
  hex.r = chosenR;
  hex.startQ = chosenQ * 1.45;
  hex.startR = chosenR * 1.45;
  hex.animQ = hex.startQ;
  hex.animR = hex.startR;
  hex.morphDuration = 0.22;
  hex.morphTimer = 0.22;
  hex.isReassembling = true;
  hex.flashTimer = 0.35;

  updateAdjacencyCounts(fighter);
  events.push({ type: 'sfx', kind: 'snap' });

  // Full Recovery Check: all N hexes intact -> morph cleanly back to original Blueprint shape!
  const allIntact = fighter.hexes.every((h) => h.state === 'ASSEMBLED');
  if (allIntact) {
    fighter.needsFullMorph = true;
  }
}
