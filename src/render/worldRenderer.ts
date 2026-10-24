import { HERBIVORE } from '../core/agents';
import type { World } from '../core/world';
import { PALETTE } from './palette';

export interface RenderOptions {
  showWater: boolean;
  /** Tool preview ring at a grid cell. */
  cursor?: { x: number; y: number; radius: number; color: string; blocked: boolean } | null;
}

/**
 * Draws terrain at one pixel per cell into an offscreen canvas, then scales it
 * up smoothly (soft, painterly look) and draws animals as crisp dots on top.
 */
export class WorldRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private terrain: HTMLCanvasElement;
  private terrainCtx: CanvasRenderingContext2D;
  private image: ImageData;
  private gw = 0;
  private gh = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.terrain = document.createElement('canvas');
    this.terrainCtx = this.terrain.getContext('2d')!;
    this.image = this.terrainCtx.createImageData(1, 1);
  }

  /** Match the backing store to the CSS size × devicePixelRatio. */
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

  /** Convert a client-space point to a grid cell, or null if outside. */
  cellAt(world: World, clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * world.width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * world.height);
    if (x < 0 || y < 0 || x >= world.width || y >= world.height) return null;
    return { x, y };
  }

  render(world: World, opts: RenderOptions): void {
    const { width: gw, height: gh } = world;
    if (gw !== this.gw || gh !== this.gh) {
      this.gw = gw;
      this.gh = gh;
      this.terrain.width = gw;
      this.terrain.height = gh;
      this.image = this.terrainCtx.createImageData(gw, gh);
    }
    const data = this.image.data;
    const { water, plant } = world;
    const [dr, dg, db] = PALETTE.soilDry;
    const [wr, wg, wb] = PALETTE.soilWet;
    const [lr, lg, lb] = PALETTE.plantLow;
    const [hr, hg, hb] = PALETTE.plantHigh;
    const [qr, qg, qb] = PALETTE.water;
    for (let i = 0; i < water.length; i++) {
      const m = water[i];
      const b = plant[i];
      // Soil darkens with moisture.
      let r = dr + (wr - dr) * m;
      let g = dg + (wg - dg) * m;
      let bl = db + (wb - db) * m;
      if (b > 0) {
        const k = Math.min(1, 0.25 + b);
        const pr = lr + (hr - lr) * b;
        const pg = lg + (hg - lg) * b;
        const pb = lb + (hb - lb) * b;
        r += (pr - r) * k;
        g += (pg - g) * k;
        bl += (pb - bl) * k;
      }
      if (opts.showWater) {
        const k = m * 0.75;
        r += (qr - r) * k;
        g += (qg - g) * k;
        bl += (qb - bl) * k;
      }
      const o = i * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = bl;
      data[o + 3] = 255;
    }
    this.terrainCtx.putImageData(this.image, 0, 0);

    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.terrain, 0, 0, cw, ch);

    const sx = cw / gw;
    const sy = ch / gh;
    const rH = Math.max(1.2, Math.min(sx, sy) * 0.32);
    const rC = Math.max(1.6, Math.min(sx, sy) * 0.42);
    // Herbivores first so predators stay visible on top.
    for (let pass = 0; pass < 2; pass++) {
      const herb = pass === 0;
      ctx.fillStyle = herb ? PALETTE.herbivore : PALETTE.carnivore;
      ctx.strokeStyle = 'rgba(10,16,14,0.55)';
      ctx.lineWidth = Math.max(1, rH * 0.35);
      const r = herb ? rH : rC;
      ctx.beginPath();
      for (const a of world.agents) {
        if (!a.alive || (a.species === HERBIVORE) !== herb) continue;
        // Deterministic sub-cell jitter from the id so stacked animals spread out.
        const jx = (((a.id * 2654435761) >>> 0) % 1000) / 1000 - 0.5;
        const jy = (((a.id * 40503) >>> 0) % 1000) / 1000 - 0.5;
        const cx = (a.x + 0.5 + jx * 0.5) * sx;
        const cy = (a.y + 0.5 + jy * 0.5) * sy;
        ctx.moveTo(cx + r, cy);
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
    }

    const cur = opts.cursor;
    if (cur) {
      const cx = (cur.x + 0.5) * sx;
      const cy = (cur.y + 0.5) * sy;
      ctx.save();
      ctx.setLineDash(cur.blocked ? [4, 4] : []);
      ctx.strokeStyle = cur.blocked ? 'rgba(231,236,223,0.45)' : cur.color;
      ctx.lineWidth = Math.max(1.5, sx * 0.12);
      ctx.beginPath();
      ctx.ellipse(cx, cy, (cur.radius + 0.5) * sx, (cur.radius + 0.5) * sy, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
