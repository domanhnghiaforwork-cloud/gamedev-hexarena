export type NeonThemeId = 'cyan' | 'ice' | 'emerald' | 'violet' | 'gold';
export type ShatterStyleId = 'shards' | 'sparks' | 'rings' | 'nova';
export type DashTrailId = 'ghost' | 'prism' | 'bolt' | 'hex-wake';

export interface PlayerCosmetics {
  neonTheme: NeonThemeId;
  shatterStyle: ShatterStyleId;
  dashTrail: DashTrailId;
}

export interface NeonThemeSpec {
  id: NeonThemeId;
  name: string;
  main: string;
  light: string;
  fillRgba: string;
  bodyFillRgba: string;
  glowRgba: string;
}

export interface CosmeticOptionMeta<T extends string> {
  id: T;
  name: string;
  desc: string;
}

export const NEON_THEMES: Record<NeonThemeId, NeonThemeSpec> = {
  cyan: {
    id: 'cyan',
    name: 'Xanh Lam Neon',
    main: '#38bdf8',
    light: '#bae6fd',
    fillRgba: 'rgba(14, 116, 144, 0.34)',
    bodyFillRgba: 'rgba(56, 189, 248, 0.11)',
    glowRgba: 'rgba(56, 189, 248, 0.48)',
  },
  ice: {
    id: 'ice',
    name: 'Băng Bạch Kim',
    main: '#e2e8f0',
    light: '#ffffff',
    fillRgba: 'rgba(148, 163, 184, 0.32)',
    bodyFillRgba: 'rgba(226, 232, 240, 0.12)',
    glowRgba: 'rgba(226, 232, 240, 0.45)',
  },
  emerald: {
    id: 'emerald',
    name: 'Lục Bảo',
    main: '#34d399',
    light: '#a7f3d0',
    fillRgba: 'rgba(6, 95, 70, 0.36)',
    bodyFillRgba: 'rgba(52, 211, 153, 0.11)',
    glowRgba: 'rgba(52, 211, 153, 0.48)',
  },
  violet: {
    id: 'violet',
    name: 'Tử Tinh',
    main: '#c084fc',
    light: '#e9d5ff',
    fillRgba: 'rgba(107, 33, 168, 0.36)',
    bodyFillRgba: 'rgba(192, 132, 252, 0.11)',
    glowRgba: 'rgba(192, 132, 252, 0.48)',
  },
  gold: {
    id: 'gold',
    name: 'Hoàng Kim',
    main: '#fbbf24',
    light: '#fef08a',
    fillRgba: 'rgba(180, 83, 9, 0.34)',
    bodyFillRgba: 'rgba(251, 191, 36, 0.11)',
    glowRgba: 'rgba(251, 191, 36, 0.48)',
  },
};

export const NEON_THEME_LIST: NeonThemeSpec[] = [
  NEON_THEMES.cyan,
  NEON_THEMES.ice,
  NEON_THEMES.emerald,
  NEON_THEMES.violet,
  NEON_THEMES.gold,
];

export const SHATTER_STYLES: CosmeticOptionMeta<ShatterStyleId>[] = [
  { id: 'shards', name: 'Mảnh Tinh Thể', desc: 'Mảnh tam giác xoay văng kèm sóng xung kích.' },
  { id: 'sparks', name: 'Tia Điện Cao Thế', desc: 'Chùm tia lửa sắc nhọn phóng ra theo hướng va chạm.' },
  { id: 'rings', name: 'Vòng Xung Lượng Tử', desc: '3 lớp sóng xung đồng tâm lan tỏa dứt khoát.' },
  { id: 'nova', name: 'Bùng Nổ Sao Neon', desc: 'Hạt sao 4 cánh rực sáng cùng vòng sáng kép.' },
];

export const DASH_TRAILS: CosmeticOptionMeta<DashTrailId>[] = [
  { id: 'ghost', name: 'Ảnh Mờ Cổ Điển', desc: 'Vòng ảnh dư âm mờ dần theo hướng lướt.' },
  { id: 'prism', name: 'Quang Phổ Lăng Kính', desc: 'Dải vòng chuyển sắc Lam → Tím → Vàng rực rỡ.' },
  { id: 'bolt', name: 'Tia Sét Chớp', desc: 'Tia sét điện nối giữa các điểm dấu chân lướt.' },
  { id: 'hex-wake', name: 'Dấu Ấn Lục Giác', desc: 'Để lại chuỗi khung lục giác xoay dọc đường lướt.' },
];

export const DEFAULT_COSMETICS: PlayerCosmetics = {
  neonTheme: 'cyan',
  shatterStyle: 'shards',
  dashTrail: 'ghost',
};

export function getNeonTheme(id?: NeonThemeId): NeonThemeSpec {
  if (id && id in NEON_THEMES) return NEON_THEMES[id];
  return NEON_THEMES.cyan;
}

export function sanitizeCosmetics(raw: unknown): PlayerCosmetics {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_COSMETICS };
  const p = raw as Partial<PlayerCosmetics>;
  const neonTheme: NeonThemeId =
    p.neonTheme === 'cyan' ||
    p.neonTheme === 'ice' ||
    p.neonTheme === 'emerald' ||
    p.neonTheme === 'violet' ||
    p.neonTheme === 'gold'
      ? p.neonTheme
      : DEFAULT_COSMETICS.neonTheme;
  const shatterStyle: ShatterStyleId =
    p.shatterStyle === 'shards' ||
    p.shatterStyle === 'sparks' ||
    p.shatterStyle === 'rings' ||
    p.shatterStyle === 'nova'
      ? p.shatterStyle
      : DEFAULT_COSMETICS.shatterStyle;
  const dashTrail: DashTrailId =
    p.dashTrail === 'ghost' ||
    p.dashTrail === 'prism' ||
    p.dashTrail === 'bolt' ||
    p.dashTrail === 'hex-wake'
      ? p.dashTrail
      : DEFAULT_COSMETICS.dashTrail;
  return { neonTheme, shatterStyle, dashTrail };
}
