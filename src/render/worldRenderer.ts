import { HERBIVORE } from '../core/agents';
import type { World } from '../core/world';
import { PALETTE } from './palette';

interface Stamp {
  key: string;
  size: number;
  /** Fully opaque pixels: offsets (dx, dy) and packed RGBA (little-endian). */
  solidDx: Int16Array;
  solidDy: Int16Array;
  solidPx: Uint32Array;
  /** Anti-aliased edge pixels, alpha-blended. */
  edgeDx: Int16Array;
  edgeDy: Int16Array;
  edgeRgba: Uint8Array;
}

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
  private stamps: Stamp[] = [];
  private readonly layer = document.createElement('canvas');
  private readonly layerCtx = this.layer.getContext('2d')!;
  private layerImage: ImageData | null = null;

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

  /** Pre-rendered dot (RGBA bytes) with a dark rim. */
  private stamp(slot: number, color: string, r: number): Stamp {
    const key = `${color}:${r.toFixed(2)}`;
    const cached = this.stamps[slot];
    if (cached && cached.key === key) return cached;
    const rim = Math.max(1, r * 0.35);
    const size = Math.ceil((r + rim) * 2) + 2;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    g.beginPath();
    g.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
    g.lineWidth = rim;
    g.strokeStyle = 'rgba(10,16,14,0.55)';
    g.stroke();
    const data = g.getImageData(0, 0, size, size).data;
    const sdx: number[] = [], sdy: number[] = [], spx: number[] = [];
    const edx: number[] = [], edy: number[] = [], erg: number[] = [];
    const u32 = new Uint32Array(data.buffer);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const a = data[i * 4 + 3];
        if (a === 255) {
          sdx.push(x);
          sdy.push(y);
          spx.push(u32[i]);
        } else if (a > 0) {
          edx.push(x);
          edy.push(y);
          erg.push(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], a);
        }
      }
    }
    const st: Stamp = {
      key,
      size,
      solidDx: Int16Array.from(sdx),
      solidDy: Int16Array.from(sdy),
      solidPx: Uint32Array.from(spx),
      edgeDx: Int16Array.from(edx),
      edgeDy: Int16Array.from(edy),
      edgeRgba: Uint8Array.from(erg),
    };
    this.stamps[slot] = st;
    return st;
  }

  /**
   * Animals are stamped into a pixel buffer in JS and blitted once. This keeps
   * thousands of agents cheap even where canvas drawing is CPU-rasterised.
   */
  private drawAgents(world: World, sx: number, sy: number, rH: number, rC: number): void {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    if (!this.layerImage || this.layerImage.width !== cw || this.layerImage.height !== ch) {
      this.layer.width = cw;
      this.layer.height = ch;
      this.layerImage = this.layerCtx.createImageData(cw, ch);
    }
    const buf = this.layerImage.data;
    const buf32 = new Uint32Array(buf.buffer);
    buf32.fill(0);
    const stamps = [this.stamp(0, PALETTE.herbivore, rH), this.stamp(1, PALETTE.carnivore, rC)];
    // Herbivores first so predators stay visible on top.
    for (let pass = 0; pass < 2; pass++) {
      const herb = pass === 0;
      const st = stamps[pass];
      const half = st.size / 2;
      const { solidDx, solidDy, solidPx, edgeDx, edgeDy, edgeRgba } = st;
      for (const a of world.agents) {
        if (!a.alive || (a.species === HERBIVORE) !== herb) continue;
        // Deterministic sub-cell jitter from the id so stacked animals spread out.
        const jx = (((a.id * 2654435761) >>> 0) % 1000) / 1000 - 0.5;
        const jy = (((a.id * 40503) >>> 0) % 1000) / 1000 - 0.5;
        const ox = Math.round((a.x + 0.5 + jx * 0.5) * sx - half);
        const oy = Math.round((a.y + 0.5 + jy * 0.5) * sy - half);
        const inside = ox >= 0 && oy >= 0 && ox + st.size <= cw && oy + st.size <= ch;
        // Edges first (blended), then the solid core overwrites.
        for (let k = 0; k < edgeDx.length; k++) {
          const px = ox + edgeDx[k];
          const py = oy + edgeDy[k];
          if (!inside && (px < 0 || py < 0 || px >= cw || py >= ch)) continue;
          const di = (py * cw + px) * 4;
          const sa = edgeRgba[k * 4 + 3];
          const da = buf[di + 3];
          if (da === 0) {
            buf[di] = edgeRgba[k * 4];
            buf[di + 1] = edgeRgba[k * 4 + 1];
            buf[di + 2] = edgeRgba[k * 4 + 2];
            buf[di + 3] = sa;
          } else {
            const f = sa / 255;
            buf[di] += (edgeRgba[k * 4] - buf[di]) * f;
            buf[di + 1] += (edgeRgba[k * 4 + 1] - buf[di + 1]) * f;
            buf[di + 2] += (edgeRgba[k * 4 + 2] - buf[di + 2]) * f;
            buf[di + 3] = da + sa * (1 - da / 255);
          }
        }
        for (let k = 0; k < solidDx.length; k++) {
          const px = ox + solidDx[k];
          const py = oy + solidDy[k];
          if (!inside && (px < 0 || py < 0 || px >= cw || py >= ch)) continue;
          buf32[py * cw + px] = solidPx[k];
        }
      }
    }
    this.layerCtx.putImageData(this.layerImage, 0, 0);
    this.ctx.drawImage(this.layer, 0, 0);
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
    ctx.imageSmoothingQuality = 'low'; // bilinear: soft enough, and cheap when CPU-rasterised
    ctx.drawImage(this.terrain, 0, 0, cw, ch);

    const sx = cw / gw;
    const sy = ch / gh;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rH = Math.max(2 * dpr, Math.min(sx, sy) * 0.32);
    const rC = Math.max(2.6 * dpr, Math.min(sx, sy) * 0.42);
    this.drawAgents(world, sx, sy, rH, rC);

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
