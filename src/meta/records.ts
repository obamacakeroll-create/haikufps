import type { RunCause } from '../game/run';

/** One finished run on the local leaderboard. */
export interface RunRecord {
  readonly distance: number;
  readonly kills: number;
  readonly seconds: number;
  readonly score: number;
  readonly seed: number;
  readonly cause: RunCause;
  /** Epoch milliseconds when the run ended. */
  readonly date: number;
}

export const LEADERBOARD_SIZE = 10;

/** Ranks runs that tie on distance. Kills and time survived break the tie. */
export function scoreRun(distance: number, kills: number, seconds: number): number {
  return Math.round(distance * 10 + kills * 25 + seconds * 2);
}

/** Orders by distance, then by score. */
export function rankRuns(records: readonly RunRecord[]): RunRecord[] {
  return [...records].sort((a, b) => b.distance - a.distance || b.score - a.score);
}

/** Adds a run and keeps only the top of the board. Returns a new list. */
export function addRecord(records: readonly RunRecord[], record: RunRecord): RunRecord[] {
  return rankRuns([...records, record]).slice(0, LEADERBOARD_SIZE);
}

/** 1-based place of `record` on the board, or undefined when it did not make the cut. */
export function placeOf(board: readonly RunRecord[], record: RunRecord): number | undefined {
  const index = board.indexOf(record);
  return index >= 0 ? index + 1 : undefined;
}

/** Reads the board from storage. Malformed entries are dropped rather than failing the whole save. */
export function readRecords(raw: unknown): RunRecord[] {
  if (!Array.isArray(raw)) return [];
  return rankRuns(raw.filter(isRecord)).slice(0, LEADERBOARD_SIZE);
}

function isRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null) return false;
  const fields = value as Record<string, unknown>;
  const numeric = ['distance', 'kills', 'seconds', 'score', 'seed', 'date'];
  return (
    numeric.every((key) => typeof fields[key] === 'number' && Number.isFinite(fields[key])) &&
    (fields.cause === 'tide' || fields.cause === 'overrun')
  );
}
