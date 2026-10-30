import { DataTexture, Scene, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { createNoise } from '../src/procgen/noise';
import { createToonRamp } from '../src/render/toon';
import { Canyon } from '../src/world/canyon';
import type { Box } from '../src/world/collision';

const LOADED_WINDOW = 2 + 5 + 1;

function makeCanyon(seed: number): { canyon: Canyon; scene: Scene } {
  const scene = new Scene();
  const ramp: DataTexture = createToonRamp();
  const canyon = new Canyon(scene, seed, createNoise(seed), { ramp, mottle: new Texture() });
  return { canyon, scene };
}

describe('Canyon streaming', () => {
  it('keeps a fixed window of sections around the player', () => {
    const { canyon } = makeCanyon(5);
    canyon.update(0);
    expect(canyon.loadedSections).toBe(LOADED_WINDOW);
    canyon.update(-400);
    expect(canyon.loadedSections).toBe(LOADED_WINDOW);
  });

  it('returns only boxes near the query point', () => {
    const { canyon } = makeCanyon(5);
    canyon.update(-100);
    const out: Box[] = [];
    canyon.boxesNear(-100, 3, out);
    expect(out.length).toBeGreaterThan(0);
    for (const box of out) expect(Math.abs(box.z + 100)).toBeLessThanOrEqual(Math.max(box.hx, box.hz) + 3);
  });

  it('removes the floors and instances of sections it unloads', () => {
    const { canyon, scene } = makeCanyon(5);
    canyon.update(0);
    const before = scene.children.length;
    canyon.update(-400);
    expect(scene.children.length).toBe(before);
    canyon.dispose();
    expect(scene.children.length).toBe(0);
  });
});
