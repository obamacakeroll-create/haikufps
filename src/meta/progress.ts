/** Lifetime totals across every run. */
export interface Stats {
  readonly runs: number;
  readonly bestDistance: number;
  readonly totalKills: number;
  readonly reshapesSurvived: number;
}

export function emptyStats(): Stats {
  return { runs: 0, bestDistance: 0, totalKills: 0, reshapesSurvived: 0 };
}

/** What one run contributed to the lifetime totals. */
export interface RunTotals {
  readonly distance: number;
  readonly kills: number;
  readonly reshapes: number;
}

export function recordRun(stats: Stats, run: RunTotals): Stats {
  return {
    runs: stats.runs + 1,
    bestDistance: Math.max(stats.bestDistance, run.distance),
    totalKills: stats.totalKills + run.kills,
    reshapesSurvived: stats.reshapesSurvived + run.reshapes,
  };
}

/** Reads stats from storage. Anything missing or malformed counts as zero. */
export function readStats(raw: unknown): Stats {
  const source: Record<string, unknown> = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const count = (key: keyof Stats): number => {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  };
  return {
    runs: count('runs'),
    bestDistance: count('bestDistance'),
    totalKills: count('totalKills'),
    reshapesSurvived: count('reshapesSurvived'),
  };
}

export type UnlockId = 'long-burn' | 'quick-hands' | 'hold-steady';

export interface Unlock {
  readonly id: UnlockId;
  readonly title: string;
  /** What the player does to earn it. */
  readonly goal: string;
  /** What it changes once earned. */
  readonly effect: string;
  readonly earned: (stats: Stats) => boolean;
}

export const UNLOCKS: readonly Unlock[] = [
  {
    id: 'long-burn',
    title: 'Long burn',
    goal: 'Run 120 m in a single run.',
    effect: 'Jetpack fuel lasts 30% longer.',
    earned: (stats) => stats.bestDistance >= 120,
  },
  {
    id: 'quick-hands',
    title: 'Quick hands',
    goal: 'Get 40 kills across all runs.',
    effect: 'Reloads take 30% less time.',
    earned: (stats) => stats.totalKills >= 40,
  },
  {
    id: 'hold-steady',
    title: 'Hold steady',
    goal: 'Survive 12 reshapes across all runs.',
    effect: 'Shots kick you half as far, so the tide loses less ground.',
    earned: (stats) => stats.reshapesSurvived >= 12,
  },
];

/** How much unlocks change a run. Each field is a multiplier. The default changes nothing. */
export interface Loadout {
  readonly fuelScale: number;
  readonly reloadScale: number;
  readonly recoilScale: number;
}

export const DEFAULT_LOADOUT: Loadout = { fuelScale: 1, reloadScale: 1, recoilScale: 1 };

export function loadoutFor(stats: Stats): Loadout {
  const earned = (id: UnlockId): boolean => UNLOCKS.some((unlock) => unlock.id === id && unlock.earned(stats));
  return {
    fuelScale: earned('long-burn') ? 1.3 : 1,
    reloadScale: earned('quick-hands') ? 0.7 : 1,
    recoilScale: earned('hold-steady') ? 0.5 : 1,
  };
}
