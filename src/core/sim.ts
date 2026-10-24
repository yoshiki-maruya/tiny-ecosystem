import { census, stepAgents, SPECIES_KEYS } from './agents';
import { stepPlants, stepWater, type World } from './world';

export type SpeciesName = (typeof SPECIES_KEYS)[number] | 'plant';

export interface SimEvent {
  tick: number;
  kind: 'extinct' | 'collapse';
  species?: SpeciesName;
}

/**
 * Advance the world by exactly one fixed tick. Returns notable events
 * (extinctions) that happened during this tick.
 */
export function stepWorld(world: World): SimEvent[] {
  const before = census(world);
  const plantBefore = plantCells(world);
  stepWater(world);
  stepPlants(world);
  stepAgents(world);
  world.tick++;
  const after = census(world);
  const events: SimEvent[] = [];
  for (let s = 0; s < 2; s++) {
    if (before[s] > 0 && after[s] === 0) events.push({ tick: world.tick, kind: 'extinct', species: SPECIES_KEYS[s] });
  }
  if (plantBefore > 0 && plantCells(world) === 0) events.push({ tick: world.tick, kind: 'extinct', species: 'plant' });
  if (before[0] + before[1] > 0 && after[0] + after[1] === 0) events.push({ tick: world.tick, kind: 'collapse' });
  return events;
}

export function runTicks(world: World, n: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...stepWorld(world));
  return events;
}

export function plantCells(world: World): number {
  let c = 0;
  for (let i = 0; i < world.plant.length; i++) if (world.plant[i] > 0) c++;
  return c;
}

export function plantBiomass(world: World): number {
  let s = 0;
  for (let i = 0; i < world.plant.length; i++) s += world.plant[i];
  return s;
}
