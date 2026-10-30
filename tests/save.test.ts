import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, clampNumeric, normalizeSettings } from '../src/core/settings';
import { SAVE_KEY, SAVE_VERSION, loadSave, parseSave, writeSave } from '../src/core/save';
import { memoryStore } from '../src/core/storage';

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
    expect(writeSave(store, { version: SAVE_VERSION, settings })).toBe(true);
    expect(loadSave(store).settings).toEqual(settings);
  });

  it('stores under the documented key', () => {
    const store = memoryStore();
    writeSave(store, { version: SAVE_VERSION, settings: DEFAULT_SETTINGS });
    expect(store.read(SAVE_KEY)).not.toBeNull();
  });
});
