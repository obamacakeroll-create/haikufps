export const ACTIONS = [
  'fire',
  'aim',
  'jump',
  'dash',
  'reload',
  'weaponNext',
  'weaponPrev',
  'weapon1',
  'weapon2',
  'weapon3',
  'pause',
  'confirm',
  'back',
  'up',
  'down',
  'left',
  'right',
  'debug',
] as const;

export type Action = (typeof ACTIONS)[number];

export interface Vec2 {
  x: number;
  y: number;
}

export type InputDevice = 'keyboard' | 'gamepad';

/** What one input source reports for a single simulation step. */
export interface SourceSample {
  held: Set<Action>;
  /** Presses that began between samples. Taps shorter than a step would otherwise be lost. */
  pressed: Set<Action>;
  /** Movement axes in [-1, 1]. +y is forward and +x is right. */
  move: Vec2;
  /** Look delta in degrees for this step. +x turns right and +y looks up. */
  look: Vec2;
  /** True when this source saw real input, which is used to decide the active device. */
  active: boolean;
}

export interface InputSource {
  readonly device: InputDevice;
  sample(dt: number): SourceSample;
}
