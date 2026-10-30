import { Emitter } from '../core/events';
import { clamp, smoothstep } from '../core/math';
import { type Rng } from '../core/rng';
import { type Canyon, type LiveSlot } from './canyon';
import { basePose, constrainPose, lerpPose, RESHAPE_LIMITS, type Pose, type Slot } from './layout';

export const RESHAPE = {
  /** Seconds of run time before the first reshape. */
  firstDelay: 6,
  /** Seconds between reshapes at the start and at the end of the ramp. */
  intervalStart: 12,
  intervalEnd: 8,
  intervalRampSeconds: 180,
  /**
   * Distance from the player to the zone's near edge. Far enough that the move ends before the
   * player arrives, close enough that the telegraph is readable.
   */
  leadDistance: 50,
  zoneDepth: 36,
  telegraphSeconds: 1.2,
  moveSeconds: 1.4,
  /** Share of the slots in a zone that move. The rest hold still, so the canyon stays readable. */
  moveChance: 0.6,
} as const;

export type ReshapePhase = 'idle' | 'telegraph' | 'moving';

export interface ReshapeZone {
  /** Center of the zone along z. */
  readonly center: number;
  readonly depth: number;
}

export interface ReshapeEvents {
  /** The zone is marked and the player is warned. Nothing has moved yet. */
  telegraph: ReshapeZone;
  /** Slots start to ease toward their new placements. */
  move: { zone: ReshapeZone; slots: readonly LiveSlot[] };
  /** Every moving slot has reached its place. */
  settle: ReshapeZone;
}

interface Plan {
  readonly live: LiveSlot;
  readonly from: Pose;
  readonly to: Pose;
}

/** A random placement for a slot. `constrainPose` decides what is allowed. */
function requestedPose(slot: Slot, rng: Rng): Pose {
  const base = basePose(slot);
  if (slot.kind === 'wall') {
    // Negative pushes the face toward the lane, positive pulls it back. The limits stop it at the lane.
    const side = slot.x < 0 ? -1 : 1;
    const face = Math.abs(base.x) - slot.width / 2 + rng.range(-1, RESHAPE_LIMITS.wallRetract);
    return { x: side * (face + slot.width / 2), y: base.y, width: base.width };
  }
  return {
    x: base.x,
    y: base.y + rng.range(-1.2, 1.2),
    width: base.width + rng.range(-RESHAPE_LIMITS.ledgeReach, RESHAPE_LIMITS.ledgeReach),
  };
}

/**
 * Runs the reshape cycle: wait, telegraph a zone ahead of the player, ease the walls and ledges in
 * it to new places, then wait again. The zone is always ahead, so the player never sees a slot move
 * under them.
 */
export class Reshaper {
  readonly events = new Emitter<ReshapeEvents>();
  private phaseValue: ReshapePhase = 'idle';
  private timer: number = RESHAPE.firstDelay;
  private zoneValue: ReshapeZone = { center: 0, depth: RESHAPE.zoneDepth };
  private progressValue = 0;
  private plans: Plan[] = [];
  private readonly candidates: LiveSlot[] = [];

  constructor(private readonly rng: Rng) {}

  get phase(): ReshapePhase {
    return this.phaseValue;
  }

  get zone(): ReshapeZone {
    return this.zoneValue;
  }

  /** 0 to 1 through the current move. */
  get progress(): number {
    return this.progressValue;
  }

  update(dt: number, runTime: number, playerZ: number, canyon: Canyon): void {
    this.timer -= dt;
    switch (this.phaseValue) {
      case 'idle':
        if (this.timer <= 0) this.startTelegraph(playerZ, canyon);
        break;
      case 'telegraph':
        if (this.timer <= 0) this.startMove();
        break;
      case 'moving':
        this.progressValue = clamp(1 - this.timer / RESHAPE.moveSeconds, 0, 1);
        this.ease(canyon, smoothstep(this.progressValue));
        if (this.timer <= 0) this.settle(runTime, canyon);
        break;
    }
  }

  private startTelegraph(playerZ: number, canyon: Canyon): void {
    const near = playerZ - RESHAPE.leadDistance;
    const far = near - RESHAPE.zoneDepth;
    this.zoneValue = { center: (near + far) / 2, depth: RESHAPE.zoneDepth };

    this.plans = [];
    for (const live of canyon.slotsBetween(far, near, this.candidates)) {
      if (!this.rng.chance(RESHAPE.moveChance)) continue;
      this.plans.push({
        live,
        from: { x: live.x, y: live.y, width: live.width },
        to: constrainPose(live.slot, requestedPose(live.slot, this.rng)),
      });
    }

    this.phaseValue = 'telegraph';
    this.timer = RESHAPE.telegraphSeconds;
    this.events.emit('telegraph', this.zoneValue);
  }

  private startMove(): void {
    this.phaseValue = 'moving';
    this.timer = RESHAPE.moveSeconds;
    this.progressValue = 0;
    this.events.emit('move', { zone: this.zoneValue, slots: this.plans.map((plan) => plan.live) });
  }

  private ease(canyon: Canyon, t: number): void {
    for (const plan of this.plans) {
      const pose = lerpPose(plan.from, plan.to, t);
      canyon.setPose(plan.live, pose.x, pose.y, pose.width);
    }
  }

  private settle(runTime: number, canyon: Canyon): void {
    this.ease(canyon, 1);
    this.plans = [];
    this.progressValue = 1;
    this.phaseValue = 'idle';
    this.timer = this.nextInterval(runTime);
    this.events.emit('settle', this.zoneValue);
  }

  private nextInterval(runTime: number): number {
    const ramp = clamp(runTime / RESHAPE.intervalRampSeconds, 0, 1);
    const base = RESHAPE.intervalStart + (RESHAPE.intervalEnd - RESHAPE.intervalStart) * ramp;
    return base * this.rng.range(0.85, 1.15);
  }
}
