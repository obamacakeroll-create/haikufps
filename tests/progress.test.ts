import { describe, expect, it } from 'vitest';
import { DEFAULT_LOADOUT, emptyStats, loadoutFor, readStats, recordRun, UNLOCKS, type Stats } from '../src/meta/progress';

const none: Stats = emptyStats();
const everything: Stats = { runs: 9, bestDistance: 500, totalKills: 500, reshapesSurvived: 500 };

function unlock(id: string) {
  const found = UNLOCKS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no unlock ${id}`);
  return found;
}

describe('stats', () => {
  it('adds each run to the lifetime totals and keeps the best distance', () => {
    const once = recordRun(none, { distance: 80, kills: 5, reshapes: 2 });
    const twice = recordRun(once, { distance: 60, kills: 3, reshapes: 1 });
    expect(twice).toEqual({ runs: 2, bestDistance: 80, totalKills: 8, reshapesSurvived: 3 });
  });

  it('reads anything missing or malformed as zero, and floors fractions', () => {
    expect(readStats(null)).toEqual(none);
    expect(readStats({ runs: 'many', bestDistance: -4, totalKills: 7.9, reshapesSurvived: Number.NaN })).toEqual({
      runs: 0,
      bestDistance: 0,
      totalKills: 7,
      reshapesSurvived: 0,
    });
  });
});

describe('unlocks', () => {
  it('earns Long burn at 120 m and not before', () => {
    expect(unlock('long-burn').earned({ ...none, bestDistance: 119.9 })).toBe(false);
    expect(unlock('long-burn').earned({ ...none, bestDistance: 120 })).toBe(true);
  });

  it('earns Quick hands at 40 kills across runs', () => {
    expect(unlock('quick-hands').earned({ ...none, totalKills: 39 })).toBe(false);
    expect(unlock('quick-hands').earned({ ...none, totalKills: 40 })).toBe(true);
  });

  it('earns Hold steady at 12 reshapes survived across runs', () => {
    expect(unlock('hold-steady').earned({ ...none, reshapesSurvived: 11 })).toBe(false);
    expect(unlock('hold-steady').earned({ ...none, reshapesSurvived: 12 })).toBe(true);
  });
});

describe('loadout', () => {
  it('changes nothing before any unlock is earned', () => {
    expect(loadoutFor(none)).toEqual(DEFAULT_LOADOUT);
  });

  it('applies each unlock to its own part of a run', () => {
    expect(loadoutFor(everything)).toEqual({ fuelScale: 1.3, reloadScale: 0.7, recoilScale: 0.5 });
  });

  it('applies only the unlocks that are earned', () => {
    expect(loadoutFor({ ...none, totalKills: 40 })).toEqual({ fuelScale: 1, reloadScale: 0.7, recoilScale: 1 });
  });
});
