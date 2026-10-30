import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { awakenMimic, HOVER_HEIGHT, stepEnemy, type EnemyWorld } from '../src/combat/behaviors';
import { createEnemy, type Enemy, type EnemyKind } from '../src/combat/enemy';
import { type LiveSlot } from '../src/world/canyon';
import { slotBox, type Slot } from '../src/world/layout';

const DT = 1 / 60;

interface Log {
  hurt: Array<{ amount: number; source: EnemyKind }>;
  shoves: Array<{ x: number; y: number; z: number }>;
  spits: number;
  detonated: number;
  awakened: number;
}

/** A stand-in world. The player object is shared, so a test can move the player between steps. */
function stub(player: { x: number; y: number; z: number }): { world: EnemyWorld; log: Log } {
  const log: Log = { hurt: [], shoves: [], spits: 0, detonated: 0, awakened: 0 };
  const world: EnemyWorld = {
    player,
    rng: createRng(3),
    hurt: (amount, source) => log.hurt.push({ amount, source }),
    shove: (x, y, z) => log.shoves.push({ x, y, z }),
    spit: () => {
      log.spits++;
    },
    detonate: (enemy) => {
      enemy.alive = false;
      log.detonated++;
    },
    awaken: (enemy) => {
      awakenMimic(enemy);
      log.awakened++;
    },
  };
  return { world, log };
}

function run(enemy: Enemy, world: EnemyWorld, seconds: number): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps && enemy.alive; i++) stepEnemy(enemy, world, DT);
}

/** A wall the mimic is pressed against. Only the fields the mimic reads are meaningful. */
function wallPerch(x: number, z: number): LiveSlot {
  const slot: Slot = { kind: 'wall', variant: 0, x, y: 4, z, yaw: 0, width: 4, height: 8, depth: 10 };
  return { slot, meshIndex: 0, x, y: 4, width: 4, box: slotBox(slot) };
}

describe('swarmling', () => {
  it('darts at the player and spends itself on contact', () => {
    const player = { x: 0, y: 0, z: 0 };
    const { world, log } = stub(player);
    const swarm = createEnemy('swarmling', 1, { x: 0, y: 1, z: -20, perch: undefined });
    run(swarm, world, 8);
    expect(log.hurt).toEqual([{ amount: 10, source: 'swarmling' }]);
    expect(log.detonated).toBe(1);
    expect(swarm.alive).toBe(false);
  });
});

describe('brute', () => {
  it('hits hard, shoves the player sideways, and waits out its cooldown', () => {
    const player = { x: 0, y: 0, z: 0 };
    const { world, log } = stub(player);
    const brute = createEnemy('brute', 2, { x: 0.5, y: 1, z: -2, perch: undefined });
    run(brute, world, 1);
    expect(log.hurt).toEqual([{ amount: 22, source: 'brute' }]);
    expect(log.shoves).toHaveLength(1);
    // The brute is on the +x side, so the shove pushes the player toward -x.
    expect(log.shoves[0]?.x).toBeLessThan(0);
  });
});

describe('spitter', () => {
  it('lobs a glob on its cadence when the player is in range', () => {
    const { world, log } = stub({ x: 0, y: 0, z: 0 });
    const spitter = createEnemy('spitter', 3, { x: 3.8, y: 0.7, z: -30, perch: undefined });
    run(spitter, world, 3);
    expect(log.spits).toBe(1);
  });

  it('stays quiet when the player is out of range', () => {
    const { world, log } = stub({ x: 0, y: 0, z: 0 });
    const spitter = createEnemy('spitter', 3, { x: 3.8, y: 0.7, z: -200, perch: undefined });
    run(spitter, world, 4);
    expect(log.spits).toBe(0);
  });
});

describe('diver', () => {
  it('keeps hovering while the player stays on the ground', () => {
    const { world } = stub({ x: 0, y: 0, z: 0 });
    const diver = createEnemy('diver', 4, { x: 0, y: HOVER_HEIGHT, z: -16, perch: undefined });
    run(diver, world, 1);
    expect(diver.phase).toBe('hover');
  });

  it('winds up when the player jumps high, then dives onto them', () => {
    const player = { x: 0, y: 0, z: 0 };
    const { world, log } = stub(player);
    const diver = createEnemy('diver', 4, { x: 0, y: HOVER_HEIGHT, z: -16, perch: undefined });
    player.y = 5;
    run(diver, world, 0.1);
    expect(diver.phase).toBe('windup');
    run(diver, world, 2);
    expect(log.hurt).toContainEqual({ amount: 30, source: 'diver' });
  });
});

describe('mimic', () => {
  it('stays dormant and flush with its wall until something shows it', () => {
    const player = { x: 0, y: 0, z: 0 };
    const { world, log } = stub(player);
    const wall = wallPerch(6, -20);
    const mimic = createEnemy('mimic', 5, { x: 4.2, y: 4, z: -20, perch: wall });
    player.z = -80;
    run(mimic, world, 2);
    expect(mimic.phase).toBe('dormant');
    expect(mimic.x).toBeCloseTo(4.2, 9);
    expect(log.awakened).toBe(0);
  });

  it('follows its wall when the wall is reshaped', () => {
    const { world } = stub({ x: 0, y: 0, z: -80 });
    const wall = wallPerch(7, -20);
    const mimic = createEnemy('mimic', 5, { x: 4.2, y: 4, z: -20, perch: wall });
    stepEnemy(mimic, world, DT);
    expect(mimic.x).toBeCloseTo(5.2, 9);
  });

  it('shows itself when the player comes close, then lunges', () => {
    const player = { x: 0, y: 0, z: -80 };
    const { world, log } = stub(player);
    const mimic = createEnemy('mimic', 5, { x: 4.2, y: 4, z: -20, perch: wallPerch(6, -20) });
    run(mimic, world, 0.5);
    player.x = 2;
    player.z = -18;
    run(mimic, world, 0.1);
    expect(log.awakened).toBe(1);
    expect(mimic.phase).toBe('windup');
    run(mimic, world, 2);
    expect(log.hurt).toContainEqual({ amount: 35, source: 'mimic' });
  });
});
