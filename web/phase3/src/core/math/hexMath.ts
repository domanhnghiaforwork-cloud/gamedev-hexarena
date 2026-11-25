import { SQRT3 } from '../constants';
import type { AxialCoord, Vec2 } from '../types';

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function angleDiff(a: number, b: number): number {
  let d = (b - a + Math.PI) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return d - Math.PI;
}

export function axialKey(q: number, r: number): string {
  return `${q},${r}`;
}

/**
 * Converts axial hex coordinate (q, r) into local (x, y) coordinates for
 * pointy-top hexes with exact edge-to-edge locking at radius R.
 * Adjacent hex centers are strictly sqrt(3) * R apart.
 */
export function axialToLocal(q: number, r: number, R: number): Vec2 {
  return {
    x: R * SQRT3 * (q + r * 0.5),
    y: R * 1.5 * r,
  };
}

/**
 * Exact inverse of axialToLocal using cube rounding (for interactive drag-and-drop hex grid).
 */
export function localToAxial(x: number, y: number, R: number): AxialCoord {
  const fracR = y / (1.5 * R);
  const fracQ = x / (SQRT3 * R) - fracR * 0.5;
  return cubeRound(fracQ, fracR);
}

export function cubeRound(fracQ: number, fracR: number): AxialCoord {
  const fracS = -fracQ - fracR;
  let rq = Math.round(fracQ);
  let rr = Math.round(fracR);
  const rs = Math.round(fracS);

  const qDiff = Math.abs(rq - fracQ);
  const rDiff = Math.abs(rr - fracR);
  const sDiff = Math.abs(rs - fracS);

  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }
  return { q: rq === 0 ? 0 : rq, r: rr === 0 ? 0 : rr };
}

export function axialDistance(a: AxialCoord, b: AxialCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}
