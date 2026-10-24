import { CARNIVORE, HERBIVORE, spawnAgent, speciesParams } from './agents';
import { clamp01, rainAt, type World } from './world';

export type AddTarget = 'plant' | 'herbivore' | 'carnivore';

export type Intervention =
  | { tick: number; type: 'rain'; x: number; y: number }
  | { tick: number; type: 'add'; species: AddTarget; x: number; y: number };

/**
 * Player-intervention rules. These are part of the simulation rules: changing
 * them changes replays, so bump CODEC_VERSION (codec/) when you do.
 */
export const RULES = {
  rain: { radius: 4, amount: 0.7, cooldown: 60 },
  add: {
    /** Total species additions allowed per run. */
    maxUses: 3,
    /** Ticks between additions. */
    cooldown: 300,
    /** Spawn radius around the clicked cell. */
    radius: 1,
    count: { plant: 0, herbivore: 5, carnivore: 2 } as Record<AddTarget, number>,
    /** Plants: biomass given to cells in the radius. */
    plantBiomass: 0.6,
  },
} as const;

export interface InterventionStatus {
  rainReadyAt: number;
  addReadyAt: number;
  addUsesLeft: number;
}

/** Cooldown / quota state implied by a log (pure function of the log). */
export function interventionStatus(log: readonly Intervention[]): InterventionStatus {
  let rainReadyAt = 0;
  let addReadyAt = 0;
  let addUses = 0;
  for (const iv of log) {
    if (iv.type === 'rain') rainReadyAt = iv.tick + RULES.rain.cooldown;
    else {
      addReadyAt = iv.tick + RULES.add.cooldown;
      addUses++;
    }
  }
  return { rainReadyAt, addReadyAt, addUsesLeft: Math.max(0, RULES.add.maxUses - addUses) };
}

/** Whether `iv` may be appended to `log` (which must be sorted by tick). */
export function canAppend(log: readonly Intervention[], iv: Intervention, width: number, height: number): boolean {
  if (!Number.isInteger(iv.tick) || iv.tick < 0) return false;
  if (!Number.isInteger(iv.x) || !Number.isInteger(iv.y)) return false;
  if (iv.x < 0 || iv.y < 0 || iv.x >= width || iv.y >= height) return false;
  const last = log[log.length - 1];
  if (last && iv.tick < last.tick) return false;
  const st = interventionStatus(log);
  if (iv.type === 'rain') return iv.tick >= st.rainReadyAt;
  if (iv.type === 'add') {
    if (!(iv.species in RULES.add.count)) return false;
    return st.addUsesLeft > 0 && iv.tick >= st.addReadyAt;
  }
  return false;
}

/** Keep only the prefix-valid entries of an untrusted log (e.g. decoded from a URL). */
export function sanitizeLog(log: readonly Intervention[], width: number, height: number): Intervention[] {
  const out: Intervention[] = [];
  for (const iv of log) if (canAppend(out, iv, width, height)) out.push(iv);
  return out;
}

export function applyIntervention(world: World, iv: Intervention): void {
  if (iv.type === 'rain') {
    rainAt(world, iv.x, iv.y, RULES.rain.radius, RULES.rain.amount);
    return;
  }
  const r = RULES.add.radius;
  if (iv.species === 'plant') {
    for (let y = iv.y - r; y <= iv.y + r; y++) {
      for (let x = iv.x - r; x <= iv.x + r; x++) {
        if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue;
        if ((x - iv.x) ** 2 + (y - iv.y) ** 2 > r * r + r) continue;
        const i = y * world.width + x;
        world.plant[i] = clamp01(Math.max(world.plant[i], RULES.add.plantBiomass));
      }
    }
    return;
  }
  const species = iv.species === 'herbivore' ? HERBIVORE : CARNIVORE;
  const p = speciesParams(world, species);
  for (let k = 0; k < RULES.add.count[iv.species]; k++) {
    const x = iv.x + world.rng.intRange(-r, r);
    const y = iv.y + world.rng.intRange(-r, r);
    spawnAgent(world, species, x, y, p.initialEnergy);
  }
}
