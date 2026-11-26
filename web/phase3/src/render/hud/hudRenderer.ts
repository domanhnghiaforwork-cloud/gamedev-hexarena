import { canvasFont } from '@config/typography';
import { DASH_COOLDOWN } from '@core/constants';
import { clamp } from '@core/math/hexMath';
import {
  getFighterSelectedSpecialInfo,
  getSpecialSkillById,
  getSpecialSkillsForMode,
  STANCE_META,
} from '@attacks/index';
import {
  getActiveBlueprint,
  isDefenseFortressActive,
  isDefenseHexWallActive,
  isRangedBlinkActive,
  isRangedSniperActive,
  isSlotKey,
} from '@core/world/structure';
import type { Fighter, FormKey } from '@core/types';
import type { LiveInputState } from '@input/inputManager';
import {
  getMobileSpecialRadialPos,
  getPCSpecialOptionRects,
  getPCSpecialRadialPos,
  getRotateHandlePos,
} from '@input/hudPresets';
import {
  formatKeyLabel,
  MOBILE_WIDGET_LABELS,
  type MobileWidgetId,
  type PCControlConfig,
} from '@storage/profiles';

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function getFormDisplay(player: Fighter, id: FormKey): { label: string; color: string } {
  if (id === 'loose') return { label: 'Đơn lẻ', color: '#38bdf8' };
  const bp = player.loadout.blueprints[id];
  return {
    label: bp.name.slice(0, 9),
    color: STANCE_META[bp.stance].color,
  };
}

function renderCancelZone(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  hovered: boolean,
  opacity: number,
): void {
  ctx.save();
  ctx.globalAlpha = opacity;
  const drawR = hovered ? r * 1.18 : r;
  ctx.beginPath();
  ctx.arc(cx, cy, drawR, 0, Math.PI * 2);
  ctx.fillStyle = hovered ? 'rgba(225, 29, 72, 0.85)' : 'rgba(15, 23, 42, 0.80)';
  ctx.fill();
  ctx.strokeStyle = hovered ? '#fecdd3' : '#fb7185';
  ctx.lineWidth = hovered ? 3 : 2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = canvasFont(800, Math.round(drawR * 0.52));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✕', cx, cy - 3);
  ctx.font = canvasFont(700, Math.round(drawR * 0.28));
  ctx.fillText('HỦY', cx, cy + drawR * 0.44);
  ctx.restore();
}

export function renderMobileCanvasHUD(
  ctx: CanvasRenderingContext2D,
  player: Fighter,
  live: LiveInputState,
  opts?: {
    editMode?: boolean;
    selectedWidget?: MobileWidgetId | null;
    snapGrid?: boolean;
  },
): void {
  const m = live.mobileLayout;
  const editMode = !!opts?.editMode;
  const isLoose = player.form === 'loose' || editMode;

  // Optional Snap Grid lines in Mobile HUD Edit Mode
  if (editMode && opts?.snapGrid) {
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 1;
    const stepX = (live.vw - m.safeLeft - m.safeRight) / 20;
    const stepY = (live.vh - m.safeTop - m.safeBottom) / 16;
    for (let i = 0; i <= 20; i++) {
      const gx = m.safeLeft + i * stepX;
      ctx.beginPath();
      ctx.moveTo(gx, m.safeTop);
      ctx.lineTo(gx, live.vh - m.safeBottom);
      ctx.stroke();
    }
    for (let j = 0; j <= 16; j++) {
      const gy = m.safeTop + j * stepY;
      ctx.beginPath();
      ctx.moveTo(m.safeLeft, gy);
      ctx.lineTo(live.vw - m.safeRight, gy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 1. Joystick
  ctx.save();
  ctx.globalAlpha = m.joy.opacity;
  ctx.beginPath();
  ctx.arc(m.joy.cx, m.joy.cy, m.joy.r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.56)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(live.joy.knobX, live.joy.knobY, m.joy.r * 0.44, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(56, 189, 248, 0.72)';
  ctx.fill();
  ctx.strokeStyle = '#e0f2fe';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // 2. Curved Dynamic N-Hex Arc-Selector (5..10 hexes, Loose mode or Edit preview)
  if (isLoose) {
    const arc = m.arc;
    const segAng = (arc.endAng - arc.startAng) / arc.hexCount;
    ctx.save();
    ctx.globalAlpha = arc.opacity;
    for (let i = 0; i < arc.hexCount; i++) {
      const hex = player.hexes[i];
      if (!hex) continue;
      const a0 = arc.startAng + i * segAng + 0.015;
      const a1 = arc.startAng + (i + 1) * segAng - 0.015;
      const midA = (a0 + a1) * 0.5;
      const midR = (arc.innerR + arc.outerR) * 0.5;

      ctx.beginPath();
      ctx.arc(arc.cx, arc.cy, arc.outerR, a0, a1);
      ctx.arc(arc.cx, arc.cy, arc.innerR, a1, a0, true);
      ctx.closePath();

      let fill = 'rgba(20, 28, 42, 0.74)';
      let stroke = 'rgba(148, 163, 184, 0.40)';
      if (hex.state === 'BROKEN') {
        fill = 'rgba(159, 18, 57, 0.55)';
        stroke = '#fb7185';
      } else if (hex.state === 'PLANTED' || hex.state === 'LAUNCHED') {
        fill = hex.selected ? 'rgba(245, 158, 11, 0.65)' : 'rgba(180, 83, 9, 0.48)';
        stroke = hex.selected ? '#ffffff' : '#fbbf24';
      } else if (hex.selected) {
        fill = 'rgba(14, 165, 233, 0.58)';
        stroke = '#ffffff';
      }
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = hex.selected ? 2.2 : 1.3;
      ctx.stroke();

      const tx = arc.cx + Math.cos(midA) * midR;
      const ty = arc.cy + Math.sin(midA) * midR;
      ctx.fillStyle = '#f8fafc';
      ctx.font = canvasFont(800, Math.max(9, Math.round(11 * m.baseScale)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hex.state === 'BROKEN' ? `${Math.ceil(hex.cooldown)}` : `${i + 1}`, tx, ty);
    }
    ctx.restore();
  }

  // 3. Main Attack / Shield-Aim Pad
  const bp = getActiveBlueprint(player);
  const isDefenseStance = bp?.stance === 'defense';
  const isFortressActive = isDefenseStance && isDefenseFortressActive(player);
  const isHexWallActive = isDefenseStance && isDefenseHexWallActive(player);
  const isBlinkActive = isRangedBlinkActive(player);
  const isSniperActive = isRangedSniperActive(player);
  const isNextFourthShot = isSniperActive && (player.specialActive?.shotsFired ?? 0) + 1 === 4;
  const atkLabel = isBlinkActive
    ? 'BIẾN'
    : isSniperActive
      ? isNextFourthShot
        ? 'BẮN #4'
        : 'BẮN'
      : isFortressActive
        ? 'XUNG'
        : isHexWallActive
          ? 'TƯỜNG'
          : bp
            ? STANCE_META[bp.stance].attackLabel
            : 'PHÓNG';
  ctx.save();
  ctx.globalAlpha = m.atk.opacity;
  ctx.beginPath();
  ctx.arc(m.atk.cx, m.atk.cy, m.atk.r, 0, Math.PI * 2);
  ctx.fillStyle = isBlinkActive
    ? 'rgba(192, 132, 252, 0.38)'
    : isNextFourthShot
      ? 'rgba(251, 191, 36, 0.44)'
      : isSniperActive
        ? 'rgba(232, 121, 249, 0.36)'
        : isFortressActive
          ? 'rgba(16, 185, 129, 0.42)'
          : isHexWallActive
            ? 'rgba(45, 212, 191, 0.36)'
            : isDefenseStance
              ? 'rgba(15, 23, 42, 0.66)'
              : 'rgba(14, 116, 144, 0.42)';
  ctx.fill();
  ctx.strokeStyle = isBlinkActive
    ? '#c084fc'
    : isNextFourthShot
      ? '#fbbf24'
      : isSniperActive
        ? '#e879f9'
        : isFortressActive
          ? '#34d399'
          : isHexWallActive
            ? '#2dd4bf'
            : isDefenseStance
              ? 'rgba(52, 211, 153, 0.55)'
              : '#38bdf8';
  ctx.lineWidth = isBlinkActive || isSniperActive || isFortressActive || isHexWallActive ? 3.0 : 2.4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(live.atk.knobX, live.atk.knobY, m.atk.r * 0.58, 0, Math.PI * 2);
  ctx.fillStyle = isBlinkActive
    ? 'rgba(192, 132, 252, 0.90)'
    : isNextFourthShot
      ? 'rgba(251, 191, 36, 0.94)'
      : isSniperActive
        ? 'rgba(232, 121, 249, 0.90)'
        : isFortressActive
          ? 'rgba(52, 211, 153, 0.90)'
          : isHexWallActive
            ? 'rgba(45, 212, 191, 0.88)'
            : isDefenseStance
              ? 'rgba(16, 185, 129, 0.45)'
              : 'rgba(56, 189, 248, 0.85)';
  ctx.fill();
  ctx.fillStyle = isDefenseStance && !isFortressActive && !isHexWallActive ? '#d1fae5' : '#082f49';
  ctx.font = canvasFont(900, Math.max(10, Math.round(12 * m.baseScale)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(atkLabel, live.atk.knobX, live.atk.knobY);
  ctx.restore();

  // 4. Dash Button
  ctx.save();
  ctx.globalAlpha = m.dash.opacity;
  ctx.beginPath();
  ctx.arc(m.dash.cx, m.dash.cy, m.dash.r, 0, Math.PI * 2);
  ctx.fillStyle = player.dashCooldown > 0 ? 'rgba(15, 23, 42, 0.8)' : 'rgba(16, 185, 129, 0.34)';
  ctx.fill();
  ctx.strokeStyle = player.dashCooldown > 0 ? 'rgba(148, 163, 184, 0.4)' : '#34d399';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  if (player.dashCooldown > 0) {
    const frac = clamp(player.dashCooldown / DASH_COOLDOWN, 0, 1);
    ctx.beginPath();
    ctx.moveTo(m.dash.cx, m.dash.cy);
    ctx.arc(m.dash.cx, m.dash.cy, m.dash.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.closePath();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.fill();
  }
  ctx.fillStyle = '#f8fafc';
  ctx.font = canvasFont(800, Math.max(9, Math.round(10 * m.baseScale)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(player.dashCooldown > 0 ? player.dashCooldown.toFixed(1) : 'LƯỚT', m.dash.cx, m.dash.cy);
  ctx.restore();

  // 5. Form Switch Button + Radial Menu
  const formInfo = getFormDisplay(player, player.form);
  ctx.save();
  ctx.globalAlpha = m.form.opacity;
  ctx.beginPath();
  ctx.arc(m.form.cx, m.form.cy, m.form.r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20, 28, 42, 0.82)';
  ctx.fill();
  ctx.strokeStyle = formInfo.color;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = canvasFont(800, Math.max(8, Math.round(9.5 * m.baseScale)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formInfo.label.slice(0, 7), m.form.cx, m.form.cy);
  ctx.restore();

  const showFormRadial = live.formRadial.pointerId !== null || (editMode && opts?.selectedWidget === 'form');
  if (showFormRadial) {
    const isPreviewOnly = live.formRadial.pointerId === null;
    live.formRadial.options.forEach((opt, idx) => {
      const fOpt = getFormDisplay(player, opt.id);
      const s = m.baseScale;
      const optAng = opt.angle + m.formRotRad;
      const px = m.form.cx + Math.cos(optAng) * 82 * s;
      const py = m.form.cy + Math.sin(optAng) * 82 * s;
      const r = 24 * s;
      const hovered = !isPreviewOnly && live.formRadial.hoverIdx === idx;
      ctx.save();
      ctx.globalAlpha = isPreviewOnly ? 0.55 : 1;
      ctx.beginPath();
      ctx.arc(px, py, hovered ? r * 1.15 : r, 0, Math.PI * 2);
      ctx.fillStyle = hovered ? fOpt.color : 'rgba(15, 23, 42, 0.90)';
      ctx.fill();
      ctx.strokeStyle = hovered ? '#ffffff' : fOpt.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = hovered ? '#0f172a' : '#f8fafc';
      ctx.font = canvasFont(800, Math.max(8, Math.round(9 * s)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fOpt.label.slice(0, 8), px, py);
      ctx.restore();
    });
  }

  // 6. Special Skill Button (Ulti) + Corner Slot Badge + Hold Radial
  const spInfo = getFighterSelectedSpecialInfo(player);
  const spMeta = spInfo.skill;
  ctx.save();
  ctx.globalAlpha = m.special.opacity;
  ctx.beginPath();
  ctx.arc(m.special.cx, m.special.cy, m.special.r, 0, Math.PI * 2);
  ctx.fillStyle = player.specialActive
    ? 'rgba(192, 132, 252, 0.42)'
    : player.specialCooldown > 0
      ? 'rgba(15, 23, 42, 0.82)'
      : 'rgba(30, 41, 59, 0.86)';
  ctx.fill();
  ctx.strokeStyle = player.specialCooldown > 0 && !player.specialActive ? 'rgba(148, 163, 184, 0.42)' : spMeta.color;
  ctx.lineWidth = player.specialActive ? 3 : 2.2;
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = canvasFont(800, Math.max(9, Math.round(10 * m.baseScale)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const spText = player.specialActive
    ? `${player.specialActive.timer.toFixed(1)}s`
    : player.specialCooldown > 0
      ? `${Math.ceil(player.specialCooldown)}s`
      : 'Ulti';
  ctx.fillText(spText, m.special.cx, m.special.cy);

  // Corner Number Badge (1 / 2 / ...) indicating active Ulti slot
  const badgeR = m.specialBadge.r;
  const badgeX = m.specialBadge.cx;
  const badgeY = m.specialBadge.cy;
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.strokeStyle = spMeta.color;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = canvasFont(900, Math.max(8.5, Math.round(10 * m.baseScale)));
  ctx.fillText(`${spInfo.index + 1}`, badgeX, badgeY + 0.5);

  // Lock Selector Toggle Chip beside Ulti Button
  const lockPos = m.specialLock;
  const isLockOn = m.specialLockLocked;
  ctx.beginPath();
  ctx.arc(lockPos.cx, lockPos.cy, lockPos.r, 0, Math.PI * 2);
  ctx.fillStyle = isLockOn ? 'rgba(245, 158, 11, 0.28)' : 'rgba(15, 23, 42, 0.86)';
  ctx.fill();
  ctx.strokeStyle = isLockOn ? '#fbbf24' : 'rgba(148, 163, 184, 0.52)';
  ctx.lineWidth = isLockOn ? 1.9 : 1.3;
  ctx.stroke();

  // Vector Padlock Icon inside lock chip
  const lr = lockPos.r * 0.44;
  const bw = lr * 1.45;
  const bh = lr * 1.15;
  const bx = lockPos.cx - bw * 0.5;
  const by = lockPos.cy - bh * 0.2;
  ctx.strokeStyle = isLockOn ? '#fef3c7' : '#cbd5e1';
  ctx.fillStyle = isLockOn ? '#fbbf24' : '#94a3b8';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (isLockOn) {
    ctx.arc(lockPos.cx, by, lr * 0.50, Math.PI, 0, false);
  } else {
    ctx.arc(lockPos.cx + lr * 0.24, by - lr * 0.14, lr * 0.48, Math.PI, 0.12, false);
  }
  ctx.stroke();
  roundRectPath(ctx, bx, by, bw, bh, 2.5);
  ctx.fill();
  ctx.restore();

  const sr = live.specialRadial;
  const showMobileSpecialRadial =
    (sr.active && sr.source === 'touch') ||
    (editMode && opts?.selectedWidget === 'special');
  if (showMobileSpecialRadial) {
    const isPreviewOnly = !sr.active;
    const modeSkills = isPreviewOnly
      ? spInfo.skills
      : getSpecialSkillsForMode(sr.modeId);
    const bubbleCount = isPreviewOnly ? Math.max(2, modeSkills.length) : modeSkills.length;
    const s = m.baseScale;
    const isAimingPhase = !isPreviewOnly && (sr.phase === 'aiming' || sr.phase === 'reselect_armed');
    const isLockedSingleOrToggle = isLockOn || modeSkills.length <= 1;

    // Show choice petals in 'selecting' (or edit preview), and faded ghosts in 'aiming' when unlocked
    if (!isAimingPhase || !isLockedSingleOrToggle) {
      for (let idx = 0; idx < bubbleCount; idx++) {
        const skillOpt = modeSkills[idx];
        const pos = getMobileSpecialRadialPos(m.special, s, m.specialRotRad, idx, bubbleCount);
        const hovered = !isPreviewOnly && sr.phase === 'selecting' && sr.hoverIdx === idx;
        const isLockedPetal = isAimingPhase && sr.lockedIdx === idx;
        if (isLockedPetal) continue; // Replaced by Dynamic Pivot Aim Ring right at this position!
        const isArmed = skillOpt ? skillOpt.id === spMeta.id : idx === 0;
        const optColor = skillOpt?.color ?? spMeta.color;
        const shortLabel = skillOpt ? skillOpt.short : `Chiêu ${idx + 1}`;

        ctx.save();
        ctx.globalAlpha = isPreviewOnly ? 0.62 : isAimingPhase ? 0.24 : 1;

        if (hovered) {
          ctx.beginPath();
          ctx.moveTo(m.special.cx, m.special.cy);
          ctx.lineTo(pos.x, pos.y);
          ctx.strokeStyle = optColor;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }

        const drawR = hovered ? pos.r * 1.16 : pos.r;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, drawR, 0, Math.PI * 2);
        ctx.fillStyle = hovered ? optColor : 'rgba(15, 23, 42, 0.92)';
        ctx.fill();
        ctx.strokeStyle = hovered ? '#ffffff' : optColor;
        ctx.lineWidth = hovered ? 2.6 : isArmed ? 2.2 : 1.5;
        ctx.stroke();

        ctx.fillStyle = hovered ? '#082f49' : '#f8fafc';
        ctx.font = canvasFont(900, Math.max(10.5, Math.round(12 * s)));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${idx + 1}`, pos.x, pos.y - 2 * s);

        ctx.fillStyle = hovered ? '#0f172a' : '#cbd5e1';
        ctx.font = canvasFont(700, Math.max(7, Math.round(7.5 * s)));
        ctx.fillText(shortLabel.slice(0, 6), pos.x, pos.y + 8.5 * s);
        ctx.restore();
      }
    }

    // Dynamic Pivot Aim Joystick when locked onto a skill ('aiming' / 'reselect_armed')
    if (isAimingPhase) {
      const lockedSkill =
        (sr.lockedSkillId ? getSpecialSkillById(sr.lockedSkillId) : undefined) ??
        modeSkills[sr.lockedIdx] ??
        spMeta;
      const pivotColor = live.cancelHovered ? '#fb7185' : lockedSkill.color;
      const aimR = 44 * s;
      const slotNum = sr.lockedIdx >= 0 ? sr.lockedIdx + 1 : spInfo.index + 1;

      ctx.save();
      ctx.beginPath();
      ctx.arc(sr.pivotX, sr.pivotY, aimR, 0, Math.PI * 2);
      ctx.fillStyle = live.cancelHovered ? 'rgba(225, 29, 72, 0.14)' : 'rgba(15, 23, 42, 0.42)';
      ctx.fill();
      ctx.strokeStyle = pivotColor;
      ctx.lineWidth = 2.0;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Pivot Center Badge
      ctx.beginPath();
      ctx.arc(sr.pivotX, sr.pivotY, 11 * s, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.fill();
      ctx.strokeStyle = pivotColor;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.font = canvasFont(900, Math.max(9, Math.round(10.5 * s)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${slotNum}`, sr.pivotX, sr.pivotY + 0.5);

      // Vector + Thumb Knob
      ctx.beginPath();
      ctx.moveTo(sr.pivotX, sr.pivotY);
      ctx.lineTo(sr.knobX, sr.knobY);
      ctx.strokeStyle = pivotColor;
      ctx.lineWidth = 2.6;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sr.knobX, sr.knobY, 14 * s, 0, Math.PI * 2);
      ctx.fillStyle = pivotColor;
      ctx.globalAlpha = 0.88;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.0;
      ctx.stroke();
      ctx.restore();
    }

    if (!isPreviewOnly) {
      const canInstantCast = (player.specialCooldown <= 0 && !player.specialActive) || Boolean(player.specialActive);
      let hintText: string;
      let hintColor: string;
      if (sr.phase === 'reselect_armed' && live.cancelHovered) {
        hintText = !isLockedSingleOrToggle
          ? 'Thả: HỦY CHIÊU · Kéo ra: CHỌN LẠI CHIÊU'
          : 'Thả: HỦY CHIÊU';
        hintColor = '#fb7185';
      } else if (sr.phase === 'aiming') {
        const lockedSkill =
          (sr.lockedSkillId ? getSpecialSkillById(sr.lockedSkillId) : undefined) ??
          modeSkills[sr.lockedIdx] ??
          spMeta;
        hintText = canInstantCast
          ? `Xoay hướng · Thả: DÙNG ${lockedSkill.name} · Kéo ✕: Hủy/Đổi`
          : `Đang hồi · Thả: ĐỔI MẶC ĐỊNH ${lockedSkill.name} · Kéo ✕: Hủy`;
        hintColor = lockedSkill.color;
      } else {
        const hoveredSkill = sr.hoverIdx !== -1 ? modeSkills[sr.hoverIdx] : null;
        hintText = hoveredSkill
          ? `Chạm ${hoveredSkill.name} để khóa & xoay chiêu`
          : 'Kéo chạm chiêu để khóa & xoay · Thả ở nút Ulti để hủy';
        hintColor = hoveredSkill ? hoveredSkill.color : '#94a3b8';
      }

      ctx.save();
      ctx.font = canvasFont(800, Math.max(9, Math.round(10 * s)));
      const tw = ctx.measureText(hintText).width + 20;
      const hx = clamp(m.special.cx - tw * 0.5, 8, live.vw - tw - 8);
      const hy = Math.max(m.safeTop + 6, m.special.cy - m.special.r - 86 * s);
      roundRectPath(ctx, hx, hy, tw, 24 * s, 99);
      ctx.fillStyle = 'rgba(11, 16, 26, 0.92)';
      ctx.fill();
      ctx.strokeStyle = hintColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hintText, hx + tw * 0.5, hy + 12 * s);
      ctx.restore();
    }
  }

  // 7. Recall & Select All + Fire Tabs (Loose or Edit mode)
  if (isLoose) {
    const selectedPlantedCount = player.hexes.filter(
      (h) => (h.state === 'PLANTED' || h.state === 'LAUNCHED') && h.selected,
    ).length;

    // Select All
    ctx.save();
    ctx.globalAlpha = m.btnAll.opacity;
    roundRectPath(ctx, m.btnAll.x, m.btnAll.y, m.btnAll.w, m.btnAll.h, 8);
    ctx.fillStyle = 'rgba(20, 28, 42, 0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = '#e0f2fe';
    ctx.font = canvasFont(700, Math.max(9, Math.round(10 * m.baseScale)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Chọn hết', m.btnAll.x + m.btnAll.w * 0.5, m.btnAll.y + m.btnAll.h * 0.5);
    ctx.restore();

    // Smart Recall
    ctx.save();
    ctx.globalAlpha = m.btnRecall.opacity;
    roundRectPath(ctx, m.btnRecall.x, m.btnRecall.y, m.btnRecall.w, m.btnRecall.h, 8);
    ctx.fillStyle = selectedPlantedCount > 0 ? 'rgba(245, 158, 11, 0.36)' : 'rgba(20, 28, 42, 0.82)';
    ctx.fill();
    ctx.strokeStyle = selectedPlantedCount > 0 ? '#ffffff' : '#fbbf24';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = '#fef3c7';
    ctx.font = canvasFont(800, Math.max(9, Math.round(10 * m.baseScale)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      selectedPlantedCount > 0 ? `Thu (${selectedPlantedCount})` : 'Thu hồi',
      m.btnRecall.x + m.btnRecall.w * 0.5,
      m.btnRecall.y + m.btnRecall.h * 0.5,
    );
    ctx.restore();

    // 3 Fire Mode Tabs
    for (const tab of m.fireTabs) {
      const active = player.fireMode === tab.id;
      ctx.save();
      ctx.globalAlpha = tab.opacity;
      roundRectPath(ctx, tab.x, tab.y, tab.w, tab.h, 7);
      ctx.fillStyle = active ? 'rgba(56, 189, 248, 0.34)' : 'rgba(20, 28, 42, 0.78)';
      ctx.fill();
      ctx.strokeStyle = active ? '#38bdf8' : 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = active ? 1.8 : 1.2;
      ctx.stroke();
      ctx.fillStyle = active ? '#ffffff' : '#cbd5e1';
      ctx.font = canvasFont(700, Math.max(8, Math.round(9.5 * m.baseScale)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tab.label, tab.x + tab.w * 0.5, tab.y + tab.h * 0.5);
      ctx.restore();
    }
  }

  // 8. Customizable Rotation Cluster (strictly hidden when not in Loose mode, visible in Edit mode)
  if (isLoose) {
    for (const btn of m.rotBtns) {
      const active = player.rotMode === btn.id;
      ctx.save();
      ctx.globalAlpha = btn.opacity;
      roundRectPath(ctx, btn.x, btn.y, btn.w, btn.h, 7);
      ctx.fillStyle = active ? 'rgba(251, 191, 36, 0.30)' : 'rgba(20, 28, 42, 0.80)';
      ctx.fill();
      ctx.strokeStyle = active ? '#fbbf24' : 'rgba(148, 163, 184, 0.38)';
      ctx.lineWidth = active ? 1.8 : 1.2;
      ctx.stroke();
      ctx.fillStyle = active ? '#fef3c7' : '#cbd5e1';
      ctx.font = canvasFont(700, Math.max(8, Math.round(9.5 * m.baseScale)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5);
      ctx.restore();
    }
  }

  // 9. Customizable Scale Cluster (always active)
  for (const btn of m.scaleBtns) {
    const active = Math.abs(player.targetScale - btn.id) < 0.05;
    ctx.save();
    ctx.globalAlpha = btn.opacity;
    roundRectPath(ctx, btn.x, btn.y, btn.w, btn.h, 7);
    const col = btn.id === 0.6 ? '#fbbf24' : btn.id === 1.5 ? '#34d399' : '#38bdf8';
    ctx.fillStyle = active ? 'rgba(56, 189, 248, 0.32)' : 'rgba(20, 28, 42, 0.80)';
    ctx.fill();
    ctx.strokeStyle = active ? col : 'rgba(148, 163, 184, 0.38)';
    ctx.lineWidth = active ? 2 : 1.2;
    ctx.stroke();
    ctx.fillStyle = active ? '#ffffff' : '#cbd5e1';
    ctx.font = canvasFont(800, Math.max(9, Math.round(10 * m.baseScale)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5);
    ctx.restore();
  }

  // 10. AoV Cancel X Zone (shown while aiming attack/dash, during Mobile Ulti select/aim, or in Edit mode)
  const isPureDefense =
    isDefenseStance && !isFortressActive && !isHexWallActive;
  const isTouchSpecialCancelable =
    live.specialRadial.source === 'touch' &&
    (live.specialRadial.phase === 'selecting' ||
      live.specialRadial.phase === 'aiming' ||
      live.specialRadial.phase === 'reselect_armed');
  if ((player.isAiming && !isPureDefense) || player.isAimingDash || isTouchSpecialCancelable || editMode) {
    renderCancelZone(ctx, m.cancel.cx, m.cancel.cy, m.cancel.r, live.cancelHovered, m.cancel.opacity);
  }

  // Edit Mode Selection Bounding Boxes
  if (editMode) {
    (Object.keys(m.widgetBounds) as MobileWidgetId[]).forEach((wid) => {
      const box = m.widgetBounds[wid];
      const isSel = opts?.selectedWidget === wid;
      ctx.save();
      roundRectPath(ctx, box.x - 4, box.y - 4, box.w + 8, box.h + 8, 10);
      ctx.strokeStyle = isSel ? '#38bdf8' : 'rgba(226, 232, 240, 0.45)';
      ctx.lineWidth = isSel ? 2.5 : 1.3;
      ctx.setLineDash(isSel ? [] : [5, 4]);
      ctx.stroke();
      if (isSel) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
        ctx.fill();
        ctx.font = canvasFont(700, 10);
        ctx.fillStyle = '#bae6fd';
        ctx.textAlign = 'center';
        ctx.fillText(MOBILE_WIDGET_LABELS[wid], box.x + box.w * 0.5, box.y - 10);

        // Crisp circular Rotate Icon Handle on rotatable widgets
        const rh = getRotateHandlePos(m, wid);
        if (rh) {
          ctx.beginPath();
          ctx.arc(rh.cx, rh.cy, rh.r, 0, Math.PI * 2);
          ctx.fillStyle = '#0f172a';
          ctx.fill();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Vector circular-arrow rotate icon inside the badge
          const ir = rh.r * 0.48;
          ctx.beginPath();
          ctx.arc(rh.cx, rh.cy, ir, -Math.PI * 0.72, Math.PI * 0.82);
          ctx.strokeStyle = '#e0f2fe';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.stroke();

          // Arrowhead at end of arc
          const tipA = Math.PI * 0.82;
          const tx = rh.cx + Math.cos(tipA) * ir;
          const ty = rh.cy + Math.sin(tipA) * ir;
          ctx.beginPath();
          ctx.moveTo(tx - 3.6, ty - 2.4);
          ctx.lineTo(tx, ty);
          ctx.lineTo(tx + 3.2, ty - 3.0);
          ctx.strokeStyle = '#e0f2fe';
          ctx.lineWidth = 1.9;
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
      }
      ctx.restore();
    });
  }
}

export function renderDesktopCanvasHUD(
  ctx: CanvasRenderingContext2D,
  player: Fighter,
  live: LiveInputState,
  pcConfig: PCControlConfig,
): void {
  const pc = live.pcLayout;
  const s = pc.scale;
  const kb = pcConfig.keybinds;

  ctx.save();
  ctx.globalAlpha = pc.opacity;

  // Dock container
  roundRectPath(ctx, pc.barRect.x, pc.barRect.y, pc.barRect.w, pc.barRect.h, 12);
  ctx.fillStyle = 'rgba(15, 22, 34, 0.88)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.30)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Form Buttons (1/2/3/4)
  const formKeyMap: Record<FormKey, string> = {
    loose: formatKeyLabel(kb.formLoose),
    slot1: formatKeyLabel(kb.formSlot1),
    slot2: formatKeyLabel(kb.formSlot2),
    slot3: formatKeyLabel(kb.formSlot3),
  };

  for (const b of pc.formBtns) {
    const active = player.form === b.id;
    const info = getFormDisplay(player, b.id);
    roundRectPath(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fillStyle = active ? 'rgba(56, 189, 248, 0.25)' : 'rgba(30, 41, 59, 0.72)';
    ctx.fill();
    ctx.strokeStyle = active ? info.color : 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = active ? 2 : 1.1;
    ctx.stroke();

    ctx.fillStyle = active ? '#ffffff' : '#cbd5e1';
    ctx.font = canvasFont(800, Math.max(9, Math.round(10.5 * s)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(info.label, b.x + b.w * 0.5, b.y + b.h * 0.42);

    ctx.fillStyle = info.color;
    ctx.font = canvasFont(700, Math.max(8, Math.round(8.5 * s)));
    const subTag = isSlotKey(b.id) ? STANCE_META[player.loadout.blueprints[b.id].stance].short : 'TỰ DO';
    ctx.fillText(`[${formKeyMap[b.id]}] ${subTag}`, b.x + b.w * 0.5, b.y + b.h * 0.78);
  }

  // Loose Hex Slots (1..N) + Select All + Recall + Fire Tabs
  if (player.form === 'loose') {
    for (const slot of pc.hexSlots) {
      const hex = player.hexes[slot.id];
      if (!hex) continue;
      roundRectPath(ctx, slot.x, slot.y, slot.w, slot.h, 7);
      let fill = 'rgba(30, 41, 59, 0.72)';
      let stroke = 'rgba(148, 163, 184, 0.30)';
      if (hex.state === 'BROKEN') {
        fill = 'rgba(159, 18, 57, 0.55)';
        stroke = '#fb7185';
      } else if (hex.state === 'PLANTED' || hex.state === 'LAUNCHED') {
        fill = hex.selected ? 'rgba(245, 158, 11, 0.62)' : 'rgba(180, 83, 9, 0.45)';
        stroke = hex.selected ? '#ffffff' : '#fbbf24';
      } else if (hex.selected) {
        fill = 'rgba(14, 165, 233, 0.52)';
        stroke = '#ffffff';
      }
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = hex.selected ? 2 : 1.1;
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = canvasFont(800, Math.max(9, Math.round(11 * s)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        hex.state === 'BROKEN' ? `${Math.ceil(hex.cooldown)}` : `${slot.id + 1}`,
        slot.x + slot.w * 0.5,
        slot.y + slot.h * 0.5,
      );
    }

    // Select All
    roundRectPath(ctx, pc.btnAll.x, pc.btnAll.y, pc.btnAll.w, pc.btnAll.h, 8);
    ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#bae6fd';
    ctx.font = canvasFont(700, Math.max(9, Math.round(10 * s)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Hết [${formatKeyLabel(kb.selectAll)}]`, pc.btnAll.x + pc.btnAll.w * 0.5, pc.btnAll.y + pc.btnAll.h * 0.5);

    // Recall
    const selPlanted = player.hexes.filter(
      (h) => (h.state === 'PLANTED' || h.state === 'LAUNCHED') && h.selected,
    ).length;
    roundRectPath(ctx, pc.btnRecall.x, pc.btnRecall.y, pc.btnRecall.w, pc.btnRecall.h, 8);
    ctx.fillStyle = selPlanted > 0 ? 'rgba(245, 158, 11, 0.38)' : 'rgba(30, 41, 59, 0.8)';
    ctx.fill();
    ctx.strokeStyle = selPlanted > 0 ? '#ffffff' : '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fef3c7';
    ctx.fillText(
      selPlanted > 0 ? `Thu (${selPlanted})` : 'Thu [RMB]',
      pc.btnRecall.x + pc.btnRecall.w * 0.5,
      pc.btnRecall.y + pc.btnRecall.h * 0.5,
    );

    // 3 Fire Mode Pills above Dock
    for (const tab of pc.fireTabs) {
      const active = player.fireMode === tab.id;
      roundRectPath(ctx, tab.x, tab.y, tab.w, tab.h, 7);
      ctx.fillStyle = active ? 'rgba(56, 189, 248, 0.34)' : 'rgba(15, 22, 34, 0.84)';
      ctx.fill();
      ctx.strokeStyle = active ? '#38bdf8' : 'rgba(148, 163, 184, 0.32)';
      ctx.lineWidth = active ? 1.8 : 1.1;
      ctx.stroke();
      ctx.fillStyle = active ? '#ffffff' : '#cbd5e1';
      ctx.font = canvasFont(700, Math.max(9, Math.round(10 * s)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tab.label, tab.x + tab.w * 0.5, tab.y + tab.h * 0.5);
    }

    // Keybind hint tag beside fire tabs
    if (pc.fireTabs.length > 0) {
      const first = pc.fireTabs[0];
      ctx.fillStyle = '#94a3b8';
      ctx.font = canvasFont(700, Math.max(8, Math.round(9.5 * s)));
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`[${formatKeyLabel(kb.cycleFire)}]`, first.x - 6, first.y + first.h * 0.5);
    }
  }

  // Dash Button
  roundRectPath(ctx, pc.dashBtn.x, pc.dashBtn.y, pc.dashBtn.w, pc.dashBtn.h, 8);
  ctx.fillStyle = player.dashCooldown > 0 ? 'rgba(15, 23, 42, 0.85)' : 'rgba(16, 185, 129, 0.28)';
  ctx.fill();
  ctx.strokeStyle = player.dashCooldown > 0 ? 'rgba(148, 163, 184, 0.35)' : '#34d399';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = canvasFont(800, Math.max(9, Math.round(10.5 * s)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    player.dashCooldown > 0 ? `Lướt ${player.dashCooldown.toFixed(1)}s` : `Lướt [${formatKeyLabel(kb.dash)}]`,
    pc.dashBtn.x + pc.dashBtn.w * 0.5,
    pc.dashBtn.y + pc.dashBtn.h * 0.5,
  );

  // Special Skill Button + Corner Number Badge + Numbered Quick-Switch Pills above Dock
  const spInfo = getFighterSelectedSpecialInfo(player);
  const spMeta = spInfo.skill;
  roundRectPath(ctx, pc.specialBtn.x, pc.specialBtn.y, pc.specialBtn.w, pc.specialBtn.h, 8);
  ctx.fillStyle = player.specialActive
    ? 'rgba(192, 132, 252, 0.36)'
    : player.specialCooldown > 0
      ? 'rgba(15, 23, 42, 0.85)'
      : 'rgba(30, 41, 59, 0.86)';
  ctx.fill();
  ctx.strokeStyle = player.specialCooldown > 0 && !player.specialActive ? 'rgba(148, 163, 184, 0.35)' : spMeta.color;
  ctx.lineWidth = player.specialActive ? 2.4 : 1.7;
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = canvasFont(800, Math.max(9, Math.round(10.5 * s)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const spLabel = player.specialActive
    ? `Ulti ${player.specialActive.timer.toFixed(1)}s`
    : player.specialCooldown > 0
      ? `Ulti (${Math.ceil(player.specialCooldown)}s)`
      : `Ulti [${formatKeyLabel(kb.special)}]`;
  ctx.fillText(spLabel, pc.specialBtn.x + pc.specialBtn.w * 0.5, pc.specialBtn.y + pc.specialBtn.h * 0.5);

  // Corner Number Badge (1 / 2 / ...) on Special Button
  const badgeR = Math.max(8, 9 * s);
  const badgeX = pc.specialBtn.x + pc.specialBtn.w - 3 * s;
  const badgeY = pc.specialBtn.y + 3 * s;
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.strokeStyle = spMeta.color;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = canvasFont(900, Math.max(8.5, Math.round(9.5 * s)));
  ctx.fillText(`${spInfo.index + 1}`, badgeX, badgeY + 0.5);

  // Numbered Quick-Switch Pills directly above Special Button + [V] hint
  const spPills = getPCSpecialOptionRects(pc.specialBtn, s, spInfo.skills.length);
  if (spPills.length > 0) {
    const firstPill = spPills[0];
    ctx.fillStyle = '#94a3b8';
    ctx.font = canvasFont(700, Math.max(8, Math.round(9 * s)));
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`[${formatKeyLabel(kb.cycleSpecial)}]`, firstPill.x - 5, firstPill.y + firstPill.h * 0.5);

    for (const pill of spPills) {
      const opt = spInfo.skills[pill.index];
      const active = opt?.id === spMeta.id;
      const col = opt?.color ?? spMeta.color;
      roundRectPath(ctx, pill.x, pill.y, pill.w, pill.h, 6);
      ctx.fillStyle = active ? 'rgba(15, 23, 42, 0.94)' : 'rgba(15, 22, 34, 0.78)';
      ctx.fill();
      ctx.strokeStyle = active ? col : 'rgba(148, 163, 184, 0.34)';
      ctx.lineWidth = active ? 2 : 1.1;
      ctx.stroke();
      if (active) {
        roundRectPath(ctx, pill.x + 1, pill.y + 1, pill.w - 2, pill.h - 2, 5);
        ctx.fillStyle = `${col}33`;
        ctx.fill();
      }
      ctx.fillStyle = active ? '#ffffff' : '#94a3b8';
      ctx.font = canvasFont(900, Math.max(8.5, Math.round(10 * s)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${pill.index + 1}`, pill.x + pill.w * 0.5, pill.y + pill.h * 0.5);
    }
  }

  ctx.restore();

  // PC Hold-V Radial Wheel Overlay (centered near cursor)
  if (live.specialRadial.active && live.specialRadial.source === 'pc') {
    const sr = live.specialRadial;
    const skills = getSpecialSkillsForMode(sr.modeId);
    const activeSkill = getFighterSelectedSpecialInfo(player).skill;
    const hoveredSkill = sr.hoverIdx !== -1 ? skills[sr.hoverIdx] : null;
    const canInstantCast = player.specialCooldown <= 0 && !player.specialActive;

    ctx.save();
    // Soft radial backdrop ring
    ctx.beginPath();
    ctx.arc(sr.originX, sr.originY, 108, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 15, 26, 0.64)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center hub (Cancel if pointer stays at center)
    ctx.beginPath();
    ctx.arc(sr.originX, sr.originY, 24, 0, Math.PI * 2);
    ctx.fillStyle = sr.hoverIdx === -1 ? 'rgba(225, 29, 72, 0.34)' : 'rgba(15, 23, 42, 0.90)';
    ctx.fill();
    ctx.strokeStyle = sr.hoverIdx === -1 ? '#fb7185' : 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.font = canvasFont(800, 9.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sr.hoverIdx === -1 ? 'HỦY' : canInstantCast ? 'DÙNG' : 'ĐỔI', sr.originX, sr.originY);

    // Skill bubbles
    for (let idx = 0; idx < skills.length; idx++) {
      const opt = skills[idx];
      const pos = getPCSpecialRadialPos(sr.originX, sr.originY, idx, skills.length);
      const hovered = sr.hoverIdx === idx;
      const isArmed = opt.id === activeSkill.id;

      if (hovered) {
        ctx.beginPath();
        ctx.moveTo(sr.originX, sr.originY);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = opt.color;
        ctx.lineWidth = 2.6;
        ctx.stroke();
      }

      const drawR = hovered ? pos.r * 1.16 : pos.r;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, drawR, 0, Math.PI * 2);
      ctx.fillStyle = hovered ? opt.color : 'rgba(15, 23, 42, 0.94)';
      ctx.fill();
      ctx.strokeStyle = hovered ? '#ffffff' : opt.color;
      ctx.lineWidth = hovered ? 2.6 : isArmed ? 2.2 : 1.5;
      ctx.stroke();

      ctx.fillStyle = hovered ? '#082f49' : '#f8fafc';
      ctx.font = canvasFont(900, 14);
      ctx.fillText(`${idx + 1}`, pos.x, pos.y - 3);
      ctx.fillStyle = hovered ? '#0f172a' : '#cbd5e1';
      ctx.font = canvasFont(700, 8.5);
      ctx.fillText(opt.short.slice(0, 7), pos.x, pos.y + 11);
    }

    // Bottom status caption under wheel
    const caption = hoveredSkill
      ? canInstantCast
        ? `Thả ${formatKeyLabel(kb.cycleSpecial)}: DÙNG NGAY · ${hoveredSkill.name}`
        : `Thả ${formatKeyLabel(kb.cycleSpecial)}: ĐỔI MẶC ĐỊNH · ${hoveredSkill.name}`
      : `Di chuột chọn · Thả ở giữa để hủy`;
    ctx.font = canvasFont(800, 10.5);
    const cw = ctx.measureText(caption).width + 20;
    const cx = clamp(sr.originX - cw * 0.5, 10, live.vw - cw - 10);
    const cy = Math.min(live.vh - 34, sr.originY + 114);
    roundRectPath(ctx, cx, cy, cw, 24, 99);
    ctx.fillStyle = 'rgba(11, 16, 26, 0.94)';
    ctx.fill();
    ctx.strokeStyle = hoveredSkill ? hoveredSkill.color : '#64748b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(caption, cx + cw * 0.5, cy + 12);
    ctx.restore();
  }

  // Cancel X Zone when aiming on PC
  if (player.isAiming) {
    renderCancelZone(ctx, pc.cancel.cx, pc.cancel.cy, pc.cancel.r, live.cancelHovered, 0.94);
  }
}
