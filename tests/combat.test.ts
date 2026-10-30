import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { createNoise } from '../src/procgen/noise';
import { createRng } from '../src/core/rng';
import { Combat, type CombatInput } from '../src/combat/combat';
import { Health } from '../src/player/health';
import { createBody, type Body } from '../src/player/movement';
import { Canyon, type LiveSlot } from '../src/world/canyon';
import { slotBox, type Slot } from '../src/world/layout';
import { QUIET, runAssets } from './support';

const DT = 1 / 60;

function setup(seed = 5): { body: Body; combat: Combat; health: Health } {
  const scene = new Scene();
  const assets = runAssets();
  const body = createBody(0, 0, 0);
  const canyon = new Canyon(scene, seed, createNoise(seed), assets);
  canyon.update(body.z);
  const health = new Health();
  const combat = new Combat(
    scene,
    canyon,
    body,
    health,
    createNoise(seed ^ 0x51ab),
    createRng(seed ^ 0x2f1d),
    { ramp: assets.ramp, splat: assets.splat },
  );
  return { body, combat, health };
}

function wallPerch(x: number, z: number): LiveSlot {
  const slot: Slot = { kind: 'wall', variant: 0, x, y: 4, z, yaw: 0, width: 4, height: 8, depth: 10 };
  return { slot, meshIndex: 0, x, y: 4, width: 4, box: slotBox(slot) };
}

/** Input for one step with the given overrides. Aim defaults to straight down the lane. */
function input(overrides: Partial<CombatInput>): CombatInput {
  return { ...QUIET, ...overrides };
}

describe('Combat', () => {
  it('kills a swarmling straight ahead with one rifle shot and counts it', () => {
    const { combat } = setup();
    combat.spawn('swarmling', { x: 0, y: 1.5, z: -10, perch: undefined });
    combat.update(DT, input({ fireHeld: true, firePressed: true, weaponIndex: 0 }));
    expect(combat.kills).toBe(1);
    expect(combat.enemies[0]?.alive).toBe(false);
  });

  it('does not kill a swarmling that is off to the side', () => {
    const { combat } = setup();
    combat.spawn('swarmling', { x: 3, y: 1.5, z: -10, perch: undefined });
    combat.update(DT, input({ fireHeld: true, firePressed: true, weaponIndex: 0 }));
    expect(combat.kills).toBe(0);
  });

  it('pushes the player backward with each scatter blast', () => {
    const { body, combat } = setup();
    combat.update(DT, input({ firePressed: true, weaponIndex: 1 }));
    expect(combat.arsenal.index).toBe(1);
    expect(body.kz).toBeGreaterThan(0);
  });

  it('launches the player when a bomb goes off at their feet', () => {
    const { body, combat } = setup();
    let blasts = 0;
    combat.events.on('blast', () => blasts++);
    combat.update(DT, input({ firePressed: true, weaponIndex: 2, aimX: 0, aimY: -1, aimZ: 0 }));
    for (let i = 0; i < 60 * 3 && blasts === 0; i++) combat.update(DT, input({}));
    expect(blasts).toBe(1);
    expect(body.vy).toBeGreaterThan(8);
  });

  it('reveals a mimic only when a reshape zone covers it', () => {
    const { combat } = setup();
    const mimic = combat.spawn('mimic', { x: 4.2, y: 4, z: -20, perch: wallPerch(6, -20) });
    combat.reveal({ center: -60, depth: 10 });
    expect(mimic.phase).toBe('dormant');
    combat.reveal({ center: -20, depth: 36 });
    expect(mimic.phase).toBe('windup');
  });

  it('reports hits and hurts through its events', () => {
    const { combat } = setup();
    const hits: boolean[] = [];
    combat.events.on('hit', ({ kill }) => hits.push(kill));
    combat.spawn('brute', { x: 0, y: 1.05, z: -10, perch: undefined });
    combat.update(DT, input({ fireHeld: true, firePressed: true, weaponIndex: 0 }));
    expect(hits).toEqual([false]);
  });

  it('hurts the player through their health when an enemy reaches them', () => {
    const { body, combat, health } = setup();
    combat.spawn('swarmling', { x: 0, y: body.y + 0.9, z: -0.1, perch: undefined });
    combat.update(DT, input({}));
    expect(health.current).toBeLessThan(100);
  });
});
