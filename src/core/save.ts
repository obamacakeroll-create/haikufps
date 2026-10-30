import { type GhostTrack, readGhost } from '../meta/ghost';
import { emptyStats, readStats, type Stats } from '../meta/progress';
import { readRecords, type RunRecord } from '../meta/records';
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from './settings';
import type { KeyValueStore } from './storage';

export const SAVE_KEY = 'haikufps.save';
export const SAVE_VERSION = 2;

export interface SaveData {
  version: number;
  settings: Settings;
  /** The local leaderboard, best run first. */
  records: RunRecord[];
  stats: Stats;
  /** The best run so far, replayed as a ghost. */
  ghost: GhostTrack | undefined;
}

function defaults(): SaveData {
  return {
    version: SAVE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    records: [],
    stats: emptyStats(),
    ghost: undefined,
  };
}

/**
 * Corrupt JSON, a missing file, or an unknown version all fall back to defaults, so the game always
 * starts. Version 1 kept only settings, so it migrates by keeping them and starting the rest empty.
 */
export function parseSave(text: string | null): SaveData {
  if (text === null) return defaults();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return defaults();
  }
  if (typeof raw !== 'object' || raw === null) return defaults();
  const record = raw as Record<string, unknown>;
  if (record.version === 1) return { ...defaults(), settings: normalizeSettings(record.settings) };
  if (record.version !== SAVE_VERSION) return defaults();
  return {
    version: SAVE_VERSION,
    settings: normalizeSettings(record.settings),
    records: readRecords(record.records),
    stats: readStats(record.stats),
    ghost: readGhost(record.ghost),
  };
}

export function loadSave(store: KeyValueStore): SaveData {
  return parseSave(store.read(SAVE_KEY));
}

export function writeSave(store: KeyValueStore, data: SaveData): boolean {
  return store.write(SAVE_KEY, JSON.stringify(data));
}
