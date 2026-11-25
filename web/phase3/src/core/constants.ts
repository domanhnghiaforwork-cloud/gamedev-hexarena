import type {
  AxialCoord,
  HexMaterialSpec,
  MaterialId,
  PlayerLoadout,
  ScaleTier,
} from './types';

export const SQRT3 = Math.sqrt(3);
export const FIXED_DT = 1 / 60;

// Arena & Fighter Constants (Exact parity with Phase 1 v1.16)
export const ARENA_RADIUS = 686;
export const PLAYER_RADIUS = 32;
export const BASE_HEX_RADIUS = 16.5;
export const HEX_HP_MULTIPLIER = 2.2;
export const HEX_REGEN_DELAY = 2.2;
export const HEX_REGEN_RATE = 0.04;
export const HEX_COOLDOWN = 5.0;
export const REASSEMBLE_DURATION = 0.30;
export const MORPH_DURATION = 0.25;
export const MATCH_DURATION = 600;
export const MAX_PLAYER_HP = 1000;
export const SPAWN_OFFSET_X = 340;
export const PLAYER_MOVE_SPEED = 228;

// Dash Constants
export const DASH_COOLDOWN = 3.5;
export const DASH_DURATION = 0.17;
export const DASH_SPEED = 740;

// 4-Rule Emergent Collision & Defense Physics Constants
export const ANCHOR_BONUS = 1.4;
export const LOAD_SHARE_RATIO = 0.30;
export const DEFLECT_ANGLE_RAD = (35 * Math.PI) / 180;

// Loadout Limits (GDD Chapter 2.1)
export const MIN_HEX_COUNT = 5;
export const MAX_HEX_COUNT = 10;
export const DEFAULT_HEX_COUNT = 7;

export const SCALE_TIERS: ScaleTier[] = [0.6, 1.0, 1.5];

export const AXIAL_DIRS: AxialCoord[] = [
  { q: 1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: -1, r: 1 },
];

export const MATERIALS: Record<MaterialId, HexMaterialSpec> = {
  base: { id: 'base', name: 'Base', dur: 100, hard: 100, sharp: 100, agil: 100 },
  heavy: { id: 'heavy', name: 'Nặng', dur: 130, hard: 130, sharp: 80, agil: 60 },
  sharp: { id: 'sharp', name: 'Sắc', dur: 70, hard: 70, sharp: 150, agil: 110 },
  light: { id: 'light', name: 'Nhẹ', dur: 85, hard: 85, sharp: 90, agil: 140 },
};

export const MATERIAL_LIST: MaterialId[] = ['base', 'heavy', 'sharp', 'light'];

export function createDefaultLoadout(): PlayerLoadout {
  return {
    version: 1,
    hexMaterials: ['heavy', 'base', 'base', 'base', 'light', 'sharp', 'sharp'],
    blueprints: {
      slot1: {
        id: 'slot1',
        name: 'Giáo Xuyên',
        stance: 'ranged',
        defaultScale: 0.6,
        rootHexIndex: 0,
        slots: [
          { hexIndex: 0, q: 0, r: 0 },
          { hexIndex: 1, q: 1, r: 0 },
          { hexIndex: 2, q: 2, r: 0 },
          { hexIndex: 3, q: 1, r: -1 },
          { hexIndex: 4, q: 0, r: 1 },
          { hexIndex: 5, q: 3, r: 0 },
          { hexIndex: 6, q: 4, r: 0 },
        ],
      },
      slot2: {
        id: 'slot2',
        name: 'Kiếm Bản',
        stance: 'melee',
        defaultScale: 1.0,
        rootHexIndex: 0,
        slots: [
          { hexIndex: 0, q: 0, r: 0 },
          { hexIndex: 1, q: 1, r: 0 },
          { hexIndex: 2, q: 2, r: 0 },
          { hexIndex: 3, q: 0, r: 1 },
          { hexIndex: 4, q: 1, r: -1 },
          { hexIndex: 5, q: 2, r: -1 },
          { hexIndex: 6, q: 3, r: 0 },
        ],
      },
      slot3: {
        id: 'slot3',
        name: 'Khiên Vòm',
        stance: 'defense',
        defaultScale: 1.5,
        rootHexIndex: 0,
        slots: [
          { hexIndex: 0, q: 0, r: 0 },
          { hexIndex: 1, q: -1, r: 0 },
          { hexIndex: 2, q: 0, r: -1 },
          { hexIndex: 3, q: -1, r: 1 },
          { hexIndex: 4, q: 1, r: 0 },
          { hexIndex: 5, q: 0, r: -2 },
          { hexIndex: 6, q: -2, r: 2 },
        ],
      },
    },
  };
}

/** Ready-to-use creative presets demonstrating 5–10 hex emergent freedom */
export function createSampleTemplates(): Array<{ id: string; label: string; loadout: PlayerLoadout }> {
  return [
    {
      id: 'standard7',
      label: 'Chuẩn 7 mảnh',
      loadout: createDefaultLoadout(),
    },
    {
      id: 'twinSpear8',
      label: 'Song Kích 8 mảnh',
      loadout: {
        version: 1,
        hexMaterials: ['heavy', 'base', 'base', 'light', 'light', 'sharp', 'sharp', 'sharp'],
        blueprints: {
          slot1: {
            id: 'slot1',
            name: 'Đinh Ba 2 Mũi',
            stance: 'ranged',
            defaultScale: 0.6,
            rootHexIndex: 0,
            slots: [
              { hexIndex: 0, q: 0, r: 0 },
              { hexIndex: 1, q: 1, r: 0 },
              { hexIndex: 2, q: 2, r: -1 },
              { hexIndex: 3, q: 1, r: 1 },
              { hexIndex: 4, q: 2, r: 0 },
              { hexIndex: 5, q: 3, r: -1 },
              { hexIndex: 6, q: 2, r: 1 },
              { hexIndex: 7, q: 3, r: 0 },
            ],
          },
          slot2: {
            id: 'slot2',
            name: 'Lưỡi Hái',
            stance: 'melee',
            defaultScale: 1.0,
            rootHexIndex: 0,
            slots: [
              { hexIndex: 0, q: 0, r: 0 },
              { hexIndex: 1, q: 1, r: 0 },
              { hexIndex: 2, q: 2, r: 0 },
              { hexIndex: 3, q: 3, r: -1 },
              { hexIndex: 4, q: 3, r: -2 },
              { hexIndex: 5, q: 2, r: -2 },
              { hexIndex: 6, q: 1, r: -1 },
              { hexIndex: 7, q: 3, r: 0 },
            ],
          },
          slot3: {
            id: 'slot3',
            name: 'Khiên Vát',
            stance: 'defense',
            defaultScale: 1.5,
            rootHexIndex: 0,
            slots: [
              { hexIndex: 0, q: 0, r: 0 },
              { hexIndex: 1, q: 1, r: 0 },
              { hexIndex: 2, q: 0, r: -1 },
              { hexIndex: 3, q: -1, r: 1 },
              { hexIndex: 4, q: 1, r: -1 },
              { hexIndex: 5, q: 0, r: 1 },
              { hexIndex: 6, q: 0, r: -2 },
              { hexIndex: 7, q: -2, r: 2 },
            ],
          },
        },
      },
    },
    {
      id: 'fortress9',
      label: 'Tổ Ong 9 mảnh',
      loadout: {
        version: 1,
        hexMaterials: ['heavy', 'heavy', 'heavy', 'base', 'base', 'base', 'light', 'sharp', 'sharp'],
        blueprints: {
          slot1: {
            id: 'slot1',
            name: 'Chùy Xung Kích',
            stance: 'ranged',
            defaultScale: 0.6,
            rootHexIndex: 0,
            slots: [
              { hexIndex: 0, q: 0, r: 0 },
              { hexIndex: 1, q: 1, r: 0 },
              { hexIndex: 2, q: 2, r: 0 },
              { hexIndex: 3, q: 2, r: -1 },
              { hexIndex: 4, q: 1, r: 1 },
              { hexIndex: 5, q: 3, r: -1 },
              { hexIndex: 6, q: 2, r: 1 },
              { hexIndex: 7, q: 3, r: 0 },
              { hexIndex: 8, q: 4, r: 0 },
            ],
          },
          slot2: {
            id: 'slot2',
            name: 'Đại Đao',
            stance: 'melee',
            defaultScale: 1.0,
            rootHexIndex: 0,
            slots: [
              { hexIndex: 0, q: 0, r: 0 },
              { hexIndex: 1, q: 1, r: 0 },
              { hexIndex: 2, q: 2, r: 0 },
              { hexIndex: 3, q: 1, r: -1 },
              { hexIndex: 4, q: 2, r: -1 },
              { hexIndex: 5, q: 0, r: 1 },
              { hexIndex: 6, q: 1, r: 1 },
              { hexIndex: 7, q: 3, r: -1 },
              { hexIndex: 8, q: 3, r: 0 },
            ],
          },
          slot3: {
            id: 'slot3',
            name: 'Khiên Tổ Ong',
            stance: 'defense',
            defaultScale: 1.5,
            rootHexIndex: 0,
            slots: [
              { hexIndex: 0, q: 0, r: 0 },
              { hexIndex: 1, q: 1, r: 0 },
              { hexIndex: 2, q: -1, r: 0 },
              { hexIndex: 3, q: 0, r: -1 },
              { hexIndex: 4, q: 0, r: 1 },
              { hexIndex: 5, q: 1, r: -1 },
              { hexIndex: 6, q: -1, r: 1 },
              { hexIndex: 7, q: 0, r: -2 },
              { hexIndex: 8, q: -2, r: 2 },
            ],
          },
        },
      },
    },
    {
      id: 'swarm10',
      label: 'Cơ Động 10 mảnh',
      loadout: {
        version: 1,
        hexMaterials: ['base', 'light', 'light', 'light', 'light', 'sharp', 'sharp', 'sharp', 'base', 'heavy'],
        blueprints: {
          slot1: {
            id: 'slot1',
            name: 'Trường Thương',
            stance: 'ranged',
            defaultScale: 0.6,
            rootHexIndex: 0,
            slots: [
              { hexIndex: 0, q: 0, r: 0 },
              { hexIndex: 1, q: 1, r: 0 },
              { hexIndex: 2, q: 2, r: 0 },
              { hexIndex: 3, q: 3, r: 0 },
              { hexIndex: 4, q: 1, r: -1 },
              { hexIndex: 5, q: 4, r: 0 },
              { hexIndex: 6, q: 5, r: 0 },
              { hexIndex: 7, q: 4, r: -1 },
              { hexIndex: 8, q: 0, r: 1 },
              { hexIndex: 9, q: -1, r: 0 },
            ],
          },
          slot2: {
            id: 'slot2',
            name: 'Quạt Lưỡi',
            stance: 'melee',
            defaultScale: 1.0,
            rootHexIndex: 0,
            slots: [
              { hexIndex: 0, q: 0, r: 0 },
              { hexIndex: 1, q: 1, r: 0 },
              { hexIndex: 2, q: 1, r: -1 },
              { hexIndex: 3, q: 0, r: 1 },
              { hexIndex: 4, q: 2, r: 0 },
              { hexIndex: 5, q: 2, r: -1 },
              { hexIndex: 6, q: 2, r: -2 },
              { hexIndex: 7, q: 1, r: 1 },
              { hexIndex: 8, q: 3, r: -1 },
              { hexIndex: 9, q: 3, r: 0 },
            ],
          },
          slot3: {
            id: 'slot3',
            name: 'Vòng Cung Rộng',
            stance: 'defense',
            defaultScale: 1.5,
            rootHexIndex: 9,
            slots: [
              { hexIndex: 9, q: 0, r: 0 },
              { hexIndex: 0, q: 1, r: 0 },
              { hexIndex: 1, q: 0, r: -1 },
              { hexIndex: 2, q: -1, r: 1 },
              { hexIndex: 3, q: 0, r: -2 },
              { hexIndex: 4, q: -2, r: 2 },
              { hexIndex: 5, q: -1, r: 0 },
              { hexIndex: 6, q: 1, r: -1 },
              { hexIndex: 7, q: 0, r: 1 },
              { hexIndex: 8, q: 1, r: -2 },
            ],
          },
        },
      },
    },
  ];
}
