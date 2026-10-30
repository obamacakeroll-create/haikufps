import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';

function sequence(seed: number, count: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.next());
}

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    expect(sequence(42, 50)).toEqual(sequence(42, 50));
  });

  it('diverges for different seeds', () => {
    expect(sequence(1, 20)).not.toEqual(sequence(2, 20));
  });

  it('keeps next() in [0, 1)', () => {
    for (const value of sequence(9, 5000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('keeps int() inclusive on both ends', () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rng.int(2, 5));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('forks independent, repeatable streams', () => {
    const base = createRng(11);
    const a = base.fork(1);
    const b = createRng(11).fork(1);
    const c = createRng(11).fork(2);
    expect(a.next()).toBe(b.next());
    expect(sequence(0, 1)).not.toEqual([c.next()]);
  });

  it('rejects pick() on an empty list', () => {
    expect(() => createRng(1).pick([])).toThrow(RangeError);
  });
});
