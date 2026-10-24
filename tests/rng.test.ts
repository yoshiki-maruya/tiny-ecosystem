import { describe, expect, it } from 'vitest';
import { Rng, hashSeed } from '../src/core/rng';

describe('Rng', () => {
  it('same seed gives same sequence', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });
  it('different seeds give different sequences', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const sa = Array.from({ length: 20 }, () => a.next());
    const sb = Array.from({ length: 20 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });
  it('stays in range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(r.int(5)).toBeLessThan(5);
    }
  });
  it('shuffle is a deterministic permutation', () => {
    const a = new Rng(3).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    const b = new Rng(3).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('hashSeed is stable', () => {
    expect(hashSeed('forest')).toBe(hashSeed('forest'));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });
});
