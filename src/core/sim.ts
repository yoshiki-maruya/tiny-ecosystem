import { stepPlants, stepWater, type World } from './world';

/** Advance the world by exactly one fixed tick. */
export function stepWorld(world: World): void {
  stepWater(world);
  stepPlants(world);
  world.tick++;
}

export function runTicks(world: World, n: number): void {
  for (let i = 0; i < n; i++) stepWorld(world);
}
