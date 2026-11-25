import { ARENA_RADIUS, SQRT3 } from '@core/constants';
import type { Obstacle } from '@core/types';

export function drawHexPolygon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  angleOffset = Math.PI / 6,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const ang = angleOffset + (i * Math.PI) / 3;
    const px = x + Math.cos(ang) * radius;
    const py = y + Math.sin(ang) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawObstacleShape(ctx: CanvasRenderingContext2D, cx: number, cy: number, obs: Obstacle, scale = 1): void {
  if (obs.shape === 'hex') {
    drawHexPolygon(ctx, cx, cy, obs.r * scale, obs.angle);
    return;
  }
  const hw = obs.hw * scale;
  const hh = obs.hh * scale;
  const c = Math.cos(obs.angle);
  const s = Math.sin(obs.angle);
  const pts: Array<[number, number]> = [
    [hw, hh],
    [-hw, hh],
    [-hw, -hh],
    [hw, -hh],
  ];
  ctx.beginPath();
  pts.forEach(([lx, ly], idx) => {
    const px = cx + lx * c - ly * s;
    const py = cy + lx * s + ly * c;
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

export function renderArena(ctx: CanvasRenderingContext2D, obstacles: Obstacle[]): void {
  // Outer hex shadow & rim
  ctx.save();
  drawHexPolygon(ctx, 0, 12, ARENA_RADIUS + 14, 0);
  ctx.fillStyle = 'rgba(8, 12, 20, 0.55)';
  ctx.fill();

  drawHexPolygon(ctx, 0, 0, ARENA_RADIUS + 8, 0);
  ctx.fillStyle = '#1c222e';
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.34)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Matte Slate floor (#252c3a) clipped to hex arena
  drawHexPolygon(ctx, 0, 0, ARENA_RADIUS, 0);
  const floorGrad = ctx.createRadialGradient(0, -40, 60, 0, 0, ARENA_RADIUS);
  floorGrad.addColorStop(0, '#2c3547');
  floorGrad.addColorStop(0.65, '#252c3a');
  floorGrad.addColorStop(1, '#1e2431');
  ctx.fillStyle = floorGrad;
  ctx.fill();

  ctx.save();
  ctx.clip();

  // Subtle floor hex tile pattern
  const tileR = 54;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.065)';
  ctx.lineWidth = 1.2;
  for (let q = -11; q <= 11; q++) {
    for (let r = -11; r <= 11; r++) {
      const tx = tileR * SQRT3 * (q + r * 0.5);
      const ty = tileR * 1.5 * r;
      if (Math.hypot(tx, ty) > ARENA_RADIUS + tileR) continue;
      drawHexPolygon(ctx, tx, ty, tileR, Math.PI / 6);
      ctx.stroke();
    }
  }

  // Subtle center arena ring, tactical cross & axis marks
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 115, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, 56, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -ARENA_RADIUS);
  ctx.lineTo(0, ARENA_RADIUS);
  ctx.moveTo(-ARENA_RADIUS, 0);
  ctx.lineTo(ARENA_RADIUS, 0);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.055)';
  ctx.stroke();

  ctx.restore();

  // Crisp two-pass inner glowing arena border
  drawHexPolygon(ctx, 0, 0, ARENA_RADIUS, 0);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.62)';
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // Render 2.5D Obstacles (dual-layer shadow + extruded base + elevated beveled top + rim sheen)
  for (const obs of obstacles) {
    // Wide ambient ground drop shadow
    ctx.save();
    drawObstacleShape(ctx, obs.x + 11, obs.y + 18, obs, 1.07);
    ctx.fillStyle = 'rgba(4, 8, 16, 0.34)';
    ctx.fill();

    // Tight contact shadow
    drawObstacleShape(ctx, obs.x + 5, obs.y + 9, obs, 1.01);
    ctx.fillStyle = 'rgba(6, 10, 18, 0.56)';
    ctx.fill();

    // Base footprint (side extrusion)
    drawObstacleShape(ctx, obs.x, obs.y, obs, 1.0);
    ctx.fillStyle = '#18202e';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Elevated top face
    const liftY = -Math.min(15, obs.height * 0.58);
    drawObstacleShape(ctx, obs.x, obs.y + liftY, obs, 0.94);
    const topGrad = ctx.createLinearGradient(obs.x - obs.boundR, obs.y + liftY - obs.boundR, obs.x + obs.boundR, obs.y + liftY + obs.boundR);
    topGrad.addColorStop(0, '#44526b');
    topGrad.addColorStop(0.55, '#333f54');
    topGrad.addColorStop(1, '#232c3e');
    ctx.fillStyle = topGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.58)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Inner geometric bevel accent
    drawObstacleShape(ctx, obs.x, obs.y + liftY, obs, 0.62);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.24)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}
