import { Scene, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { Run } from '../src/game/run';
import { TIDE } from '../src/game/tide';
import { type Intent } from '../src/player/movement';
import { createToonRamp } from '../src/render/toon';

const DT = 1 / 60;

const idle: Intent = {
  wishX: 0,
  wishZ: 0,
  speedScale: 1,
  facingX: 0,
  facingZ: -1,
  jumpPressed: false,
  jumpHeld: false,
  dashPressed: false,
};

function makeRun(seed: number): Run {
  return new Run(new Scene(), { ramp: createToonRamp(), mottle: new Texture() }, seed);
}

function simulate(run: Run, seconds: number, intent: Intent): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps && run.status === 'running'; i++) run.update(DT, intent);
}

describe('Run', () => {
  it('holds the tide still during the grace period', () => {
    const run = makeRun(1);
    simulate(run, TIDE.graceSeconds - 0.1, idle);
    expect(run.gap).toBe(TIDE.startGap);
  });

  it('ends the run once a stationary player is caught by the tide', () => {
    const run = makeRun(2);
    simulate(run, 30, idle);
    expect(run.status).toBe('over');
    expect(run.gap).toBe(0);
  });

  it('counts distance from the farthest point reached, so backtracking never lowers it', () => {
    const run = makeRun(3);
    simulate(run, 2, { ...idle, wishZ: -1 });
    const reached = run.distance;
    expect(reached).toBeGreaterThan(15);
    simulate(run, 1, { ...idle, wishZ: 1 });
    expect(run.distance).toBeGreaterThanOrEqual(reached);
    expect(-run.body.z).toBeLessThan(run.distance - 5);
  });

  it('stops advancing once the run is over', () => {
    const run = makeRun(4);
    simulate(run, 30, idle);
    const time = run.time;
    run.update(DT, idle);
    expect(run.time).toBe(time);
  });
});
