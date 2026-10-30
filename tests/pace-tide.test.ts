import { describe, expect, it } from 'vitest';
import { PACE, paceAt } from '../src/game/pace';
import { stepGap, TIDE } from '../src/game/tide';

describe('paceAt', () => {
  it('starts at the base pace and climbs to the cap', () => {
    expect(paceAt(0)).toBeCloseTo(PACE.start);
    expect(paceAt(60)).toBeCloseTo(PACE.start + 60 * PACE.gainPerSecond);
    expect(paceAt(10_000)).toBe(PACE.max);
  });

  it('never decreases over a run', () => {
    let previous = paceAt(0);
    for (let t = 1; t <= 400; t++) {
      const current = paceAt(t);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });
});

describe('stepGap', () => {
  it('holds steady when the player keeps pace', () => {
    expect(stepGap(20, 10, 10, 1)).toBe(20);
  });

  it('closes quickly when the player is behind pace', () => {
    expect(stepGap(20, 8, 10, 1)).toBeCloseTo(20 - 2 * TIDE.shrinkRate);
  });

  it('opens slowly when the player is ahead of pace', () => {
    expect(stepGap(20, 14, 10, 2)).toBeCloseTo(20 + 4 * TIDE.growRate * 2);
  });

  it('clamps at zero and at the maximum gap', () => {
    expect(stepGap(1, 0, 10, 1)).toBe(0);
    expect(stepGap(45, 30, 10, 10)).toBe(TIDE.maxGap);
  });
});
