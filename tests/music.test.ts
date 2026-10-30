import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../src/audio/engine';
import { chordAt, hz, intensityFor, layersFor, PROGRESSION, STEP_SECONDS, tensionFor } from '../src/audio/music';

describe('music', () => {
  it('loops the four-bar progression', () => {
    expect(chordAt(0)).toBe(chordAt(4));
    expect(chordAt(1)).toBe(PROGRESSION[1]);
    expect(chordAt(-1)).toBe(chordAt(3));
  });

  it('tunes A4 to 440 Hz', () => {
    expect(hz(69)).toBeCloseTo(440, 9);
  });

  it('keeps intensity between 0 and 1, rising with difficulty and tension', () => {
    expect(intensityFor(0, 0)).toBeCloseTo(0.2, 9);
    expect(intensityFor(1, 1)).toBe(1);
    expect(intensityFor(0.5, 0)).toBeGreaterThan(intensityFor(0, 0));
    expect(intensityFor(0, 0.5)).toBeGreaterThan(intensityFor(0, 0));
  });

  it('builds tension only as the tide closes in', () => {
    expect(tensionFor(20)).toBe(0);
    expect(tensionFor(0)).toBe(1);
    expect(tensionFor(7)).toBeCloseTo(0.5, 9);
  });

  it('brings layers in one at a time: bass, then drums, then lead', () => {
    const calm = layersFor(0, 0);
    expect(calm.bass).toBe(0);
    expect(calm.drums).toBe(0);
    expect(calm.lead).toBe(0);
    expect(layersFor(0.5, 0).bass).toBe(1);
    expect(layersFor(0.5, 0).lead).toBe(0);
    expect(layersFor(1, 0).lead).toBe(1);
  });

  it('brings in the dread layer only under tension', () => {
    expect(layersFor(0.5, 0).dread).toBe(0);
    expect(layersFor(0.5, 1).dread).toBe(1);
  });

  it('spaces sixteenth notes so a bar lasts four beats at the tempo', () => {
    expect(STEP_SECONDS * 16).toBeCloseTo((4 * 60) / 116, 9);
  });
});

describe('audio engine', () => {
  it('stays silent without a browser audio context', () => {
    const engine = new AudioEngine();
    engine.unlock();
    expect(engine.ready).toBe(false);
    expect(engine.voices).toBeUndefined();
    expect(engine.now).toBe(0);
  });
});
