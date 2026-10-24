import { Rng } from './rng';
import { cloneParams, type SimParams } from './params';
import { spawnInitialAgents, type Agent } from './agents';

export interface World {
  readonly params: SimParams;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  tick: number;
  rng: Rng;
  /** Moisture per cell, 0..1, row-major. */
  water: Float64Array;
  /** Plant biomass per cell, 0..1, row-major. */
  plant: Float64Array;
  /** Scratch buffer reused by diffusion / plant updates. */
  scratch: Float64Array;
  /** Living animals (plus ones that died this tick until compaction). */
  agents: Agent[];
  nextId: number;
  /** Per-species intrusive linked lists of agents per cell: cellHead[species][cell]. */
  cellHead: [(Agent | null)[], (Agent | null)[]];
}

export function createWorld(params: SimParams, seed: number): World {
  const p = cloneParams(params);
  const width = p.width;
  const height = p.height;
  const n = width * height;
  const world: World = {
    params: p,
    seed: seed >>> 0,
    width,
    height,
    tick: 0,
    rng: new Rng(seed),
    water: new Float64Array(n),
    plant: new Float64Array(n),
    scratch: new Float64Array(n),
    agents: [],
    nextId: 1,
    cellHead: [new Array<Agent | null>(n).fill(null), new Array<Agent | null>(n).fill(null)],
  };
  initTerrain(world);
  spawnInitialAgents(world);
  return world;
}

function initTerrain(world: World): void {
  const { rng, water, plant, params } = world;
  const n = water.length;
  // Patchy moisture: noisy base, then smooth it so there are wet and dry areas.
  for (let i = 0; i < n; i++) water[i] = params.water.initial * (0.3 + 1.4 * rng.next());
  for (let k = 0; k < 6; k++) diffuse(world, 0.24);
  for (let i = 0; i < n; i++) water[i] = clamp01(water[i]);

  for (let i = 0; i < n; i++) {
    if (water[i] >= params.plant.growthThreshold && rng.chance(params.plant.initialCover)) {
      plant[i] = 0.2 + 0.6 * rng.next();
    }
  }
}

/** Add a circular rain shower with linear falloff. Out-of-bounds parts are ignored. */
export function rainAt(world: World, cx: number, cy: number, radius: number, amount: number): void {
  const { width, height, water } = world;
  const r = Math.max(0, Math.floor(radius));
  const x0 = Math.max(0, cx - r);
  const x1 = Math.min(width - 1, cx + r);
  const y0 = Math.max(0, cy - r);
  const y1 = Math.min(height - 1, cy + r);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r + 0.5) continue;
      const f = r === 0 ? 1 : 1 - d / (r + 1);
      const i = y * width + x;
      water[i] = clamp01(water[i] + amount * f);
    }
  }
}

/** Diffuse moisture toward the 4-neighbour mean (no flux across the border). */
function diffuse(world: World, d: number): void {
  const { width, height, water, scratch } = world;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      const c = water[i];
      const l = x > 0 ? water[i - 1] : c;
      const r = x < width - 1 ? water[i + 1] : c;
      const u = y > 0 ? water[i - width] : c;
      const dn = y < height - 1 ? water[i + width] : c;
      scratch[i] = c + d * (l + r + u + dn - 4 * c);
    }
  }
  water.set(scratch);
}

export function stepWater(world: World): void {
  const { params, rng, water } = world;
  const wp = params.water;
  diffuse(world, Math.min(0.25, Math.max(0, wp.diffusion)));
  const keep = 1 - wp.evaporation;
  for (let i = 0; i < water.length; i++) water[i] = clamp01(water[i] * keep);
  if (rng.chance(wp.rainChance)) {
    const cx = rng.int(world.width);
    const cy = rng.int(world.height);
    rainAt(world, cx, cy, wp.rainRadius, wp.rainAmount);
  }
}

export function stepPlants(world: World): void {
  const { params, rng, water, plant, scratch, width, height } = world;
  const pp = params.plant;
  // Double-buffered so update order cannot bias spreading.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      const b = plant[i];
      const m = water[i];
      let nb = b;
      if (b > 0) {
        if (m >= pp.growthThreshold) {
          // Logistic growth plus a root term so grazed cells regrow at a usable pace.
          const g = Math.min(pp.growthRate * m * (b + 0.15) * (1 - b), m / Math.max(pp.waterUse, 1e-9));
          nb = b + g;
          water[i] = clamp01(m - g * pp.waterUse);
        } else {
          nb = b - pp.wiltRate;
        }
        if (nb < 0.001) nb = 0;
      } else if (m >= pp.growthThreshold) {
        let ns = 0;
        if (x > 0) ns += plant[i - 1];
        if (x < width - 1) ns += plant[i + 1];
        if (y > 0) ns += plant[i - width];
        if (y < height - 1) ns += plant[i + width];
        if (rng.chance(pp.seedRate * ns + pp.sproutChance)) nb = pp.seedBiomass;
      }
      scratch[i] = clamp01(nb);
    }
  }
  plant.set(scratch);
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
