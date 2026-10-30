import { Scene, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { Run } from '../src/game/run';
import { type Intent } from '../src/player/movement';
import { createToonRamp } from '../src/render/toon';
import { LANE_HALF, wallGap } from '../src/world/layout';

const CAPSULE_RADIUS = 0.4;
/** Ledges sit above head height, so this only bounds a body that is standing on the floor. */
const GROUND_Y = 1;

describe('movement against the canyon walls', () => {
  it('never lets a body on the floor pass a wall face, with strafing and jumps', () => {
    const offenders: string[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const rng = createRng(seed * 13);
      const run = new Run(new Scene(), { ramp: createToonRamp(), mottle: new Texture() }, seed);
      const right = LANE_HALF + wallGap(seed, 1) - CAPSULE_RADIUS;
      const left = LANE_HALF + wallGap(seed, -1) - CAPSULE_RADIUS;
      let strafe = 0;
      for (let i = 0; i < 60 * 25 && run.status === 'running'; i++) {
        if (i % 30 === 0) strafe = rng.pick([-1, 0, 1]);
        const intent: Intent = {
          wishX: strafe,
          wishZ: -1,
          speedScale: 1,
          facingX: 0,
          facingZ: -1,
          jumpPressed: i % 90 === 0,
          jumpHeld: i % 90 < 40,
          dashPressed: i % 120 === 0,
        };
        run.update(1 / 60, intent);
        const { x, y, z } = run.body;
        if (y < GROUND_Y && (x > right + 0.02 || x < -left - 0.02)) {
          offenders.push(`seed ${seed}: x ${x.toFixed(2)} y ${y.toFixed(2)} z ${z.toFixed(1)}`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  }, 120_000);
});
