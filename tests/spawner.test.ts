import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { aliveCap, kindWeights, SPAWN, spawnInterval, Spawner } from '../src/combat/spawner';

describe('difficulty curve', () => {
  it('spawns faster and allows more enemies as run time goes on', () => {
    expect(spawnInterval(0)).toBeCloseTo(SPAWN.startInterval, 9);
    expect(spawnInterval(SPAWN.rampSeconds)).toBeCloseTo(SPAWN.endInterval, 9);
    expect(aliveCap(0)).toBe(SPAWN.startAlive);
    expect(aliveCap(SPAWN.rampSeconds)).toBe(SPAWN.endAlive);

    let previousInterval = Infinity;
    let previousCap = 0;
    for (let time = 0; time <= SPAWN.rampSeconds; time += 5) {
      expect(spawnInterval(time)).toBeLessThanOrEqual(previousInterval);
      expect(aliveCap(time)).toBeGreaterThanOrEqual(previousCap);
      previousInterval = spawnInterval(time);
      previousCap = aliveCap(time);
    }
  });

  it('keeps the later enemy kinds out of the opening', () => {
    const early = kindWeights(10).map(([kind]) => kind);
    expect(early).toEqual(['swarmling']);
    const late = kindWeights(70).map(([kind]) => kind);
    expect(late).toEqual(expect.arrayContaining(['swarmling', 'spitter', 'diver', 'brute', 'mimic']));
  });
});

describe('Spawner', () => {
  it('holds back while the field is at its cap', () => {
    const spawner = new Spawner(createRng(1));
    let orders = 0;
    for (let i = 0; i < 60 * 20; i++) {
      if (spawner.update(1 / 60, 0, aliveCap(0)) !== undefined) orders++;
    }
    expect(orders).toBe(0);
  });

  it('spawns swarms of several swarmlings at once', () => {
    const spawner = new Spawner(createRng(2));
    let swarm: number | undefined;
    for (let i = 0; i < 60 * 60 && swarm === undefined; i++) {
      const order = spawner.update(1 / 60, 0, 0);
      if (order?.kind === 'swarmling') swarm = order.count;
    }
    expect(swarm).toBeGreaterThanOrEqual(3);
    expect(swarm).toBeLessThanOrEqual(5);
  });

  it('gives the same sequence for the same seed', () => {
    const run = (seed: number): string[] => {
      const spawner = new Spawner(createRng(seed));
      const kinds: string[] = [];
      for (let i = 0; i < 60 * 120; i++) {
        const order = spawner.update(1 / 60, i / 60, 0);
        if (order !== undefined) kinds.push(`${order.kind}x${order.count}`);
      }
      return kinds;
    };
    expect(run(9)).toEqual(run(9));
  });
});
