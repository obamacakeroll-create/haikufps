import { Scene, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { Canyon, type LiveSlot } from '../src/world/canyon';
import { LANE_HALF, LEDGE_MIN_BOTTOM, RESHAPE_LIMITS, basePose, constrainPose, wallGap, type Pose, type Slot } from '../src/world/layout';
import { createNoise } from '../src/procgen/noise';
import { RESHAPE, Reshaper, type ReshapeEvents, type ReshapePhase } from '../src/world/reshape';
import { createToonRamp } from '../src/render/toon';

const DT = 1 / 60;

/** Walls must stay outside the lane and ledges must stay above head height and below the ceiling. */
function assertWithinLimits(live: LiveSlot): void {
  const { box, slot } = live;
  if (slot.kind === 'wall') {
    const face = Math.abs(box.x) - box.hx;
    expect(face).toBeGreaterThanOrEqual(LANE_HALF + RESHAPE_LIMITS.wallClearance - 1e-9);
    expect(face).toBeLessThanOrEqual(Math.abs(slot.x) - slot.width / 2 + RESHAPE_LIMITS.wallRetract + 1e-9);
  } else {
    expect(box.y - box.hy).toBeGreaterThanOrEqual(LEDGE_MIN_BOTTOM - 1e-9);
    expect(box.y + box.hy).toBeLessThanOrEqual(RESHAPE_LIMITS.ledgeTopMax + 1e-9);
    expect(LANE_HALF + 1.5 - box.hx * 2).toBeGreaterThanOrEqual(RESHAPE_LIMITS.ledgeInnerMin - 1e-9);
  }
}

function makeCanyon(seed: number): Canyon {
  const canyon = new Canyon(new Scene(), seed, createNoise(seed), { ramp: createToonRamp(), mottle: new Texture() });
  canyon.update(0);
  canyon.flush();
  return canyon;
}

function allLive(canyon: Canyon): LiveSlot[] {
  return canyon.slotsBetween(-Infinity, Infinity, []);
}

describe('constrainPose', () => {
  it('keeps any requested pose within the limits, across slots and extreme requests', () => {
    const rng = createRng(77);
    for (let seed = 1; seed <= 25; seed++) {
      const canyon = makeCanyon(seed);
      for (const live of allLive(canyon)) {
        for (let i = 0; i < 20; i++) {
          const requested: Pose = {
            x: rng.range(-30, 30),
            y: rng.range(-20, 40),
            width: rng.range(0, 20),
          };
          const pose = constrainPose(live.slot, requested);
          const box = { x: pose.x, y: pose.y, z: live.slot.z, hx: pose.width / 2, hy: live.slot.height / 2, hz: live.slot.depth / 2, yaw: live.slot.yaw };
          live.box.x = box.x;
          live.box.y = box.y;
          live.box.hx = box.hx;
          assertWithinLimits(live);
        }
      }
    }
  });

  it('leaves the base pose untouched', () => {
    const canyon = makeCanyon(4);
    for (const live of allLive(canyon)) {
      expect(constrainPose(live.slot, basePose(live.slot))).toEqual(basePose(live.slot));
    }
  });

  it('places walls at the lane edge when pushed inward, not inside the lane', () => {
    const wall: Slot = {
      kind: 'wall',
      variant: 0,
      x: -(LANE_HALF + wallGap(1, -1) + 3.5),
      y: 7,
      z: -40,
      yaw: 0,
      width: 7,
      height: 16,
      depth: 12,
    };
    const pushed = constrainPose(wall, { x: -0.5, y: 7, width: 7 });
    expect(Math.abs(pushed.x) - 3.5).toBeCloseTo(LANE_HALF + RESHAPE_LIMITS.wallClearance);
  });
});

describe('Reshaper', () => {
  function simulate(
    seconds: number,
    seed: number,
    onPhase?: (phase: ReshapePhase, time: number) => void,
  ): { canyon: Canyon; reshaper: Reshaper; events: (keyof ReshapeEvents)[] } {
    const canyon = makeCanyon(seed);
    const reshaper = new Reshaper(createRng(seed ^ 0x55));
    const events: (keyof ReshapeEvents)[] = [];
    reshaper.events.on('telegraph', () => events.push('telegraph'));
    reshaper.events.on('move', () => events.push('move'));
    reshaper.events.on('settle', () => events.push('settle'));

    let playerZ = 0;
    let last: ReshapePhase = 'idle';
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps; i++) {
      const time = i * DT;
      playerZ -= 10 * DT;
      canyon.update(playerZ);
      reshaper.update(DT, time, playerZ, canyon);
      canyon.flush();
      if (reshaper.phase !== last) onPhase?.(reshaper.phase, time);
      last = reshaper.phase;
    }
    return { canyon, reshaper, events };
  }

  it('cycles telegraph, move, and settle in order, with the first reshape after the set delay', () => {
    const phases: [ReshapePhase, number][] = [];
    const { events } = simulate(RESHAPE.firstDelay + 6, 3, (phase, time) => phases.push([phase, time]));
    expect(events.slice(0, 3)).toEqual(['telegraph', 'move', 'settle']);
    expect(phases[0]?.[0]).toBe('telegraph');
    expect(phases[0]?.[1]).toBeGreaterThanOrEqual(RESHAPE.firstDelay - DT * 2);
  });

  it('keeps every moved slot within the limits at every frame, for many seeds', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { canyon, events } = simulate(60, seed);
      expect(events.filter((e) => e === 'settle').length).toBeGreaterThan(0);
      for (const live of allLive(canyon)) assertWithinLimits(live);
    }
  });

  it('never moves slots outside the zone, and the zone is always ahead of the player', () => {
    const canyon = makeCanyon(9);
    const reshaper = new Reshaper(createRng(99));
    const before = new Map(allLive(canyon).map((live) => [live, { x: live.x, y: live.y, width: live.width }]));
    let zone = { center: 0, depth: 0 };
    reshaper.events.on('telegraph', (z) => {
      zone = z;
    });

    let playerZ = 0;
    for (let i = 0; i < 60 * 12; i++) {
      canyon.update(playerZ);
      reshaper.update(DT, i * DT, playerZ, canyon);
      canyon.flush();
      if (reshaper.phase === 'telegraph') {
        expect(zone.center).toBeLessThan(playerZ - RESHAPE.leadDistance + 1);
      }
      playerZ -= 0.5 * DT;
    }
    for (const live of allLive(canyon)) {
      const start = before.get(live);
      if (start === undefined) continue;
      const inZone = live.slot.z <= zone.center + zone.depth / 2 && live.slot.z >= zone.center - zone.depth / 2;
      if (!inZone) expect(live.x).toBe(start.x);
    }
  });

  it('keeps the reshaped layout when a section unloads and reloads', () => {
    const canyon = makeCanyon(12);
    const reshaper = new Reshaper(createRng(12));
    let playerZ = 0;
    for (let i = 0; i < 60 * 9; i++) {
      canyon.update(playerZ);
      reshaper.update(DT, i * DT, playerZ, canyon);
      canyon.flush();
      playerZ -= 10 * DT;
    }
    const snapshot = new Map(allLive(canyon).map((live) => [live.slot, { x: live.x, y: live.y, width: live.width }]));
    // Walk far enough back to unload the reshaped sections, then return to them.
    canyon.update(-600);
    canyon.update(0);
    for (const live of allLive(canyon)) {
      const saved = snapshot.get(live.slot);
      if (saved !== undefined) expect(live.x).toBeCloseTo(saved.x);
    }
  });
});
