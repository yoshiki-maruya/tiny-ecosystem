import type { PopulationHistory } from '../ui/history';
import { SPECIES_COLORS } from './palette';

interface Series {
  key: 'plant' | 'herb' | 'carn';
  label: string;
  color: string;
}

const SERIES: Series[] = [
  { key: 'plant', label: '植物', color: SPECIES_COLORS.plant },
  { key: 'herb', label: '草食', color: SPECIES_COLORS.herbivore },
  { key: 'carn', label: '肉食', color: SPECIES_COLORS.carnivore },
];

/**
 * Population graph as three stacked rows (small multiples), each with its own
 * scale so a 40-strong predator population is as readable as 4000 plants.
 * A row whose latest value is 0 is flagged "絶滅".
 */
export class PopulationGraph {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(hist: PopulationHistory): void {
    const { ctx, canvas } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const rowH = H / SERIES.length;
    const padL = 44 * dpr;
    const padR = 6 * dpr;
    const n = hist.size;
    ctx.font = `${11 * dpr}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';

    SERIES.forEach((s, row) => {
      const data = hist[s.key];
      const top = row * rowH + 6 * dpr;
      const bottom = (row + 1) * rowH - 6 * dpr;
      let max = 1;
      for (let k = 0; k < n; k++) max = Math.max(max, data[hist.index(k)]);
      max = niceCeil(max);
      const last = n ? data[hist.index(n - 1)] : 0;
      const extinct = n > 0 && last === 0;

      // Baseline + label.
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, bottom + 0.5);
      ctx.lineTo(W - padR, bottom + 0.5);
      ctx.stroke();
      ctx.fillStyle = s.color;
      ctx.textAlign = 'left';
      ctx.fillText(s.label, 0, top + 6 * dpr);
      ctx.fillStyle = extinct ? '#f0b45a' : '#e7ecdf';
      ctx.font = `600 ${12 * dpr}px system-ui, sans-serif`;
      ctx.fillText(extinct ? '絶滅' : String(Math.round(last)), 0, top + 22 * dpr);
      ctx.font = `${11 * dpr}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(231,236,223,0.35)';
      ctx.textAlign = 'right';
      ctx.fillText(String(max), W - padR, top + 4 * dpr);

      if (n < 2) return;
      const cap = hist.capacity;
      const x = (k: number) => padL + ((W - padL - padR) * (k + cap - n)) / (cap - 1);
      const plotTop = top + 12 * dpr; // leave room for the scale label
      const y = (v: number) => bottom - ((bottom - plotTop) * v) / max;

      // Soft area + line.
      ctx.beginPath();
      ctx.moveTo(x(0), bottom);
      for (let k = 0; k < n; k++) ctx.lineTo(x(k), y(data[hist.index(k)]));
      ctx.lineTo(x(n - 1), bottom);
      ctx.closePath();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const px = x(k);
        const py = y(data[hist.index(k)]);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = extinct ? 'rgba(240,180,90,0.9)' : s.color;
      ctx.lineWidth = 1.6 * dpr;
      ctx.stroke();
    });
  }
}

function niceCeil(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
