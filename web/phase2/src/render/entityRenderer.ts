import { AXIAL_DIRS, BASE_HEX_RADIUS, PLAYER_RADIUS } from '@core/constants';
import { axialKey, axialToLocal, clamp } from '@core/hexMath';
import { getActiveStance, isHexStolen } from '@core/structure';
import type { Fighter, HexEntity } from '@core/types';
import { drawHexPolygon } from './arenaRenderer';

export function renderFighterBody(ctx: CanvasRenderingContext2D, f: Fighter, nowSec: number): void {
  const isPlayer = f.id === 'player';
  const mainColor = isPlayer ? '#38bdf8' : '#fb7185';
  const lightColor = isPlayer ? '#bae6fd' : '#fecdd3';

  // Dash afterimages
  for (const img of f.dashAfterimages) {
    const a = clamp(img.life / img.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = a * 0.45;
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(img.x, img.y, PLAYER_RADIUS * (0.75 + 0.25 * a), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Ground Hitbox Ring (PLAYER_RADIUS = 32)
  ctx.save();
  ctx.beginPath();
  ctx.arc(f.x, f.y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = isPlayer ? 'rgba(56, 189, 248, 0.11)' : 'rgba(251, 113, 133, 0.11)';
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

  // Special Skill active rings around Fighter
  if (f.specialActive) {
    const sp = f.specialActive;
    const progress = clamp(sp.timer / Math.max(0.01, sp.maxTimer), 0, 1);
    if (sp.type === 'loose') {
      const orbitR = (PLAYER_RADIUS + 24 + BASE_HEX_RADIUS * f.currentScale * 1.15) * 1.2;
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.42)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([12, 8]);
      ctx.lineDashOffset = -nowSec * 90;
      ctx.beginPath();
      ctx.arc(f.x, f.y, orbitR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (sp.type === 'defense') {
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
    }

    // Active special duration arc around character
    const spColor =
      sp.type === 'loose' ? '#38bdf8' : sp.type === 'melee' ? '#fbbf24' : sp.type === 'ranged' ? '#c084fc' : '#34d399';
    ctx.strokeStyle = spColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(f.x, f.y, PLAYER_RADIUS + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
  }

  // 2.5D Sphere Drop Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
  ctx.beginPath();
  ctx.ellipse(f.x + 2, f.y + 8, 17, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Elevated Glowing Sphere Core
  const sphereY = f.y - 6;
  const grad = ctx.createRadialGradient(f.x - 5, sphereY - 6, 2, f.x, sphereY, 19);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, f.damageFlash > 0 ? '#ffffff' : lightColor);
  grad.addColorStop(1, mainColor);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(f.x, sphereY, 17, 0, Math.PI * 2);
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

export function renderFighterHexLayer(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  highFlightOnly: boolean,
  nowSec: number,
  hoverPlantedHexId = -1,
): void {
  const isPlayer = f.id === 'player';
  const baseColor = isPlayer ? '#38bdf8' : '#fb7185';
  const R = BASE_HEX_RADIUS * f.currentScale;

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

      // Status tag ("BAY QUA" / "LÁI" / "TỰ ĐỘNG" + countdown)
      ctx.setLineDash([]);
      const rem = f.specialActive ? f.specialActive.timer.toFixed(1) : '0.0';
      const label = anim.hasCmd
        ? `BAY QUA · ${rem}s`
        : anim.isManualSteer
          ? `LÁI · ${rem}s`
          : `TỰ ĐỘNG · ${rem}s`;
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = anim.isManualSteer ? '#f0abfc' : '#bae6fd';
      ctx.fillText(label, anim.targetX, anim.targetY - R * 2.1);
      ctx.restore();
    }
  }

  // Edge-Weld Glow lines between adjacent assembled hexes (ground layer only)
  if (!highFlightOnly && f.form !== 'loose') {
    const assembled = f.hexes.filter((h) => h.state === 'ASSEMBLED');
    const byKey = new Map<string, HexEntity>();
    for (const h of assembled) byKey.set(axialKey(h.q, h.r), h);

    ctx.save();
    ctx.strokeStyle = f.specialActive?.type === 'defense' ? '#34d399' : baseColor;
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = Math.max(2, R * 0.16);
    for (const h of assembled) {
      for (let i = 0; i < 3; i++) {
        const d = AXIAL_DIRS[i * 2];
        const nb = byKey.get(axialKey(h.q + d.q, h.r + d.r));
        if (nb) {
          ctx.beginPath();
          ctx.moveTo(h.x, h.y);
          ctx.lineTo(nb.x, nb.y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  for (const h of f.hexes) {
    if (h.state === 'BROKEN') continue;
    const isHigh = h.altitude > 0.35;
    if (isHigh !== highFlightOnly) continue;

    // Motion trail
    if (h.trail.length > 1) {
      ctx.save();
      const trailColor =
        isHexStolen(h) ? '#fbbf24' : h.state === 'RECALLING' ? '#fbbf24' : baseColor;
      ctx.strokeStyle = trailColor;
      ctx.lineCap = 'round';
      for (let i = 1; i < h.trail.length; i++) {
        const frac = i / h.trail.length;
        ctx.globalAlpha = frac * 0.42;
        ctx.lineWidth = R * 0.65 * frac;
        ctx.beginPath();
        ctx.moveTo(h.trail[i - 1].x, h.trail[i - 1].y - h.altitude * 18);
        ctx.lineTo(h.trail[i].x, h.trail[i].y - h.altitude * 18);
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

    // Drop shadow
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${0.28 + h.altitude * 0.16})`;
    drawHexPolygon(ctx, h.x + 3 + h.altitude * 6, h.y + 6 + h.altitude * 10, R * (0.94 - h.altitude * 0.12), h.spinAngle + Math.PI / 6);
    ctx.fill();
    ctx.restore();

    // Determine stroke/fill colors by faction & state
    let strokeColor = baseColor;
    let fillColor = isPlayer ? 'rgba(14, 116, 144, 0.34)' : 'rgba(190, 18, 60, 0.34)';
    if (isHexStolen(h)) {
      const thiefIsPlayer = h.stolenById === 'player';
      strokeColor = thiefIsPlayer ? '#38bdf8' : '#fb7185';
      fillColor = 'rgba(245, 158, 11, 0.36)';
    } else if (h.state === 'PLANTED' || h.state === 'RECALLING') {
      strokeColor = '#fbbf24';
      fillColor = 'rgba(245, 158, 11, 0.28)';
    } else if (f.specialActive?.type === 'melee' && h.state === 'ASSEMBLED') {
      strokeColor = '#fbbf24';
    } else if (f.specialActive?.type === 'ranged' && h.state === 'ASSEMBLED') {
      strokeColor = '#c084fc';
    } else if (f.specialActive?.type === 'defense' && h.state === 'ASSEMBLED') {
      strokeColor = '#34d399';
    }

    // Hover highlight for PC Right-Click targeted recall
    if (isPlayer && hoverPlantedHexId === h.id && (h.state === 'PLANTED' || h.state === 'LAUNCHED')) {
      ctx.save();
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(drawX, drawY, R * 1.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = '700 10px system-ui, sans-serif';
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
      ctx.font = `800 ${Math.max(9, Math.round(R * 0.58))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = h.selected ? '#ffffff' : 'rgba(226, 232, 240, 0.85)';
      ctx.fillText(String(h.id + 1), drawX, drawY + 0.5);
      ctx.restore();
    }

    // Stolen countdown tag
    if (h.state === 'STOLEN_FLOOR') {
      ctx.save();
      ctx.font = '800 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fef08a';
      ctx.fillText(`${h.stolenTimer.toFixed(1)}s`, drawX, drawY - R - 7);
      ctx.restore();
    }
  }
}
