import { describe, expect, it } from 'vitest';
import { createEnemy } from '../src/combat/enemy';
import { rayBox, raySphere, traceShot, type Ray } from '../src/combat/ray';
import { type Box } from '../src/world/collision';

function ray(x: number, y: number, z: number, dx: number, dy: number, dz: number): Ray {
  return { x, y, z, dx, dy, dz };
}

describe('raySphere', () => {
  it('reports the entry distance to a sphere ahead', () => {
    expect(raySphere(ray(0, 0, 0, 0, 0, -1), { x: 0, y: 0, z: -10 }, 2)).toBeCloseTo(8, 9);
  });

  it('misses a sphere to the side or behind', () => {
    expect(raySphere(ray(0, 0, 0, 0, 0, -1), { x: 5, y: 0, z: -10 }, 2)).toBeUndefined();
    expect(raySphere(ray(0, 0, 0, 0, 0, -1), { x: 0, y: 0, z: 10 }, 2)).toBeUndefined();
  });

  it('counts a ray that starts inside the sphere as a hit at zero', () => {
    expect(raySphere(ray(0, 0, 0, 0, 0, -1), { x: 0, y: 0, z: 0.5 }, 2)).toBe(0);
  });
});

describe('rayBox', () => {
  const wall: Box = { x: 0, y: 2, z: -10, hx: 1, hy: 2, hz: 1, yaw: 0 };

  it('hits the near face and reports its outward normal', () => {
    const hit = rayBox(ray(0, 2, 0, 0, 0, -1), wall);
    expect(hit?.t).toBeCloseTo(9, 9);
    expect(hit?.nz).toBeCloseTo(1, 9);
    expect(hit?.nx).toBeCloseTo(0, 9);
  });

  it('misses a ray that passes beside the box', () => {
    expect(rayBox(ray(3, 2, 0, 0, 0, -1), wall)).toBeUndefined();
  });

  it('turns with the box yaw', () => {
    // Long along z, so a ray along x crosses it at x = ±0.5 unless the box is turned.
    const long: Box = { x: 0, y: 2, z: -10, hx: 0.5, hy: 2, hz: 5, yaw: 0 };
    const turned: Box = { ...long, yaw: Math.PI / 2 };
    expect(rayBox(ray(-8, 2, -10, 1, 0, 0), long)?.t).toBeCloseTo(7.5, 9);
    expect(rayBox(ray(-8, 2, -10, 1, 0, 0), turned)?.t).toBeCloseTo(3, 9);
  });
});

describe('traceShot', () => {
  it('prefers an enemy standing in front of the wall behind it', () => {
    const enemy = createEnemy('swarmling', 1, { x: 0, y: 1.5, z: -6, perch: undefined });
    const wall: Box = { x: 0, y: 2, z: -12, hx: 1, hy: 2, hz: 1, yaw: 0 };
    const trace = traceShot(ray(0, 1.5, 0, 0, 0, -1), 100, [wall], [enemy]);
    expect(trace.enemy).toBe(enemy);
    expect(trace.wall).toBeUndefined();
    expect(trace.distance).toBeCloseTo(6 - 0.55, 9);
  });

  it('stops at a wall that is closer than an enemy behind it', () => {
    const enemy = createEnemy('swarmling', 1, { x: 0, y: 1.5, z: -6, perch: undefined });
    const wall: Box = { x: 0, y: 2, z: -3, hx: 1, hy: 2, hz: 1, yaw: 0 };
    const trace = traceShot(ray(0, 1.5, 0, 0, 0, -1), 100, [wall], [enemy]);
    expect(trace.enemy).toBeUndefined();
    expect(trace.wall).toBeDefined();
    expect(trace.distance).toBeCloseTo(2, 9);
  });

  it('reports the range when nothing is hit', () => {
    const trace = traceShot(ray(0, 1.5, 0, 0, 0, -1), 40, [], []);
    expect(trace.distance).toBe(40);
    expect(trace.enemy).toBeUndefined();
    expect(trace.wall).toBeUndefined();
  });

  it('skips enemies that are already dead', () => {
    const enemy = createEnemy('swarmling', 1, { x: 0, y: 1.5, z: -6, perch: undefined });
    enemy.alive = false;
    expect(traceShot(ray(0, 1.5, 0, 0, 0, -1), 100, [], [enemy]).enemy).toBeUndefined();
  });
});
