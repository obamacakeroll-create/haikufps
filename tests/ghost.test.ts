import { describe, expect, it } from 'vitest';
import { GHOST_HZ, type GhostPose, GhostRecorder, readGhost, sampleGhost, type GhostTrack } from '../src/meta/ghost';

const pose = (): GhostPose => ({ x: 0, y: 0, z: 0, yaw: 0 });

describe('ghost recorder', () => {
  it('samples at the ghost rate, whatever the frame rate', () => {
    const recorder = new GhostRecorder();
    for (let i = 0; i < 60; i++) recorder.update(1 / 60, 0, 0, -i * 0.1, 0);
    const samples = recorder.track(1, 6).samples.length / 4;
    expect(Math.abs(samples - GHOST_HZ)).toBeLessThanOrEqual(1);
  });

  it('stores positions to the centimeter and yaw to the milliradian', () => {
    const recorder = new GhostRecorder();
    recorder.update(0.1, 1.234, 0.001, -5.678, 0.5);
    expect(recorder.track(1, 5.678).samples.slice(0, 4)).toEqual([123, 0, -568, 500]);
  });
});

describe('sampleGhost', () => {
  it('interpolates between samples', () => {
    const track: GhostTrack = { seed: 1, distance: 2, samples: [0, 0, 0, 0, 100, 0, -200, 0] };
    const out = sampleGhost(track, 0.5 / GHOST_HZ, pose());
    expect(out.x).toBeCloseTo(0.5, 9);
    expect(out.z).toBeCloseTo(-1, 9);
  });

  it('holds the last pose once the track runs out', () => {
    const track: GhostTrack = { seed: 1, distance: 2, samples: [0, 0, 0, 0, 100, 0, -200, 0] };
    const out = sampleGhost(track, 10, pose());
    expect(out.x).toBeCloseTo(1, 9);
    expect(out.z).toBeCloseTo(-2, 9);
  });

  it('plays back the same poses after a trip through JSON', () => {
    const recorder = new GhostRecorder();
    for (let i = 0; i < 120; i++) recorder.update(1 / 60, Math.sin(i * 0.1) * 3, 0, -i * 0.2, 0.25);
    const original = recorder.track(9, 24);
    const stored = readGhost(JSON.parse(JSON.stringify(original)));
    expect(stored).toEqual(original);
    expect(sampleGhost(stored ?? original, 1.2, pose())).toEqual(sampleGhost(original, 1.2, pose()));
  });

  it('reads nothing from a track with a partial pose', () => {
    expect(readGhost({ seed: 1, distance: 9, samples: [1, 2, 3] })).toBeUndefined();
    expect(readGhost(null)).toBeUndefined();
  });
});
