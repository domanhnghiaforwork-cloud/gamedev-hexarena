import { DEFAULT_COSMETICS, getNeonTheme, type PlayerCosmetics } from '@config/cosmetics';
import { canvasFont } from '@config/typography';
import { AXIAL_DIRS, BASE_HEX_RADIUS, PLAYER_RADIUS } from '@core/constants';
import { axialKey, axialToLocal, clamp } from '@core/math/hexMath';
import { segmentIntersectsAnyObstacle } from '@core/world/obstacles';
import {
  RANGED_SNIPER_CONE_HALF_ANGLE,
  RANGED_SNIPER_RANGE,
  computePrismWebClusters,
  getActiveStance,
  getLooseGravityFieldRadius,
  getLooseOrbitRadius,
  isDefenseFortressActive,
  isDefenseHexWallActive,
  isHexStolen,
  isLooseGravityFieldActive,
  isLoosePrismWebActive,
  isRangedSniperActive,
} from '@core/world/structure';
import type { Fighter, HexEntity, Obstacle, SummonedWall } from '@core/types';
import { drawHexPolygon } from './arenaRenderer';

export function renderGravityField(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  nowSec: number,
  playerCosmetics: PlayerCosmetics = DEFAULT_COSMETICS,
): void {
  if (!isLooseGravityFieldActive(f)) return;
  const fieldR = getLooseGravityFieldRadius(f);
  const orbitR = getLooseOrbitRadius(f);
  const isPlayer = f.id === 'player';
  const ringColor = isPlayer ? getNeonTheme(playerCosmetics.neonTheme).main : '#fb7185';
  const fillRgba = isPlayer ? 'rgba(56, 189, 248,' : 'rgba(251, 113, 133,';

  ctx.save();
  // Gravity well gradient fill spanning from fighter body edge to expanded outer boundary (+40% over v2)
  const grad = ctx.createRadialGradient(f.x, f.y, PLAYER_RADIUS * 0.9, f.x, f.y, fieldR);
  grad.addColorStop(0, `${fillRgba} 0.04)`);
  grad.addColorStop(0.55, `${fillRgba} 0.14)`);
  grad.addColorStop(0.92, `${fillRgba} 0.24)`);
  grad.addColorStop(1, `${fillRgba} 0.04)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(f.x, f.y, fieldR, 0, Math.PI * 2);
  ctx.fill();

  // Middle orbit guide ring where loose shards spin
  ctx.strokeStyle = isPlayer ? 'rgba(186, 230, 253, 0.36)' : 'rgba(254, 205, 211, 0.36)';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([7, 7]);
  ctx.lineDashOffset = -nowSec * 65;
  ctx.beginPath();
  ctx.arc(f.x, f.y, orbitR, 0, Math.PI * 2);
  ctx.stroke();

  // Outer gravity boundary ring (-80% enemy physical entity speed zone)
  ctx.strokeStyle = ringColor;
  ctx.globalAlpha = 0.72;
  ctx.lineWidth = 2.6;
  ctx.setLineDash([14, 8]);
  ctx.lineDashOffset = nowSec * 48;
  ctx.beginPath();
  ctx.arc(f.x, f.y, fieldR, 0, Math.PI * 2);
  ctx.stroke();

  // Orbiting gravitational motes pulled gently inward
  ctx.setLineDash([]);
  ctx.fillStyle = ringColor;
  for (let i = 0; i < 6; i++) {
    const a = nowSec * 1.4 + (i * Math.PI) / 3;
    const radialFrac = 0.58 + 0.32 * (1 - ((nowSec * 0.65 + i * 0.17) % 1));
    const mx = f.x + Math.cos(a) * fieldR * radialFrac;
    const my = f.y + Math.sin(a) * fieldR * radialFrac;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(mx, my, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle inward gravity ripple pulse
  const pulseT = (nowSec * 0.75) % 1;
  const pulseR = fieldR - (fieldR - PLAYER_RADIUS) * pulseT;
  ctx.strokeStyle = isPlayer ? `rgba(186, 230, 253, ${(1 - pulseT) * 0.30})` : `rgba(254, 205, 211, ${(1 - pulseT) * 0.30})`;
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(f.x, f.y, pulseR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}


export function renderPrismWeb(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  nowSec: number,
): void {
  if (!isLoosePrismWebActive(f)) return;
  const isPlayer = f.id === 'player';
  const beamColor = isPlayer ? '#c084fc' : '#fb7185';
  const coreColor = isPlayer ? '#f5d0fe' : '#ffe4e6';
  const fillRgb = isPlayer ? '168, 85, 247' : '244, 63, 94';
  const clusters = computePrismWebClusters(f);
  const pulse = 0.5 + 0.5 * Math.sin(nowSec * 6.5);

  ctx.save();
  // Soft beacon ring on unlinked PLANTED hexes ready to tether
  const planted = f.hexes.filter((h) => h.state === 'PLANTED');
  const linkedIds = new Set<number>();
  for (const c of clusters) {
    for (const n of c.nodes) linkedIds.add(n.id);
  }
  for (const h of planted) {
    if (linkedIds.has(h.id)) continue;
    ctx.beginPath();
    ctx.arc(h.x, h.y, BASE_HEX_RADIUS * f.currentScale + 8 + pulse * 2.5, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${fillRgb}, 0.55)`;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const cluster of clusters) {
    // Closed Convex Hull slow region (-40% enemy speed)
    if (cluster.isClosed && cluster.hull.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(cluster.hull[0].x, cluster.hull[0].y);
      for (let i = 1; i < cluster.hull.length; i++) {
        ctx.lineTo(cluster.hull[i].x, cluster.hull[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(${fillRgb}, ${(0.15 + 0.05 * pulse).toFixed(3)})`;
      ctx.fill();

      ctx.strokeStyle = `rgba(${fillRgb}, 0.38)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -nowSec * 42;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3-layer laser beams along every convex hull / tether edge
    ctx.lineCap = 'round';
    for (const [a, b] of cluster.edges) {
      // Outer bloom
      ctx.strokeStyle = `rgba(${fillRgb}, ${(0.28 + 0.10 * pulse).toFixed(3)})`;
      ctx.lineWidth = 11 + pulse * 2.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // Mid neon beam
      ctx.strokeStyle = beamColor;
      ctx.lineWidth = 4.2 + pulse * 1.0;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // Crisp white laser core
      ctx.strokeStyle = coreColor;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Pylon rings around convex hull vertices
    for (const v of cluster.hull) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, BASE_HEX_RADIUS * f.currentScale * 0.92 + 5, 0, Math.PI * 2);
      ctx.strokeStyle = coreColor;
      ctx.lineWidth = 2.0;
      ctx.stroke();
    }
  }
  ctx.restore();
}


export function renderSniperStageCone(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  obstacles: Obstacle[],
  nowSec: number,
): void {
  if (!isRangedSniperActive(f) || !f.specialActive) return;
  const coneAngle = f.specialActive.coneAngle ?? f.facing;
  const half = f.specialActive.coneHalfAngle ?? RANGED_SNIPER_CONE_HALF_ANGLE;
  const range = RANGED_SNIPER_RANGE;
  const isPlayer = f.id === 'player';
  const nextShotIsFourth = (f.specialActive.shotsFired ?? 0) + 1 === 4;
  const mainCol = !isPlayer ? '#fb7185' : nextShotIsFourth ? '#fbbf24' : '#e879f9';
  const fillCol = !isPlayer
    ? 'rgba(251, 113, 133, 0.08)'
    : nextShotIsFourth
      ? 'rgba(251, 191, 36, 0.11)'
      : 'rgba(232, 121, 249, 0.09)';

  ctx.save();
  // Stage sector fill
  ctx.beginPath();
  ctx.moveTo(f.x, f.y);
  ctx.arc(f.x, f.y, range, coneAngle - half, coneAngle + half);
  ctx.closePath();
  ctx.fillStyle = fillCol;
  ctx.fill();

  // Outer range arc & boundary rails
  ctx.strokeStyle = mainCol;
  ctx.globalAlpha = 0.52;
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(f.x, f.y);
  ctx.lineTo(f.x + Math.cos(coneAngle - half) * range, f.y + Math.sin(coneAngle - half) * range);
  ctx.moveTo(f.x, f.y);
  ctx.lineTo(f.x + Math.cos(coneAngle + half) * range, f.y + Math.sin(coneAngle + half) * range);
  ctx.stroke();

  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -nowSec * 36;
  ctx.beginPath();
  ctx.arc(f.x, f.y, range, coneAngle - half, coneAngle + half);
  ctx.stroke();

  // Inner distance calibration rings (350 / 700)
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 1.2;
  for (const rRing of [350, 700]) {
    ctx.beginPath();
    ctx.arc(f.x, f.y, rRing, coneAngle - half, coneAngle + half);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Clipped laser sightline along current facing
  const aimEndX = f.x + Math.cos(f.facing) * range;
  const aimEndY = f.y + Math.sin(f.facing) * range;
  const obsHit = segmentIntersectsAnyObstacle(obstacles, f.x, f.y, aimEndX, aimEndY, 4);
  const sightT = obsHit ? obsHit.t : 1.0;
  const sightX = f.x + (aimEndX - f.x) * sightT;
  const sightY = f.y + (aimEndY - f.y) * sightT;

  ctx.globalAlpha = nextShotIsFourth ? 0.92 : 0.72;
  ctx.strokeStyle = mainCol;
  ctx.lineWidth = nextShotIsFourth ? 2.6 : 1.8;
  ctx.beginPath();
  ctx.moveTo(f.x + Math.cos(f.facing) * (PLAYER_RADIUS + 8), f.y + Math.sin(f.facing) * (PLAYER_RADIUS + 8));
  ctx.lineTo(sightX, sightY);
  ctx.stroke();

  if (obsHit) {
    ctx.beginPath();
    ctx.arc(sightX, sightY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = mainCol;
    ctx.fill();
  }

  // Remaining Ammo Pips below shooter (4th shot diamond-highlighted in gold!)
  if (isPlayer) {
    const totalAmmo = f.specialActive.totalAmmo ?? f.hexes.length;
    const shotsFired = f.specialActive.shotsFired ?? 0;
    const remaining = f.hexes.filter((h) => h.state === 'ASSEMBLED').length;
    const pipGap = 11;
    const startX = f.x - ((totalAmmo - 1) * pipGap) * 0.5;
    const pipY = f.y + PLAYER_RADIUS + 18;
    ctx.globalAlpha = 0.95;
    for (let i = 0; i < totalAmmo; i++) {
      const px = startX + i * pipGap;
      const spent = i < shotsFired || i >= shotsFired + remaining;
      const isFourthPip = i === 3;
      const isCurrent = i === shotsFired;
      ctx.beginPath();
      if (isFourthPip) {
        const s = isCurrent ? 5.8 : 4.6;
        ctx.moveTo(px, pipY - s);
        ctx.lineTo(px + s, pipY);
        ctx.lineTo(px, pipY + s);
        ctx.lineTo(px - s, pipY);
        ctx.closePath();
      } else {
        ctx.arc(px, pipY, isCurrent ? 4.2 : 3.2, 0, Math.PI * 2);
      }
      ctx.fillStyle = spent
        ? 'rgba(148, 163, 184, 0.25)'
        : isFourthPip
          ? '#fbbf24'
          : '#e879f9';
      ctx.fill();
      if (!spent && isCurrent) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}


export function renderFighterBody(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  nowSec: number,
  isSlowed = false,
  playerCosmetics: PlayerCosmetics = DEFAULT_COSMETICS,
): void {
  const isPlayer = f.id === 'player';
  const theme = isPlayer ? getNeonTheme(playerCosmetics.neonTheme) : null;
  const mainColor = theme ? theme.main : '#fb7185';
  const lightColor = theme ? theme.light : '#fecdd3';
  const bodyFill = theme ? theme.bodyFillRgba : 'rgba(251, 113, 133, 0.11)';
  const dashTrail = isPlayer ? playerCosmetics.dashTrail : 'ghost';

  // Cosmetic Dash Afterimages
  if (f.dashAfterimages.length > 0) {
    if (dashTrail === 'bolt') {
      ctx.save();
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      f.dashAfterimages.forEach((img, idx) => {
        const jx = img.x + Math.sin(nowSec * 45 + idx * 3.1) * 5;
        const jy = img.y + Math.cos(nowSec * 41 + idx * 2.3) * 5;
        if (idx === 0) ctx.moveTo(jx, jy);
        else ctx.lineTo(jx, jy);
      });
      ctx.lineTo(f.x, f.y);
      ctx.globalAlpha = 0.75;
      ctx.stroke();
      ctx.restore();
    }

    const prismPalette = ['#38bdf8', '#c084fc', '#fbbf24'];
    f.dashAfterimages.forEach((img, idx) => {
      const a = clamp(img.life / img.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a * 0.52;
      if (dashTrail === 'hex-wake') {
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 2.3;
        drawHexPolygon(ctx, img.x, img.y, PLAYER_RADIUS * (0.72 + 0.25 * a), nowSec * 4 + idx * 0.5);
        ctx.stroke();
      } else {
        ctx.strokeStyle = dashTrail === 'prism' ? prismPalette[idx % prismPalette.length] : mainColor;
        ctx.lineWidth = dashTrail === 'prism' ? 3.0 : 2.5;
        ctx.beginPath();
        ctx.arc(img.x, img.y, PLAYER_RADIUS * (0.75 + 0.25 * a), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  // Ground Hitbox Ring (PLAYER_RADIUS = 32)
  ctx.save();
  ctx.beginPath();
  ctx.arc(f.x, f.y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = bodyFill;
  ctx.fill();
  ctx.strokeStyle = f.damageFlash > 0 ? '#ffffff' : mainColor;
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // Facing pointer notch on ground ring
  const fx = f.x + Math.cos(f.facing) * (PLAYER_RADIUS + 4);
  const fy = f.y + Math.sin(f.facing) * (PLAYER_RADIUS + 4);
  ctx.fillStyle = lightColor;
  ctx.beginPath();
  ctx.arc(fx, fy, 4.2, 0, Math.PI * 2);
  ctx.fill();

  // Gravity slow indicator around slowed enemy fighter
  if (isSlowed) {
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = nowSec * 36;
    ctx.beginPath();
    ctx.arc(f.x, f.y, PLAYER_RADIUS + 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Special Skill active visual signatures around Fighter
  if (f.specialActive) {
    const sp = f.specialActive;
    const progress = clamp(sp.timer / Math.max(0.01, sp.maxTimer), 0, 1);
    if (sp.type === 'melee') {
      // Rotating golden parry brackets
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.80)';
      ctx.lineWidth = 2.4;
      for (let i = 0; i < 4; i++) {
        const a0 = nowSec * 3.4 + (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.arc(f.x, f.y, PLAYER_RADIUS + 10, a0, a0 + 0.48);
        ctx.stroke();
      }
      ctx.restore();
    } else if (isRangedSniperActive(f)) {
      const nextFourth = (sp.shotsFired ?? 0) + 1 === 4;
      ctx.save();
      ctx.strokeStyle = nextFourth ? 'rgba(251, 191, 36, 0.85)' : 'rgba(232, 121, 249, 0.78)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(f.x, f.y, PLAYER_RADIUS + 10, f.facing - 0.55, f.facing + 0.55);
      ctx.stroke();
      ctx.restore();
    } else if (sp.type === 'ranged') {
      // Violet plasma halo ring
      ctx.save();
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.65)';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -nowSec * 42;
      ctx.beginPath();
      ctx.arc(f.x, f.y, PLAYER_RADIUS + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (isDefenseFortressActive(f)) {
      const stored = sp.storedEnergy ?? 0;
      const chargeRatio = clamp(stored / 360, 0, 1);
      ctx.save();
      ctx.strokeStyle = stored >= 60 ? '#fbbf24' : '#34d399';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(f.x, f.y, PLAYER_RADIUS + 8, f.facing - 1.12, f.facing + 1.12);
      ctx.stroke();
      if (chargeRatio > 0.02) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(f.x, f.y, PLAYER_RADIUS + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * chargeRatio);
        ctx.stroke();
      }
      ctx.restore();
    } else if (isDefenseHexWallActive(f)) {
      ctx.save();
      ctx.strokeStyle = 'rgba(45, 212, 191, 0.72)';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -nowSec * 30;
      drawHexPolygon(ctx, f.x, f.y, PLAYER_RADIUS + 11, nowSec * 0.6);
      ctx.stroke();
      ctx.restore();
    }

    // Active special duration arc around character
    const spColor =
      sp.type === 'loose'
        ? sp.skillId === 'loose:prism_web'
          ? '#a855f7'
          : mainColor
        : sp.type === 'melee'
          ? '#fbbf24'
          : sp.type === 'ranged'
            ? '#c084fc'
            : isDefenseHexWallActive(f)
              ? '#2dd4bf'
              : '#34d399';
    ctx.strokeStyle = spColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(f.x, f.y, PLAYER_RADIUS + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
  }

  // Dual-layer 2.5D Sphere Drop Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(f.x + 3, f.y + 10, 21, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
  ctx.beginPath();
  ctx.ellipse(f.x + 2, f.y + 7, 15.5, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Elevated Glowing Sphere Core (with tactile backward kick on sniper shots)
  const recoilFrac = f.recoilTimer > 0 ? clamp(f.recoilTimer / 0.24, 0, 1) : 0;
  const recoilOff = f.recoilAmp * recoilFrac;
  const rx = f.x - Math.cos(f.recoilAngle) * recoilOff;
  const ry = f.y - Math.sin(f.recoilAngle) * recoilOff;
  const sphereY = ry - 6;
  const grad = ctx.createRadialGradient(rx - 5, sphereY - 6, 2, rx, sphereY, 19);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, f.damageFlash > 0 ? '#ffffff' : lightColor);
  grad.addColorStop(1, mainColor);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(rx, sphereY, 17, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}


function drawMaterialEmblem(
  ctx: CanvasRenderingContext2D,
  matId: string,
  R: number,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  if (matId === 'heavy') {
    drawHexPolygon(ctx, 0, 0, R * 0.44, Math.PI / 6);
    ctx.globalAlpha = 0.72;
    ctx.fill();
  } else if (matId === 'sharp') {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? R * 0.54 : R * 0.20;
      const a = (i * Math.PI) / 4;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.9;
    ctx.fill();
  } else if (matId === 'light') {
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.38, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}


function drawThreeTierCracks(ctx: CanvasRenderingContext2D, R: number, hpRatio: number, nowSec: number): void {
  if (hpRatio > 0.75) return;
  const tier = hpRatio <= 0.25 ? 3 : hpRatio <= 0.5 ? 2 : 1;
  const pulse = tier === 3 ? 0.65 + 0.35 * Math.sin(nowSec * 18) : 1.0;

  ctx.save();
  ctx.strokeStyle = tier === 3 ? `rgba(251, 191, 36, ${pulse})` : '#fbbf24';
  ctx.lineWidth = tier === 3 ? 2.2 : 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (tier >= 2) {
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = tier === 3 ? 8 : 4;
  }

  // Crack 1 (<= 75%): V-shaped central crack
  ctx.beginPath();
  ctx.moveTo(-R * 0.32, -R * 0.28);
  ctx.lineTo(0, 0);
  ctx.lineTo(R * 0.34, -R * 0.14);
  ctx.stroke();

  if (tier >= 2) {
    // Crack 2 (<= 50%): Lower branching fracture
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-R * 0.12, R * 0.30);
    ctx.lineTo(R * 0.24, R * 0.44);
    ctx.stroke();
  }

  if (tier >= 3) {
    // Crack 3 (<= 25%): Deep critical spider split
    ctx.beginPath();
    ctx.moveTo(-R * 0.12, R * 0.30);
    ctx.lineTo(-R * 0.46, R * 0.18);
    ctx.moveTo(R * 0.34, -R * 0.14);
    ctx.lineTo(R * 0.56, -R * 0.36);
    ctx.stroke();
  }
  ctx.restore();
}


export function renderSummonedWalls(
  ctx: CanvasRenderingContext2D,
  walls: SummonedWall[],
  nowSec: number,
): void {
  if (walls.length === 0) return;
  const R = BASE_HEX_RADIUS;

  for (const wall of walls) {
    const isPlayer = wall.ownerId === 'player';
    const strokeColor = isPlayer ? '#2dd4bf' : '#fb7185';
    const fillColor = isPlayer ? 'rgba(20, 184, 166, 0.28)' : 'rgba(244, 63, 94, 0.26)';
    const expireAlpha = wall.timer < 1.0 ? clamp(wall.timer * (0.65 + 0.35 * Math.sin(nowSec * 18)), 0.15, 1) : 1;

    ctx.save();
    ctx.globalAlpha = expireAlpha;

    // Weld bridges between intact adjacent hexes of this wall
    const intact = wall.hexes.filter((wh) => !wh.broken);
    ctx.strokeStyle = strokeColor;
    ctx.lineCap = 'round';
    for (let i = 0; i < intact.length - 1; i++) {
      if (Math.abs(intact[i + 1].id - intact[i].id) !== 1) continue;
      ctx.globalAlpha = expireAlpha * 0.42;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(intact[i].x, intact[i].y);
      ctx.lineTo(intact[i + 1].x, intact[i + 1].y);
      ctx.stroke();

      ctx.strokeStyle = '#f8fafc';
      ctx.globalAlpha = expireAlpha * 0.72;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = strokeColor;
    }

    for (const wh of intact) {
      // 2.5D shadow
      ctx.globalAlpha = expireAlpha;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
      drawHexPolygon(ctx, wh.x + 3, wh.y + 5, R * 0.94, wall.angle + Math.PI / 6);
      ctx.fill();

      // Base-material hex block
      drawHexPolygon(ctx, wh.x, wh.y, R * 0.96, wall.angle + Math.PI / 6);
      ctx.fillStyle = wh.flashTimer > 0 ? 'rgba(255, 255, 255, 0.72)' : fillColor;
      ctx.fill();
      ctx.strokeStyle = wh.flashTimer > 0 ? '#ffffff' : strokeColor;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // Inner shield glyph ring
      drawHexPolygon(ctx, wh.x, wh.y, R * 0.48, wall.angle + Math.PI / 6);
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Durability bar if damaged
      const hpRatio = clamp(wh.hp / Math.max(1, wh.maxHp), 0, 1);
      if (hpRatio < 0.98) {
        const bw = R * 1.3;
        const bx = wh.x - bw * 0.5;
        const by = wh.y - R - 7;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(bx, by, bw, 3.2);
        ctx.fillStyle = hpRatio > 0.5 ? strokeColor : '#fbbf24';
        ctx.fillRect(bx, by, bw * hpRatio, 3.2);
      }
    }
    ctx.restore();
  }
}

export function renderFighterHexLayer(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  highFlightOnly: boolean,
  nowSec: number,
  hoverPlantedHexId = -1,
  playerCosmetics: PlayerCosmetics = DEFAULT_COSMETICS,
): void {
  const isPlayer = f.id === 'player';
  const theme = isPlayer ? getNeonTheme(playerCosmetics.neonTheme) : null;
  const baseColor = theme ? theme.main : '#fb7185';
  const baseFillRgba = theme ? theme.fillRgba : 'rgba(190, 18, 60, 0.34)';
  const R = BASE_HEX_RADIUS * f.currentScale;

  // Melee Swept Cleave Energy Arc
  if (!highFlightOnly && f.attackAnim?.type === 'melee' && !f.attackAnim.wallBlocked) {
    const anim = f.attackAnim;
    const p = clamp(anim.timer / Math.max(0.01, anim.duration), 0, 1);
    const curAng = anim.startAngle + (anim.endAngle - anim.startAngle) * p;
    const arcR = PLAYER_RADIUS + R * 3.1;
    ctx.save();
    ctx.strokeStyle = anim.empoweredParry ? 'rgba(251, 191, 36, 0.42)' : theme ? theme.glowRgba : 'rgba(251, 113, 133, 0.38)';
    ctx.lineWidth = R * 1.15;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(f.x, f.y, arcR, anim.startAngle, curAng);
    ctx.stroke();
    ctx.strokeStyle = anim.empoweredParry ? 'rgba(254, 240, 138, 0.72)' : 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();
  }

  // Draw Guided Ranged Weapon Dashed Target Silhouette (dynamic for ANY 5..10 hex blueprint!)
  if (
    !highFlightOnly &&
    getActiveStance(f) === 'ranged' &&
    f.attackAnim?.type === 'ranged' &&
    f.attackAnim.phase === 'guided' &&
    !f.isAI
  ) {
    const anim = f.attackAnim;
    const assembled = f.hexes.filter((h) => h.state === 'ASSEMBLED');
    if (assembled.length > 0) {
      ctx.save();
      // Dashed connector from current weapon anchor to target destination
      ctx.strokeStyle = anim.isManualSteer ? 'rgba(192, 132, 252, 0.72)' : 'rgba(56, 189, 248, 0.52)';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(anim.anchorX, anim.anchorY);
      ctx.lineTo(anim.targetX, anim.targetY);
      ctx.stroke();

      // Dashed weapon blueprint silhouette at target destination
      const cosT = Math.cos(anim.targetAngle);
      const sinT = Math.sin(anim.targetAngle);
      ctx.strokeStyle = anim.isManualSteer ? '#e879f9' : '#7dd3fc';
      ctx.fillStyle = anim.isManualSteer ? 'rgba(192, 132, 252, 0.14)' : 'rgba(56, 189, 248, 0.10)';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      for (const h of assembled) {
        const loc = axialToLocal(h.animQ, h.animR, R);
        const gx = anim.targetX + loc.x * cosT - loc.y * sinT;
        const gy = anim.targetY + loc.x * sinT + loc.y * cosT;
        drawHexPolygon(ctx, gx, gy, R * 0.94, anim.targetAngle + Math.PI / 6);
        ctx.fill();
        ctx.stroke();
      }

      // Status tag ("BAY QUA" / "LÁI" / "TỰ ĐỘNG" + countdown) + rotating diamond lock reticle
      ctx.setLineDash([]);
      ctx.save();
      ctx.translate(anim.targetX, anim.targetY);
      ctx.rotate(nowSec * 2.5);
      ctx.strokeStyle = anim.isManualSteer ? '#f0abfc' : '#c084fc';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(-7, -7, 14, 14);
      ctx.restore();

      const rem = f.specialActive ? f.specialActive.timer.toFixed(1) : '0.0';
      const label = anim.hasCmd
        ? `BAY QUA · ${rem}s`
        : anim.isManualSteer
          ? `LÁI · ${rem}s`
          : `TỰ ĐỘNG · ${rem}s`;
      ctx.font = canvasFont(700, 11);
      ctx.textAlign = 'center';
      ctx.fillStyle = anim.isManualSteer ? '#f0abfc' : '#bae6fd';
      ctx.fillText(label, anim.targetX, anim.targetY - R * 2.1);
      ctx.restore();
    }
  }

  // Two-pass Glowing Edge-Weld Bridges between adjacent assembled hexes (ground layer only)
  if (!highFlightOnly && f.form !== 'loose') {
    const assembled = f.hexes.filter((h) => h.state === 'ASSEMBLED');
    const byKey = new Map<string, HexEntity>();
    for (const h of assembled) byKey.set(axialKey(h.q, h.r), h);

    const weldColor =
      isDefenseFortressActive(f)
        ? '#34d399'
        : isDefenseHexWallActive(f)
          ? '#2dd4bf'
          : f.specialActive?.type === 'melee'
            ? '#fbbf24'
            : f.specialActive?.type === 'ranged'
              ? '#c084fc'
              : baseColor;
    const pulse = 0.72 + 0.22 * Math.sin(nowSec * 7);

    const pairs: Array<[HexEntity, HexEntity]> = [];
    for (const h of assembled) {
      for (let i = 0; i < 3; i++) {
        const d = AXIAL_DIRS[i * 2];
        const nb = byKey.get(axialKey(h.q + d.q, h.r + d.r));
        if (nb) pairs.push([h, nb]);
      }
    }

    if (pairs.length > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      // Pass 1: Soft outer energy halo
      ctx.strokeStyle = weldColor;
      ctx.globalAlpha = 0.30 * pulse;
      ctx.lineWidth = Math.max(4.5, R * 0.36);
      for (const [h, nb] of pairs) {
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.lineTo(nb.x, nb.y);
        ctx.stroke();
      }
      // Pass 2: Bright inner weld core
      ctx.strokeStyle = '#f8fafc';
      ctx.globalAlpha = 0.78 * pulse;
      ctx.lineWidth = Math.max(1.6, R * 0.13);
      for (const [h, nb] of pairs) {
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.lineTo(nb.x, nb.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  for (const h of f.hexes) {
    if (h.state === 'BROKEN' || h.state === 'SNIPER_SPENT') continue;
    const isHigh = h.altitude > 0.35;
    if (isHigh !== highFlightOnly) continue;

    // Smooth Two-Pass Luminous Motion Trail (Sniper shots get blazing golden/violet tracer ribbon!)
    if (h.trail.length > 1) {
      ctx.save();
      const isSniperShot = h.state === 'SNIPER_SHOT';
      const isSniperFourth = isSniperShot && Boolean(h.sniperEmpowered);
      const trailColor = isSniperFourth
        ? '#fbbf24'
        : isSniperShot
          ? isPlayer
            ? '#e879f9'
            : '#fb7185'
          : h.state === 'SNIPER_RETURN'
            ? '#c084fc'
            : isHexStolen(h)
              ? '#fbbf24'
              : h.state === 'RECALLING'
                ? '#fbbf24'
                : baseColor;
      ctx.lineCap = 'round';
      for (let i = 1; i < h.trail.length; i++) {
        const frac = i / h.trail.length;
        ctx.strokeStyle = trailColor;
        ctx.globalAlpha = frac * (isSniperFourth ? 0.68 : isSniperShot ? 0.52 : 0.34);
        ctx.lineWidth = R * (isSniperFourth ? 1.35 : isSniperShot ? 1.05 : 0.85) * frac;
        ctx.beginPath();
        ctx.moveTo(h.trail[i - 1].x, h.trail[i - 1].y - h.altitude * 18);
        ctx.lineTo(h.trail[i].x, h.trail[i].y - h.altitude * 18);
        ctx.stroke();

        ctx.strokeStyle = isSniperFourth ? '#fef08a' : '#ffffff';
        ctx.globalAlpha = frac * (isSniperShot ? 0.55 : 0.24);
        ctx.lineWidth = R * (isSniperShot ? 0.42 : 0.24) * frac;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Visual Ping tether from player to pinged hex
    if (isPlayer && f.pingHexId === h.id && f.pingTimer > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(h.x, h.y);
      ctx.stroke();
      ctx.restore();
    }

    const liftY = h.altitude * 22;
    const drawX = h.x;
    const drawY = h.y - liftY;

    // 2.5D Dual-Layer Drop Shadow (expands softly when lifted during High-Flight Recall)
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${0.18 + h.altitude * 0.10})`;
    drawHexPolygon(ctx, h.x + 5 + h.altitude * 9, h.y + 8 + h.altitude * 14, R * (1.02 - h.altitude * 0.08), h.spinAngle + Math.PI / 6);
    ctx.fill();
    ctx.fillStyle = `rgba(0, 0, 0, ${0.32 + h.altitude * 0.12})`;
    drawHexPolygon(ctx, h.x + 2.5 + h.altitude * 5, h.y + 5 + h.altitude * 8, R * (0.90 - h.altitude * 0.14), h.spinAngle + Math.PI / 6);
    ctx.fill();
    ctx.restore();

    // Determine stroke/fill colors by faction & state
    let strokeColor = baseColor;
    let fillColor = baseFillRgba;
    if (isHexStolen(h)) {
      const thiefIsPlayer = h.stolenById === 'player';
      strokeColor = thiefIsPlayer ? baseColor : '#fb7185';
      fillColor = 'rgba(245, 158, 11, 0.36)';
    } else if (h.state === 'SNIPER_SHOT') {
      strokeColor = h.sniperEmpowered ? '#fbbf24' : isPlayer ? '#e879f9' : '#fb7185';
      fillColor = h.sniperEmpowered
        ? 'rgba(251, 191, 36, 0.45)'
        : isPlayer
          ? 'rgba(232, 121, 249, 0.42)'
          : 'rgba(251, 113, 133, 0.42)';
    } else if (h.state === 'SNIPER_RETURN') {
      strokeColor = isPlayer ? '#c084fc' : '#fb7185';
      fillColor = 'rgba(192, 132, 252, 0.28)';
    } else if (h.state === 'PLANTED' || h.state === 'RECALLING') {
      strokeColor = '#fbbf24';
      fillColor = 'rgba(245, 158, 11, 0.28)';
    } else if (f.specialActive?.type === 'melee' && h.state === 'ASSEMBLED') {
      strokeColor = '#fbbf24';
    } else if (f.specialActive?.type === 'ranged' && h.state === 'ASSEMBLED') {
      strokeColor = '#c084fc';
    } else if (isDefenseFortressActive(f) && h.state === 'ASSEMBLED') {
      strokeColor = '#34d399';
    } else if (isDefenseHexWallActive(f) && h.state === 'ASSEMBLED') {
      strokeColor = '#2dd4bf';
    }

    // Hover highlight for PC Right-Click targeted recall
    if (isPlayer && hoverPlantedHexId === h.id && (h.state === 'PLANTED' || h.state === 'LAUNCHED')) {
      ctx.save();
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(drawX, drawY, R * 1.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = canvasFont(700, 10);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fef08a';
      ctx.fillText('RMB: Thu mảnh này', drawX, drawY - R * 1.65);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(drawX, drawY);

    // Pseudo-3D Random Tumble squeeze in Loose mode
    if (f.form === 'loose' && f.rotMode === 'random' && !isHexStolen(h)) {
      const sx = 0.62 + 0.38 * Math.abs(Math.cos(h.tumblePhaseX));
      const sy = 0.62 + 0.38 * Math.abs(Math.sin(h.tumblePhaseY));
      ctx.scale(sx, sy);
    }

    ctx.rotate(h.spinAngle);

    // Normal Spin saw-ring aura
    if (f.form === 'loose' && f.rotMode === 'normal' && !isHexStolen(h)) {
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Main hex body
    drawHexPolygon(ctx, 0, 0, R * 0.96, Math.PI / 6);
    ctx.fillStyle = h.flashTimer > 0 ? 'rgba(255, 255, 255, 0.72)' : fillColor;
    ctx.fill();

    const borderW = h.material.id === 'heavy' ? 3.2 : h.material.id === 'light' ? 1.6 : 2.3;
    ctx.lineWidth = borderW;
    ctx.strokeStyle = (isPlayer && f.pingHexId === h.id && f.pingTimer > 0) || h.selected ? '#ffffff' : strokeColor;
    ctx.stroke();

    // Material geometric core emblem
    drawMaterialEmblem(ctx, h.material.id, R, strokeColor);

    // 3-Tier Amber Damage Cracks
    drawThreeTierCracks(ctx, R, h.hp / Math.max(1, h.maxHp), nowSec);

    // Root indicator dot when Assembled
    if (h.state === 'ASSEMBLED' && h.id === f.rootHexId) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
      ctx.lineWidth = 1.6;
      drawHexPolygon(ctx, 0, 0, R * 0.64, Math.PI / 6);
      ctx.stroke();
    }

    ctx.restore();

    // Index badge in Loose mode for player readability (1..N)
    if (isPlayer && f.form === 'loose' && !isHexStolen(h)) {
      ctx.save();
      ctx.font = canvasFont(800, Math.max(9, Math.round(R * 0.58)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = h.selected ? '#ffffff' : 'rgba(226, 232, 240, 0.85)';
      ctx.fillText(String(h.id + 1), drawX, drawY + 0.5);
      ctx.restore();
    }

    // Stolen countdown tag
    if (h.state === 'STOLEN_FLOOR') {
      ctx.save();
      ctx.font = canvasFont(800, 10);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fef08a';
      ctx.fillText(`${h.stolenTimer.toFixed(1)}s`, drawX, drawY - R - 7);
      ctx.restore();
    }
  }
}
