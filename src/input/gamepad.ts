import type { Settings } from '../core/settings';
import type { Action, InputSource, SourceSample, Vec2 } from './actions';

/** Indices from the W3C "standard" gamepad mapping. Chromium reports DualSense this way. */
export const PAD = {
  cross: 0,
  circle: 1,
  square: 2,
  triangle: 3,
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  options: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

/** Analog triggers count as held once they pass this value. */
export const TRIGGER_THRESHOLD = 0.35;

const BUTTON_BINDINGS: ReadonlyArray<readonly [number, readonly Action[]]> = [
  [PAD.cross, ['jump', 'confirm']],
  [PAD.circle, ['dash', 'back']],
  [PAD.square, ['reload']],
  [PAD.triangle, ['weaponNext']],
  [PAD.r1, ['weaponNext']],
  [PAD.l1, ['weaponPrev']],
  [PAD.options, ['pause']],
  [PAD.dpadUp, ['up']],
  [PAD.dpadDown, ['down']],
  [PAD.dpadLeft, ['left']],
  [PAD.dpadRight, ['right']],
];

export interface PadReading {
  readonly buttons: ReadonlyArray<{ readonly pressed: boolean; readonly value: number }>;
  readonly axes: ReadonlyArray<number>;
}

export interface PadFrame {
  held: Set<Action>;
  move: Vec2;
  look: Vec2;
}

/** Radial dead zone. Rescales so output starts at zero just outside the zone and reaches 1 at the rim. */
export function radialDeadzone(x: number, y: number, deadzone: number): Vec2 {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  const scale = scaled / magnitude;
  return { x: x * scale, y: y * scale };
}

function axis(pad: PadReading, index: number): number {
  return pad.axes[index] ?? 0;
}

function triggerDown(pad: PadReading, index: number): boolean {
  const button = pad.buttons[index];
  return button !== undefined && (button.pressed || button.value >= TRIGGER_THRESHOLD);
}

/** Pure translation from a raw pad reading to game actions and axes. */
export function readPad(pad: PadReading, settings: Settings, dt: number): PadFrame {
  const held = new Set<Action>();
  for (const [index, actions] of BUTTON_BINDINGS) {
    if (pad.buttons[index]?.pressed) {
      for (const action of actions) held.add(action);
    }
  }
  if (triggerDown(pad, PAD.r2)) held.add('fire');
  if (triggerDown(pad, PAD.l2)) held.add('aim');

  // Stick up reads as a negative axis value, so flip Y to make up positive.
  const move = radialDeadzone(axis(pad, 0), -axis(pad, 1), settings.stickDeadzone);
  const turn = radialDeadzone(axis(pad, 2), -axis(pad, 3), settings.stickDeadzone);
  const degreesPerSecond = settings.stickSensitivity * dt;
  const yDirection = settings.invertY ? -1 : 1;
  return {
    held,
    move,
    look: { x: turn.x * degreesPerSecond, y: turn.y * degreesPerSecond * yDirection },
  };
}

/** Prefers a standard-mapped pad, then any connected pad. */
export function pickGamepad<T extends { readonly connected: boolean; readonly mapping: string }>(
  pads: ReadonlyArray<T | null>,
): T | null {
  let fallback: T | null = null;
  for (const pad of pads) {
    if (pad === null || !pad.connected) continue;
    if (pad.mapping === 'standard') return pad;
    fallback ??= pad;
  }
  return fallback;
}

export class GamepadSource implements InputSource {
  readonly device = 'gamepad';
  private current: Gamepad | null = null;

  constructor(private readonly settings: () => Settings) {}

  /** The pad that answered the last sample, used for rumble. */
  get pad(): Gamepad | null {
    return this.current;
  }

  sample(dt: number): SourceSample {
    const pad =
      typeof navigator.getGamepads === 'function'
        ? pickGamepad(navigator.getGamepads())
        : null;
    this.current = pad;
    if (pad === null) {
      return { held: new Set(), pressed: new Set(), move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, active: false };
    }
    const frame = readPad(pad, this.settings(), dt);
    const active =
      frame.held.size > 0 ||
      frame.move.x !== 0 ||
      frame.move.y !== 0 ||
      frame.look.x !== 0 ||
      frame.look.y !== 0;
    return { held: frame.held, pressed: new Set(), move: frame.move, look: frame.look, active };
  }

  /** Dual-rumble through the Gamepad API. Silently does nothing where haptics are unsupported. */
  rumble(strong: number, weak: number, durationMs: number): void {
    const actuator = this.current?.vibrationActuator;
    if (actuator === undefined || typeof actuator.playEffect !== 'function') return;
    const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
    actuator
      .playEffect('dual-rumble', {
        startDelay: 0,
        duration: durationMs,
        strongMagnitude: clamp01(strong),
        weakMagnitude: clamp01(weak),
      })
      .catch(() => undefined);
  }
}
