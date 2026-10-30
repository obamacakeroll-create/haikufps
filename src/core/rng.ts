export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** An independent stream derived from this seed, so one system's draws never shift another's. */
  fork(salt: number): Rng;
}

function mix32(value: number): number {
  let h = value | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Seeded sfc32 generator. The same seed always yields the same sequence. */
export function createRng(seed: number): Rng {
  const origin = seed | 0;
  let a = mix32(origin);
  let b = mix32(origin ^ 0x9e3779b9);
  let c = mix32(origin ^ 0x85ebca6b);
  let d = mix32(origin ^ 0xc2b2ae35);

  const next = (): number => {
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };

  for (let i = 0; i < 16; i++) next();

  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    chance: (probability) => next() < probability,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new RangeError('pick() needs at least one item');
      return items[Math.floor(next() * items.length)] as T;
    },
    fork: (salt) => createRng(mix32(origin ^ mix32(salt))),
  };
}
