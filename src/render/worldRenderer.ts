import { CARNIVORE, HERBIVORE, speciesParams, type Agent, type DeathRecord } from '../core/agents';
import type { World } from '../core/world';
import { PALETTE } from './palette';
import { DotLayer } from './dotLayer';
import { animalSprite, plantSprite, sproutSprite } from './sprites';

export interface RenderOptions {
  showWater: boolean;
  /** 0..1 progress between the previous and the current tick (for smooth motion). */
  alpha: number;
  /** Tool preview ring at a grid cell. */
  cursor?: { x: number; y: number; radius: number; color: string; blocked: boolean } | null;
  /** Id of the animal being observed. */
  selectedId?: number | null;
  /** Grid cell being observed (when no animal is selected). */
  selectedCell?: { x: number; y: number } | null;
}

interface Effect {
  rec: DeathRecord;
  facing: number;
  t0: number;
}

const PLANT_LEVELS = 8;
const EFFECT_MS = 900;
const MAX_EFFECTS = 40;
/** Below this cell size (device px) illustrations are illegible: fall back to tiles and dots. */
const MIN_DETAIL_CELL = 14;
/** Above this many animals, draw dots instead of illustrated sprites. */
const MAX_DETAIL_AGENTS = 1500;

/**
 * Draws the world as crisp tiles with small illustrated plants and animals.
 * Animals glide between cells using the previous-tick position, newborns pop
 * in, and deaths leave a short effect (a puff when eaten, a fading ghost when
 * starved or old) so it is possible to follow what happens.
 */
export class WorldRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private effects: Effect[] = [];
  private noise: Float32Array = new Float32Array(0);
  private gw = 0;
  private gh = 0;

  private readonly dots: DotLayer;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.dots = new DotLayer(this.ctx);
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

  /** Convert a client-space point to fractional grid coordinates. */
  gridAt(world: World, clientX: number, clientY: number): { gx: number; gy: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      gx: ((clientX - rect.left) / rect.width) * world.width,
      gy: ((clientY - rect.top) / rect.height) * world.height,
    };
  }

  /** Convert a client-space point to a grid cell, or null if outside. */
  cellAt(world: World, clientX: number, clientY: number): { x: number; y: number } | null {
    const { gx, gy } = this.gridAt(world, clientX, clientY);
    const x = Math.floor(gx);
    const y = Math.floor(gy);
    if (x < 0 || y < 0 || x >= world.width || y >= world.height) return null;
    return { x, y };
  }

  /** Where an agent is drawn (grid units, centre), given the interpolation alpha. */
  agentPos(a: Agent, alpha: number): { x: number; y: number } {
    const k = ease(alpha);
    const [jx, jy] = jitter(a.id);
    return { x: a.px + (a.x - a.px) * k + 0.5 + jx, y: a.py + (a.y - a.py) * k + 0.5 + jy };
  }

  /** Called after each live tick with the animals that died during it. */
  addDeaths(deaths: readonly DeathRecord[], world: World): void {
    const now = performance.now();
    for (const rec of deaths) {
      this.effects.push({ rec: { ...rec }, facing: rec.x < world.width / 2 ? 1 : -1, t0: now });
    }
    if (this.effects.length > MAX_EFFECTS) this.effects.splice(0, this.effects.length - MAX_EFFECTS);
  }

  clearEffects(): void {
    this.effects = [];
  }

  render(world: World, opts: RenderOptions): void {
    const { ctx, canvas } = this;
    const { width: gw, height: gh, water, plant } = world;
    if (gw !== this.gw || gh !== this.gh) this.buildNoise(gw, gh);
    const cw = canvas.width;
    const ch = canvas.height;
    const s = cw / gw;
    const sy = ch / gh;
    const tiny = s < MIN_DETAIL_CELL;
    const [lr, lg, lb] = PALETTE.plantLow;
    const [hr, hg, hb] = PALETTE.plantHigh;

    // --- ground: one crisp tile per cell, darker when wet, with gentle texture.
    const [dr, dg, db] = PALETTE.soilDry;
    const [wr, wg, wb] = PALETTE.soilWet;
    const [qr, qg, qb] = PALETTE.water;
    for (let y = 0; y < gh; y++) {
      const y0 = Math.floor(y * sy);
      const y1 = Math.floor((y + 1) * sy);
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const m = water[i];
        const n = this.noise[i];
        let r = dr + (wr - dr) * m + n;
        let g = dg + (wg - dg) * m + n;
        let b = db + (wb - db) * m + n;
        const bm = plant[i];
        if (tiny && bm > 0) {
          // Small cells: plants are just a green tint of the tile.
          const k = Math.min(1, 0.25 + bm);
          r += (lr + (hr - lr) * bm - r) * k;
          g += (lg + (hg - lg) * bm - g) * k;
          b += (lb + (hb - lb) * bm - b) * k;
        }
        if (opts.showWater) {
          const k = m * 0.7;
          r += (qr - r) * k;
          g += (qg - g) * k;
          b += (qb - b) * k;
        }
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        const x0 = Math.floor(x * s);
        ctx.fillRect(x0, y0, Math.floor((x + 1) * s) - x0, y1 - y0);
      }
    }

    // --- plants: a clump per cell sized by biomass; grazed cells show sprouts.
    const sprout = sproutSprite(s);
    // Plant clumps are drawn a bit larger than a cell so neighbours merge into a meadow.
    const ps = s * 1.3;
    const pOff = (ps - s) / 2;
    for (let y = 0; y < gh && !tiny; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const bm = plant[i];
        if (bm <= 0) continue;
        const h = hash2(x, y);
        const ox = ((h & 0xff) / 255 - 0.5) * 0.18 * s;
        const oy = (((h >>> 8) & 0xff) / 255 - 0.5) * 0.18 * s;
        if (bm < 0.07) {
          ctx.drawImage(sprout, Math.round(x * s + ox), Math.round(y * sy + oy));
          continue;
        }
        const spr = plantSprite(Math.max(1, Math.ceil(bm * PLANT_LEVELS)), PLANT_LEVELS, ps, (h >>> 16) % 3);
        ctx.drawImage(spr, Math.round(x * s + ox - pOff), Math.round(y * sy + oy - pOff));
      }
    }

    // --- selection highlight (vision range under the animals).
    const selected = opts.selectedId != null ? world.agents.find((a) => a.id === opts.selectedId && a.alive) : undefined;
    if (selected) {
      const v = speciesParams(world, selected.species).vision;
      const p = this.agentPos(selected, opts.alpha);
      ctx.fillStyle = 'rgba(231, 236, 223, 0.07)';
      ctx.strokeStyle = 'rgba(231, 236, 223, 0.35)';
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.setLineDash([s * 0.2, s * 0.15]);
      const x0 = Math.max(0, selected.x - v) * s;
      const y0 = Math.max(0, selected.y - v) * sy;
      const x1 = Math.min(gw, selected.x + v + 1) * s;
      const y1 = Math.min(gh, selected.y + v + 1) * sy;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.ellipse(p.x * s, p.y * sy + s * 0.25, s * 0.7, s * 0.38, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#f7f3e6';
      ctx.lineWidth = Math.max(1.5, s * 0.07);
      ctx.stroke();
    } else if (opts.selectedCell) {
      const c = opts.selectedCell;
      ctx.strokeStyle = 'rgba(247, 243, 230, 0.8)';
      ctx.lineWidth = Math.max(1.5, s * 0.06);
      ctx.strokeRect(c.x * s, c.y * sy, s, sy);
    }

    // --- animals: shadows first, then bodies sorted by y so nearer ones overlap.
    const alpha = opts.alpha;
    const list = world.agents.filter((a) => a.alive);
    if (tiny || list.length > MAX_DETAIL_AGENTS) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dots.draw(world, s, sy, Math.max(2 * dpr, s * 0.32), Math.max(2.6 * dpr, s * 0.42));
      this.drawCursor(opts, s, sy);
      return;
    }
    const pos = list.map((a) => this.agentPos(a, alpha));
    const order = list.map((_, i) => i).sort((i, j) => pos[i].y - pos[j].y || list[i].id - list[j].id);
    ctx.fillStyle = 'rgba(8, 12, 10, 0.28)';
    for (const i of order) {
      const a = list[i];
      const r = (a.species === CARNIVORE ? 0.5 : 0.38) * s * this.growScale(a, world.tick, alpha);
      ctx.beginPath();
      ctx.ellipse(pos[i].x * s, pos[i].y * sy + s * 0.3, r, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const i of order) {
      const a = list[i];
      const p = speciesParams(world, a.species);
      const size = (a.species === CARNIVORE ? 1.45 : 1.2) * s * this.growScale(a, world.tick, alpha);
      const spr = animalSprite(a.species === HERBIVORE ? 'herbivore' : 'carnivore', size, a.facing);
      // Weak (low energy) animals look faded.
      ctx.globalAlpha = a.energy < p.maxEnergy * 0.2 ? 0.55 : 1;
      const bob = a.x !== a.px || a.y !== a.py ? -Math.sin(Math.PI * Math.min(1, alpha)) * s * 0.06 : 0;
      ctx.drawImage(spr, Math.round(pos[i].x * s - spr.width / 2), Math.round(pos[i].y * sy - spr.height / 2 + bob));
      ctx.globalAlpha = 1;
      this.drawBadge(a, pos[i].x * s, pos[i].y * sy, s);
    }

    // --- death effects (real-time, independent of tick speed).
    const now = performance.now();
    this.effects = this.effects.filter((e) => now - e.t0 < EFFECT_MS);
    for (const e of this.effects) {
      const t = (now - e.t0) / EFFECT_MS;
      const cx = (e.rec.x + 0.5) * s;
      const cy = (e.rec.y + 0.5) * sy;
      if (e.rec.cause === 'eaten') {
        // A puff of fur.
        ctx.fillStyle = `rgba(241, 226, 191, ${0.9 * (1 - t)})`;
        for (let k = 0; k < 7; k++) {
          const ang = (k / 7) * Math.PI * 2 + e.rec.id;
          const d = s * (0.15 + 0.45 * t);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, s * 0.07 * (1 - t * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const spr = animalSprite(e.rec.species === HERBIVORE ? 'herbivore' : 'carnivore', s * 1.2, e.facing, 'ghost');
        ctx.globalAlpha = 0.75 * (1 - t);
        ctx.drawImage(spr, Math.round(cx - spr.width / 2), Math.round(cy - spr.height / 2 - t * s * 0.6));
        ctx.globalAlpha = 1;
      }
    }

    this.drawCursor(opts, s, sy);
  }

  private drawCursor(opts: RenderOptions, s: number, sy: number): void {
    const ctx = this.ctx;
    const cur = opts.cursor;
    if (cur) {
      const cx = (cur.x + 0.5) * s;
      const cy = (cur.y + 0.5) * sy;
      ctx.save();
      ctx.setLineDash(cur.blocked ? [4, 4] : []);
      ctx.strokeStyle = cur.blocked ? 'rgba(231,236,223,0.45)' : cur.color;
      ctx.lineWidth = Math.max(1.5, s * 0.08);
      ctx.beginPath();
      ctx.ellipse(cx, cy, (cur.radius + 0.5) * s, (cur.radius + 0.5) * sy, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Newborns grow from 55% to full size over their first few ticks. */
  private growScale(a: Agent, tick: number, alpha: number): number {
    const age = tick - a.born + alpha;
    if (age >= 6) return 1;
    return 0.55 + 0.45 * Math.max(0, age) / 6;
  }

  /** Small status mark above an animal: "!" when fleeing, "♥"-ish dot when it just caught prey. */
  private drawBadge(a: Agent, x: number, y: number, s: number): void {
    const ctx = this.ctx;
    if (a.action === 'flee') {
      ctx.font = `800 ${Math.round(s * 0.55)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.strokeStyle = 'rgba(20, 24, 20, 0.85)';
      ctx.strokeText('!', x + s * 0.15, y - s * 0.42);
      ctx.fillStyle = '#ffd36b';
      ctx.fillText('!', x + s * 0.15, y - s * 0.42);
    } else if (a.action === 'eat' || a.action === 'catch') {
      ctx.fillStyle = a.action === 'catch' ? 'rgba(255, 140, 90, 0.95)' : 'rgba(170, 220, 120, 0.9)';
      const bx = x + a.facing * s * 0.6;
      ctx.beginPath();
      ctx.arc(bx, y - s * 0.02, s * 0.06, 0, Math.PI * 2);
      ctx.arc(bx + a.facing * s * 0.08, y - s * 0.12, s * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private buildNoise(gw: number, gh: number): void {
    this.gw = gw;
    this.gh = gh;
    this.noise = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) this.noise[y * gw + x] = ((hash2(x, y) & 0xff) / 255 - 0.5) * 10;
    }
  }
}

function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Stable per-animal offset inside its cell, so animals sharing a cell don't stack exactly. */
function jitter(id: number): [number, number] {
  const h = Math.imul(id, 2654435761) >>> 0;
  return [((h & 0xff) / 255 - 0.5) * 0.3, (((h >>> 8) & 0xff) / 255 - 0.5) * 0.3];
}

function hash2(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
