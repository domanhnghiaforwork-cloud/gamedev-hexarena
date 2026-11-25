import { clamp } from '@core/math/hexMath';
import type { FireMode, FormKey, RotMode, ScaleTier } from '@core/types';
import type { MobileHUDConfig, MobileWidgetId, PCControlConfig } from '@storage/profiles';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CircleWidget {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
}

export interface PillButtonRect extends Rect {
  id: string;
  label: string;
}

export interface MobileComputedLayout {
  vw: number;
  vh: number;
  baseScale: number;
  safeTop: number;
  safeBottom: number;
  safeLeft: number;
  safeRight: number;
  joy: CircleWidget;
  atk: CircleWidget;
  dash: CircleWidget;
  form: CircleWidget;
  formRotRad: number;
  special: CircleWidget;
  specialRotRad: number;
  specialLock: CircleWidget;
  specialBadge: CircleWidget;
  specialLockLocked: boolean;
  cancel: CircleWidget;
  arc: {
    cx: number;
    cy: number;
    innerR: number;
    outerR: number;
    startAng: number;
    endAng: number;
    hexCount: number;
    opacity: number;
  };
  btnRecall: Rect & { opacity: number };
  btnAll: Rect & { opacity: number };
  recallGroupRect: Rect;
  fireTabs: Array<Rect & { id: FireMode; label: string; opacity: number }>;
  fireTabsGroupRect: Rect;
  rotBtns: Array<Rect & { id: RotMode; label: string; opacity: number }>;
  rotGroupRect: Rect;
  scaleBtns: Array<Rect & { id: ScaleTier; label: string; opacity: number }>;
  scaleGroupRect: Rect;
  widgetBounds: Record<MobileWidgetId, Rect>;
}

export function isWidgetRotatable(wid: MobileWidgetId): boolean {
  return (
    wid === 'atk' ||
    wid === 'form' ||
    wid === 'special' ||
    wid === 'recall' ||
    wid === 'fireTabs' ||
    wid === 'rotCluster' ||
    wid === 'scaleCluster'
  );
}

export function getWidgetRotateStep(wid: MobileWidgetId): number {
  if (wid === 'atk' || wid === 'form' || wid === 'special') return 45;
  return 90;
}

export function getMobileSpecialRadialPos(
  special: CircleWidget,
  baseScale: number,
  rotRad: number,
  idx: number,
  total: number,
): { x: number; y: number; r: number } {
  const safeTotal = Math.max(1, total);
  const step = safeTotal <= 2 ? 0.80 : safeTotal === 3 ? 0.70 : Math.min(0.62, 2.2 / Math.max(1, safeTotal - 1));
  const centerAng = -Math.PI * 0.56 + rotRad;
  const ang = centerAng + (idx - (safeTotal - 1) * 0.5) * step;
  const distR = special.r + 30 * baseScale;
  return {
    x: special.cx + Math.cos(ang) * distR,
    y: special.cy + Math.sin(ang) * distR,
    r: 19 * baseScale,
  };
}

export function getMobileSpecialLockPos(
  special: CircleWidget,
  baseScale: number,
  rotRad: number,
  vw?: number,
  vh?: number,
): CircleWidget {
  const lockAng = Math.PI * 0.98 + rotRad;
  const lockR = clamp(12.5 * baseScale, 10, 15.5);
  const lockDist = special.r + lockR + 5 * baseScale;
  let cx = special.cx + Math.cos(lockAng) * lockDist;
  let cy = special.cy + Math.sin(lockAng) * lockDist;
  if (typeof vw === 'number' && typeof vh === 'number') {
    cx = clamp(cx, lockR + 4, Math.max(lockR + 4, vw - lockR - 4));
    cy = clamp(cy, lockR + 4, Math.max(lockR + 4, vh - lockR - 4));
  }
  return {
    cx,
    cy,
    r: lockR,
    opacity: special.opacity,
  };
}

export function getMobileSpecialBadgePos(
  special: CircleWidget,
  baseScale: number,
  rotRad: number,
): CircleWidget {
  const badgeAng = -Math.PI * 0.22 + rotRad;
  const badgeR = Math.max(8.5, 9.5 * baseScale);
  const badgeDist = special.r * 0.96;
  return {
    cx: special.cx + Math.cos(badgeAng) * badgeDist,
    cy: special.cy + Math.sin(badgeAng) * badgeDist,
    r: badgeR,
    opacity: special.opacity,
  };
}

export function getPCSpecialRadialPos(
  originX: number,
  originY: number,
  idx: number,
  total: number,
): { x: number; y: number; r: number } {
  const safeTotal = Math.max(1, total);
  let ang: number;
  if (safeTotal === 1) {
    ang = -Math.PI * 0.5;
  } else if (safeTotal === 2) {
    ang = idx === 0 ? -Math.PI * 0.72 : -Math.PI * 0.28;
  } else {
    ang = -Math.PI * 0.5 + (idx / safeTotal) * Math.PI * 2;
  }
  const distR = safeTotal <= 2 ? 76 : 82;
  return {
    x: originX + Math.cos(ang) * distR,
    y: originY + Math.sin(ang) * distR,
    r: 26,
  };
}

export function getPCSpecialOptionRects(
  specialBtn: Rect,
  scale: number,
  count: number,
): Array<Rect & { index: number }> {
  const safeCount = Math.max(1, count);
  const pillW = 24 * scale;
  const pillH = 20 * scale;
  const gap = 4 * scale;
  const totalW = safeCount * pillW + Math.max(0, safeCount - 1) * gap;
  const startX = specialBtn.x + (specialBtn.w - totalW) * 0.5;
  const y = specialBtn.y - pillH - 6 * scale;
  const out: Array<Rect & { index: number }> = [];
  for (let i = 0; i < safeCount; i++) {
    out.push({
      index: i,
      x: startX + i * (pillW + gap),
      y,
      w: pillW,
      h: pillH,
    });
  }
  return out;
}

export function getRotateHandlePos(
  layout: MobileComputedLayout,
  wid: MobileWidgetId,
): { cx: number; cy: number; r: number } | null {
  if (!isWidgetRotatable(wid)) return null;
  const b = layout.widgetBounds[wid];
  const r = clamp(14 * layout.baseScale, 12, 17);
  let cx = b.x + b.w + 4;
  let cy = b.y - 4;
  if (cx + r > layout.vw - 6) cx = b.x - 4;
  if (cy - r < 6) cy = b.y + b.h + 4;
  cx = clamp(cx, r + 6, layout.vw - r - 6);
  cy = clamp(cy, r + 6, layout.vh - r - 6);
  return { cx, cy, r };
}

export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Smart Mobile Layout Solver:
 * - Translates normalized Custom HUD coordinates (0..1) into exact safe-area pixel boxes.
 * - Dynamically expands Arc-Selector sweep angle for 5..10 hexes while keeping comfortable touch targets.
 * - Guarantees every widget remains strictly inside safe viewport bounds across 16:9, 20:9, and tablet screens.
 */
export function computeSmartMobileLayout(
  vw: number,
  vh: number,
  hexCount: number,
  config: MobileHUDConfig,
  insets: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 },
): MobileComputedLayout {
  const safeTop = Math.max(50, insets.top + 46);
  const safeBottom = Math.max(8, insets.bottom + 6);
  const safeLeft = Math.max(8, insets.left + 8);
  const safeRight = Math.max(8, insets.right + 8);

  const usableW = Math.max(240, vw - safeLeft - safeRight);
  const usableH = Math.max(200, vh - safeTop - safeBottom);
  const isPortrait = vh > vw;
  // Dual-axis scaling handles ultra-wide 20:9 phones, notched iPhones, small phones, and large iPads evenly!
  const s = isPortrait
    ? clamp(Math.min(usableW / 440, usableH / 640), 0.68, 1.05)
    : clamp(Math.min(usableW / 760, usableH / 340), 0.68, 1.18);

  const posOf = (id: MobileWidgetId, halfW: number, halfH: number) => {
    const w = config.widgets[id];
    const rawX = safeLeft + w.nx * usableW;
    const rawY = safeTop + w.ny * usableH;
    return {
      cx: clamp(rawX, safeLeft + halfW, vw - safeRight - halfW),
      cy: clamp(rawY, safeTop + halfH, vh - safeBottom - halfH),
      scale: w.scale,
      opacity: w.opacity,
    };
  };

  // Joystick
  const joyR = 52 * s * config.widgets.joy.scale;
  const joyP = posOf('joy', joyR + 4, joyR + 4);
  const joy: CircleWidget = { cx: joyP.cx, cy: joyP.cy, r: joyR, opacity: joyP.opacity };

  const rotDegOf = (id: MobileWidgetId): number => {
    const r = config.widgets[id].rotation ?? 0;
    return ((Math.round(r) % 360) + 360) % 360;
  };

  // Attack + Arc-Selector (auto-adapts sweep for 5..10 hexes & supports custom rotation!)
  const atkScale = config.widgets.atk.scale;
  const atkR = 40 * s * atkScale;
  const arcInnerR = 54 * s * atkScale;
  const arcOuterR = 92 * s * atkScale;
  const atkP = posOf('atk', atkR + 10, atkR + 10);
  const atk: CircleWidget = { cx: atkP.cx, cy: atkP.cy, r: atkR, opacity: atkP.opacity };

  // Expand sweep slightly for 8..10 hexes so each segment stays easy to tap & swipe!
  const extraSweep = Math.max(0, hexCount - 7) * 0.085;
  const atkRotRad = (rotDegOf('atk') * Math.PI) / 180;
  const arc = {
    cx: atk.cx,
    cy: atk.cy,
    innerR: arcInnerR,
    outerR: arcOuterR,
    startAng: Math.PI * 0.95 - extraSweep * 0.35 + atkRotRad,
    endAng: Math.PI * 1.63 + extraSweep * 0.65 + atkRotRad,
    hexCount,
    opacity: atk.opacity,
  };

  // Tight bounding box covering both Attack pad & rotated Arc-Selector
  let atkMinX = atk.cx - atk.r;
  let atkMaxX = atk.cx + atk.r;
  let atkMinY = atk.cy - atk.r;
  let atkMaxY = atk.cy + atk.r;
  const arcSamples = 12;
  for (let i = 0; i <= arcSamples; i++) {
    const a = arc.startAng + ((arc.endAng - arc.startAng) * i) / arcSamples;
    const ox = arc.cx + Math.cos(a) * arcOuterR;
    const oy = arc.cy + Math.sin(a) * arcOuterR;
    atkMinX = Math.min(atkMinX, ox);
    atkMaxX = Math.max(atkMaxX, ox);
    atkMinY = Math.min(atkMinY, oy);
    atkMaxY = Math.max(atkMaxY, oy);
  }
  const atkGroupRect: Rect = {
    x: clamp(atkMinX, safeLeft, vw - safeRight - 10),
    y: clamp(atkMinY, safeTop, vh - safeBottom - 10),
    w: Math.max(atk.r * 2, clamp(atkMaxX, safeLeft + 10, vw - safeRight) - clamp(atkMinX, safeLeft, vw - safeRight - 10)),
    h: Math.max(atk.r * 2, clamp(atkMaxY, safeTop + 10, vh - safeBottom) - clamp(atkMinY, safeTop, vh - safeBottom - 10)),
  };

  // Dash
  const dashR = 26 * s * config.widgets.dash.scale;
  const dashP = posOf('dash', dashR + 4, dashR + 4);
  const dash: CircleWidget = { cx: dashP.cx, cy: dashP.cy, r: dashR, opacity: dashP.opacity };

  // Form Switch (radial wheel rotates with custom rotation!)
  const formR = 26 * s * config.widgets.form.scale;
  const formP = posOf('form', formR + 4, formR + 4);
  const form: CircleWidget = { cx: formP.cx, cy: formP.cy, r: formR, opacity: formP.opacity };
  const formRotRad = (rotDegOf('form') * Math.PI) / 180;

  // Special Skill
  const specR = 28 * s * config.widgets.special.scale;
  const specP = posOf('special', specR + 4, specR + 4);
  const special: CircleWidget = { cx: specP.cx, cy: specP.cy, r: specR, opacity: specP.opacity };
  const specialRotRad = (rotDegOf('special') * Math.PI) / 180;
  const specialLock = getMobileSpecialLockPos(special, s, specialRotRad, vw, vh);
  const specialBadge = getMobileSpecialBadgePos(special, s, specialRotRad);
  const specialLockLocked = Boolean(config.specialSelectorLocked);

  // Cancel X Zone
  const cancelR = 25 * s * config.widgets.cancel.scale;
  const cancelP = posOf('cancel', cancelR + 4, cancelR + 4);
  const cancel: CircleWidget = { cx: cancelP.cx, cy: cancelP.cy, r: cancelR, opacity: cancelP.opacity };

  // Recall + Select All cluster (0°: vertical All/Rec, 90°: horizontal All|Rec, 180°: vertical Rec/All, 270°: horizontal Rec|All)
  const recScale = s * config.widgets.recall.scale;
  const recW = 74 * recScale;
  const allH = 26 * recScale;
  const recH = 30 * recScale;
  const recGap = 6 * recScale;
  const recQ = Math.round(rotDegOf('recall') / 90) % 4;
  const recHorizontal = recQ === 1 || recQ === 3;
  const recReversed = recQ === 2 || recQ === 3;

  let btnAll: Rect & { opacity: number };
  let btnRecall: Rect & { opacity: number };
  let recallGroupRect: Rect;

  if (recHorizontal) {
    const hBtnH = 28 * recScale;
    const totalW = recW * 2 + recGap;
    const recP = posOf('recall', totalW * 0.5 + 2, hBtnH * 0.5 + 2);
    const leftX = recP.cx - totalW * 0.5;
    const topY = recP.cy - hBtnH * 0.5;
    const firstX = leftX;
    const secondX = leftX + recW + recGap;
    btnAll = { x: recReversed ? secondX : firstX, y: topY, w: recW, h: hBtnH, opacity: recP.opacity };
    btnRecall = { x: recReversed ? firstX : secondX, y: topY, w: recW, h: hBtnH, opacity: recP.opacity };
    recallGroupRect = { x: leftX, y: topY, w: totalW, h: hBtnH };
  } else {
    const recTotalH = allH + recGap + recH;
    const recP = posOf('recall', recW * 0.5 + 2, recTotalH * 0.5 + 2);
    const leftX = recP.cx - recW * 0.5;
    const topY = recP.cy - recTotalH * 0.5;
    btnAll = {
      x: leftX,
      y: recReversed ? topY + recH + recGap : topY,
      w: recW,
      h: allH,
      opacity: recP.opacity,
    };
    btnRecall = {
      x: leftX,
      y: recReversed ? topY : topY + allH + recGap,
      w: recW,
      h: recH,
      opacity: recP.opacity,
    };
    recallGroupRect = { x: leftX, y: topY, w: recW, h: recTotalH };
  }

  // Helper to lay out a 3-button linear strip in 0° (horiz), 90° (vert), 180° (horiz rev), 270° (vert rev)
  function layoutLinearStrip<T extends string | number>(
    wid: MobileWidgetId,
    defs: Array<{ id: T; label: string; w: number }>,
    btnH: number,
    gap: number,
  ): { btns: Array<Rect & { id: T; label: string; opacity: number }>; groupRect: Rect } {
    const q = Math.round(rotDegOf(wid) / 90) % 4;
    const isVert = q === 1 || q === 3;
    const ordered = q === 2 || q === 3 ? [...defs].reverse() : defs;

    if (isVert) {
      const colW = Math.max(...ordered.map((d) => d.w));
      const totalH = btnH * ordered.length + gap * Math.max(0, ordered.length - 1);
      const p = posOf(wid, colW * 0.5 + 2, totalH * 0.5 + 2);
      const leftX = p.cx - colW * 0.5;
      let curY = p.cy - totalH * 0.5;
      const btns = ordered.map((d) => {
        const r = { id: d.id, label: d.label, x: leftX, y: curY, w: colW, h: btnH, opacity: p.opacity };
        curY += btnH + gap;
        return r;
      });
      return { btns, groupRect: { x: leftX, y: p.cy - totalH * 0.5, w: colW, h: totalH } };
    }

    const totalW = ordered.reduce((acc, d) => acc + d.w, 0) + gap * Math.max(0, ordered.length - 1);
    const p = posOf(wid, totalW * 0.5 + 2, btnH * 0.5 + 2);
    let curX = p.cx - totalW * 0.5;
    const topY = p.cy - btnH * 0.5;
    const btns = ordered.map((d) => {
      const r = { id: d.id, label: d.label, x: curX, y: topY, w: d.w, h: btnH, opacity: p.opacity };
      curX += d.w + gap;
      return r;
    });
    return { btns, groupRect: { x: p.cx - totalW * 0.5, y: topY, w: totalW, h: btnH } };
  }

  // 3 Firing Mode Tabs
  const ftScale = s * config.widgets.fireTabs.scale;
  const ftLayout = layoutLinearStrip<FireMode>(
    'fireTabs',
    [
      { id: 'xayah', label: 'Cắm & Thu', w: 68 * ftScale },
      { id: 'seq', label: 'Lần lượt', w: 58 * ftScale },
      { id: 'volley', label: 'Đồng loạt', w: 64 * ftScale },
    ],
    27 * ftScale,
    4 * ftScale,
  );
  const fireTabs = ftLayout.btns;
  const fireTabsGroupRect = ftLayout.groupRect;

  // Rotation Cluster (3 buttons: Tĩnh / Pháp tuyến / Ngẫu nhiên)
  const rotScale = s * config.widgets.rotCluster.scale;
  const rotLayout = layoutLinearStrip<RotMode>(
    'rotCluster',
    [
      { id: 'static', label: 'Tĩnh', w: 48 * rotScale },
      { id: 'normal', label: 'P.Tuyến', w: 64 * rotScale },
      { id: 'random', label: 'N.Nhiên', w: 64 * rotScale },
    ],
    29 * rotScale,
    4 * rotScale,
  );
  const rotBtns = rotLayout.btns;
  const rotGroupRect = rotLayout.groupRect;

  // Scale Cluster (3 buttons: 60% / 100% / 150%)
  const scScale = s * config.widgets.scaleCluster.scale;
  const scLayout = layoutLinearStrip<ScaleTier>(
    'scaleCluster',
    [
      { id: 0.6, label: '60%', w: 50 * scScale },
      { id: 1.0, label: '100%', w: 54 * scScale },
      { id: 1.5, label: '150%', w: 54 * scScale },
    ],
    29 * scScale,
    4 * scScale,
  );
  const scaleBtns = scLayout.btns;
  const scaleGroupRect = scLayout.groupRect;

  const widgetBounds: Record<MobileWidgetId, Rect> = {
    joy: { x: joy.cx - joy.r, y: joy.cy - joy.r, w: joy.r * 2, h: joy.r * 2 },
    atk: atkGroupRect,
    dash: { x: dash.cx - dash.r, y: dash.cy - dash.r, w: dash.r * 2, h: dash.r * 2 },
    form: { x: form.cx - form.r, y: form.cy - form.r, w: form.r * 2, h: form.r * 2 },
    special: { x: special.cx - special.r, y: special.cy - special.r, w: special.r * 2, h: special.r * 2 },
    recall: recallGroupRect,
    fireTabs: fireTabsGroupRect,
    rotCluster: rotGroupRect,
    scaleCluster: scaleGroupRect,
    cancel: { x: cancel.cx - cancel.r, y: cancel.cy - cancel.r, w: cancel.r * 2, h: cancel.r * 2 },
  };

  return {
    vw,
    vh,
    baseScale: s,
    safeTop,
    safeBottom,
    safeLeft,
    safeRight,
    joy,
    atk,
    dash,
    form,
    formRotRad,
    special,
    specialRotRad,
    specialLock,
    specialBadge,
    specialLockLocked,
    cancel,
    arc,
    btnRecall,
    btnAll,
    recallGroupRect,
    fireTabs,
    fireTabsGroupRect,
    rotBtns,
    rotGroupRect,
    scaleBtns,
    scaleGroupRect,
    widgetBounds,
  };
}

export interface PCComputedDock {
  scale: number;
  opacity: number;
  barRect: Rect;
  formBtns: Array<Rect & { id: FormKey }>;
  hexSlots: Array<Rect & { id: number }>;
  btnAll: Rect;
  btnRecall: Rect;
  fireTabs: Array<Rect & { id: FireMode; label: string }>;
  dashBtn: Rect;
  specialBtn: Rect;
  cancel: CircleWidget;
}

export function computeDesktopDockLayout(
  vw: number,
  vh: number,
  hexCount: number,
  isLoose: boolean,
  pcConfig: PCControlConfig,
): PCComputedDock {
  const autoS = clamp(vw / 1280, 0.72, 1.05);
  const pcS = autoS * pcConfig.dockScale;
  const rowH = 36 * pcS;
  const pad = 10 * pcS;
  const btnGap = 6 * pcS;

  const formW = 74 * pcS;
  const formsTotalW = formW * 4 + btnGap * 3;
  const dashW = 86 * pcS;
  const specialW = 122 * pcS;

  // Compact slot width cleanly scales when player brings 8..10 hexes so Dock never overflows!
  const slotW = (hexCount >= 9 ? 25 : 29) * pcS;
  const slotGap = 3 * pcS;
  const slotsTotalW = slotW * hexCount + slotGap * Math.max(0, hexCount - 1);
  const allPcW = 88 * pcS;
  const recallPcW = 94 * pcS;
  const looseGroupW = slotsTotalW + btnGap + allPcW + btnGap + recallPcW;

  const rightSkillsW = dashW + btnGap + specialW;
  const rawBarW = (isLoose
    ? formsTotalW + 12 * pcS + looseGroupW + 12 * pcS + rightSkillsW
    : formsTotalW + 16 * pcS + rightSkillsW) + pad * 2;

  const fitFactor = rawBarW > vw - 20 ? (vw - 20) / rawBarW : 1;
  const k = fitFactor;

  const fRowH = rowH * k;
  const fPad = pad * k;
  const fGap = btnGap * k;
  const fFormW = formW * k;
  const fSlotW = slotW * k;
  const fSlotGap = slotGap * k;
  const fAllW = allPcW * k;
  const fRecallW = recallPcW * k;
  const fDashW = dashW * k;
  const fSpecialW = specialW * k;
  const barW = rawBarW * k;
  const barH = fRowH + fPad * 2;
  const barX = (vw - barW) * 0.5;
  const barY = vh - barH - 12;

  let curX = barX + fPad;
  const rowY = barY + fPad;

  const formIds: FormKey[] = ['loose', 'slot1', 'slot2', 'slot3'];
  const formBtns = formIds.map((id) => {
    const r = { id, x: curX, y: rowY, w: fFormW, h: fRowH };
    curX += fFormW + fGap;
    return r;
  });
  curX += 6 * pcS * k;

  const hexSlots: Array<Rect & { id: number }> = [];
  let btnAll: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let btnRecall: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let fireTabs: Array<Rect & { id: FireMode; label: string }> = [];

  if (isLoose) {
    const slotsStartX = curX;
    for (let i = 0; i < hexCount; i++) {
      hexSlots.push({ id: i, x: curX, y: rowY, w: fSlotW, h: fRowH });
      curX += fSlotW + fSlotGap;
    }
    curX += fGap - fSlotGap;
    btnAll = { x: curX, y: rowY, w: fAllW, h: fRowH };
    curX += fAllW + fGap;
    btnRecall = { x: curX, y: rowY, w: fRecallW, h: fRowH };
    curX += fRecallW + 12 * pcS * k;

    const fTabH = 24 * pcS * k;
    const fDefs: Array<{ id: FireMode; label: string; w: number }> = [
      { id: 'xayah', label: 'Cắm & Thu', w: 86 * pcS * k },
      { id: 'seq', label: 'Lần lượt', w: 76 * pcS * k },
      { id: 'volley', label: 'Đồng loạt', w: 84 * pcS * k },
    ];
    const fTotalW = fDefs.reduce((a, b) => a + b.w, 0) + fGap * 2;
    let fx = slotsStartX + (looseGroupW * k - fTotalW) * 0.5;
    const fy = barY - fTabH - 7;
    fireTabs = fDefs.map((d) => {
      const r = { id: d.id, label: d.label, x: fx, y: fy, w: d.w, h: fTabH };
      fx += d.w + fGap;
      return r;
    });
  } else {
    curX += 4 * pcS * k;
  }

  const dashBtn: Rect = { x: curX, y: rowY, w: fDashW, h: fRowH };
  curX += fDashW + fGap;
  const specialBtn: Rect = { x: curX, y: rowY, w: fSpecialW, h: fRowH };

  const cancelR = 28 * clamp(Math.min(vw, vh) / 480, 0.85, 1.15);
  const cancel: CircleWidget = {
    cx: vw - Math.max(54, vw * 0.055),
    cy: clamp(vh * 0.34, 118, vh * 0.44),
    r: cancelR,
    opacity: 0.94,
  };

  return {
    scale: pcS * k,
    opacity: pcConfig.dockOpacity,
    barRect: { x: barX, y: barY, w: barW, h: barH },
    formBtns,
    hexSlots,
    btnAll,
    btnRecall,
    fireTabs,
    dashBtn,
    specialBtn,
    cancel,
  };
}
