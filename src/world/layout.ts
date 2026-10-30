import { createRng } from '../core/rng';
import type { Box } from './collision';

/** Half the open floor between the walls. The lane is always clear of wall geometry. */
export const LANE_HALF = 5;
/** Length of one canyon section along z. */
export const SECTION_LENGTH = 36;
/** Invisible ceiling. Walls rise past it, but the jetpack cannot climb above it. */
export const CEILING = 30;
/** Ledges sit above this height so a standing player can walk underneath them. */
export const LEDGE_MIN_BOTTOM = 2;

export interface SlabSize {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

/** Wall geometry is built once per variant. Each instance scales it slightly. */
export const WALL_VARIANTS: readonly SlabSize[] = [
  { width: 7, height: 16, depth: 12 },
  { width: 9, height: 24, depth: 14 },
  { width: 6, height: 30, depth: 10 },
  { width: 8, height: 20, depth: 16 },
];

/** Ledge geometry is built once and stretched per instance. */
export const LEDGE_BASE: SlabSize = { width: 4, height: 1, depth: 6 };

const LEDGE_CHANCE = 0.55;
const WALL_GAP_MIN = 0.9;
const WALL_GAP_MAX = 1.3;
const LEDGE_OUTER_EDGE = LANE_HALF + 1.5;

export type SlotKind = 'wall' | 'ledge';

/**
 * One piece of solid canyon. The base transform is what the player and the renderer see now.
 * Reshaping will move these transforms later, so keep it in one place.
 */
export interface Slot {
  readonly kind: SlotKind;
  /** Index into WALL_VARIANTS. Ledges use 0. */
  readonly variant: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export interface Section {
  readonly index: number;
  /** Edge nearest the spawn. Larger z is closer to the start. */
  readonly zNear: number;
  /** Edge farthest along the run. */
  readonly zFar: number;
  readonly slots: readonly Slot[];
}

/** Sections are numbered along the run. Section k covers z from -k * length to -(k + 1) * length. */
export function sectionIndexAt(z: number): number {
  // Adding 0 turns -0 into 0, so Map keys for section 0 always match.
  return Math.floor(-z / SECTION_LENGTH) + 0;
}

/**
 * Distance from the lane's edge to one side's wall face. It stays fixed for the whole run, so the
 * faces never step and a player sliding along a wall cannot catch on a seam.
 */
export function wallGap(runSeed: number, side: -1 | 1): number {
  return createRng((runSeed ^ (side < 0 ? 0x2545f491 : 0x9e3779b9)) | 0).range(WALL_GAP_MIN, WALL_GAP_MAX);
}

export function generateSection(runSeed: number, index: number): Section {
  const rng = createRng((runSeed ^ Math.imul(index, 0x27d4eb2d)) | 0);
  const zNear = -index * SECTION_LENGTH;
  const zFar = zNear - SECTION_LENGTH;
  const slots: Slot[] = [];

  const sides: readonly (-1 | 1)[] = [-1, 1];
  for (const side of sides) {
    // Walls start at the run's wall face and run the full section depth. They overlap slightly so
    // no gaps show between them.
    const face = LANE_HALF + wallGap(runSeed, side);
    for (let cursor = zNear; cursor > zFar; ) {
      const variant = rng.int(0, WALL_VARIANTS.length - 1);
      const base = WALL_VARIANTS[variant] ?? WALL_VARIANTS[0]!;
      const width = base.width * rng.range(0.94, 1.06);
      const height = base.height * rng.range(0.85, 1.15);
      const depth = base.depth * rng.range(0.92, 1.08);
      slots.push({
        kind: 'wall',
        variant,
        x: side * (face + width / 2),
        // The base sits one unit under the floor so no seam shows at the ground.
        y: height / 2 - 1,
        z: cursor - depth / 2,
        yaw: 0,
        width,
        height,
        depth,
      });
      cursor -= depth * rng.range(0.85, 1);
    }

    // A ledge protrudes into the lane above head height. The floor under it stays clear.
    if (rng.chance(LEDGE_CHANCE)) {
      const protrude = rng.range(1.2, 2.2);
      const innerEdge = LANE_HALF - protrude;
      const width = LEDGE_OUTER_EDGE - innerEdge;
      const depth = rng.range(4.5, 7);
      const height = 0.9;
      const top = rng.range(2.9, 4.3);
      slots.push({
        kind: 'ledge',
        variant: 0,
        x: side * (innerEdge + LEDGE_OUTER_EDGE) / 2,
        y: top - height / 2,
        z: rng.range(zFar + depth / 2, zNear - depth / 2),
        yaw: 0,
        width,
        height,
        depth,
      });
    }
  }

  return { index, zNear, zFar, slots };
}

export function slotBox(slot: Slot): Box {
  return {
    x: slot.x,
    y: slot.y,
    z: slot.z,
    hx: slot.width / 2,
    hy: slot.height / 2,
    hz: slot.depth / 2,
    yaw: slot.yaw,
  };
}
