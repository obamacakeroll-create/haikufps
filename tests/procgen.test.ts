import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { createNoise } from '../src/procgen/noise';
import { buildFloor, buildRock, buildSlab, paintStrata } from '../src/procgen/geometry';
import { PALETTE } from '../src/render/palette';

function allFinite(values: ArrayLike<number>): boolean {
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) return false;
  }
  return true;
}

describe('createNoise', () => {
  it('is deterministic for a seed', () => {
    const a = createNoise(5);
    const b = createNoise(5);
    expect(a.sample(1.3, -2.7, 0.4)).toBe(b.sample(1.3, -2.7, 0.4));
    expect(a.fbm(3.1, 4.2, 5.3)).toBe(b.fbm(3.1, 4.2, 5.3));
  });

  it('stays within [-1, 1]', () => {
    const noise = createNoise(9);
    const rng = createRng(1);
    for (let i = 0; i < 2000; i++) {
      const x = rng.range(-50, 50);
      const y = rng.range(-50, 50);
      const z = rng.range(-50, 50);
      expect(Math.abs(noise.sample(x, y, z))).toBeLessThanOrEqual(1);
      expect(Math.abs(noise.fbm(x, y, z))).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe('procedural geometry', () => {
  const noise = createNoise(3);

  it('builds finite slabs that stay near their nominal size', () => {
    const geometry = buildSlab(noise, 8, 20, 10, 6);
    const position = geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(0);
    expect(allFinite(position.array)).toBe(true);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox?.getSize(geometry.boundingBox.min.clone());
    expect(size?.y ?? 0).toBeGreaterThan(15);
    expect(size?.y ?? 0).toBeLessThan(25);
  });

  it('builds faceted rocks with per-face normals', () => {
    const geometry = buildRock(noise, 1.5, 1);
    expect(geometry.getIndex()).toBeNull();
    expect(geometry.getAttribute('normal')).toBeDefined();
    expect(allFinite(geometry.getAttribute('position').array)).toBe(true);
  });

  it('lifts the floor by noise without leaving it flat', () => {
    const geometry = buildFloor(noise, { width: 40, depth: 40, segmentsX: 10, segmentsZ: 10 });
    const y = geometry.getAttribute('position');
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < y.count; i++) {
      min = Math.min(min, y.getY(i));
      max = Math.max(max, y.getY(i));
    }
    expect(max - min).toBeGreaterThan(0.01);
  });

  it('keeps the flat lane at ground level and places the floor at its center', () => {
    const geometry = buildFloor(noise, {
      width: 40,
      depth: 40,
      segmentsX: 40,
      segmentsZ: 20,
      centerZ: -100,
      flatHalfWidth: 7,
    });
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getX(i)) <= 7) expect(position.getY(i)).toBeCloseTo(0, 9);
    }
    const zs = Array.from({ length: position.count }, (_, i) => position.getZ(i));
    expect((Math.min(...zs) + Math.max(...zs)) / 2).toBeCloseTo(-100);
  });

  it('paints strata with palette colors', () => {
    const geometry = buildSlab(noise, 8, 20, 10, 4);
    paintStrata(geometry, PALETTE.strata, noise, 2.6);
    const color = geometry.getAttribute('color');
    expect(color.itemSize).toBe(3);
    expect(color.count).toBe(geometry.getAttribute('position').count);
    expect(allFinite(color.array)).toBe(true);
    for (let i = 0; i < color.array.length; i++) {
      expect(color.array[i]).toBeGreaterThanOrEqual(0);
      expect(color.array[i]).toBeLessThanOrEqual(1);
    }
  });
});
