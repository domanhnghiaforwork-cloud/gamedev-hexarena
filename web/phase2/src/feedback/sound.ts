import type { SfxKind } from '@core/types';

class SoundSynth {
  private ctx: AudioContext | null = null;
  public enabled = true;

  public init(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    dur: number,
    type: OscillatorType = 'triangle',
    vol = 0.14,
  ): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + dur);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  public play(kind: SfxKind): void {
    switch (kind) {
      case 'launch':
        this.playTone(340, 680, 0.08, 'triangle', 0.11);
        break;
      case 'clash':
        this.playTone(260, 120, 0.09, 'sawtooth', 0.13);
        break;
      case 'shatter':
        this.playTone(540, 90, 0.22, 'sawtooth', 0.17);
        this.playTone(880, 220, 0.14, 'square', 0.09);
        break;
      case 'snap':
        this.playTone(220, 520, 0.07, 'sine', 0.10);
        break;
      case 'recall':
        this.playTone(280, 740, 0.16, 'sine', 0.12);
        break;
      case 'bounce':
        this.playTone(460, 260, 0.08, 'triangle', 0.10);
        break;
      case 'pierce':
        this.playTone(720, 220, 0.15, 'sawtooth', 0.15);
        this.playTone(1040, 440, 0.10, 'triangle', 0.10);
        break;
      case 'dash':
        this.playTone(220, 640, 0.11, 'sine', 0.12);
        break;
      case 'special':
        this.playTone(320, 880, 0.22, 'triangle', 0.16);
        this.playTone(480, 960, 0.18, 'sine', 0.10);
        break;
      case 'pulse':
        this.playTone(180, 52, 0.28, 'sawtooth', 0.18);
        this.playTone(520, 140, 0.22, 'triangle', 0.12);
        break;
      case 'cancel':
        this.playTone(240, 150, 0.07, 'sine', 0.08);
        break;
      case 'uiClick':
        this.playTone(520, 640, 0.04, 'sine', 0.06);
        break;
    }
  }

  public playCountdown(step: number): void {
    if (step > 0) {
      // Crisp 3 / 2 / 1 esports countdown pulse
      const baseFreq = step === 1 ? 660 : step === 2 ? 550 : 440;
      this.playTone(baseFreq, baseFreq * 0.96, 0.14, 'triangle', 0.14);
    } else {
      // Triumphant "CHIẾN!" match-start chord
      this.playTone(587.3, 880, 0.24, 'triangle', 0.16);
      this.playTone(880, 1174.6, 0.28, 'sine', 0.12);
    }
  }
}

export const soundFX = new SoundSynth();
