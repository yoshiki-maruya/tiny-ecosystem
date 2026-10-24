import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../src/core/params';
import { Simulation } from '../src/core/simulation';
import { hashWorld } from '../src/core/hash';
import { RULES } from '../src/core/interventions';

/** Scripted play-through: interventions at fixed ticks. */
function scripted(seed: number, until: number): Simulation {
  const sim = new Simulation(seed, DEFAULT_PARAMS);
  const script: Record<number, Parameters<Simulation['intervene']>[0]> = {
    20: { type: 'rain', x: 10, y: 12 },
    90: { type: 'add', species: 'herbivore', x: 16, y: 16 },
    150: { type: 'rain', x: 25, y: 20 },
    420: { type: 'add', species: 'carnivore', x: 5, y: 28 },
  };
  while (sim.tick < until) {
    const s = script[sim.tick];
    if (s) expect(sim.intervene(s)).toBe(true);
    sim.step();
  }
  return sim;
}

describe('Simulation determinism', () => {
  it('same seed + same interventions → same world hash', () => {
    expect(hashWorld(scripted(123, 600).world)).toBe(hashWorld(scripted(123, 600).world));
  });

  it('different seed → different world', () => {
    expect(hashWorld(scripted(123, 300).world)).not.toBe(hashWorld(scripted(124, 300).world));
  });

  it('replaying the log from scratch reproduces the live run', () => {
    const live = scripted(77, 700);
    const replay = new Simulation(77, DEFAULT_PARAMS, live.appliedLog);
    replay.advanceTo(live.tick);
    expect(hashWorld(replay.world)).toBe(hashWorld(live.world));
  });

  it('interventions change the outcome', () => {
    const a = new Simulation(5);
    const b = new Simulation(5);
    b.intervene({ type: 'rain', x: 16, y: 16 });
    a.advanceTo(50);
    b.advanceTo(50);
    expect(hashWorld(a.world)).not.toBe(hashWorld(b.world));
  });

  it('enforces cooldowns and the add quota', () => {
    const sim = new Simulation(9);
    expect(sim.intervene({ type: 'rain', x: 1, y: 1 })).toBe(true);
    expect(sim.intervene({ type: 'rain', x: 1, y: 1 })).toBe(false);
    sim.advanceTo(RULES.rain.cooldown);
    expect(sim.intervene({ type: 'rain', x: 1, y: 1 })).toBe(true);
    let used = 0;
    for (let k = 0; k < RULES.add.maxUses + 2; k++) {
      if (sim.intervene({ type: 'add', species: 'herbivore', x: 3, y: 3 })) used++;
      sim.advanceTo(sim.tick + RULES.add.cooldown);
    }
    expect(used).toBe(RULES.add.maxUses);
  });

  it('drops out-of-order or invalid entries from an untrusted log', () => {
    const sim = new Simulation(1, DEFAULT_PARAMS, [
      { tick: 10, type: 'rain', x: 1, y: 1 },
      { tick: 5, type: 'rain', x: 1, y: 1 },
      { tick: 20, type: 'rain', x: 999, y: 1 },
    ]);
    expect(sim.log.length).toBe(1);
  });
});
