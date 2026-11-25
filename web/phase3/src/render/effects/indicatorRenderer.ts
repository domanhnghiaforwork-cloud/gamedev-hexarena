import { BASE_HEX_RADIUS, DASH_DURATION, DASH_SPEED, PLAYER_RADIUS } from '@core/constants';
import { clamp } from '@core/math/hexMath';
import { getLooseLaunchRange } from '@attacks/loose/attack';
import { getActiveAnchorDist, getActiveStance } from '@core/world/structure';
import type { Fighter } from '@core/types';
import type { ReticleStyle } from '@storage/profiles';

export function renderSkillIndicator(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  isCanceling: boolean,
): void {
  // Hide normal aiming indicator during Guided Ranged Special (replaced by dashed weapon silhouette!)
  const stance = getActiveStance(f);
  if (stance === 'ranged' && f.attackAnim?.type === 'ranged' && f.attackAnim.phase === 'guided') {
    return;
  }

  // Dash Aim Indicator (Mobile drag-aim)
  if (f.isAimingDash) {
    const dashDist = DASH_SPEED * DASH_DURATION;
    const tx = f.x + Math.cos(f.dashAimAngle) * dashDist;
    const ty = f.y + Math.sin(f.dashAimAngle) * dashDist;
    ctx.save();
    ctx.strokeStyle = isCanceling ? '#fb7185' : '#34d399';
    ctx.fillStyle = isCanceling ? 'rgba(251, 113, 133, 0.18)' : 'rgba(52, 211, 153, 0.18)';
    ctx.lineWidth = 2.4;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tx, ty, PLAYER_RADIUS * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (!f.isAiming) return;

  const S = f.currentScale;
  const R = BASE_HEX_RADIUS * S;
  const ang = f.aimAngle;

  // Color shifts with scale tier (60% amber-pierce, 100% cyan, 150% emerald-wide) or Red when canceling!
  const baseStroke = isCanceling
    ? '#fb7185'
    : S <= 0.7
      ? '#fbbf24'
      : S >= 1.3
        ? '#34d399'
        : '#38bdf8';
  const baseFill = isCanceling
    ? 'rgba(251, 113, 133, 0.16)'
    : S <= 0.7
      ? 'rgba(251, 191, 36, 0.16)'
      : S >= 1.3
        ? 'rgba(52, 211, 153, 0.16)'
        : 'rgba(56, 189, 248, 0.16)';

  ctx.save();
  ctx.strokeStyle = baseStroke;
  ctx.fillStyle = baseFill;
  ctx.lineWidth = 2.2;
  if (isCanceling) ctx.setLineDash([7, 5]);

  if (f.form === 'loose') {
    const range = getLooseLaunchRange(f.aimStrength);
    const tx = f.x + Math.cos(ang) * range;
    const ty = f.y + Math.sin(ang) * range;

    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    // Exact yellow landing ring matching launchHex 1:1
    ctx.strokeStyle = isCanceling ? '#fb7185' : '#fbbf24';
    ctx.fillStyle = isCanceling ? 'rgba(251, 113, 133, 0.20)' : 'rgba(251, 191, 36, 0.16)';
    ctx.beginPath();
    ctx.arc(tx, ty, Math.max(16, R * 1.15), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (f.fireMode === 'volley') {
      const selectedCount = Math.max(2, f.hexes.filter((h) => h.state === 'ORBIT' && h.selected).length);
      const spread = Math.min(0.55, (selectedCount - 1) * 0.10);
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.arc(f.x, f.y, range, ang - spread * 0.5, ang + spread * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  } else if (stance === 'ranged') {
    const range = 320 + 260 * clamp(f.aimStrength, 0.35, 1.0);
    const halfW = R * 1.25;
    ctx.translate(f.x, f.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.rect(PLAYER_RADIUS, -halfW, range, halfW * 2);
    ctx.fill();
    ctx.stroke();
  } else if (stance === 'melee') {
    const reach = getActiveAnchorDist(f, R) + R * 4.5;
    const sweepHalf = 0.75 + 0.22 * S;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.arc(f.x, f.y, reach, ang - sweepHalf, ang + sweepHalf);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (stance === 'defense') {
    const isFortress = f.specialActive?.type === 'defense';
    if (!isFortress) {
      ctx.restore();
      return;
    }
    const reach = 210 + (f.specialActive?.storedEnergy ?? 0) * 0.45;
    const halfArc = 1.12;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.arc(f.x, f.y, reach, ang - halfArc, ang + halfArc);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

export function renderDesktopReticle(
  ctx: CanvasRenderingContext2D,
  player: Fighter,
  wx: number,
  wy: number,
  style: ReticleStyle,
): void {
  const stance = getActiveStance(player);
  const isGuided = stance === 'ranged' && player.attackAnim?.type === 'ranged' && player.attackAnim.phase === 'guided';
  const S = player.currentScale;
  const R = BASE_HEX_RADIUS * S;

  ctx.save();
  // Loose mode live yellow landing preview directly at cursor (clamped to launch range)
  if (player.form === 'loose' && !player.isAiming) {
    const dx = wx - player.x;
    const dy = wy - player.y;
    const d = Math.hypot(dx, dy);
    const strength = clamp((d - 120) / 360, 0, 1);
    const range = getLooseLaunchRange(strength);
    const ang = Math.atan2(dy, dx);
    const lx = player.x + Math.cos(ang) * range;
    const ly = player.y + Math.sin(ang) * range;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(lx, ly, Math.max(13, R * 1.05), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const color = isGuided ? '#e879f9' : '#38bdf8';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  if (style === 'minimal') {
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(wx, wy, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(wx, wy, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'crosshair') {
    ctx.lineWidth = 1.8;
    const gap = 4;
    const len = 12;
    ctx.beginPath();
    ctx.moveTo(wx - len, wy);
    ctx.lineTo(wx - gap, wy);
    ctx.moveTo(wx + gap, wy);
    ctx.lineTo(wx + len, wy);
    ctx.moveTo(wx, wy - len);
    ctx.lineTo(wx, wy - gap);
    ctx.moveTo(wx, wy + gap);
    ctx.lineTo(wx, wy + len);
    ctx.stroke();
  } else {
    // Default Neon Reticle
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(wx, wy, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(wx, wy, 2.4, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(wx + Math.cos(a) * 12, wy + Math.sin(a) * 12);
      ctx.lineTo(wx + Math.cos(a) * 17, wy + Math.sin(a) * 17);
      ctx.stroke();
    }
  }
  ctx.restore();
}
