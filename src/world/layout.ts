import { clamp } from '../core/math';
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
export const LEDGE_HEIGHT = 0.9;

/**
 * Limits on where reshaping may move solid geometry. Every reshape target is clamped to these, so
 * the lane stays open and every ledge stays reachable however the canyon has been rearranged.
 */
export const RESHAPE_LIMITS = {
  /** Smallest distance between a wall face and the lane's edge. */
  wallClearance: 0.6,
  /** How far a wall face may move away from the lane, beyond its place in the run. */
  wallRetract: 2,
  /** Ledge top range. The bottom stays above head height, and the top stays within jetpack reach. */
  ledgeTopMin: LEDGE_MIN_BOTTOM + LEDGE_HEIGHT,
  ledgeTopMax: 4.8,
  /** A ledge's inner edge may not come closer to the centerline than this. */
  ledgeInnerMin: 1.6,
  /** How far a ledge may widen or narrow from its generated width. */
  ledgeReach: 0.8,
} as const;

/** Where a slot sits and how wide it is. Walls and ledges are the only things reshaping moves. */
export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

export function basePose(slot: Slot): Pose {
  return { x: slot.x, y: slot.y, width: slot.width };
}

/** Clamps a requested pose to the reshape limits. Returns a new pose. */
export function constrainPose(slot: Slot, pose: Pose): Pose {
  const side = slot.x < 0 ? -1 : 1;
  if (slot.kind === 'wall') {
    const baseFace = Math.abs(slot.x) - slot.width / 2;
    const face = clamp(
      Math.abs(pose.x) - slot.width / 2,
      LANE_HALF + RESHAPE_LIMITS.wallClearance,
      baseFace + RESHAPE_LIMITS.wallRetract,
    );
    return { x: side * (face + slot.width / 2), y: slot.y, width: slot.width };
  }

  // The outer edge stays buried in the wall. Only the inner edge and the height move.
  const widest = Math.min(slot.width + RESHAPE_LIMITS.ledgeReach, LEDGE_OUTER_EDGE - RESHAPE_LIMITS.ledgeInnerMin);
  const width = clamp(pose.width, slot.width - RESHAPE_LIMITS.ledgeReach, widest);
  const top = clamp(pose.y + LEDGE_HEIGHT / 2, RESHAPE_LIMITS.ledgeTopMin, RESHAPE_LIMITS.ledgeTopMax);
  return { x: side * (LEDGE_OUTER_EDGE - width / 2), y: top - LEDGE_HEIGHT / 2, width };
}

export function lerpPose(from: Pose, to: Pose, t: number): Pose {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    width: from.width + (to.width - from.width) * t,
  };
}


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
      const top = rng.range(RESHAPE_LIMITS.ledgeTopMin, 4.3);
      slots.push({
        kind: 'ledge',
        variant: 0,
        x: side * (innerEdge + LEDGE_OUTER_EDGE) / 2,
        y: top - LEDGE_HEIGHT / 2,
        z: rng.range(zFar + depth / 2, zNear - depth / 2),
        yaw: 0,
        width,
        height: LEDGE_HEIGHT,
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
