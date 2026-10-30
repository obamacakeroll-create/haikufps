import { type Vec3 } from '../core/math';
import { type Box } from '../world/collision';
import { ENEMY_STATS, type Enemy } from './enemy';

export interface Ray extends Vec3 {
  /** Unit direction. */
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
}

/** Entry distance along the ray into a sphere. Undefined on a miss or when the sphere is behind. */
export function raySphere(ray: Ray, center: Vec3, radius: number): number | undefined {
  const ox = ray.x - center.x;
  const oy = ray.y - center.y;
  const oz = ray.z - center.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const b = ox * ray.dx + oy * ray.dy + oz * ray.dz;
  const discriminant = b * b - c;
  if (discriminant < 0) return undefined;
  const t = -b - Math.sqrt(discriminant);
  return t >= 0 ? t : undefined;
}

export interface BoxHit {
  readonly t: number;
  /** Surface normal at the entry face, in world space. */
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

/**
 * Entry into a yawed box. The ray is moved into the box's frame, using the same mapping as
 * `separateCapsule`, so shots and bodies agree about where the walls are. Rays that start inside a
 * box miss it, because a player cannot shoot from inside a wall.
 */
export function rayBox(ray: Ray, box: Box): BoxHit | undefined {
  const cos = Math.cos(box.yaw);
  const sin = Math.sin(box.yaw);
  const px = ray.x - box.x;
  const pz = ray.z - box.z;
  const origin = [px * cos - pz * sin, ray.y - box.y, px * sin + pz * cos];
  const dir = [ray.dx * cos - ray.dz * sin, ray.dy, ray.dx * sin + ray.dz * cos];
  const half = [box.hx, box.hy, box.hz];

  let tNear = -Infinity;
  let tFar = Infinity;
  let nearAxis = 0;
  let nearSign = 0;
  for (let axis = 0; axis < 3; axis++) {
    const o = origin[axis] ?? 0;
    const d = dir[axis] ?? 0;
    const h = half[axis] ?? 0;
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(o) > h) return undefined;
      continue;
    }
    let tEnter = (-h - o) / d;
    let tExit = (h - o) / d;
    // The entry face is the one on the side the ray comes from.
    let sign = -1;
    if (tEnter > tExit) {
      [tEnter, tExit] = [tExit, tEnter];
      sign = 1;
    }
    if (tEnter > tNear) {
      tNear = tEnter;
      nearAxis = axis;
      nearSign = sign;
    }
    tFar = Math.min(tFar, tExit);
    if (tNear > tFar) return undefined;
  }
  if (tFar < 0 || tNear < 0) return undefined;

  const local = [0, 0, 0];
  local[nearAxis] = nearSign;
  const nx = (local[0] ?? 0) * cos + (local[2] ?? 0) * sin;
  const nz = -(local[0] ?? 0) * sin + (local[2] ?? 0) * cos;
  return { t: tNear, nx, ny: local[1] ?? 0, nz };
}

export interface ShotTrace {
  /** Distance to the first thing hit, or to the range limit when nothing was hit. */
  readonly distance: number;
  readonly enemy: Enemy | undefined;
  /** Canyon surface struck first, if no enemy was closer. */
  readonly wall: BoxHit | undefined;
}

/** Finds whatever a shot strikes first: a living enemy, a canyon wall, or nothing. */
export function traceShot(ray: Ray, range: number, boxes: readonly Box[], enemies: readonly Enemy[]): ShotTrace {
  let wallDistance = range;
  let wall: BoxHit | undefined;
  for (const box of boxes) {
    const hit = rayBox(ray, box);
    if (hit !== undefined && hit.t <= wallDistance) {
      wallDistance = hit.t;
      wall = hit;
    }
  }

  let enemyDistance = wallDistance;
  let enemy: Enemy | undefined;
  for (const candidate of enemies) {
    if (!candidate.alive) continue;
    const t = raySphere(ray, candidate, ENEMY_STATS[candidate.kind].radius);
    if (t !== undefined && t < enemyDistance) {
      enemyDistance = t;
      enemy = candidate;
    }
  }

  if (enemy !== undefined) return { distance: enemyDistance, enemy, wall: undefined };
  return { distance: wallDistance, enemy: undefined, wall };
}
