/**
 * All tunable simulation parameters live here. The UI edits copies of these,
 * and the URL codec stores the diff from DEFAULT_PARAMS.
 */

export interface WaterParams {
  /** Mean initial moisture (0..1). */
  initial: number;
  /** Fraction of moisture lost per tick. */
  evaporation: number;
  /** Diffusion coefficient toward the 4-neighbour mean per tick (0..0.25 is stable). */
  diffusion: number;
  /** Chance per tick that a natural rain shower starts somewhere. */
  rainChance: number;
  /** Radius (cells) of a natural rain shower. */
  rainRadius: number;
  /** Moisture added at the centre of a shower (falls off linearly). */
  rainAmount: number;
}

export interface PlantParams {
  /** Initial fraction of cells that start with plants. */
  initialCover: number;
  /** Plants only grow where moisture >= this. */
  growthThreshold: number;
  /** Logistic growth rate per tick (scaled by moisture). */
  growthRate: number;
  /** Biomass lost per tick when moisture is below threshold. */
  wiltRate: number;
  /** Moisture consumed per unit of biomass growth. */
  waterUse: number;
  /** Chance per tick an empty fertile cell is seeded, per unit of neighbour biomass. */
  seedRate: number;
  /** Biomass of a freshly seeded cell. */
  seedBiomass: number;
  /** Chance per tick an isolated fertile cell sprouts from the seed bank. */
  sproutChance: number;
}

export interface AnimalParams {
  initialCount: number;
  /** Cells moved per tick. */
  speed: number;
  /** Search radius (Chebyshev) for food. */
  vision: number;
  /** Energy lost every tick. */
  metabolism: number;
  /** Extra energy lost per cell moved. */
  moveCost: number;
  /** Energy needed to reproduce. Parent splits energy with the child. */
  reproduceThreshold: number;
  /** Fraction of parent energy handed to the child. */
  reproduceShare: number;
  /** Energy cap. */
  maxEnergy: number;
  /** Starting energy of initial individuals. */
  initialEnergy: number;
  /** Max age in ticks. */
  lifespan: number;
  /** Herbivore: max biomass eaten per tick. Carnivore: unused. */
  biteSize: number;
  /** Energy gained per unit of food (biomass for herbivores, one prey for carnivores). */
  foodEnergy: number;
}

export interface SimParams {
  width: number;
  height: number;
  water: WaterParams;
  plant: PlantParams;
  herbivore: AnimalParams;
  carnivore: AnimalParams;
}

export const DEFAULT_PARAMS: SimParams = {
  width: 64,
  height: 64,
  water: {
    initial: 0.45,
    evaporation: 0.004,
    diffusion: 0.12,
    rainChance: 0.18,
    rainRadius: 7,
    rainAmount: 0.6,
  },
  plant: {
    initialCover: 0.25,
    growthThreshold: 0.25,
    growthRate: 0.06,
    wiltRate: 0.01,
    waterUse: 0.02,
    seedRate: 0.02,
    seedBiomass: 0.08,
    sproutChance: 0.0002,
  },
  herbivore: {
    initialCount: 120,
    speed: 1,
    vision: 3,
    metabolism: 0.02,
    moveCost: 0.01,
    reproduceThreshold: 1.6,
    reproduceShare: 0.5,
    maxEnergy: 2.5,
    initialEnergy: 1,
    lifespan: 300,
    biteSize: 0.25,
    foodEnergy: 0.6,
  },
  carnivore: {
    initialCount: 15,
    speed: 2,
    vision: 5,
    metabolism: 0.025,
    moveCost: 0.006,
    reproduceThreshold: 2.4,
    reproduceShare: 0.5,
    maxEnergy: 3.5,
    initialEnergy: 1.5,
    lifespan: 450,
    biteSize: 1,
    foodEnergy: 0.9,
  },
};

export function cloneParams(p: SimParams): SimParams {
  return {
    width: p.width,
    height: p.height,
    water: { ...p.water },
    plant: { ...p.plant },
    herbivore: { ...p.herbivore },
    carnivore: { ...p.carnivore },
  };
}

/** Deep-merge a partial (e.g. decoded from URL) onto defaults, ignoring unknown keys. */
export function mergeParams(base: SimParams, patch: unknown): SimParams {
  const out = cloneParams(base);
  if (!patch || typeof patch !== 'object') return out;
  const src = patch as Record<string, unknown>;
  const outRec = out as unknown as Record<string, unknown>;
  for (const key of Object.keys(out) as (keyof SimParams)[]) {
    const v = src[key];
    if (v === undefined) continue;
    const cur = outRec[key];
    if (typeof cur === 'number') {
      if (typeof v === 'number' && Number.isFinite(v)) outRec[key] = v;
    } else if (cur && typeof cur === 'object' && v && typeof v === 'object') {
      const group = cur as Record<string, number>;
      const vg = v as Record<string, unknown>;
      for (const k of Object.keys(group)) {
        const n = vg[k];
        if (typeof n === 'number' && Number.isFinite(n)) group[k] = n;
      }
    }
  }
  out.width = clampInt(out.width, 8, 256);
  out.height = clampInt(out.height, 8, 256);
  return out;
}

/** Minimal diff of `p` against `base` (only changed leaves). */
export function diffParams(base: SimParams, p: SimParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const b = base as unknown as Record<string, unknown>;
  const c = p as unknown as Record<string, unknown>;
  for (const key of Object.keys(b)) {
    const bv = b[key];
    const cv = c[key];
    if (typeof bv === 'number') {
      if (bv !== cv) out[key] = cv;
    } else {
      const bg = bv as Record<string, number>;
      const cg = cv as Record<string, number>;
      const g: Record<string, number> = {};
      let any = false;
      for (const k of Object.keys(bg)) {
        if (bg[k] !== cg[k]) {
          g[k] = cg[k];
          any = true;
        }
      }
      if (any) out[key] = g;
    }
  }
  return out;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}
