import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { Run, type RunInput } from '../src/game/run';
import { BODY } from '../src/player/movement';
import { separateCapsule, type Box } from '../src/world/collision';
import { QUIET, runAssets } from './support';

/**
 * A reshape moves a wall by up to a few centimeters per frame, so a body can end a frame that
 * close to a wall. Anything deeper than this would be the body really being inside the wall.
 */
const MAX_OVERLAP = 0.1;

describe('movement against the canyon walls', () => {
  it('never leaves the body inside a collider, with strafing, jumps, dashes, and reshapes', () => {
    const offenders: string[] = [];
    const nearby: Box[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const rng = createRng(seed * 13);
      const run = new Run(new Scene(), runAssets(), seed);
      let strafe = 0;
      for (let i = 0; i < 60 * 25 && run.status === 'running'; i++) {
        if (i % 30 === 0) strafe = rng.pick([-1, 0, 1]);
        const intent: RunInput = {
          ...QUIET,
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
        run.present(1, false);

        const { x, y, z } = run.body;
        for (const box of run.collidersNear(nearby)) {
          const probe = { x, y, z };
          if (!separateCapsule(probe, BODY.radius, BODY.height, box)) continue;
          const overlap = Math.hypot(probe.x - x, probe.y - y, probe.z - z);
          if (overlap > MAX_OVERLAP) {
            offenders.push(`seed ${seed}: overlap ${overlap.toFixed(2)} at x ${x.toFixed(2)} y ${y.toFixed(2)} z ${z.toFixed(1)}`);
            break;
          }
        }
        if (offenders.length > 0) break;
      }
    }
    expect(offenders).toEqual([]);
  }, 120_000);
});
