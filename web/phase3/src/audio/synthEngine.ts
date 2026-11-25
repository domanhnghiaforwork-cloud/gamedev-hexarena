export interface SynthToneStep {
  freqStart: number;
  freqEnd: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
}

export class SynthEngine {
  private ctx: AudioContext | null = null;

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public init(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playTone(
    freqStart: number,
    freqEnd: number,
    dur: number,
    type: OscillatorType = 'triangle',
    vol = 0.14,
  ): void {
    const ctx = this.init();
    if (!ctx || vol <= 0.0005) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + dur);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  public playRecipe(steps: readonly SynthToneStep[], volumeMult = 1.0): void {
    if (volumeMult <= 0.0005) return;
    for (const s of steps) {
      this.playTone(s.freqStart, s.freqEnd, s.dur, s.type ?? 'triangle', (s.vol ?? 0.14) * volumeMult);
    }
  }
}
