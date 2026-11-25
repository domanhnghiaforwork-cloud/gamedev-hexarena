import type { SfxKind } from '@core/types';
import { SFX_CATALOG } from './sfxRegistry';
import { SynthEngine } from './synthEngine';

export class AudioManager {
  private synth = new SynthEngine();
  private bufferCache = new Map<string, AudioBuffer>();

  public enabled = true;
  public masterVolume = 1.0;
  public sfxVolume = 1.0;
  public bgmVolume = 0.5;

  public init(): void {
    this.synth.init();
  }

  public async preloadSfx(kind: SfxKind): Promise<void> {
    const entry = SFX_CATALOG[kind];
    if (!entry?.assetUrl || this.bufferCache.has(entry.assetUrl)) return;
    const ctx = this.synth.init();
    if (!ctx || typeof fetch === 'undefined') return;
    try {
      const res = await fetch(entry.assetUrl);
      if (!res.ok) return;
      const arr = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arr);
      this.bufferCache.set(entry.assetUrl, decoded);
    } catch {
      // Fallback to Web Audio synth automatically
    }
  }

  private playBuffer(buf: AudioBuffer, vol: number): void {
    const ctx = this.synth.init();
    if (!ctx || vol <= 0.0005) return;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  public play(kind: SfxKind): void {
    if (!this.enabled) return;
    const vol = this.masterVolume * this.sfxVolume;
    if (vol <= 0.0005) return;

    const entry = SFX_CATALOG[kind];
    if (!entry) return;

    if (entry.assetUrl) {
      const cached = this.bufferCache.get(entry.assetUrl);
      if (cached) {
        this.playBuffer(cached, vol);
        return;
      }
    }

    this.synth.playRecipe(entry.tones, vol);
  }

  public playCountdown(step: number): void {
    if (!this.enabled) return;
    const vol = this.masterVolume * this.sfxVolume;
    if (vol <= 0.0005) return;

    if (step > 0) {
      const baseFreq = step === 1 ? 660 : step === 2 ? 550 : 440;
      this.synth.playTone(baseFreq, baseFreq * 0.96, 0.14, 'triangle', 0.14 * vol);
    } else {
      this.synth.playTone(587.3, 880, 0.24, 'triangle', 0.16 * vol);
      this.synth.playTone(880, 1174.6, 0.28, 'sine', 0.12 * vol);
    }
  }
}

export const soundFX = new AudioManager();
