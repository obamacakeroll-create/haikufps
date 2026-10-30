import { describe, expect, it } from 'vitest';
import {
  CEILING,
  generateSection,
  LANE_HALF,
  LEDGE_MIN_BOTTOM,
  SECTION_LENGTH,
  sectionIndexAt,
  slotBox,
  type Slot,
} from '../src/world/layout';

const SEEDS = [1, 7, 42, 9001, -3];
const INDICES = Array.from({ length: 40 }, (_, i) => i - 3);

/** World-space x of each corner of a yawed box, so the lane check can use the exact outline. */
function cornerXs(slot: Slot): number[] {
  const box = slotBox(slot);
  const cos = Math.cos(box.yaw);
  const sin = Math.sin(box.yaw);
  const xs: number[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lx = sx * box.hx;
      const lz = sz * box.hz;
      xs.push(box.x + lx * cos + lz * sin);
    }
  }
  return xs;
}

describe('generateSection', () => {
  it('is deterministic for a seed and index', () => {
    expect(generateSection(7, 4)).toEqual(generateSection(7, 4));
  });

  it('tiles along z with no gaps between neighbouring sections', () => {
    for (let index = -2; index < 10; index++) {
      expect(generateSection(1, index).zFar).toBeCloseTo(generateSection(1, index + 1).zNear);
    }
  });

  it('keeps every wall outside the lane so the path stays open', () => {
    for (const seed of SEEDS) {
      for (const index of INDICES) {
        for (const slot of generateSection(seed, index).slots) {
          if (slot.kind !== 'wall') continue;
          for (const x of cornerXs(slot)) expect(Math.abs(x)).toBeGreaterThanOrEqual(LANE_HALF);
        }
      }
    }
  });

  it('keeps ledges above head height and below the ceiling', () => {
    for (const seed of SEEDS) {
      for (const index of INDICES) {
        for (const slot of generateSection(seed, index).slots) {
          if (slot.kind !== 'ledge') continue;
          const box = slotBox(slot);
          expect(box.y - box.hy).toBeGreaterThanOrEqual(LEDGE_MIN_BOTTOM);
          expect(box.y + box.hy).toBeLessThan(CEILING);
        }
      }
    }
  });

  it('places each ledge inside its own section', () => {
    for (const seed of SEEDS) {
      for (const index of INDICES) {
        const section = generateSection(seed, index);
        for (const slot of section.slots) {
          if (slot.kind !== 'ledge') continue;
          const box = slotBox(slot);
          expect(box.z - box.hz).toBeGreaterThanOrEqual(section.zFar - 1e-9);
          expect(box.z + box.hz).toBeLessThanOrEqual(section.zNear + 1e-9);
        }
      }
    }
  });

  it('produces ledges often enough to climb', () => {
    let ledges = 0;
    for (const index of INDICES) ledges += generateSection(3, index).slots.filter((s) => s.kind === 'ledge').length;
    expect(ledges).toBeGreaterThan(INDICES.length / 2);
  });
});

describe('sectionIndexAt', () => {
  it('maps z to the section that covers it', () => {
    expect(sectionIndexAt(-1)).toBe(0);
    expect(sectionIndexAt(-SECTION_LENGTH - 1)).toBe(1);
    expect(sectionIndexAt(SECTION_LENGTH / 2)).toBe(-1);
  });
});
