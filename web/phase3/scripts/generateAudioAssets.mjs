import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../public/assets/audio/sfx');
const SAMPLE_RATE = 22050;

function writeWavMono16(filePath, samples) {
  const numSamples = samples.length;
  const dataBytes = numSamples * 2;
  const buf = Buffer.alloc(44 + dataBytes);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM
  buf.writeUInt16LE(1, 20);  // linear PCM
  buf.writeUInt16LE(1, 22);  // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
}

function synth(durationSec, fn) {
  const len = Math.max(1, Math.floor(durationSec * SAMPLE_RATE));
  const out = new Float32Array(len);
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 1073741823.5 - 1;
  };
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const u = i / len;
    out[i] = fn(t, u, rand);
  }
  return out;
}

const RECIPES = {
  // Heavy forged-metal clang + low thump
  clash_heavy: synth(0.24, (t, u, rand) => {
    const env = Math.exp(-t * 15);
    const body = Math.sin(2 * Math.PI * (145 * Math.exp(-t * 4) + 75) * t);
    const metal = Math.sin(2 * Math.PI * 318 * t + 1.8 * Math.sin(2 * Math.PI * 482 * t)) * Math.exp(-t * 18);
    const grit = rand() * Math.exp(-t * 55) * 0.45;
    const fade = u > 0.9 ? (1 - u) * 10 : 1;
    return (body * 0.52 + metal * 0.42 + grit) * env * fade * 0.85;
  }),

  // Standard tempered steel clash
  clash_base: synth(0.18, (t, u, rand) => {
    const env = Math.exp(-t * 20);
    const ring1 = Math.sin(2 * Math.PI * 410 * t);
    const ring2 = Math.sin(2 * Math.PI * 655 * t + Math.sin(2 * Math.PI * 240 * t));
    const impact = rand() * Math.exp(-t * 60) * 0.35;
    const fade = u > 0.88 ? (1 - u) / 0.12 : 1;
    return (ring1 * 0.45 + ring2 * 0.40 + impact) * env * fade * 0.80;
  }),

  // High crystalline / sharp blade ring
  clash_sharp: synth(0.22, (t, u, rand) => {
    const env = Math.exp(-t * 16);
    const chime1 = Math.sin(2 * Math.PI * 1120 * t);
    const chime2 = Math.sin(2 * Math.PI * 1790 * t) * 0.65;
    const chime3 = Math.sin(2 * Math.PI * 2460 * t) * Math.exp(-t * 24) * 0.4;
    const spark = rand() * Math.exp(-t * 75) * 0.3;
    const fade = u > 0.9 ? (1 - u) * 10 : 1;
    return (chime1 * 0.42 + chime2 + chime3 + spark) * env * fade * 0.72;
  }),

  // Multi-layered crystal shatter + sparkling debris
  shatter: synth(0.36, (t, u, rand) => {
    const burst = rand() * Math.exp(-t * 22) * 0.55;
    const lowCrack = Math.sin(2 * Math.PI * (240 - 160 * u) * t) * Math.exp(-t * 18) * 0.45;
    const shard1 = Math.sin(2 * Math.PI * 1480 * t) * Math.exp(-Math.max(0, t - 0.02) * 20) * 0.35;
    const shard2 = Math.sin(2 * Math.PI * 2140 * t) * Math.exp(-Math.max(0, t - 0.06) * 24) * 0.3;
    const shard3 = Math.sin(2 * Math.PI * 2960 * t) * Math.exp(-Math.max(0, t - 0.11) * 28) * 0.22;
    const fade = u > 0.9 ? (1 - u) * 10 : 1;
    return (burst + lowCrack + shard1 + shard2 + shard3) * fade * 0.85;
  }),

  // Air slash whoosh for melee cleave
  melee_whoosh: synth(0.22, (t, u, rand) => {
    const bell = Math.sin(Math.PI * u);
    const sweep = 280 + 520 * Math.sin(Math.PI * u);
    const blade = Math.sin(2 * Math.PI * sweep * t) * 0.28;
    const air = rand() * (0.45 + 0.4 * Math.sin(Math.PI * u));
    return (air * 0.55 + blade) * bell * 0.75;
  }),

  // Magnetic hex launch zip
  launch: synth(0.14, (t, u) => {
    const env = Math.sin(Math.PI * Math.min(1, u * 4)) * Math.exp(-t * 16);
    const freq = 320 + 520 * u;
    const tone = Math.sin(2 * Math.PI * freq * t);
    const sub = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 28);
    return (tone * 0.55 + sub * 0.35) * env * 0.75;
  }),

  // Deep gravity field hum + shimmer
  gravity_field: synth(0.45, (t, u) => {
    const env = Math.sin(Math.PI * u);
    const wobble = 1 + 0.08 * Math.sin(2 * Math.PI * 9 * t);
    const sub = Math.sin(2 * Math.PI * 76 * wobble * t) * 0.55;
    const mid = Math.sin(2 * Math.PI * (152 + 120 * u) * t) * 0.35;
    const high = Math.sin(2 * Math.PI * (440 + 220 * u) * t) * 0.16;
    return (sub + mid + high) * env * 0.80;
  }),

  // Armor pierce crack
  pierce: synth(0.20, (t, u, rand) => {
    const env = Math.exp(-t * 18);
    const f = 980 * Math.exp(-t * 8) + 210;
    const s = Math.sin(2 * Math.PI * f * t) * 0.55 + Math.sin(2 * Math.PI * f * 1.5 * t) * 0.25;
    const snap = rand() * Math.exp(-t * 50) * 0.4;
    const fade = u > 0.9 ? (1 - u) * 10 : 1;
    return (s + snap) * env * fade * 0.80;
  }),

  // Counter-pulse shockwave boom
  pulse: synth(0.36, (t, u) => {
    const env = Math.exp(-t * 8.5);
    const bass = Math.sin(2 * Math.PI * (190 * Math.exp(-t * 7) + 46) * t) * 0.72;
    const harmonic = Math.sin(2 * Math.PI * (420 * Math.exp(-t * 10) + 110) * t) * 0.28;
    const fade = u > 0.9 ? (1 - u) * 10 : 1;
    return (bass + harmonic) * env * fade * 0.88;
  }),

  // Sleek thruster dash burst
  dash: synth(0.16, (t, u, rand) => {
    const env = Math.exp(-t * 18);
    const sweep = Math.sin(2 * Math.PI * (240 + 480 * u) * t) * 0.45;
    const air = rand() * Math.exp(-t * 22) * 0.42;
    const fade = u > 0.88 ? (1 - u) / 0.12 : 1;
    return (sweep + air) * env * fade * 0.75;
  }),

  // Rising magnetic recall chime
  recall: synth(0.20, (t, u) => {
    const env = Math.sin(Math.PI * u);
    const freq = 300 + 540 * u * u;
    return (Math.sin(2 * Math.PI * freq * t) * 0.6 + Math.sin(2 * Math.PI * freq * 1.5 * t) * 0.25) * env * 0.70;
  }),

  // Crisp magnetic snap
  snap: synth(0.10, (t, u) => {
    const env = Math.exp(-t * 32);
    const f = 260 + 420 * u;
    return Math.sin(2 * Math.PI * f * t) * env * 0.72;
  }),

  // Ricochet bounce ping
  bounce: synth(0.12, (t, u) => {
    const env = Math.exp(-t * 24);
    const f = 540 * Math.exp(-t * 6) + 220;
    return Math.sin(2 * Math.PI * f * t) * env * 0.72;
  }),

  // Heroic special activation chord
  special: synth(0.32, (t, u) => {
    const env = Math.sin(Math.PI * Math.min(1, u * 5)) * Math.exp(-t * 5.5);
    const c1 = Math.sin(2 * Math.PI * (330 + 330 * Math.min(1, u * 2)) * t) * 0.45;
    const c2 = Math.sin(2 * Math.PI * (495 + 495 * Math.min(1, u * 2)) * t) * 0.35;
    const c3 = Math.sin(2 * Math.PI * 880 * t) * 0.22;
    const fade = u > 0.9 ? (1 - u) * 10 : 1;
    return (c1 + c2 + c3) * env * fade * 0.80;
  }),

  // Cancel / invalid action soft thud
  cancel: synth(0.10, (t, u) => {
    const env = Math.exp(-t * 28);
    const f = 250 - 95 * u;
    return Math.sin(2 * Math.PI * f * t) * env * 0.62;
  }),

  // Clean UI click
  ui_click: synth(0.06, (t, u) => {
    const env = Math.exp(-t * 48);
    const f = 580 + 180 * u;
    return Math.sin(2 * Math.PI * f * t) * env * 0.58;
  }),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, samples] of Object.entries(RECIPES)) {
  writeWavMono16(path.join(OUT_DIR, `${name}.wav`), samples);
}
console.log(`Generated ${Object.keys(RECIPES).length} WAV SFX files in ${OUT_DIR}`);
