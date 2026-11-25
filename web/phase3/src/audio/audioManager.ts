import type { SfxKind } from '@core/types';
import type { AudioSettings } from '@storage/profiles';
import { BgmEngine, type BgmMode } from './bgmEngine';
import { SFX_CATALOG } from './sfxRegistry';
import { SynthEngine } from './synthEngine';

export class AudioManager {
  private synth = new SynthEngine();
  private bgm = new BgmEngine();
  private bufferCache = new Map<string, AudioBuffer>();
  private preloadStarted = false;

  public enabled = true;
  public masterVolume = 1.0;
  public sfxVolume = 1.0;
  public bgmVolume = 0.45;

  public init(): void {
    const ctx = this.synth.init();
    if (ctx) {
      this.bgm.bindContext(ctx);
      this.bgm.setVolume(this.enabled ? this.masterVolume * this.bgmVolume : 0);
      this.bgm.ensureRunning();
      if (!this.preloadStarted) {
        this.preloadStarted = true;
        void this.preloadAllSfx();
      }
    }
  }

  public applySettings(settings: AudioSettings): void {
    this.enabled = settings.enabled;
    this.masterVolume = settings.masterVolume;
    this.sfxVolume = settings.sfxVolume;
    this.bgmVolume = settings.bgmVolume;
    this.bgm.setVolume(this.enabled ? this.masterVolume * this.bgmVolume : 0);
  }

  public getSettings(): AudioSettings {
    return {
      enabled: this.enabled,
      masterVolume: this.masterVolume,
      sfxVolume: this.sfxVolume,
      bgmVolume: this.bgmVolume,
    };
  }

  public setBgmMode(mode: BgmMode): void {
    this.bgm.setMode(mode);
    this.bgm.setVolume(this.enabled ? this.masterVolume * this.bgmVolume : 0);
  }

  public setMatchTension(tension: number): void {
    this.bgm.setTension(tension);
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

  public async preloadAllSfx(): Promise<void> {
    const kinds = Object.keys(SFX_CATALOG) as SfxKind[];
    await Promise.all(kinds.map((k) => this.preloadSfx(k)));
  }

  private playBuffer(buf: AudioBuffer, vol: number): void {
    const ctx = this.synth.init();
    if (!ctx || vol <= 0.0005) return;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    // Slight pitch micro-variation keeps repeated rapid clashes organic
    src.playbackRate.value = 0.96 + Math.random() * 0.08;
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
        this.playBuffer(cached, Math.min(1, vol * 0.72));
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
