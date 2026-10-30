export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Eases 0 to 1 with a smooth start and finish. Input is clamped to [0, 1]. */
export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}
