import { type Color } from 'three';
import { type Vec3 } from '../core/math';
import { PALETTE } from '../render/palette';
import { type LiveSlot } from '../world/canyon';

export type EnemyKind = 'swarmling' | 'brute' | 'spitter' | 'diver' | 'mimic';

export const ENEMY_KINDS: readonly EnemyKind[] = ['swarmling', 'brute', 'spitter', 'diver', 'mimic'];

export interface EnemyStats {
  readonly hp: number;
  /** Radius of the hit sphere. Contact damage uses it too. */
  readonly radius: number;
  /** Share of rifle damage that lands. Armor lowers it. Other weapons always land in full. */
  readonly rifleScale: number;
  readonly score: number;
  /** Color of the droplets an enemy throws off when hit. */
  readonly color: Color;
}

export const ENEMY_STATS: Readonly<Record<EnemyKind, EnemyStats>> = {
  swarmling: { hp: 1, radius: 0.55, rifleScale: 1, score: 10, color: PALETTE.enemy.swarmling },
  brute: { hp: 6, radius: 1.05, rifleScale: 0.5, score: 60, color: PALETTE.enemy.brute },
  spitter: { hp: 3, radius: 0.7, rifleScale: 1, score: 30, color: PALETTE.enemy.spitter },
  diver: { hp: 2, radius: 0.8, rifleScale: 1, score: 35, color: PALETTE.enemy.diver },
  mimic: { hp: 4, radius: 1.2, rifleScale: 1, score: 80, color: PALETTE.enemy.mimic },
};

export type EnemyPhase = 'chase' | 'perched' | 'hover' | 'windup' | 'dive' | 'recover' | 'dormant';

export interface Enemy {
  readonly kind: EnemyKind;
  /** Per-enemy offset, so a swarm does not move in step. */
  readonly seed: number;
  /** Center at the end of the last simulation step. */
  x: number;
  y: number;
  z: number;
  /** Center at the start of the last step. Rendering blends between the two. */
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  /** Point a dive is aimed at, locked when the windup ends. */
  goalX: number;
  goalY: number;
  goalZ: number;
  hp: number;
  alive: boolean;
  phase: EnemyPhase;
  /** Seconds since spawn. Drives the wobble. */
  age: number;
  /** Seconds left in the current phase, or until the next action. */
  timer: number;
  /** Seconds until this enemy may hurt the player again. */
  cooldown: number;
  /** 1 right after a hit, fading to 0. */
  flash: number;
  /** Ledge or wall this enemy sits on. Its placement is followed through reshapes. */
  perch: LiveSlot | undefined;
  /** Lane side the enemy spawned on, -1 or 1. */
  readonly side: -1 | 1;
}

export interface EnemySpot extends Vec3 {
  readonly perch: LiveSlot | undefined;
}

const START_PHASE: Readonly<Record<EnemyKind, EnemyPhase>> = {
  swarmling: 'chase',
  brute: 'chase',
  spitter: 'perched',
  diver: 'hover',
  mimic: 'dormant',
};

/** First-action delay. Divers wait before their first dive, and spitters before their first spit. */
const START_TIMER: Readonly<Record<EnemyKind, number>> = {
  swarmling: 0,
  brute: 0,
  spitter: 1.5,
  diver: 3,
  mimic: 0,
};

export function createEnemy(kind: EnemyKind, seed: number, spot: EnemySpot): Enemy {
  return {
    kind,
    seed,
    x: spot.x,
    y: spot.y,
    z: spot.z,
    px: spot.x,
    py: spot.y,
    pz: spot.z,
    vx: 0,
    vy: 0,
    vz: 0,
    goalX: spot.x,
    goalY: spot.y,
    goalZ: spot.z,
    hp: ENEMY_STATS[kind].hp,
    alive: true,
    phase: START_PHASE[kind],
    age: 0,
    timer: START_TIMER[kind],
    cooldown: 0,
    flash: 0,
    perch: spot.perch,
    side: spot.x < 0 ? -1 : 1,
  };
}
