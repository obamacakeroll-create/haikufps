import { clamp, lerp } from '../core/math';
import { type Rng } from '../core/rng';
import { type EnemyKind } from './enemy';

export const SPAWN = {
  firstDelay: 3,
  startInterval: 2.4,
  endInterval: 0.8,
  startAlive: 3,
  endAlive: 12,
  /** Seconds of run time to reach the hardest settings. */
  rampSeconds: 180,
} as const;

interface Gate {
  /** Run time before this kind can appear. */
  readonly from: number;
  readonly weight: number;
}

const GATES: Readonly<Record<Exclude<EnemyKind, 'swarmling'>, Gate>> = {
  spitter: { from: 18, weight: 0.8 },
  diver: { from: 30, weight: 0.6 },
  brute: { from: 40, weight: 0.6 },
  mimic: { from: 55, weight: 0.4 },
};

/** The single difficulty curve. Everything that gets harder with time reads from here. */
export function difficulty(time: number): number {
  return clamp(time / SPAWN.rampSeconds, 0, 1);
}

export function spawnInterval(time: number): number {
  return lerp(SPAWN.startInterval, SPAWN.endInterval, difficulty(time));
}

export function aliveCap(time: number): number {
  return Math.round(lerp(SPAWN.startAlive, SPAWN.endAlive, difficulty(time)));
}

/** Relative chance of each kind at `time`. Kinds not yet introduced are left out. */
export function kindWeights(time: number): ReadonlyArray<readonly [EnemyKind, number]> {
  // Gated kinds ramp in from half weight, so the first appearance is not a flood.
  const ramp = 0.5 + 0.5 * difficulty(time);
  const weights: Array<readonly [EnemyKind, number]> = [['swarmling', 1]];
  for (const [kind, gate] of Object.entries(GATES) as Array<[Exclude<EnemyKind, 'swarmling'>, Gate]>) {
    if (time >= gate.from) weights.push([kind, gate.weight * ramp]);
  }
  return weights;
}

export interface SpawnOrder {
  readonly kind: EnemyKind;
  readonly count: number;
}

export class Spawner {
  private timer: number = SPAWN.firstDelay;

  constructor(private readonly rng: Rng) {}

  /** Advances the spawn clock. Returns an order when one is due and the field has room. */
  update(dt: number, time: number, alive: number): SpawnOrder | undefined {
    this.timer -= dt;
    if (this.timer > 0) return undefined;
    if (alive >= aliveCap(time)) {
      this.timer = 0.25;
      return undefined;
    }
    const kind = this.pick(time);
    this.timer = spawnInterval(time) * this.rng.range(0.8, 1.2);
    return { kind, count: kind === 'swarmling' ? this.rng.int(3, 5) : 1 };
  }

  private pick(time: number): EnemyKind {
    const weights = kindWeights(time);
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.rng.next() * total;
    for (const [kind, weight] of weights) {
      roll -= weight;
      if (roll < 0) return kind;
    }
    return 'swarmling';
  }
}
