import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../src/core/params';
import { Simulation } from '../src/core/simulation';

describe('invariants', () => {
  it('energy, moisture, biomass stay in range and agents stay on the board', () => {
    for (const seed of [1, 2, 3]) {
      const sim = new Simulation(seed, DEFAULT_PARAMS);
      expect(sim.intervene({ type: 'add', species: 'carnivore', x: 0, y: 0 })).toBe(true);
      expect(sim.intervene({ type: 'rain', x: 31, y: 31 })).toBe(true);
      let bad = 0;
      for (let t = 0; t < 800; t++) {
        sim.step();
        const w = sim.world;
        for (let i = 0; i < w.water.length; i++) {
          if (!(w.water[i] >= 0 && w.water[i] <= 1)) bad++;
          if (!(w.plant[i] >= 0 && w.plant[i] <= 1)) bad++;
        }
        for (const a of w.agents) {
          const p = a.species === 0 ? w.params.herbivore : w.params.carnivore;
          if (!a.alive) bad++;
          if (!(a.energy > 0 && a.energy <= p.maxEnergy)) bad++;
          if (a.x < 0 || a.y < 0 || a.x >= w.width || a.y >= w.height) bad++;
          if (!Number.isInteger(a.x) || !Number.isInteger(a.y)) bad++;
          if (a.age < 0 || a.age >= p.lifespan) bad++;
        }
      }
      expect(bad).toBe(0);
    }
  });

  it('per-cell agent lists agree with agent positions', () => {
    const sim = new Simulation(4, DEFAULT_PARAMS);
    sim.advanceTo(300);
    const w = sim.world;
    let listed = 0;
    for (const heads of w.cellHead) {
      for (let i = 0; i < heads.length; i++) {
        for (let a = heads[i]; a; a = a.next) {
          expect(a.y * w.width + a.x).toBe(i);
          listed++;
        }
      }
    }
    expect(listed).toBe(w.agents.length);
  });
});
