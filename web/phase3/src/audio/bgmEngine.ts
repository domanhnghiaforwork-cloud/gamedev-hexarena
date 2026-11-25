export type BgmMode = 'none' | 'lobby' | 'match';

// D minor / Dorian tactical progression frequencies (Hz)
const LOBBY_ARP = [293.66, 349.23, 440.0, 523.25, 440.0, 349.23, 392.0, 440.0];
const LOBBY_BASS = [73.42, 73.42, 65.41, 65.41, 58.27, 58.27, 65.41, 65.41];

const MATCH_BASS = [
  73.42, 73.42, 146.83, 73.42,
  65.41, 65.41, 130.81, 65.41,
  58.27, 58.27, 116.54, 58.27,
  65.41, 82.41, 98.0, 82.41,
];
const MATCH_LEAD = [
  293.66, 0, 440.0, 349.23,
  261.63, 0, 392.0, 349.23,
  233.08, 0, 349.23, 293.66,
  261.63, 329.63, 392.0, 440.0,
];

/**
 * Lightweight Procedural Web Audio BGM Sequencer:
 * - Zero external large MP3 dependencies; works offline too.
 * - Adapts tempo (118 -> 136 BPM) & percussive intensity when match HP tension rises (HP <= 30%).
 */
export class BgmEngine {
  private ctx: AudioContext | null = null;
  private busGain: GainNode | null = null;
  private mode: BgmMode = 'none';
  private tension = 0; // 0..1
  private volume = 0.35;
  private stepIdx = 0;
  private timerId: number | null = null;
  private nextNoteTime = 0;

  public bindContext(ctx: AudioContext): void {
    if (this.ctx === ctx && this.busGain) return;
    this.ctx = ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.mode === 'none' ? 0 : this.volume * 0.26, ctx.currentTime);
    gain.connect(ctx.destination);
    this.busGain = gain;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.busGain) {
      const target = this.mode === 'none' ? 0 : this.volume * 0.26;
      this.busGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  public setTension(tension: number): void {
    this.tension = Math.max(0, Math.min(1, tension));
  }

  public getMode(): BgmMode {
    return this.mode;
  }

  public setMode(next: BgmMode): void {
    if (this.mode === next) return;
    this.mode = next;
    this.stepIdx = 0;
    if (this.ctx && this.busGain) {
      const target = next === 'none' ? 0 : this.volume * 0.26;
      this.busGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    }
    if (next === 'none') {
      this.stopTimer();
    } else if (this.ctx) {
      this.ensureRunning();
    }
  }

  public ensureRunning(): void {
    if (typeof window === 'undefined' || !this.ctx || !this.busGain || this.mode === 'none') return;
    if (this.ctx.state === 'suspended') return;
    if (this.timerId !== null) return;

    this.nextNoteTime = this.ctx.currentTime + 0.04;
    this.timerId = window.setInterval(() => this.schedulerTick(), 50);
  }

  public stop(): void {
    this.mode = 'none';
    this.stopTimer();
    if (this.ctx && this.busGain) {
      this.busGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  private stopTimer(): void {
    if (typeof window !== 'undefined' && this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private schedulerTick(): void {
    if (!this.ctx || !this.busGain || this.mode === 'none' || this.volume <= 0.001) return;
    if (this.ctx.state !== 'running') return;

    const horizon = this.ctx.currentTime + 0.14;
    while (this.nextNoteTime < horizon) {
      this.scheduleStep(this.nextNoteTime, this.stepIdx);
      const bpm = this.mode === 'lobby' ? 96 : 118 + this.tension * 18;
      const stepSec = 60 / bpm / 2; // eighth-note pulse
      this.nextNoteTime += stepSec;
      this.stepIdx = (this.stepIdx + 1) % 32;
    }
  }

  private scheduleNote(
    when: number,
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    cutoff = 1800,
  ): void {
    if (!this.ctx || !this.busGain || freq <= 0 || vol <= 0.0005) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, when);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, when + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.busGain);

    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private scheduleKick(when: number, strength = 1): void {
    if (!this.ctx || !this.busGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(118, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.09);

    gain.gain.setValueAtTime(0.28 * strength, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.11);

    osc.connect(gain);
    gain.connect(this.busGain);
    osc.start(when);
    osc.stop(when + 0.12);
  }

  private scheduleStep(when: number, idx: number): void {
    if (this.mode === 'lobby') {
      const i = idx % LOBBY_ARP.length;
      if (idx % 4 === 0) {
        this.scheduleNote(when, LOBBY_BASS[i], 0.55, 'triangle', 0.22, 420);
      }
      if (idx % 2 === 0) {
        this.scheduleNote(when, LOBBY_ARP[i], 0.34, 'sine', 0.14, 1400);
      }
      return;
    }

    // Match mode: driving tactical rhythm + dynamic tension layer
    const i = idx % 16;
    const brightness = 900 + this.tension * 1800;

    // Bass pulse on every 8th note
    this.scheduleNote(when, MATCH_BASS[i], 0.18, 'sawtooth', 0.17 + this.tension * 0.06, 480 + this.tension * 520);

    // Kick on beats (and extra syncopation at high tension)
    if (i % 4 === 0 || (this.tension > 0.35 && i % 4 === 3)) {
      this.scheduleKick(when, 0.8 + this.tension * 0.35);
    }

    // Lead synth motif
    const leadFreq = MATCH_LEAD[i];
    if (leadFreq > 0) {
      this.scheduleNote(when, leadFreq, 0.19, 'triangle', 0.12 + this.tension * 0.05, brightness);
    }

    // Tension high-octave shimmer when HP <= 30%
    if (this.tension > 0.2 && i % 2 === 1) {
      const shimmer = (leadFreq > 0 ? leadFreq : MATCH_BASS[i] * 4) * 2;
      this.scheduleNote(when, shimmer, 0.09, 'sine', 0.06 * this.tension, 2600);
    }
  }
}
