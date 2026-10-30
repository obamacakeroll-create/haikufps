import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { createNoise } from '../src/procgen/noise';
import { createRng } from '../src/core/rng';
import { Combat, type CombatInput } from '../src/combat/combat';
import { Arsenal, RIFLE } from '../src/combat/weapons';
import { Health } from '../src/player/health';
import { createBody } from '../src/player/movement';
import { Run, type RunInput } from '../src/game/run';
import { DEFAULT_LOADOUT, type Loadout } from '../src/meta/progress';
import { Canyon } from '../src/world/canyon';
import { QUIET, runAssets } from './support';

describe('reload scale', () => {
  it('shortens a reload in proportion', () => {
    const quick = new Arsenal(0.5);
    const slow = new Arsenal();
    for (const arsenal of [quick, slow]) {
      arsenal.fire();
      arsenal.reload();
    }
    quick.update(RIFLE.reloadSeconds * 0.5 + 0.01);
    slow.update(RIFLE.reloadSeconds * 0.5 + 0.01);
    expect(quick.reloading).toBe(false);
    expect(slow.reloading).toBe(true);
  });

  it('reports reload progress against the shortened time', () => {
    const arsenal = new Arsenal(0.5);
    arsenal.fire();
    arsenal.reload();
    arsenal.update(RIFLE.reloadSeconds * 0.25);
    expect(arsenal.reloadProgress).toBeCloseTo(0.5, 2);
  });
});

describe('fuel scale', () => {
  it('drains fuel more slowly in proportion to the unlock', () => {
    const drain = (loadout: Loadout): number => {
      const run = new Run(new Scene(), runAssets(), 4, loadout);
      for (let i = 0; i < 40; i++) {
        const intent: RunInput = {
          ...QUIET,
          jumpPressed: i === 0,
          jumpHeld: i < 40,
          wishX: 0,
          wishZ: -1,
          facingX: 0,
          facingZ: -1,
          dashPressed: false,
          speedScale: 1,
        };
        run.update(1 / 60, intent);
      }
      return 1 - run.body.fuel;
    };
    const normal = drain(DEFAULT_LOADOUT);
    const longBurn = drain({ ...DEFAULT_LOADOUT, fuelScale: 1.3 });
    expect(normal).toBeGreaterThan(0);
    expect(longBurn).toBeCloseTo(normal / 1.3, 6);
  });
});

describe('recoil scale', () => {
  it('shrinks the kick a shot gives the player', () => {
    const kick = (recoilScale: number): number => {
      const scene = new Scene();
      const assets = runAssets();
      const body = createBody(0, 0, 0);
      const canyon = new Canyon(scene, 5, createNoise(5), assets);
      canyon.update(body.z);
      const combat = new Combat(scene, canyon, body, new Health(), createNoise(5 ^ 0x51ab), createRng(5 ^ 0x2f1d), { ramp: assets.ramp, splat: assets.splat }, {
        ...DEFAULT_LOADOUT,
        recoilScale,
      });
      const input: CombatInput = { ...QUIET, firePressed: true, fireHeld: true, weaponIndex: 1, aimX: 0, aimY: 0, aimZ: -1 };
      combat.update(1 / 60, input);
      return body.kz;
    };
    expect(kick(0.5)).toBeCloseTo(kick(1) / 2, 6);
  });
});
