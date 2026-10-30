import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, clampNumeric, normalizeSettings } from '../src/core/settings';
import { SAVE_KEY, SAVE_VERSION, type SaveData, loadSave, parseSave, writeSave } from '../src/core/save';
import { memoryStore } from '../src/core/storage';
import { emptyStats } from '../src/meta/progress';
import { addRecord, type RunRecord } from '../src/meta/records';
import { type GhostTrack } from '../src/meta/ghost';

describe('normalizeSettings', () => {
  it('returns defaults for anything that is not an object', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and replaces wrong types with defaults', () => {
    const out = normalizeSettings({ aimMode: 'hold', fov: 'wide', invertY: 'yes', rumble: false });
    expect(out.aimMode).toBe('hold');
    expect(out.fov).toBe(DEFAULT_SETTINGS.fov);
    expect(out.invertY).toBe(DEFAULT_SETTINGS.invertY);
    expect(out.rumble).toBe(false);
  });

  it('clamps numbers into their bounds', () => {
    const out = normalizeSettings({ fov: 500, stickDeadzone: -1, masterVolume: 2 });
    expect(out.fov).toBe(100);
    expect(out.stickDeadzone).toBe(0);
    expect(out.masterVolume).toBe(1);
  });

  it('rejects non-finite numbers', () => {
    expect(normalizeSettings({ fov: Number.NaN }).fov).toBe(DEFAULT_SETTINGS.fov);
  });

  it('falls back to toggle aim for unknown modes', () => {
    expect(normalizeSettings({ aimMode: 'sometimes' }).aimMode).toBe('toggle');
  });
});

describe('clampNumeric', () => {
  it('rounds to three decimals so slider steps do not drift', () => {
    expect(clampNumeric('mouseSensitivity', 0.1 + 0.2)).toBe(0.3);
  });
});

describe('parseSave and writeSave', () => {
  it('returns defaults for missing or corrupt data', () => {
    expect(parseSave(null).settings).toEqual(DEFAULT_SETTINGS);
    expect(parseSave('{not json').settings).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults for a version this build does not know', () => {
    const future = JSON.stringify({ version: SAVE_VERSION + 1, settings: { fov: 90 } });
    expect(parseSave(future).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips settings through a store', () => {
    const store = memoryStore();
    const settings = { ...DEFAULT_SETTINGS, aimMode: 'hold' as const, fov: 88 };
    expect(writeSave(store, fresh(settings))).toBe(true);
    expect(loadSave(store).settings).toEqual(settings);
  });

  it('stores under the documented key', () => {
    const store = memoryStore();
    writeSave(store, fresh(DEFAULT_SETTINGS));
    expect(store.read(SAVE_KEY)).not.toBeNull();
  });

  it('migrates a version 1 save by keeping its settings and starting the rest empty', () => {
    const v1 = JSON.stringify({ version: 1, settings: { fov: 92, aimMode: 'hold' } });
    const migrated = parseSave(v1);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.settings.fov).toBe(92);
    expect(migrated.settings.aimMode).toBe('hold');
    expect(migrated.records).toEqual([]);
    expect(migrated.stats).toEqual(emptyStats());
    expect(migrated.ghost).toBeUndefined();
  });

  it('round-trips the leaderboard, stats, and ghost', () => {
    const store = memoryStore();
    const record: RunRecord = { distance: 140, kills: 9, seconds: 61, score: 1800, seed: 77, cause: 'tide', date: 1_700_000_000_000 };
    const ghost: GhostTrack = { seed: 77, distance: 140, samples: [0, 0, -100, 0, 5, 0, -200, 12] };
    const save: SaveData = {
      version: SAVE_VERSION,
      settings: DEFAULT_SETTINGS,
      records: addRecord([], record),
      stats: { runs: 3, bestDistance: 140, totalKills: 20, reshapesSurvived: 4 },
      ghost,
    };
    writeSave(store, save);
    const loaded = loadSave(store);
    expect(loaded.records).toEqual([record]);
    expect(loaded.stats).toEqual(save.stats);
    expect(loaded.ghost).toEqual(ghost);
  });

  it('drops malformed leaderboard entries and keeps the valid ones', () => {
    const record = { distance: 50, kills: 1, seconds: 20, score: 600, seed: 3, cause: 'overrun', date: 1 };
    const text = JSON.stringify({ version: SAVE_VERSION, settings: DEFAULT_SETTINGS, records: [record, { distance: 'far' }, null] });
    expect(parseSave(text).records).toEqual([record]);
  });

  it('drops a ghost whose samples do not form whole [x, y, z, yaw] groups', () => {
    const text = JSON.stringify({ version: SAVE_VERSION, settings: DEFAULT_SETTINGS, ghost: { seed: 1, distance: 9, samples: [1, 2, 3] } });
    expect(parseSave(text).ghost).toBeUndefined();
  });
});

function fresh(settings: SaveData['settings']): SaveData {
  return { version: SAVE_VERSION, settings, records: [], stats: emptyStats(), ghost: undefined };
}
