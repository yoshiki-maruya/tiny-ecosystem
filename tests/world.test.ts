import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../src/core/params';
import { createWorld } from '../src/core/world';
import { runTicks } from '../src/core/sim';
import { hashWorld } from '../src/core/hash';

const run = (seed: number, n: number) => {
  const w = createWorld(DEFAULT_PARAMS, seed);
  runTicks(w, n);
  return w;
};

describe('world (plants only)', () => {
  it('is deterministic', () => {
    expect(hashWorld(run(5, 300))).toBe(hashWorld(run(5, 300)));
  });
  it('differs across seeds', () => {
    expect(hashWorld(run(5, 100))).not.toBe(hashWorld(run(6, 100)));
  });
  it('keeps water and plants within [0,1]', () => {
    const w = createWorld(DEFAULT_PARAMS, 11);
    let bad = 0;
    for (let t = 0; t < 400; t++) {
      runTicks(w, 1);
      for (let i = 0; i < w.water.length; i++) {
        if (!(w.water[i] >= 0 && w.water[i] <= 1)) bad++;
        if (!(w.plant[i] >= 0 && w.plant[i] <= 1)) bad++;
      }
    }
    expect(bad).toBe(0);
  });
  it('plants persist and spread rather than dying instantly', () => {
    const w = run(9, 400);
    let alive = 0;
    for (const v of w.plant) if (v > 0) alive++;
    expect(alive).toBeGreaterThan(w.plant.length * 0.05);
  });
});
