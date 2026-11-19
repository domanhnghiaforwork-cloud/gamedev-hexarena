import { ARENA_RADIUS, PLAYER_RADIUS, SPAWN_OFFSET_X, SQRT3 } from './constants';
import { clamp } from './hexMath';
import type { Fighter, HexEntity, Obstacle, ObstaclePlane, Vec2 } from './types';

function getObstacleNormals(shape: 'hex' | 'square' | 'rect', r: number, hw: number, hh: number, angle: number): ObstaclePlane[] {
  if (shape === 'hex') {
    const apothem = r * (SQRT3 / 2);
    const list: ObstaclePlane[] = [];
    for (let i = 0; i < 6; i++) {
      const ang = angle + (i * Math.PI) / 3 + Math.PI / 6;
      list.push({ nx: Math.cos(ang), ny: Math.sin(ang), d: apothem });
    }
    return list;
  }
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    { nx: c, ny: s, d: hw },
    { nx: -c, ny: -s, d: hw },
    { nx: -s, ny: c, d: hh },
    { nx: s, ny: -c, d: hh },
  ];
}

function getObstacleVertices(shape: 'hex' | 'square' | 'rect', x: number, y: number, r: number, hw: number, hh: number, angle: number): Vec2[] {
  if (shape === 'hex') {
    const pts: Vec2[] = [];
    for (let i = 0; i < 6; i++) {
      const ang = angle + (i * Math.PI) / 3;
      pts.push({ x: x + Math.cos(ang) * r, y: y + Math.sin(ang) * r });
    }
    return pts;
  }
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const corners: Array<[number, number]> = [
    [hw, hh],
    [-hw, hh],
    [-hw, -hh],
    [hw, -hh],
  ];
  return corners.map(([lx, ly]) => ({
    x: x + lx * c - ly * s,
    y: y + lx * s + ly * c,
  }));
}

export function generateObstacles(rng: () => number = Math.random): Obstacle[] {
  const count = 3 + Math.floor(rng() * 3); // 3 to 5 obstacles
  const shapes: Array<'hex' | 'square' | 'rect'> = ['hex', 'square', 'rect'];
  const list: Obstacle[] = [];
  const spawnPoints = [
    { x: -SPAWN_OFFSET_X, y: 0 },
    { x: SPAWN_OFFSET_X, y: 0 },
  ];

  const arenaApothem = ARENA_RADIUS * (SQRT3 / 2);

  for (let i = 0; i < count; i++) {
    let placed: Obstacle | null = null;
    for (let attempt = 0; attempt < 90; attempt++) {
      const shape = shapes[Math.floor(rng() * shapes.length)];
      let r = 0;
      let hw = 0;
      let hh = 0;
      let angle = 0;
      let boundR = 0;

      if (shape === 'hex') {
        r = 40 + rng() * 24;
        angle = rng() < 0.5 ? 0 : Math.PI / 6;
        boundR = r;
      } else if (shape === 'square') {
        const half = 34 + rng() * 18;
        hw = half;
        hh = half;
        angle = rng() < 0.5 ? 0 : Math.PI / 4;
        boundR = half * Math.SQRT2;
      } else {
        hw = 58 + rng() * 34;
        hh = 20 + rng() * 11;
        angle = Math.floor(rng() * 6) * (Math.PI / 6);
        boundR = Math.hypot(hw, hh);
      }

      const distR = 85 + rng() * (arenaApothem - boundR - 140);
      const theta = rng() * Math.PI * 2;
      const x = Math.cos(theta) * distR;
      const y = Math.sin(theta) * distR;

      // Stay well inside hex arena walls
      let insideWall = true;
      for (let k = 0; k < 6; k++) {
        const nang = ((k * 60 + 30) * Math.PI) / 180;
        const proj = x * Math.cos(nang) + y * Math.sin(nang);
        if (proj > arenaApothem - boundR - 64) {
          insideWall = false;
          break;
        }
      }
      if (!insideWall) continue;

      // Keep clear of spawn points
      let clearSpawn = true;
      for (const sp of spawnPoints) {
        if (Math.hypot(x - sp.x, y - sp.y) < boundR + PLAYER_RADIUS + 115) {
          clearSpawn = false;
          break;
        }
      }
      if (!clearSpawn) continue;

      // Keep navigable corridors between obstacles
      let clearOther = true;
      for (const other of list) {
        if (Math.hypot(x - other.x, y - other.y) < boundR + other.boundR + 108) {
          clearOther = false;
          break;
        }
      }
      if (!clearOther) continue;

      placed = {
        id: i,
        shape,
        x,
        y,
        angle,
        r,
        hw,
        hh,
        boundR,
        height: 18 + rng() * 12,
        normals: getObstacleNormals(shape, r, hw, hh, angle),
        verts: getObstacleVertices(shape, x, y, r, hw, hh, angle),
      };
      break;
    }

    if (placed) list.push(placed);
  }

  // Fallback guaranteed symmetric pillars if RNG got unlucky
  if (list.length < 3) {
    const fallbackCoords = [
      { x: 0, y: -210 },
      { x: 0, y: 210 },
      { x: -170, y: 0 },
    ];
    for (let i = list.length; i < 3; i++) {
      const c = fallbackCoords[i];
      const r = 48;
      list.push({
        id: i,
        shape: 'hex',
        x: c.x,
        y: c.y,
        angle: 0,
        r,
        hw: 0,
        hh: 0,
        boundR: r,
        height: 22,
        normals: getObstacleNormals('hex', r, 0, 0, 0),
        verts: getObstacleVertices('hex', c.x, c.y, r, 0, 0, 0),
      });
    }
  }

  return list;
}

export function constrainToHexArena(entity: Vec2, margin = 0): { nx: number; ny: number } | null {
  const apothem = (ARENA_RADIUS - margin) * (SQRT3 / 2);
  let bounced = false;
  let bounceNx = 0;
  let bounceNy = 0;
  for (let i = 0; i < 6; i++) {
    const ang = ((i * 60 + 30) * Math.PI) / 180;
    const nx = Math.cos(ang);
    const ny = Math.sin(ang);
    const proj = entity.x * nx + entity.y * ny;
    if (proj > apothem) {
      const excess = proj - apothem;
      entity.x -= nx * excess;
      entity.y -= ny * excess;
      bounced = true;
      bounceNx = -nx;
      bounceNy = -ny;
    }
  }
  return bounced ? { nx: bounceNx, ny: bounceNy } : null;
}

export interface PushoutHit {
  nx: number;
  ny: number;
  push: number;
}

export function resolveCircleObstacle(px: number, py: number, radius: number, obs: Obstacle): PushoutHit | null {
  if (Math.hypot(px - obs.x, py - obs.y) > obs.boundR + radius + 4) return null;

  if (obs.shape === 'square' || obs.shape === 'rect') {
    const dx = px - obs.x;
    const dy = py - obs.y;
    const c = Math.cos(-obs.angle);
    const s = Math.sin(-obs.angle);
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;

    const clampedX = clamp(lx, -obs.hw, obs.hw);
    const clampedY = clamp(ly, -obs.hh, obs.hh);
    const diffX = lx - clampedX;
    const diffY = ly - clampedY;
    const d = Math.hypot(diffX, diffY);

    if (d >= radius) return null;

    let lnx: number;
    let lny: number;
    let push: number;
    if (d > 1e-5) {
      lnx = diffX / d;
      lny = diffY / d;
      push = radius - d;
    } else {
      const penX = obs.hw - Math.abs(lx);
      const penY = obs.hh - Math.abs(ly);
      if (penX < penY) {
        lnx = lx >= 0 ? 1 : -1;
        lny = 0;
        push = penX + radius;
      } else {
        lnx = 0;
        lny = ly >= 0 ? 1 : -1;
        push = penY + radius;
      }
    }

    const cw = Math.cos(obs.angle);
    const sw = Math.sin(obs.angle);
    return {
      nx: lnx * cw - lny * sw,
      ny: lnx * sw + lny * cw,
      push,
    };
  }

  let inside = true;
  let minPen = Infinity;
  let minNx = 1;
  let minNy = 0;
  for (const plane of obs.normals) {
    const proj = (px - obs.x) * plane.nx + (py - obs.y) * plane.ny;
    if (proj > plane.d) {
      inside = false;
      break;
    }
    const pen = plane.d - proj;
    if (pen < minPen) {
      minPen = pen;
      minNx = plane.nx;
      minNy = plane.ny;
    }
  }
  if (inside) {
    return { nx: minNx, ny: minNy, push: minPen + radius };
  }

  const verts = obs.verts;
  let bestDistSq = Infinity;
  let bestCx = obs.x;
  let bestCy = obs.y;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abLenSq = abx * abx + aby * aby;
    const t = abLenSq > 1e-6 ? clamp(((px - a.x) * abx + (py - a.y) * aby) / abLenSq, 0, 1) : 0;
    const cx = a.x + abx * t;
    const cy = a.y + aby * t;
    const dSq = (px - cx) * (px - cx) + (py - cy) * (py - cy);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestCx = cx;
      bestCy = cy;
    }
  }

  const d = Math.sqrt(bestDistSq);
  if (d < radius && d > 1e-5) {
    return {
      nx: (px - bestCx) / d,
      ny: (py - bestCy) / d,
      push: radius - d,
    };
  }
  return null;
}

export interface SegmentHit {
  t: number;
  nx: number;
  ny: number;
}

export function segmentIntersectsObstacle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  obs: Obstacle,
  pad = 0,
): SegmentHit | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;
  let hitNx = 0;
  let hitNy = 0;

  for (const plane of obs.normals) {
    const distStart = (x1 - obs.x) * plane.nx + (y1 - obs.y) * plane.ny - (plane.d + pad);
    const denom = dx * plane.nx + dy * plane.ny;

    if (Math.abs(denom) < 1e-8) {
      if (distStart > 0) return null;
    } else {
      const t = -distStart / denom;
      if (denom < 0) {
        if (t > tMin) {
          tMin = t;
          hitNx = plane.nx;
          hitNy = plane.ny;
        }
      } else {
        if (t < tMax) tMax = t;
      }
      if (tMin > tMax) return null;
    }
  }

  if (tMin <= tMax && tMax >= 0 && tMin <= 1) {
    return { t: tMin, nx: hitNx, ny: hitNy };
  }
  return null;
}

export function segmentIntersectsAnyObstacle(
  obstacles: Obstacle[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  pad = 0,
): (SegmentHit & { obs: Obstacle }) | null {
  for (const obs of obstacles) {
    const hit = segmentIntersectsObstacle(x1, y1, x2, y2, obs, pad);
    if (hit) return { obs, ...hit };
  }
  return null;
}

export function isCircleBlockedByObstacle(
  obstacles: Obstacle[],
  px: number,
  py: number,
  radius: number,
): (PushoutHit & { obs: Obstacle }) | null {
  for (const obs of obstacles) {
    const hit = resolveCircleObstacle(px, py, radius, obs);
    if (hit) return { obs, ...hit };
  }
  return null;
}

export function placePlantedHexSafely(
  obstacles: Obstacle[],
  hex: HexEntity,
  R: number,
  fighter: Fighter,
  opponent: Fighter,
): void {
  const minFD = PLAYER_RADIUS + R * 0.90;
  for (const fBody of [opponent, fighter]) {
    const dx = hex.x - fBody.x;
    const dy = hex.y - fBody.y;
    const d = Math.hypot(dx, dy);
    if (d < minFD) {
      const nx = d > 1e-4 ? dx / d : Math.cos(hex.orbitAngle);
      const ny = d > 1e-4 ? dy / d : Math.sin(hex.orbitAngle);
      hex.x = fBody.x + nx * minFD;
      hex.y = fBody.y + ny * minFD;
    }
  }
  constrainToHexArena(hex, R + 4);
  for (const obs of obstacles) {
    const hit = resolveCircleObstacle(hex.x, hex.y, R * 0.85, obs);
    if (hit) {
      hex.x += hit.nx * hit.push;
      hex.y += hit.ny * hit.push;
    }
  }
}
