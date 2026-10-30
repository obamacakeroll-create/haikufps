import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from './settings';
import type { KeyValueStore } from './storage';

export const SAVE_KEY = 'haikufps.save';
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  settings: Settings;
}

function defaults(): SaveData {
  return { version: SAVE_VERSION, settings: { ...DEFAULT_SETTINGS } };
}

/**
 * Corrupt JSON, a missing file, or a version this build does not know all fall back to
 * defaults, so the game always starts. Add migrations here when the schema first changes.
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
  if (record.version !== SAVE_VERSION) return defaults();
  return { version: SAVE_VERSION, settings: normalizeSettings(record.settings) };
}

export function loadSave(store: KeyValueStore): SaveData {
  return parseSave(store.read(SAVE_KEY));
}

export function writeSave(store: KeyValueStore, data: SaveData): boolean {
  return store.write(SAVE_KEY, JSON.stringify(data));
}
