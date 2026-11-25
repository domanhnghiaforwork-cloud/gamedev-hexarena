import { canvasFont } from '@config/typography';
import type { SimEvent } from '@core/types';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  isShard?: boolean;
  angle?: number;
  vAngle?: number;
}

interface Shockwave {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
  color: string;
}

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  scale: number;
  life: number;
  maxLife: number;
}

const MAX_PARTICLES = 180;
const MAX_SHOCKWAVES = 24;
const MAX_FLOATING_TEXTS = 36;

export class VFXManager {
  public particles: Particle[] = [];
  public shockwaves: Shockwave[] = [];
  public floatingTexts: FloatingText[] = [];
  public screenShake = 0;

  private enforceCaps(): void {
    if (this.particles.length > MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - MAX_PARTICLES);
    }
    if (this.shockwaves.length > MAX_SHOCKWAVES) {
      this.shockwaves.splice(0, this.shockwaves.length - MAX_SHOCKWAVES);
    }
    if (this.floatingTexts.length > MAX_FLOATING_TEXTS) {
      this.floatingTexts.splice(0, this.floatingTexts.length - MAX_FLOATING_TEXTS);
    }
  }

  public clear(): void {
    this.particles.length = 0;
    this.shockwaves.length = 0;
    this.floatingTexts.length = 0;
    this.screenShake = 0;
  }

  public ingestEvents(events: SimEvent[]): void {
    for (const ev of events) {
      if (ev.type === 'sparks') {
        for (let i = 0; i < ev.count; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = ev.speed * (0.35 + Math.random() * 0.85);
          this.particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            color: ev.color,
            size: ev.size * (0.65 + Math.random() * 0.6),
            life: 0.25 + Math.random() * 0.22,
            maxLife: 0.47,
          });
        }
      } else if (ev.type === 'shatter') {
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
          const spd = 120 + Math.random() * 240;
          this.particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            color: i % 3 === 0 ? '#fbbf24' : ev.color,
            size: ev.radius * (0.28 + Math.random() * 0.28),
            life: 0.45 + Math.random() * 0.25,
            maxLife: 0.70,
            isShard: true,
            angle: Math.random() * Math.PI * 2,
            vAngle: (Math.random() - 0.5) * 14,
          });
        }
        this.shockwaves.push({
          x: ev.x,
          y: ev.y,
          r: ev.radius * 0.6,
          maxR: ev.radius * 3.0,
          life: 0.28,
          maxLife: 0.28,
          color: '#fbbf24',
        });
      } else if (ev.type === 'shockwave') {
        this.shockwaves.push({
          x: ev.x,
          y: ev.y,
          r: ev.r,
          maxR: ev.maxR,
          life: ev.life,
          maxLife: ev.life,
          color: ev.color,
        });
      } else if (ev.type === 'floatingText') {
        this.floatingTexts.push({
          x: ev.x + (Math.random() - 0.5) * 10,
          y: ev.y,
          vy: -48,
          text: ev.text,
          color: ev.color,
          scale: ev.scale,
          life: 0.85,
          maxLife: 0.85,
        });
      } else if (ev.type === 'shake') {
        this.screenShake = Math.max(this.screenShake, ev.amount);
      }
    }
    this.enforceCaps();
  }

  public update(dt: number): void {
    this.screenShake = Math.max(0, this.screenShake - dt * 28);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.06, dt);
      p.vy *= Math.pow(0.06, dt);
      if (p.isShard && p.angle !== undefined && p.vAngle !== undefined) {
        p.angle += p.vAngle * dt;
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life -= dt;
      if (s.life <= 0) this.shockwaves.splice(i, 1);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const f = this.floatingTexts[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      f.y += f.vy * dt;
      f.vy *= Math.pow(0.2, dt);
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    for (const s of this.shockwaves) {
      const t = 1 - s.life / s.maxLife;
      const r = s.r + (s.maxR - s.r) * (1 - Math.pow(1 - t, 2.2));
      ctx.save();
      ctx.globalAlpha = Math.max(0, (1 - t) * 0.82);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3.2 * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.isShard) {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle ?? 0);
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.85, p.size * 0.65);
        ctx.lineTo(-p.size * 0.85, p.size * 0.45);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const f of this.floatingTexts) {
      const a = Math.max(0, Math.min(1, (f.life / f.maxLife) * 1.4));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = canvasFont(800, Math.round(14 * f.scale));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }
}
