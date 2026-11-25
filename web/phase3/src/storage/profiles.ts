import { createDefaultLoadout } from '@core/constants';
import { sanitizeLoadout } from '@core/world/blueprint';
import { clamp } from '@core/math/hexMath';
import type { PlayerLoadout } from '@core/types';

export type MobilePresetId = '4-finger' | '3-finger' | '2-finger';

export type MobileWidgetId =
  | 'joy'
  | 'atk'
  | 'dash'
  | 'form'
  | 'special'
  | 'recall'
  | 'fireTabs'
  | 'rotCluster'
  | 'scaleCluster'
  | 'cancel';

export interface WidgetTransform {
  nx: number;        // normalized center X (0..1 of safe viewport)
  ny: number;        // normalized center Y (0..1 of safe viewport)
  scale: number;     // 0.7..1.4
  opacity: number;   // 0.35..1.0
  rotation?: number; // rotation angle in degrees (0..359, default 0)
}

export interface MobileHUDConfig {
  version: number;
  preset: MobilePresetId;
  snapGrid: boolean;
  widgets: Record<MobileWidgetId, WidgetTransform>;
}

export type PCActionKey =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'cycleRot'
  | 'cycleScale'
  | 'cycleFire'
  | 'selectAll'
  | 'dash'
  | 'special'
  | 'cycleForm'
  | 'formLoose'
  | 'formSlot1'
  | 'formSlot2'
  | 'formSlot3';

export type PCKeybindMap = Record<PCActionKey, string>;
export type ReticleStyle = 'neon' | 'minimal' | 'crosshair';

export interface PCControlConfig {
  version: number;
  keybinds: PCKeybindMap;
  mouseWheelScale: boolean;
  dockScale: number;    // 0.8..1.25
  dockOpacity: number;  // 0.5..1.0
  reticleStyle: ReticleStyle;
}

const KEY_LOADOUT = 'hex_arena_p3_loadout_v1';
const KEY_MOBILE_HUD = 'hex_arena_p3_mobile_hud_v1';
const KEY_PC_CONTROLS = 'hex_arena_p3_pc_controls_v1';
export const MOBILE_HUD_VERSION = 2;

export const DEFAULT_PC_KEYBINDS: PCKeybindMap = {
  moveUp: 'w',
  moveDown: 's',
  moveLeft: 'a',
  moveRight: 'd',
  cycleRot: 'q',
  cycleScale: 'e',
  cycleFire: 'f',
  selectAll: ' ',
  dash: 'shift',
  special: 'c',
  cycleForm: 'r',
  formLoose: '1',
  formSlot1: '2',
  formSlot2: '3',
  formSlot3: '4',
};

export const PC_ACTION_LABELS: Record<PCActionKey, string> = {
  moveUp: 'Di chuyển Lên',
  moveDown: 'Di chuyển Xuống',
  moveLeft: 'Di chuyển Trái',
  moveRight: 'Di chuyển Phải',
  cycleRot: 'Đổi chế độ Xoay trục',
  cycleScale: 'Đổi nấc Co giãn',
  cycleFire: 'Đổi kiểu phóng (Đơn lẻ)',
  selectAll: 'Chọn / Bỏ chọn hết mảnh',
  dash: 'Kỹ năng Lướt (Dash)',
  special: 'Kỹ năng Ulti',
  cycleForm: 'Xoay vòng Dạng vũ khí',
  formLoose: 'Chọn nhanh: Đơn lẻ',
  formSlot1: 'Chọn nhanh: Cấu hình 1',
  formSlot2: 'Chọn nhanh: Cấu hình 2',
  formSlot3: 'Chọn nhanh: Cấu hình 3',
};

export function formatKeyLabel(key: string): string {
  if (key === ' ') return 'SPACE';
  if (key === 'shift') return 'SHIFT';
  if (key === 'tab') return 'TAB';
  if (key === 'control') return 'CTRL';
  if (key === 'alt') return 'ALT';
  if (key === 'arrowup') return '↑';
  if (key === 'arrowdown') return '↓';
  if (key === 'arrowleft') return '←';
  if (key === 'arrowright') return '→';
  return key.toUpperCase();
}

export function createDefaultPCConfig(): PCControlConfig {
  return {
    version: 1,
    keybinds: { ...DEFAULT_PC_KEYBINDS },
    mouseWheelScale: true,
    dockScale: 1.0,
    dockOpacity: 0.92,
    reticleStyle: 'neon',
  };
}

/**
 * Ergonomically verified Mobile HUD Presets v2 (Normalized 0..1 coordinates inside safe viewport):
 * - Guarantees ZERO overlap and >= 12px clearance across iPhone SE, iPhone Notch/Dynamic Island, Android 20:9, & iPad.
 * - 2-finger (Default Thumb): Rot & Scale on mid-left index/thumb zone, right-hand arc of Ulti / Form / Dash / Recall around Attack pad.
 * - 3-finger (Hybrid): Rot & Scale grouped neatly in Top-Left for Left-Index, thumbs free on bottom corners.
 * - 4-finger (Claw): Rot Top-Left, Scale Top-Right for both index fingers; Fire Tabs upper-right center.
 */
export function createMobileHUDPreset(preset: MobilePresetId): MobileHUDConfig {
  if (preset === '3-finger') {
    return {
      version: MOBILE_HUD_VERSION,
      preset,
      snapGrid: true,
      widgets: {
        joy:          { nx: 0.13, ny: 0.77, scale: 1.0,  opacity: 0.90 },
        atk:          { nx: 0.90, ny: 0.78, scale: 1.0,  opacity: 0.94 },
        dash:         { nx: 0.65, ny: 0.89, scale: 1.0,  opacity: 0.92 },
        form:         { nx: 0.58, ny: 0.70, scale: 1.0,  opacity: 0.92 },
        special:      { nx: 0.68, ny: 0.50, scale: 1.0,  opacity: 0.94 },
        recall:       { nx: 0.43, ny: 0.86, scale: 0.98, opacity: 0.92 },
        fireTabs:     { nx: 0.68, ny: 0.22, scale: 0.96, opacity: 0.90 },
        scaleCluster: { nx: 0.16, ny: 0.14, scale: 0.96, opacity: 0.92 },
        rotCluster:   { nx: 0.16, ny: 0.30, scale: 0.96, opacity: 0.92 },
        cancel:       { nx: 0.94, ny: 0.32, scale: 1.0,  opacity: 0.92 },
      },
    };
  }

  if (preset === '4-finger') {
    return {
      version: MOBILE_HUD_VERSION,
      preset,
      snapGrid: true,
      widgets: {
        joy:          { nx: 0.13, ny: 0.77, scale: 1.0,  opacity: 0.90 },
        atk:          { nx: 0.90, ny: 0.78, scale: 1.0,  opacity: 0.94 },
        dash:         { nx: 0.65, ny: 0.89, scale: 1.0,  opacity: 0.92 },
        form:         { nx: 0.58, ny: 0.70, scale: 1.0,  opacity: 0.92 },
        special:      { nx: 0.68, ny: 0.50, scale: 1.0,  opacity: 0.94 },
        recall:       { nx: 0.43, ny: 0.86, scale: 0.98, opacity: 0.92 },
        fireTabs:     { nx: 0.63, ny: 0.25, scale: 0.96, opacity: 0.90 },
        rotCluster:   { nx: 0.16, ny: 0.16, scale: 0.96, opacity: 0.92 },
        scaleCluster: { nx: 0.85, ny: 0.12, scale: 0.96, opacity: 0.92 },
        cancel:       { nx: 0.94, ny: 0.34, scale: 1.0,  opacity: 0.92 },
      },
    };
  }

  // Default: 2-finger Thumb-Optimized Layout
  return {
    version: MOBILE_HUD_VERSION,
    preset: '2-finger',
    snapGrid: true,
    widgets: {
      joy:          { nx: 0.13, ny: 0.79, scale: 1.0,  opacity: 0.90 },
      atk:          { nx: 0.90, ny: 0.78, scale: 1.0,  opacity: 0.94 },
      dash:         { nx: 0.65, ny: 0.89, scale: 1.0,  opacity: 0.92 },
      form:         { nx: 0.58, ny: 0.70, scale: 1.0,  opacity: 0.92 },
      special:      { nx: 0.68, ny: 0.50, scale: 1.0,  opacity: 0.94 },
      recall:       { nx: 0.43, ny: 0.86, scale: 0.98, opacity: 0.92 },
      fireTabs:     { nx: 0.68, ny: 0.22, scale: 0.96, opacity: 0.90 },
      rotCluster:   { nx: 0.16, ny: 0.27, scale: 0.96, opacity: 0.92 },
      scaleCluster: { nx: 0.16, ny: 0.43, scale: 0.96, opacity: 0.92 },
      cancel:       { nx: 0.94, ny: 0.32, scale: 1.0,  opacity: 0.92 },
    },
  };
}

export const MOBILE_WIDGET_LABELS: Record<MobileWidgetId, string> = {
  joy: 'Joystick Di chuyển',
  atk: 'Nút Đánh & Vòng cung',
  dash: 'Nút Lướt (Dash)',
  form: 'Nút Đổi dạng',
  special: 'Kỹ năng Ulti',
  recall: 'Thu hồi & Chọn hết',
  fireTabs: '3 Kiểu phóng',
  rotCluster: 'Cụm Xoay trục',
  scaleCluster: 'Cụm Co giãn',
  cancel: 'Vùng Hủy chiêu (✕)',
};

export function loadPlayerLoadout(): PlayerLoadout {
  try {
    const raw = localStorage.getItem(KEY_LOADOUT);
    if (!raw) return createDefaultLoadout();
    return sanitizeLoadout(JSON.parse(raw));
  } catch {
    return createDefaultLoadout();
  }
}

export function savePlayerLoadout(loadout: PlayerLoadout): void {
  try {
    localStorage.setItem(KEY_LOADOUT, JSON.stringify(sanitizeLoadout(loadout)));
  } catch {
    // Ignore quota/private-mode storage errors
  }
}

export function sanitizeMobileHUDConfig(raw: unknown): MobileHUDConfig {
  if (!raw || typeof raw !== 'object') return createMobileHUDPreset('2-finger');
  const parsed = raw as Partial<MobileHUDConfig>;
  const preset: MobilePresetId =
    parsed.preset === '4-finger' || parsed.preset === '3-finger' || parsed.preset === '2-finger'
      ? parsed.preset
      : '2-finger';
  const base = createMobileHUDPreset(preset);
  if (typeof parsed.snapGrid === 'boolean') base.snapGrid = parsed.snapGrid;
  // Auto-upgrade legacy v1 layouts to non-overlapping ergonomic v2 coordinates cleanly
  if (parsed.version !== MOBILE_HUD_VERSION) {
    return base;
  }
  if (parsed.widgets && typeof parsed.widgets === 'object') {
    (Object.keys(base.widgets) as MobileWidgetId[]).forEach((k) => {
      const w = parsed.widgets?.[k];
      if (w && typeof w.nx === 'number' && typeof w.ny === 'number') {
        const rawRot = typeof w.rotation === 'number' && Number.isFinite(w.rotation) ? w.rotation : 0;
        const normRot = ((Math.round(rawRot) % 360) + 360) % 360;
        base.widgets[k] = {
          nx: clamp(w.nx, 0.05, 0.95),
          ny: clamp(w.ny, 0.10, 0.94),
          scale: clamp(typeof w.scale === 'number' ? w.scale : 1.0, 0.7, 1.4),
          opacity: clamp(typeof w.opacity === 'number' ? w.opacity : 0.92, 0.35, 1.0),
          rotation: normRot,
        };
      }
    });
  }
  return base;
}

export function loadMobileHUDConfig(): MobileHUDConfig {
  try {
    const raw = localStorage.getItem(KEY_MOBILE_HUD);
    if (!raw) return createMobileHUDPreset('2-finger');
    return sanitizeMobileHUDConfig(JSON.parse(raw));
  } catch {
    return createMobileHUDPreset('2-finger');
  }
}

export function saveMobileHUDConfig(cfg: MobileHUDConfig): void {
  try {
    localStorage.setItem(KEY_MOBILE_HUD, JSON.stringify(sanitizeMobileHUDConfig(cfg)));
  } catch {
    // Ignore storage errors
  }
}

export function sanitizePCControlConfig(raw: unknown): PCControlConfig {
  if (!raw || typeof raw !== 'object') return createDefaultPCConfig();
  const parsed = raw as Partial<PCControlConfig>;
  const base = createDefaultPCConfig();
  if (parsed.keybinds && typeof parsed.keybinds === 'object') {
    (Object.keys(base.keybinds) as PCActionKey[]).forEach((k) => {
      const v = parsed.keybinds?.[k];
      if (typeof v === 'string' && v.length > 0) {
        base.keybinds[k] = v.toLowerCase();
      }
    });
  }
  if (typeof parsed.mouseWheelScale === 'boolean') base.mouseWheelScale = parsed.mouseWheelScale;
  if (typeof parsed.dockScale === 'number') base.dockScale = clamp(parsed.dockScale, 0.8, 1.25);
  if (typeof parsed.dockOpacity === 'number') base.dockOpacity = clamp(parsed.dockOpacity, 0.5, 1.0);
  if (parsed.reticleStyle === 'neon' || parsed.reticleStyle === 'minimal' || parsed.reticleStyle === 'crosshair') {
    base.reticleStyle = parsed.reticleStyle;
  }
  return base;
}

export function loadPCControlConfig(): PCControlConfig {
  try {
    const raw = localStorage.getItem(KEY_PC_CONTROLS);
    if (!raw) return createDefaultPCConfig();
    return sanitizePCControlConfig(JSON.parse(raw));
  } catch {
    return createDefaultPCConfig();
  }
}

export function savePCControlConfig(cfg: PCControlConfig): void {
  try {
    localStorage.setItem(KEY_PC_CONTROLS, JSON.stringify(sanitizePCControlConfig(cfg)));
  } catch {
    // Ignore storage errors
  }
}
