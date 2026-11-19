import { AXIAL_DIRS, MATERIALS, MAX_HEX_COUNT, MIN_HEX_COUNT, createDefaultLoadout } from './constants';
import { axialKey, axialToLocal, clamp, dist } from './hexMath';
import type {
  BlueprintDerivedMetrics,
  BlueprintSlot,
  BlueprintValidationResult,
  HexRole,
  MaterialId,
  PlayerLoadout,
  SlotKey,
  WeaponBlueprint,
} from './types';

export function cloneLoadout(loadout: PlayerLoadout): PlayerLoadout {
  return {
    version: loadout.version,
    hexMaterials: [...loadout.hexMaterials],
    blueprints: {
      slot1: cloneBlueprint(loadout.blueprints.slot1),
      slot2: cloneBlueprint(loadout.blueprints.slot2),
      slot3: cloneBlueprint(loadout.blueprints.slot3),
    },
  };
}

export function cloneBlueprint(bp: WeaponBlueprint): WeaponBlueprint {
  return {
    id: bp.id,
    name: bp.name,
    stance: bp.stance,
    defaultScale: bp.defaultScale,
    rootHexIndex: bp.rootHexIndex,
    slots: bp.slots.map((s) => ({ hexIndex: s.hexIndex, q: s.q, r: s.r })),
  };
}

/**
 * Translates all slot coordinates so that rootHexIndex sits cleanly at (0, 0).
 */
export function normalizeBlueprint(bp: WeaponBlueprint): WeaponBlueprint {
  const copy = cloneBlueprint(bp);
  const rootSlot = copy.slots.find((s) => s.hexIndex === copy.rootHexIndex) ?? copy.slots[0];
  if (!rootSlot) return copy;
  copy.rootHexIndex = rootSlot.hexIndex;
  const dq = rootSlot.q;
  const dr = rootSlot.r;
  if (dq !== 0 || dr !== 0) {
    for (const s of copy.slots) {
      s.q -= dq;
      s.r -= dr;
    }
  }
  return copy;
}

/**
 * Validates that a WeaponBlueprint covers hexIndices 0..hexCount-1 with no duplicate axial cells
 * and forms a single BFS-connected component starting from rootHexIndex.
 */
export function validateBlueprint(bp: WeaponBlueprint, hexCount: number): BlueprintValidationResult {
  const coordMap = new Map<string, BlueprintSlot>();
  let duplicateCoords = false;
  const seenIndices = new Set<number>();

  for (const s of bp.slots) {
    seenIndices.add(s.hexIndex);
    const key = axialKey(s.q, s.r);
    if (coordMap.has(key)) {
      duplicateCoords = true;
    } else {
      coordMap.set(key, s);
    }
  }

  const missingHexIndices: number[] = [];
  for (let i = 0; i < hexCount; i++) {
    if (!seenIndices.has(i)) missingHexIndices.push(i);
  }

  const rootSlot = bp.slots.find((s) => s.hexIndex === bp.rootHexIndex) ?? bp.slots[0];
  const connected = new Set<number>();

  if (rootSlot) {
    connected.add(rootSlot.hexIndex);
    const queue: BlueprintSlot[] = [rootSlot];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const d of AXIAL_DIRS) {
        const nb = coordMap.get(axialKey(curr.q + d.q, curr.r + d.r));
        if (nb && !connected.has(nb.hexIndex)) {
          connected.add(nb.hexIndex);
          queue.push(nb);
        }
      }
    }
  }

  const disconnectedIndices = bp.slots
    .filter((s) => !connected.has(s.hexIndex))
    .map((s) => s.hexIndex);

  let errorMessage: string | null = null;
  if (bp.slots.length !== hexCount || missingHexIndices.length > 0) {
    errorMessage = `Cấu hình cần đủ ${hexCount} mảnh lục giác.`;
  } else if (duplicateCoords) {
    errorMessage = 'Có mảnh đang nằm chồng lên cùng một ô lưới.';
  } else if (disconnectedIndices.length > 0) {
    errorMessage = `Có ${disconnectedIndices.length} mảnh bị tách rời khỏi khối Gốc (chưa nối cạnh).`;
  }

  return {
    valid: errorMessage === null,
    disconnectedIndices,
    duplicateCoords,
    missingHexIndices,
    errorMessage,
  };
}

/**
 * Magnetically snaps any disconnected hexes into the closest open adjacent cell on the root component,
 * preferring cells with maximum edge connections (same emergent rule as in-match BFS).
 */
export function autoConnectBlueprint(bp: WeaponBlueprint): WeaponBlueprint {
  const norm = normalizeBlueprint(bp);
  if (norm.slots.length <= 1) return norm;

  // Deduplicate any overlapping coords first by moving duplicates to disconnected list
  const rootSlot = norm.slots.find((s) => s.hexIndex === norm.rootHexIndex) ?? norm.slots[0];
  const coordMap = new Map<string, BlueprintSlot>();
  const uniqueSlots: BlueprintSlot[] = [];
  const forcedLoose: BlueprintSlot[] = [];

  for (const s of norm.slots) {
    const key = axialKey(s.q, s.r);
    if (!coordMap.has(key)) {
      coordMap.set(key, s);
      uniqueSlots.push(s);
    } else if (s.hexIndex === rootSlot.hexIndex) {
      const prev = coordMap.get(key)!;
      forcedLoose.push(prev);
      coordMap.set(key, s);
    } else {
      forcedLoose.push(s);
    }
  }

  // BFS from root
  const connectedIds = new Set<number>([rootSlot.hexIndex]);
  const queue: BlueprintSlot[] = [rootSlot];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const d of AXIAL_DIRS) {
      const nb = coordMap.get(axialKey(curr.q + d.q, curr.r + d.r));
      if (nb && !connectedIds.has(nb.hexIndex)) {
        connectedIds.add(nb.hexIndex);
        queue.push(nb);
      }
    }
  }

  const cluster = norm.slots.filter((s) => connectedIds.has(s.hexIndex));
  const clusterMap = new Map<string, BlueprintSlot>();
  for (const s of cluster) clusterMap.set(axialKey(s.q, s.r), s);

  const loose = [
    ...forcedLoose,
    ...uniqueSlots.filter((s) => !connectedIds.has(s.hexIndex)),
  ];

  // Sort loose hexes closest to existing root cluster first
  loose.sort((a, b) => {
    const la = axialToLocal(a.q, a.r, 1);
    const lb = axialToLocal(b.q, b.r, 1);
    const da = Math.min(...cluster.map((c) => {
      const lc = axialToLocal(c.q, c.r, 1);
      return dist(la.x, la.y, lc.x, lc.y);
    }));
    const db = Math.min(...cluster.map((c) => {
      const lc = axialToLocal(c.q, c.r, 1);
      return dist(lb.x, lb.y, lc.x, lc.y);
    }));
    return da - db;
  });

  for (const h of loose) {
    const candidates = new Map<string, { q: number; r: number; neighbors: number }>();
    for (const c of cluster) {
      for (const d of AXIAL_DIRS) {
        const cq = c.q + d.q;
        const cr = c.r + d.r;
        const key = axialKey(cq, cr);
        if (!clusterMap.has(key)) {
          const prev = candidates.get(key);
          if (prev) prev.neighbors++;
          else candidates.set(key, { q: cq, r: cr, neighbors: 1 });
        }
      }
    }

    const hLoc = axialToLocal(h.q, h.r, 1);
    let best: { q: number; r: number; neighbors: number } | null = null;
    let bestScore = Infinity;
    for (const cand of candidates.values()) {
      const cLoc = axialToLocal(cand.q, cand.r, 1);
      const score = dist(hLoc.x, hLoc.y, cLoc.x, cLoc.y) - cand.neighbors * 0.25;
      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
    }

    if (best) {
      h.q = best.q;
      h.r = best.r;
      cluster.push(h);
      clusterMap.set(axialKey(h.q, h.r), h);
    }
  }

  return normalizeBlueprint(norm);
}

/**
 * Resizes the shared hex pool (5..10) while keeping all 3 weapon blueprints connected & valid.
 */
export function resizeLoadoutHexCount(loadout: PlayerLoadout, targetCount: number): PlayerLoadout {
  const newCount = clamp(Math.round(targetCount), MIN_HEX_COUNT, MAX_HEX_COUNT);
  const copy = cloneLoadout(loadout);
  const curCount = copy.hexMaterials.length;
  if (newCount === curCount) return copy;

  const slotKeys: SlotKey[] = ['slot1', 'slot2', 'slot3'];

  if (newCount > curCount) {
    // Append new Base hexes and add them cleanly into open stance-appropriate slots
    for (let idx = curCount; idx < newCount; idx++) {
      copy.hexMaterials.push('base');
      for (const sk of slotKeys) {
        const bp = copy.blueprints[sk];
        const occupied = new Set(bp.slots.map((s) => axialKey(s.q, s.r)));
        const candidates = new Map<string, { q: number; r: number; neighbors: number }>();

        for (const s of bp.slots) {
          for (const d of AXIAL_DIRS) {
            const cq = s.q + d.q;
            const cr = s.r + d.r;
            const key = axialKey(cq, cr);
            if (!occupied.has(key)) {
              const prev = candidates.get(key);
              if (prev) prev.neighbors++;
              else candidates.set(key, { q: cq, r: cr, neighbors: 1 });
            }
          }
        }

        let best: { q: number; r: number } = { q: 1, r: 0 };
        let bestScore = -Infinity;
        for (const c of candidates.values()) {
          const loc = axialToLocal(c.q, c.r, 1);
          let score = c.neighbors * 1.2;
          if (bp.stance === 'ranged') {
            // Prefer elongating forward along +X
            score = loc.x * 1.5 - Math.abs(loc.y) * 1.1 + c.neighbors * 0.4;
          } else if (bp.stance === 'melee') {
            // Prefer forward-upper cutting arc
            score = loc.x * 1.0 - Math.abs(loc.y + 0.8) * 0.4 + c.neighbors * 0.8;
          } else {
            // Defense: prefer sturdy wide arc / high adjacency
            score = c.neighbors * 1.8 + Math.abs(loc.y) * 0.45 - Math.abs(loc.x) * 0.6;
          }
          if (score > bestScore) {
            bestScore = score;
            best = { q: c.q, r: c.r };
          }
        }

        bp.slots.push({ hexIndex: idx, q: best.q, r: best.r });
      }
    }
  } else {
    // Shrink pool from the end; ensure rootHexIndex stays valid and re-connect if removal split the graph
    copy.hexMaterials = copy.hexMaterials.slice(0, newCount);
    for (const sk of slotKeys) {
      const bp = copy.blueprints[sk];
      bp.slots = bp.slots.filter((s) => s.hexIndex < newCount);
      if (bp.rootHexIndex >= newCount) {
        bp.rootHexIndex = 0;
      }
      copy.blueprints[sk] = autoConnectBlueprint(bp);
    }
  }

  return copy;
}

/**
 * Automatically derives positional roles (root/tip/front/core/spine/wing), safe anchor distance,
 * and emergent combat preview stats from arbitrary user-built (q, r) geometry!
 */
export function computeBlueprintMetrics(
  bp: WeaponBlueprint,
  materials: MaterialId[],
): BlueprintDerivedMetrics {
  const norm = normalizeBlueprint(bp);
  const roles: Record<number, HexRole> = {};
  const occupied = new Map<string, BlueprintSlot>();
  for (const s of norm.slots) occupied.set(axialKey(s.q, s.r), s);

  const locals = new Map<number, { x: number; y: number; adj: number }>();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let totalAdj = 0;
  let totalHard = 0;
  let totalAgil = 0;

  for (const s of norm.slots) {
    const loc = axialToLocal(s.q, s.r, 1);
    let adj = 0;
    for (const d of AXIAL_DIRS) {
      if (occupied.has(axialKey(s.q + d.q, s.r + d.r))) adj++;
    }
    locals.set(s.hexIndex, { x: loc.x, y: loc.y, adj });
    minX = Math.min(minX, loc.x);
    maxX = Math.max(maxX, loc.x);
    minY = Math.min(minY, loc.y);
    maxY = Math.max(maxY, loc.y);
    totalAdj += adj;

    const mat = MATERIALS[materials[s.hexIndex] ?? 'base'];
    totalHard += mat.hard * (1 + 0.1 * adj);
    totalAgil += mat.agil;
  }

  const n = Math.max(1, norm.slots.length);
  const spanX = Math.max(0.01, maxX - minX);
  const tipThresholdX = maxX - Math.max(0.95, spanX * 0.22);

  let maxTipSharp = 0;

  for (const s of norm.slots) {
    const info = locals.get(s.hexIndex)!;
    const mat = MATERIALS[materials[s.hexIndex] ?? 'base'];

    if (s.hexIndex === norm.rootHexIndex) {
      roles[s.hexIndex] = 'root';
    } else if (norm.stance === 'defense') {
      // Exposed front face (no teammate strictly ahead at q+1, r)
      const hasFrontCover = occupied.has(axialKey(s.q + 1, s.r));
      if (!hasFrontCover && info.x >= (minX + maxX) * 0.35) {
        roles[s.hexIndex] = 'front';
      } else if (info.adj >= 4) {
        roles[s.hexIndex] = 'core';
      } else if (Math.abs(info.y) > 1.8) {
        roles[s.hexIndex] = 'wing';
      } else {
        roles[s.hexIndex] = 'spine';
      }
    } else {
      // Ranged / Melee: forward-most exposed hexes automatically become Tips (+35% sharpness!)
      if (info.x >= tipThresholdX && info.adj <= 3) {
        roles[s.hexIndex] = 'tip';
        maxTipSharp = Math.max(maxTipSharp, mat.sharp * 1.35);
      } else if (info.adj >= 4) {
        roles[s.hexIndex] = 'core';
      } else if (Math.abs(info.y) <= 1.25) {
        roles[s.hexIndex] = 'spine';
      } else {
        roles[s.hexIndex] = 'wing';
      }
    }
  }

  if (maxTipSharp === 0) {
    for (const s of norm.slots) {
      const mat = MATERIALS[materials[s.hexIndex] ?? 'base'];
      maxTipSharp = Math.max(maxTipSharp, mat.sharp);
    }
  }

  // Safe anchor distance factor (in units of R) so even backward-extending hexes clear PLAYER_RADIUS!
  // At minLocalX = 0 -> 1.15 * R; at minLocalX = -1.73 (shield backing) -> ~2.85 * R -> capped neatly around 2.05..3.2
  const baseClearance = norm.stance === 'defense' ? 1.15 : 1.05;
  const anchorDistFactor = Math.max(
    norm.stance === 'defense' ? 1.85 : 1.15,
    baseClearance - Math.min(0, minX) + 0.12,
  );

  const avgAdj = totalAdj / n;
  const avgHard = totalHard / n;
  const avgAgil = totalAgil / n;
  const lateralSpan = maxY - minY;

  return {
    roles,
    anchorDistFactor,
    minLocalX: Number.isFinite(minX) ? minX : 0,
    maxLocalX: Number.isFinite(maxX) ? maxX : 0,
    reachScore: clamp(Math.round(((maxX + 1.0) / 9.2) * 100), 12, 100),
    coverageScore: clamp(Math.round(((lateralSpan + 1.5) / 7.8) * 100), 15, 100),
    hardnessScore: clamp(Math.round((avgHard / 185) * 100), 15, 100),
    pierceScore: clamp(Math.round((maxTipSharp / 205) * 100), 15, 100),
    agilityScore: clamp(Math.round((avgAgil / 140) * 100), 15, 100),
    avgAdjacency: avgAdj,
  };
}

/**
 * Safely sanitizes an untrusted/persisted PlayerLoadout object, falling back to DEFAULT_LOADOUT on corruption.
 */
export function sanitizeLoadout(raw: unknown): PlayerLoadout {
  try {
    if (!raw || typeof raw !== 'object') return createDefaultLoadout();
    const obj = raw as Partial<PlayerLoadout>;
    if (!Array.isArray(obj.hexMaterials)) return createDefaultLoadout();
    if (obj.hexMaterials.length < MIN_HEX_COUNT || obj.hexMaterials.length > MAX_HEX_COUNT) {
      return createDefaultLoadout();
    }
    const validMats: MaterialId[] = obj.hexMaterials.map((m) =>
      m === 'base' || m === 'heavy' || m === 'sharp' || m === 'light' ? m : 'base',
    );
    const fallback = resizeLoadoutHexCount(createDefaultLoadout(), validMats.length);
    const slotKeys: SlotKey[] = ['slot1', 'slot2', 'slot3'];

    for (const sk of slotKeys) {
      const candidate = obj.blueprints?.[sk];
      if (!candidate || !Array.isArray(candidate.slots)) continue;
      const cleanBp: WeaponBlueprint = {
        id: sk,
        name: typeof candidate.name === 'string' && candidate.name.trim()
          ? candidate.name.trim().slice(0, 18)
          : fallback.blueprints[sk].name,
        stance:
          candidate.stance === 'ranged' || candidate.stance === 'melee' || candidate.stance === 'defense'
            ? candidate.stance
            : fallback.blueprints[sk].stance,
        defaultScale:
          candidate.defaultScale === 0.6 || candidate.defaultScale === 1.0 || candidate.defaultScale === 1.5
            ? candidate.defaultScale
            : fallback.blueprints[sk].defaultScale,
        rootHexIndex:
          typeof candidate.rootHexIndex === 'number' &&
          candidate.rootHexIndex >= 0 &&
          candidate.rootHexIndex < validMats.length
            ? candidate.rootHexIndex
            : 0,
        slots: candidate.slots
          .filter(
            (s) =>
              s &&
              typeof s.hexIndex === 'number' &&
              s.hexIndex >= 0 &&
              s.hexIndex < validMats.length &&
              Number.isFinite(s.q) &&
              Number.isFinite(s.r),
          )
          .map((s) => ({ hexIndex: Math.round(s.hexIndex), q: Math.round(s.q), r: Math.round(s.r) })),
      };

      const check = validateBlueprint(cleanBp, validMats.length);
      if (check.valid) {
        fallback.blueprints[sk] = normalizeBlueprint(cleanBp);
      } else if (cleanBp.slots.length === validMats.length && check.missingHexIndices.length === 0) {
        fallback.blueprints[sk] = autoConnectBlueprint(cleanBp);
      }
    }

    fallback.hexMaterials = validMats;
    return fallback;
  } catch {
    return createDefaultLoadout();
  }
}
