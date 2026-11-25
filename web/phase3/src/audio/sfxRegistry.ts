import type { SfxKind } from '@core/types';
import type { SynthToneStep } from './synthEngine';

export interface SfxEntry {
  category: 'combat' | 'skill' | 'ui';
  tones: SynthToneStep[];
  /** Audio asset path under /assets/audio/sfx/... (with automatic synth fallback) */
  assetUrl?: string;
}

export const SFX_CATALOG: Record<SfxKind, SfxEntry> = {
  launch: {
    category: 'combat',
    assetUrl: '/assets/audio/sfx/launch.wav',
    tones: [{ freqStart: 340, freqEnd: 680, dur: 0.08, type: 'triangle', vol: 0.11 }],
  },
  meleeWhoosh: {
    category: 'combat',
    assetUrl: '/assets/audio/sfx/melee_whoosh.wav',
    tones: [
      { freqStart: 420, freqEnd: 170, dur: 0.12, type: 'triangle', vol: 0.12 },
      { freqStart: 780, freqEnd: 310, dur: 0.09, type: 'sine', vol: 0.06 },
    ],
  },
  clash: {
    category: 'combat',
    assetUrl: '/assets/audio/sfx/clash_base.wav',
    tones: [{ freqStart: 260, freqEnd: 120, dur: 0.09, type: 'sawtooth', vol: 0.13 }],
  },
  clashHeavy: {
    category: 'combat',
    assetUrl: '/assets/audio/sfx/clash_heavy.wav',
    tones: [
      { freqStart: 165, freqEnd: 72, dur: 0.13, type: 'sawtooth', vol: 0.16 },
      { freqStart: 310, freqEnd: 140, dur: 0.09, type: 'triangle', vol: 0.10 },
    ],
  },
  clashSharp: {
    category: 'combat',
    assetUrl: '/assets/audio/sfx/clash_sharp.wav',
    tones: [
      { freqStart: 920, freqEnd: 540, dur: 0.10, type: 'triangle', vol: 0.12 },
      { freqStart: 1480, freqEnd: 880, dur: 0.08, type: 'sine', vol: 0.08 },
    ],
  },
  shatter: {
    category: 'combat',
    assetUrl: '/assets/audio/sfx/shatter.wav',
    tones: [
      { freqStart: 540, freqEnd: 90, dur: 0.22, type: 'sawtooth', vol: 0.17 },
      { freqStart: 880, freqEnd: 220, dur: 0.14, type: 'square', vol: 0.09 },
    ],
  },
  snap: {
    category: 'skill',
    assetUrl: '/assets/audio/sfx/snap.wav',
    tones: [{ freqStart: 220, freqEnd: 520, dur: 0.07, type: 'sine', vol: 0.10 }],
  },
  recall: {
    category: 'skill',
    assetUrl: '/assets/audio/sfx/recall.wav',
    tones: [{ freqStart: 280, freqEnd: 740, dur: 0.16, type: 'sine', vol: 0.12 }],
  },
  bounce: {
    category: 'combat',
    assetUrl: '/assets/audio/sfx/bounce.wav',
    tones: [{ freqStart: 460, freqEnd: 260, dur: 0.08, type: 'triangle', vol: 0.10 }],
  },
  pierce: {
    category: 'combat',
    assetUrl: '/assets/audio/sfx/pierce.wav',
    tones: [
      { freqStart: 720, freqEnd: 220, dur: 0.15, type: 'sawtooth', vol: 0.15 },
      { freqStart: 1040, freqEnd: 440, dur: 0.10, type: 'triangle', vol: 0.10 },
    ],
  },
  dash: {
    category: 'skill',
    assetUrl: '/assets/audio/sfx/dash.wav',
    tones: [{ freqStart: 220, freqEnd: 640, dur: 0.11, type: 'sine', vol: 0.12 }],
  },
  special: {
    category: 'skill',
    assetUrl: '/assets/audio/sfx/special.wav',
    tones: [
      { freqStart: 320, freqEnd: 880, dur: 0.22, type: 'triangle', vol: 0.16 },
      { freqStart: 480, freqEnd: 960, dur: 0.18, type: 'sine', vol: 0.10 },
    ],
  },
  gravityField: {
    category: 'skill',
    assetUrl: '/assets/audio/sfx/gravity_field.wav',
    tones: [
      { freqStart: 120, freqEnd: 74, dur: 0.28, type: 'sine', vol: 0.16 },
      { freqStart: 360, freqEnd: 620, dur: 0.24, type: 'triangle', vol: 0.09 },
    ],
  },
  pulse: {
    category: 'skill',
    assetUrl: '/assets/audio/sfx/pulse.wav',
    tones: [
      { freqStart: 180, freqEnd: 52, dur: 0.28, type: 'sawtooth', vol: 0.18 },
      { freqStart: 520, freqEnd: 140, dur: 0.22, type: 'triangle', vol: 0.12 },
    ],
  },
  cancel: {
    category: 'ui',
    assetUrl: '/assets/audio/sfx/cancel.wav',
    tones: [{ freqStart: 240, freqEnd: 150, dur: 0.07, type: 'sine', vol: 0.08 }],
  },
  uiClick: {
    category: 'ui',
    assetUrl: '/assets/audio/sfx/ui_click.wav',
    tones: [{ freqStart: 520, freqEnd: 640, dur: 0.04, type: 'sine', vol: 0.06 }],
  },
};
