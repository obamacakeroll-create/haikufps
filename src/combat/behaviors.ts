import { clamp, type Vec3 } from '../core/math';
import { type Rng } from '../core/rng';
import { BODY } from '../player/movement';
import { LANE_HALF, LEDGE_HEIGHT } from '../world/layout';
import { ENEMY_STATS, type Enemy, type EnemyKind } from './enemy';

/** What enemies may do to the world. Combat implements it, so behaviors stay free of scene code. */
export interface EnemyWorld {
  /** The player's body. Enemies measure from its feet. */
  readonly player: Vec3;
  readonly rng: Rng;
  hurt(amount: number, source: EnemyKind): void;
  shove(x: number, y: number, z: number): void;
  spit(from: Vec3, to: Vec3): void;
  /** Removes an enemy that spent itself on the player. It does not count as a kill. */
  detonate(enemy: Enemy): void;
  /** A dormant mimic shows itself. */
  awaken(enemy: Enemy): void;
}

export const HOVER_HEIGHT = 7.5;

const PLAYER_CENTER = BODY.height / 2;
const FLASH_DECAY = 5;
const SETTLE_RATE = 6;

const SWARM_SPEED = 9;
const SWARM_HIT = 10;
const SWARM_CONTACT = 0.45;

const BRUTE_SPEED = 3.8;
const BRUTE_HIT = 22;
const BRUTE_COOLDOWN = 1.4;
const BRUTE_SHOVE = 9;

const SPIT_INTERVAL = 2.6;
const SPIT_WINDUP = 0.5;
const SPIT_RANGE = 70;

const HOVER_SECONDS = 4.5;
const DIVE_TRIGGER_HEIGHT = 3.2;
const DIVE_TRIGGER_RANGE = 45;
const DIVE_WINDUP = 0.7;
const DIVE_SPEED = 26;
const DIVE_REACH = 2.1;
const DIVE_HIT = 30;
const RECOVER_SECONDS = 1.2;
const RECOVER_SPEED = 12;

const AMBUSH_RANGE = 4;
const MIMIC_WINDUP = 0.55;
const MIMIC_SPEED = 14;
const MIMIC_HIT = 35;
const MIMIC_COOLDOWN = 1.2;

/** Moves an enemy's velocity toward a target at `speed`, with `rate` controlling how sharply it turns. */
function steer(enemy: Enemy, target: Vec3, speed: number, rate: number, dt: number): void {
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const dz = target.z - enemy.z;
  const length = Math.hypot(dx, dy, dz);
  const scale = length > 1e-6 ? speed / length : 0;
  const blend = Math.min(1, rate * dt);
  enemy.vx += (dx * scale - enemy.vx) * blend;
  enemy.vy += (dy * scale - enemy.vy) * blend;
  enemy.vz += (dz * scale - enemy.vz) * blend;
}

function advance(enemy: Enemy, dt: number): void {
  enemy.x += enemy.vx * dt;
  enemy.y += enemy.vy * dt;
  enemy.z += enemy.vz * dt;
}

function settle(enemy: Enemy, dt: number): void {
  const fade = Math.exp(-SETTLE_RATE * dt);
  enemy.vx *= fade;
  enemy.vy *= fade;
  enemy.vz *= fade;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function keepInLane(enemy: Enemy): void {
  const half = LANE_HALF - ENEMY_STATS[enemy.kind].radius;
  enemy.x = clamp(enemy.x, -half, half);
}

/** Center of the player's body, where enemies aim. */
function playerCenter(world: EnemyWorld): Vec3 {
  return { x: world.player.x, y: world.player.y + PLAYER_CENTER, z: world.player.z };
}

/** Advances one enemy by `dt` seconds of simulated time. */
export function stepEnemy(enemy: Enemy, world: EnemyWorld, dt: number): void {
  enemy.age += dt;
  enemy.cooldown = Math.max(0, enemy.cooldown - dt);
  enemy.flash = Math.max(0, enemy.flash - dt * FLASH_DECAY);
  switch (enemy.kind) {
    case 'swarmling':
      return stepSwarmling(enemy, world, dt);
    case 'brute':
      return stepBrute(enemy, world, dt);
    case 'spitter':
      return stepSpitter(enemy, world, dt);
    case 'diver':
      return stepDiver(enemy, world, dt);
    case 'mimic':
      return stepMimic(enemy, world, dt);
  }
}

/** Swarmlings dart at the player with a wobble, and spend themselves on contact. */
function stepSwarmling(enemy: Enemy, world: EnemyWorld, dt: number): void {
  const center = playerCenter(world);
  const wobble = Math.sin(enemy.age * 6 + enemy.seed) * 1.4;
  const lift = Math.sin(enemy.age * 4 + enemy.seed) * 0.8;
  steer(enemy, { x: center.x + wobble, y: center.y + lift, z: center.z }, SWARM_SPEED, 3.5, dt);
  advance(enemy, dt);
  keepInLane(enemy);
  enemy.y = clamp(enemy.y, 0.6, 6);

  if (distance(enemy, center) < ENEMY_STATS.swarmling.radius + SWARM_CONTACT) {
    world.hurt(SWARM_HIT, 'swarmling');
    world.detonate(enemy);
  }
}

/** Brutes plod along the floor and shove the player sideways on contact. */
function stepBrute(enemy: Enemy, world: EnemyWorld, dt: number): void {
  const radius = ENEMY_STATS.brute.radius;
  const { player } = world;
  steer(enemy, { x: player.x, y: radius, z: player.z }, BRUTE_SPEED, 2, dt);
  advance(enemy, dt);
  keepInLane(enemy);
  enemy.y = radius;
  enemy.vy = 0;

  const dx = player.x - enemy.x;
  const dz = player.z - enemy.z;
  if (Math.hypot(dx, dz) < radius + 0.5 && enemy.cooldown <= 0) {
    enemy.cooldown = BRUTE_COOLDOWN;
    world.hurt(BRUTE_HIT, 'brute');
    world.shove(dx < 0 ? -BRUTE_SHOVE : BRUTE_SHOVE, 3, 0);
  }
}

/** Spitters stay put, on a ledge when one is ahead, and lob globs at the player. */
function stepSpitter(enemy: Enemy, world: EnemyWorld, dt: number): void {
  const { perch } = enemy;
  if (perch !== undefined) {
    enemy.x = perch.x;
    enemy.y = perch.y + LEDGE_HEIGHT / 2 + ENEMY_STATS.spitter.radius * 0.9;
    enemy.z = perch.slot.z;
  }

  enemy.timer -= dt;
  enemy.phase = enemy.timer < SPIT_WINDUP ? 'windup' : 'perched';
  if (enemy.timer > 0) return;

  enemy.timer = SPIT_INTERVAL * world.rng.range(0.85, 1.15);
  const center = playerCenter(world);
  if (distance(enemy, center) < SPIT_RANGE) {
    world.spit({ x: enemy.x, y: enemy.y, z: enemy.z }, center);
  }
}

/**
 * Divers hover ahead of the player and dive when the player is airborne or the hover runs out. The
 * windup is the telegraph. The dive aims where the player was when it ended, so moving away works.
 */
function stepDiver(enemy: Enemy, world: EnemyWorld, dt: number): void {
  const { player } = world;
  const radius = ENEMY_STATS.diver.radius;

  switch (enemy.phase) {
    case 'hover': {
      const hoverX = clamp(player.x * 0.6, -LANE_HALF + 1, LANE_HALF - 1);
      const bob = Math.sin(enemy.age * 1.7 + enemy.seed) * 0.7;
      steer(enemy, { x: hoverX, y: HOVER_HEIGHT + bob, z: player.z - 16 }, 9, 2.5, dt);
      advance(enemy, dt);
      enemy.timer -= dt;
      const airborne = player.y > DIVE_TRIGGER_HEIGHT && Math.abs(player.z - enemy.z) < DIVE_TRIGGER_RANGE;
      if (enemy.timer <= 0 || airborne) startWindup(enemy);
      break;
    }
    case 'windup': {
      settle(enemy, dt);
      advance(enemy, dt);
      const center = playerCenter(world);
      enemy.goalX = center.x;
      enemy.goalY = center.y;
      enemy.goalZ = center.z;
      enemy.timer -= dt;
      if (enemy.timer <= 0) enemy.phase = 'dive';
      break;
    }
    case 'dive': {
      steer(enemy, { x: enemy.goalX, y: enemy.goalY, z: enemy.goalZ }, DIVE_SPEED, 40, dt);
      advance(enemy, dt);
      const reached = distance(enemy, { x: enemy.goalX, y: enemy.goalY, z: enemy.goalZ }) < 1;
      if (reached || enemy.y <= radius) {
        if (distance(enemy, playerCenter(world)) < DIVE_REACH) world.hurt(DIVE_HIT, 'diver');
        enemy.phase = 'recover';
        enemy.timer = RECOVER_SECONDS;
      }
      break;
    }
    case 'recover': {
      steer(enemy, { x: player.x, y: HOVER_HEIGHT, z: player.z - 16 }, RECOVER_SPEED, 4, dt);
      advance(enemy, dt);
      enemy.timer -= dt;
      if (enemy.timer <= 0) {
        enemy.phase = 'hover';
        enemy.timer = HOVER_SECONDS;
      }
      break;
    }
    default:
      break;
  }
  enemy.y = Math.max(radius, enemy.y);
}

function startWindup(enemy: Enemy): void {
  enemy.phase = 'windup';
  enemy.timer = DIVE_WINDUP;
}

/**
 * A mimic sits flush on a wall and looks like it. It shows itself when a reshape moves its zone,
 * when the player comes close, or when it is shot. Then it lunges.
 */
function stepMimic(enemy: Enemy, world: EnemyWorld, dt: number): void {
  const { player } = world;
  if (enemy.phase === 'dormant') {
    const { perch } = enemy;
    if (perch !== undefined) {
      const inner = Math.abs(perch.x) - perch.width / 2;
      enemy.x = enemy.side * (inner + 0.2);
      enemy.y = clamp(perch.y, 1.6, 4);
      enemy.z = perch.slot.z;
    }
    if (Math.abs(player.z - enemy.z) < AMBUSH_RANGE && Math.abs(player.x - enemy.x) < AMBUSH_RANGE) {
      world.awaken(enemy);
    }
    return;
  }

  if (enemy.phase === 'windup') {
    enemy.timer -= dt;
    if (enemy.timer <= 0) enemy.phase = 'chase';
    return;
  }

  const center = playerCenter(world);
  steer(enemy, center, MIMIC_SPEED, 6, dt);
  advance(enemy, dt);
  if (distance(enemy, center) < ENEMY_STATS.mimic.radius + 0.5 && enemy.cooldown <= 0) {
    enemy.cooldown = MIMIC_COOLDOWN;
    world.hurt(MIMIC_HIT, 'mimic');
    world.shove(enemy.vx * 0.4, 3, enemy.vz * 0.4);
  }
}

/** Shows a dormant mimic. Returns false when it was already awake. */
export function awakenMimic(enemy: Enemy): boolean {
  if (enemy.phase !== 'dormant') return false;
  enemy.perch = undefined;
  enemy.phase = 'windup';
  enemy.timer = MIMIC_WINDUP;
  enemy.vx = 0;
  enemy.vy = 0;
  enemy.vz = 0;
  return true;
}
