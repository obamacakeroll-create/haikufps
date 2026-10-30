export type AimMode = 'toggle' | 'hold';

export interface Settings {
  aimMode: AimMode;
  /** Degrees of turn per pixel of mouse movement. */
  mouseSensitivity: number;
  /** Degrees per second at full stick deflection. */
  stickSensitivity: number;
  stickDeadzone: number;
  invertY: boolean;
  fov: number;
  rumble: boolean;
  reducedMotion: boolean;
  /** Race the best run's ghost on its canyon. */
  raceGhost: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
}

export const DEFAULT_SETTINGS: Settings = {
  aimMode: 'toggle',
  mouseSensitivity: 0.12,
  stickSensitivity: 220,
  stickDeadzone: 0.12,
  invertY: false,
  fov: 75,
  rumble: true,
  reducedMotion: false,
  raceGhost: true,
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.9,
};

export type NumericKey = {
  [K in keyof Settings]: Settings[K] extends number ? K : never;
}[keyof Settings];

type BooleanKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

export const NUMERIC_BOUNDS: Readonly<Record<NumericKey, readonly [min: number, max: number]>> = {
  mouseSensitivity: [0.02, 0.6],
  stickSensitivity: [60, 400],
  stickDeadzone: [0, 0.4],
  fov: [60, 100],
  masterVolume: [0, 1],
  musicVolume: [0, 1],
  sfxVolume: [0, 1],
};

/** Clamp to the key's bounds and round to three decimals, so repeated slider steps never drift. */
export function clampNumeric(key: NumericKey, value: number): number {
  const [min, max] = NUMERIC_BOUNDS[key];
  const clamped = Math.min(max, Math.max(min, value));
  return Math.round(clamped * 1000) / 1000;
}

function readNumber(source: Record<string, unknown>, key: NumericKey): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS[key];
  return clampNumeric(key, value);
}

function readBoolean(source: Record<string, unknown>, key: BooleanKey): boolean {
  const value = source[key];
  return typeof value === 'boolean' ? value : DEFAULT_SETTINGS[key];
}

/** Accepts anything from storage and returns a fully valid Settings object. */
export function normalizeSettings(raw: unknown): Settings {
  const source: Record<string, unknown> =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const aim = source.aimMode;
  return {
    aimMode: aim === 'toggle' || aim === 'hold' ? aim : DEFAULT_SETTINGS.aimMode,
    mouseSensitivity: readNumber(source, 'mouseSensitivity'),
    stickSensitivity: readNumber(source, 'stickSensitivity'),
    stickDeadzone: readNumber(source, 'stickDeadzone'),
    invertY: readBoolean(source, 'invertY'),
    fov: readNumber(source, 'fov'),
    rumble: readBoolean(source, 'rumble'),
    reducedMotion: readBoolean(source, 'reducedMotion'),
    raceGhost: readBoolean(source, 'raceGhost'),
    masterVolume: readNumber(source, 'masterVolume'),
    musicVolume: readNumber(source, 'musicVolume'),
    sfxVolume: readNumber(source, 'sfxVolume'),
  };
}
