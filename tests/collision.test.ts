import { describe, expect, it } from 'vitest';
import { separateCapsule, type Box } from '../src/world/collision';

const RADIUS = 0.4;
const HEIGHT = 1.8;

function box(overrides: Partial<Box> = {}): Box {
  return { x: 0, y: 0, z: 0, hx: 1, hy: 2, hz: 2, yaw: 0, ...overrides };
}

describe('separateCapsule', () => {
  it('stands a feet-level capsule on the top face and reports ground', () => {
    const feet = { x: 0, y: 0.95, z: 0 };
    const hit = separateCapsule(feet, RADIUS, HEIGHT, box({ hy: 1 }));
    expect(hit?.ny).toBeCloseTo(1);
    expect(feet.y).toBeCloseTo(1);
  });

  it('ignores a capsule that is clear of the box', () => {
    const feet = { x: 3, y: 0, z: 0 };
    expect(separateCapsule(feet, RADIUS, HEIGHT, box())).toBeUndefined();
    expect(feet.x).toBe(3);
  });

  it('pushes a capsule out through a side face', () => {
    const feet = { x: 1.2, y: -1, z: 0 };
    const hit = separateCapsule(feet, RADIUS, HEIGHT, box());
    expect(hit?.nx).toBeCloseTo(1);
    expect(feet.x).toBeCloseTo(1.4);
  });

  it('respects the box yaw, so a turned box pushes along its rotated face', () => {
    // A quarter turn swaps the box's long axis onto world x, so its world z half extent is hx.
    const feet = { x: 0, y: 0, z: 1.2 };
    const hit = separateCapsule(feet, RADIUS, HEIGHT, box({ yaw: Math.PI / 2 }));
    expect(hit?.nz).toBeCloseTo(1);
    expect(feet.z).toBeCloseTo(1.4);
  });

  it('exits through the nearest face when the capsule starts inside the box', () => {
    const feet = { x: 0.2, y: 0, z: 0 };
    const hit = separateCapsule(feet, RADIUS, HEIGHT, box());
    expect(hit?.nx).toBe(1);
    expect(feet.x).toBeCloseTo(1.4);
  });
});
