import { describe, expect, it } from 'vitest';
import { createBody, MOVE, stepBody, type Intent } from '../src/player/movement';
import { type Box } from '../src/world/collision';

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

function run(
  body: ReturnType<typeof createBody>,
  intent: Partial<Intent>,
  seconds: number,
  boxes: readonly Box[] = [],
  onStep?: (step: number) => void,
): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    stepBody(body, { ...idle, ...intent }, DT, boxes);
    onStep?.(i);
  }
}

describe('stepBody', () => {
  it('keeps a grounded body on the floor', () => {
    const body = createBody(0, 0, 0);
    run(body, {}, 1);
    expect(body.y).toBe(0);
    expect(body.grounded).toBe(true);
  });

  it('jumps to roughly the height the jump speed and gravity allow', () => {
    const body = createBody(0, 0, 0);
    let peak = 0;
    run(body, { jumpPressed: true }, 1.2, [], () => {
      peak = Math.max(peak, body.y);
    });
    const expected = (MOVE.jumpSpeed * MOVE.jumpSpeed) / (2 * MOVE.gravity);
    expect(peak).toBeGreaterThan(expected - 0.1);
    expect(peak).toBeLessThan(expected + 0.1);
  });

  it('thrusts with the jetpack while jump is held and drains fuel', () => {
    const body = createBody(0, 0, 0);
    run(body, { jumpPressed: true, jumpHeld: true }, 1);
    expect(body.y).toBeGreaterThan(7);
    expect(body.fuel).toBeCloseTo(1 - MOVE.jetDrain, 1);
  });

  it('refills fuel after the thrust rest', () => {
    const body = createBody(0, 0, 0);
    run(body, { jumpPressed: true, jumpHeld: true }, 1);
    const spent = body.fuel;
    run(body, {}, 2);
    expect(body.fuel).toBeGreaterThan(spent);
  });

  it('lands on the top face of a ledge', () => {
    const ledge: Box = { x: 0, y: 2.5, z: -5, hx: 2, hy: 0.5, hz: 3, yaw: 0 };
    const body = createBody(0, 4.5, -5);
    run(body, {}, 1, [ledge]);
    expect(body.y).toBeCloseTo(3);
    expect(body.grounded).toBe(true);
  });

  it('stops against a wall instead of passing through it', () => {
    const wall: Box = { x: 2, y: 2.5, z: 0, hx: 1, hy: 5, hz: 5, yaw: 0 };
    const body = createBody(0, 0, 0);
    run(body, { wishX: 1 }, 1, [wall]);
    expect(body.x).toBeLessThanOrEqual(1 - 0.4 + 0.01);
    expect(body.x).toBeGreaterThan(0.4);
  });

  it('dashes along the wish direction and then waits out the cooldown', () => {
    const body = createBody(0, 0, 0);
    stepBody(body, { ...idle, wishZ: -1, dashPressed: true }, DT, []);
    expect(body.vz).toBeCloseTo(-MOVE.dashSpeed);
    expect(body.dashCooldown).toBeCloseTo(MOVE.dashCooldown);

    run(body, {}, 0.3);
    stepBody(body, { ...idle, dashPressed: true }, DT, []);
    expect(body.dashTime).toBeLessThanOrEqual(0);
  });

  it('dashes forward when there is no movement input', () => {
    const body = createBody(0, 0, 0);
    stepBody(body, { ...idle, facingX: 0, facingZ: -1, dashPressed: true }, DT, []);
    expect(body.vz).toBeCloseTo(-MOVE.dashSpeed);
  });
});
