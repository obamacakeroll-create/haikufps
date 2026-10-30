import { clamp, lerp } from '../core/math';

/** Samples per second. Playback interpolates between them, so this only has to look smooth. */
export const GHOST_HZ = 20;
const STEP = 1 / GHOST_HZ;
const FIELDS = 4;
/** Positions are stored as whole centimeters and yaw as whole milliradians. */
const POSITION_SCALE = 100;
const YAW_SCALE = 1000;
/** Longest ghost kept, in samples. Ten minutes at 20 Hz. Longer runs are cut short. */
const MAX_SAMPLES = GHOST_HZ * 600 * FIELDS;

/** The best run, replayable on the same canyon seed. */
export interface GhostTrack {
  readonly seed: number;
  readonly distance: number;
  /** Flat [x, y, z, yaw] groups in quantized units. */
  readonly samples: readonly number[];
}

export interface GhostPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Records the player's pose at a fixed rate during a run. */
export class GhostRecorder {
  private readonly samples: number[] = [];
  private clock = 0;

  /** Call once per simulation step. The sample is taken at the step where the clock passes its time. */
  update(dt: number, x: number, y: number, z: number, yaw: number): void {
    if (this.samples.length >= MAX_SAMPLES) return;
    this.clock += dt;
    while (this.clock >= STEP) {
      this.clock -= STEP;
      this.samples.push(
        Math.round(x * POSITION_SCALE),
        Math.round(y * POSITION_SCALE),
        Math.round(z * POSITION_SCALE),
        Math.round(yaw * YAW_SCALE),
      );
    }
  }

  track(seed: number, distance: number): GhostTrack {
    return { seed, distance, samples: [...this.samples] };
  }
}

/** The ghost's pose at `time` seconds into the run. Holds the last pose once the track runs out. */
export function sampleGhost(track: GhostTrack, time: number, out: GhostPose): GhostPose {
  const count = Math.floor(track.samples.length / FIELDS);
  if (count === 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    out.yaw = 0;
    return out;
  }
  const index = clamp(time * GHOST_HZ, 0, count - 1);
  const first = Math.floor(index);
  const second = Math.min(first + 1, count - 1);
  const t = index - first;
  const a = first * FIELDS;
  const b = second * FIELDS;
  const at = (k: number): number => track.samples[k] ?? 0;
  out.x = lerp(at(a) / POSITION_SCALE, at(b) / POSITION_SCALE, t);
  out.y = lerp(at(a + 1) / POSITION_SCALE, at(b + 1) / POSITION_SCALE, t);
  out.z = lerp(at(a + 2) / POSITION_SCALE, at(b + 2) / POSITION_SCALE, t);
  out.yaw = lerp(at(a + 3) / YAW_SCALE, at(b + 3) / YAW_SCALE, t);
  return out;
}

/** Reads a ghost from storage. A malformed track is dropped rather than failing the whole save. */
export function readGhost(raw: unknown): GhostTrack | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const fields = raw as Record<string, unknown>;
  const { seed, distance, samples } = fields;
  if (typeof seed !== 'number' || !Number.isFinite(seed)) return undefined;
  if (typeof distance !== 'number' || !Number.isFinite(distance)) return undefined;
  if (!Array.isArray(samples) || samples.length === 0 || samples.length > MAX_SAMPLES) return undefined;
  if (samples.length % FIELDS !== 0) return undefined;
  if (!samples.every((value) => typeof value === 'number' && Number.isFinite(value))) return undefined;
  return { seed, distance, samples: samples as number[] };
}
