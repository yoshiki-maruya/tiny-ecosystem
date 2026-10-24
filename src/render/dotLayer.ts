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

/**
 * Fast fallback for crowded worlds (thousands of animals or tiny cells):
 * animals become dots stamped into a pixel buffer in JS and blitted once,
 * which stays cheap even where canvas drawing is CPU-rasterised.
 */
export class DotLayer {
  private stamps: Stamp[] = [];
  private readonly layer = document.createElement('canvas');
  private readonly layerCtx = this.layer.getContext('2d')!;
  private layerImage: ImageData | null = null;

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

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
  draw(world: World, sx: number, sy: number, rH: number, rC: number): void {
    const cw = this.ctx.canvas.width;
    const ch = this.ctx.canvas.height;
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
}
