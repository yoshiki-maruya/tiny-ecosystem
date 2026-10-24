/**
 * Simulation throughput benchmark (headless, no rendering).
 *   npm run bench
 * At 1x the app runs 5 ticks/s (64x: 320 ticks/s, ~5.3 per 60fps frame); a frame has
 * a 16.7 ms budget, so ms/tick tells how much headroom each speed has.
 */
import { DEFAULT_PARAMS, mergeParams, type SimParams } from '../src/core/params';
import { createWorld } from '../src/core/world';
import { stepWorld } from '../src/core/sim';
import { census } from '../src/core/agents';
import { PRESETS } from '../src/ui/presets';

interface Case {
  name: string;
  params: SimParams;
  seed: number;
  warmup: number;
  ticks: number;
}

const cases: Case[] = [
  { name: 'default (32x32)', params: DEFAULT_PARAMS, seed: 30, warmup: 200, ticks: 1000 },
  { name: 'outbreak preset, peak (32x32)', params: PRESETS.find((p) => p.id === 'outbreak')!.params, seed: 1, warmup: 150, ticks: 200 },
  {
    name: 'stress: ~5000 agents (64x64)',
    params: mergeParams(DEFAULT_PARAMS, {
      width: 64,
      height: 64,
      herbivore: { initialCount: 4500, lifespan: 100000, metabolism: 0, moveCost: 0, reproduceThreshold: 99, maxEnergy: 100 },
      carnivore: { initialCount: 500, lifespan: 100000, metabolism: 0, moveCost: 0, huntSuccess: 0, reproduceThreshold: 99, maxEnergy: 100 },
    }),
    seed: 1,
    warmup: 20,
    ticks: 200,
  },
];

const FRAME_MS = 1000 / 60;
console.log('| case | agents | ms/tick | ticks per 16.7ms frame | 16x (1.3 ticks/frame) | 64x (5.3 ticks/frame) |');
console.log('|---|---|---|---|---|---|');
for (const c of cases) {
  const w = createWorld(c.params, c.seed);
  for (let i = 0; i < c.warmup; i++) stepWorld(w);
  const [h0, c0] = census(w);
  const t0 = performance.now();
  for (let i = 0; i < c.ticks; i++) stepWorld(w);
  const ms = (performance.now() - t0) / c.ticks;
  const [h1, c1] = census(w);
  const agents = `${h0 + c0}→${h1 + c1}`;
  const perFrame = FRAME_MS / ms;
  const ok = (n: number) => (n * ms < FRAME_MS ? `OK (${(n * ms).toFixed(2)} ms)` : `NG (${(n * ms).toFixed(2)} ms)`);
  console.log(`| ${c.name} | ${agents} | ${ms.toFixed(3)} | ${perFrame.toFixed(0)} | ${ok(80 / 60)} | ${ok(320 / 60)} |`);
}
