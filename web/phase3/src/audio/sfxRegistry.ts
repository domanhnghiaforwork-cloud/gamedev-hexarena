import type { SfxKind } from '@core/types';
import type { SynthToneStep } from './synthEngine';

export interface SfxEntry {
  category: 'combat' | 'skill' | 'ui';
  tones: SynthToneStep[];
  /** Optional external audio asset path under /assets/audio/... */
  assetUrl?: string;
}

export const SFX_CATALOG: Record<SfxKind, SfxEntry> = {
  launch: {
    category: 'combat',
    tones: [{ freqStart: 340, freqEnd: 680, dur: 0.08, type: 'triangle', vol: 0.11 }],
  },
  clash: {
    category: 'combat',
    tones: [{ freqStart: 260, freqEnd: 120, dur: 0.09, type: 'sawtooth', vol: 0.13 }],
  },
  shatter: {
    category: 'combat',
    tones: [
      { freqStart: 540, freqEnd: 90, dur: 0.22, type: 'sawtooth', vol: 0.17 },
      { freqStart: 880, freqEnd: 220, dur: 0.14, type: 'square', vol: 0.09 },
    ],
  },
  snap: {
    category: 'skill',
    tones: [{ freqStart: 220, freqEnd: 520, dur: 0.07, type: 'sine', vol: 0.10 }],
  },
  recall: {
    category: 'skill',
    tones: [{ freqStart: 280, freqEnd: 740, dur: 0.16, type: 'sine', vol: 0.12 }],
  },
  bounce: {
    category: 'combat',
    tones: [{ freqStart: 460, freqEnd: 260, dur: 0.08, type: 'triangle', vol: 0.10 }],
  },
  pierce: {
    category: 'combat',
    tones: [
      { freqStart: 720, freqEnd: 220, dur: 0.15, type: 'sawtooth', vol: 0.15 },
      { freqStart: 1040, freqEnd: 440, dur: 0.10, type: 'triangle', vol: 0.10 },
    ],
  },
  dash: {
    category: 'skill',
    tones: [{ freqStart: 220, freqEnd: 640, dur: 0.11, type: 'sine', vol: 0.12 }],
  },
  special: {
    category: 'skill',
    tones: [
      { freqStart: 320, freqEnd: 880, dur: 0.22, type: 'triangle', vol: 0.16 },
      { freqStart: 480, freqEnd: 960, dur: 0.18, type: 'sine', vol: 0.10 },
    ],
  },
  pulse: {
    category: 'skill',
    tones: [
      { freqStart: 180, freqEnd: 52, dur: 0.28, type: 'sawtooth', vol: 0.18 },
      { freqStart: 520, freqEnd: 140, dur: 0.22, type: 'triangle', vol: 0.12 },
    ],
  },
  cancel: {
    category: 'ui',
    tones: [{ freqStart: 240, freqEnd: 150, dur: 0.07, type: 'sine', vol: 0.08 }],
  },
  uiClick: {
    category: 'ui',
    tones: [{ freqStart: 520, freqEnd: 640, dur: 0.04, type: 'sine', vol: 0.06 }],
  },
};
