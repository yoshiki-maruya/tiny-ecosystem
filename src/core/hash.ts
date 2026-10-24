import type { World } from './world';

/** FNV-1a over the full world state; used by tests and replay verification. */
export function hashWorld(world: World): string {
  let h = 0x811c9dc5;
  const mix = (v: number): void => {
    h ^= v >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const f64 = new Float64Array(1);
  const u32 = new Uint32Array(f64.buffer);
  const mixF = (v: number): void => {
    f64[0] = v;
    mix(u32[0]);
    mix(u32[1]);
  };
  mix(world.tick);
  mix(world.rng.state);
  for (let i = 0; i < world.water.length; i++) mixF(world.water[i]);
  for (let i = 0; i < world.plant.length; i++) mixF(world.plant[i]);
  return h.toString(16).padStart(8, '0');
}
