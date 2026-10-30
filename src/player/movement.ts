import { GROUND_NORMAL_Y, separateCapsule, type Box, type Contact } from '../world/collision';
import { CEILING } from '../world/layout';

export const BODY = {
  radius: 0.4,
  height: 1.8,
  eyeHeight: 1.62,
} as const;

export const MOVE = {
  walkSpeed: 12,
  groundAccel: 70,
  airAccel: 26,
  gravity: 30,
  terminalSpeed: 40,
  jumpSpeed: 9.5,
  jetAccel: 46,
  jetMaxRise: 9,
  /** Fuel is a 0 to 1 fraction. At 0.42 per second, a full tank lasts about 2.4 seconds of thrust. */
  jetDrain: 0.42,
  fuelRegen: 0.45,
  /** Seconds after thrust before fuel starts to refill. */
  fuelRest: 0.4,
  dashSpeed: 26,
  dashTime: 0.18,
  dashCooldown: 0.8,
  /** How quickly shoves fade, per second. */
  knockDecay: 4,
  /** Limit on lateral movement. Walls stop the player well before this. */
  xLimit: 8,
  /** Longest sub-step, so a fast body cannot skip over a thin wall. */
  maxSubstep: 0.12,
  maxSubsteps: 24,
} as const;

export interface Body {
  /** Feet position. */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  /** 0 to 1. */
  fuel: number;
  /** Seconds of fuel rest left before refilling starts. */
  fuelRest: number;
  dashTime: number;
  dashCooldown: number;
  dashX: number;
  dashZ: number;
  /** Horizontal shove from blasts and recoil. It fades on its own and does not count toward walking. */
  kx: number;
  kz: number;
}

export interface Intent {
  /** Wish direction in world space, length at most 1. */
  wishX: number;
  wishZ: number;
  /** Scales walking speed, for example while aiming down sights. */
  speedScale: number;
  /** Unit vector used for a dash with no movement input. */
  facingX: number;
  facingZ: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  dashPressed: boolean;
}

export function createBody(x: number, y: number, z: number): Body {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: true,
    fuel: 1,
    fuelRest: 0,
    dashTime: 0,
    dashCooldown: 0,
    dashX: 0,
    dashZ: 0,
    kx: 0,
    kz: 0,
  };
}

/** Moves `current` toward `target` by at most `maxDelta`, in the plane. */
function approach(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

function startDash(body: Body, intent: Intent): void {
  const length = Math.hypot(intent.wishX, intent.wishZ);
  const useWish = length >= 0.2;
  const dirX = useWish ? intent.wishX / length : intent.facingX;
  const dirZ = useWish ? intent.wishZ / length : intent.facingZ;
  body.dashX = dirX;
  body.dashZ = dirZ;
  body.dashTime = MOVE.dashTime;
  body.dashCooldown = MOVE.dashCooldown;
}

/** One simulation step of player movement. Mutates `body` in place. */
export function stepBody(body: Body, intent: Intent, dt: number, boxes: readonly Box[]): void {
  body.dashCooldown = Math.max(0, body.dashCooldown - dt);
  const knockFade = Math.exp(-MOVE.knockDecay * dt);
  body.kx *= knockFade;
  body.kz *= knockFade;
  if (intent.dashPressed && body.dashCooldown <= 0 && body.dashTime <= 0) startDash(body, intent);

  let standing = body.grounded;
  let thrusting = false;

  if (body.dashTime > 0) {
    body.dashTime -= dt;
    body.vx = body.dashX * MOVE.dashSpeed;
    body.vz = body.dashZ * MOVE.dashSpeed;
    body.vy = 0;
  } else {
    const target = MOVE.walkSpeed * intent.speedScale;
    const accel = (standing ? MOVE.groundAccel : MOVE.airAccel) * dt;
    body.vx = approach(body.vx, intent.wishX * target, accel);
    body.vz = approach(body.vz, intent.wishZ * target, accel);

    if (standing && intent.jumpPressed) {
      body.vy = MOVE.jumpSpeed;
      standing = false;
    }
    if (!standing && intent.jumpHeld && body.fuel > 0) {
      thrusting = true;
      body.vy = Math.min(MOVE.jetMaxRise, body.vy + MOVE.jetAccel * dt);
      body.fuel = Math.max(0, body.fuel - MOVE.jetDrain * dt);
      body.fuelRest = MOVE.fuelRest;
    } else {
      body.vy = Math.max(-MOVE.terminalSpeed, body.vy - MOVE.gravity * dt);
    }
  }

  if (!thrusting) {
    body.fuelRest = Math.max(0, body.fuelRest - dt);
    if (body.fuelRest === 0) body.fuel = Math.min(1, body.fuel + MOVE.fuelRegen * dt);
  }

  // Split the step so no sub-step moves farther than the thinnest collider.
  const travel = Math.hypot(body.vx, body.vy, body.vz) * dt;
  const steps = Math.min(MOVE.maxSubsteps, Math.max(1, Math.ceil(travel / MOVE.maxSubstep)));
  const h = dt / steps;
  standing = false;

  for (let step = 0; step < steps; step++) {
    body.x += (body.vx + body.kx) * h;
    body.y += body.vy * h;
    body.z += (body.vz + body.kz) * h;

    if (body.y < 0) {
      body.y = 0;
      if (body.vy < 0) body.vy = 0;
      standing = true;
    }
    for (const box of boxes) {
      const hit = separateCapsule(body, BODY.radius, BODY.height, box);
      if (!hit) continue;
      if (hit.ny > GROUND_NORMAL_Y) standing = true;
      slide(body, hit);
    }
    if (body.y > CEILING) {
      body.y = CEILING;
      if (body.vy > 0) body.vy = 0;
    }
    if (Math.abs(body.x) > MOVE.xLimit) {
      body.x = Math.sign(body.x) * MOVE.xLimit;
      body.vx = 0;
    }
  }

  body.grounded = standing;
}

/**
 * Adds a shove: horizontal parts go into the fading knock, and a vertical push adds to the fall
 * speed, so a blast below the player can launch them.
 */
export function shove(body: Body, x: number, y: number, z: number): void {
  body.kx += x;
  body.kz += z;
  body.vy += y;
  if (y > 0) body.grounded = false;
}

/** Removes the velocity that pushes into a surface, so the body slides along it. */
function slide(body: Body, normal: Contact): void {
  const into = body.vx * normal.nx + body.vy * normal.ny + body.vz * normal.nz;
  if (into < 0) {
    body.vx -= normal.nx * into;
    body.vy -= normal.ny * into;
    body.vz -= normal.nz * into;
  }
  // Shoves are cut the same way, so a blast cannot drive the body through a wall.
  const shoved = body.kx * normal.nx + body.kz * normal.nz;
  if (shoved < 0) {
    body.kx -= normal.nx * shoved;
    body.kz -= normal.nz * shoved;
  }
}
