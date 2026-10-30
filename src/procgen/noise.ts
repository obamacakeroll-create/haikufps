import { createRng } from '../core/rng';

export interface Noise {
  /** Smooth value noise in [-1, 1]. */
  sample(x: number, y: number, z: number): number;
  /** Octave sum of `sample`, normalized to roughly [-1, 1]. */
  fbm(x: number, y: number, z: number, octaves?: number): number;
}

const fade = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Seeded 3D value noise, so the same seed always shapes the same rocks. */
export function createNoise(seed: number): Noise {
  const rng = createRng(seed);
  const values = new Float32Array(256);
  for (let i = 0; i < 256; i++) values[i] = rng.next() * 2 - 1;

  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = rng.int(0, i);
    const swap = perm[i] ?? 0;
    perm[i] = perm[j] ?? 0;
    perm[j] = swap;
  }

  const p = (i: number): number => perm[i & 255] ?? 0;
  const lattice = (x: number, y: number, z: number): number => values[p(p(p(x) + y) + z)] ?? 0;

  const sample = (x: number, y: number, z: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const u = fade(x - xi);
    const v = fade(y - yi);
    const w = fade(z - zi);
    const x00 = lerp(lattice(xi, yi, zi), lattice(xi + 1, yi, zi), u);
    const x10 = lerp(lattice(xi, yi + 1, zi), lattice(xi + 1, yi + 1, zi), u);
    const x01 = lerp(lattice(xi, yi, zi + 1), lattice(xi + 1, yi, zi + 1), u);
    const x11 = lerp(lattice(xi, yi + 1, zi + 1), lattice(xi + 1, yi + 1, zi + 1), u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
  };

  const fbm = (x: number, y: number, z: number, octaves = 4): number => {
    let total = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      total += amplitude * sample(x * frequency, y * frequency, z * frequency);
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2.02;
    }
    return total / norm;
  };

  return { sample, fbm };
}
