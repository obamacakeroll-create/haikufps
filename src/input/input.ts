import type { Emitter } from '../core/events';
import type { Action, InputDevice, InputSource, Vec2 } from './actions';

export type InputEvents = {
  device: InputDevice;
};

/** One simulation step's view of input. Built fresh each step. */
export interface Controls {
  readonly device: InputDevice;
  /** Length is at most 1. */
  readonly move: Readonly<Vec2>;
  /** Degrees this step, before any aim scaling. */
  readonly look: Readonly<Vec2>;
  held(action: Action): boolean;
  pressed(action: Action): boolean;
}

/** Merges every source into one set of actions and axes, and tracks which device last acted. */
export class InputManager {
  private activeDevice: InputDevice = 'keyboard';
  private previousHeld = new Set<Action>();

  constructor(
    private readonly sources: readonly InputSource[],
    private readonly events: Emitter<InputEvents>,
  ) {}

  get device(): InputDevice {
    return this.activeDevice;
  }

  poll(dt: number): Controls {
    const held = new Set<Action>();
    const pressed = new Set<Action>();
    const move = { x: 0, y: 0 };
    const look = { x: 0, y: 0 };

    const activeDevices: InputDevice[] = [];
    for (const source of this.sources) {
      const sample = source.sample(dt);
      for (const action of sample.held) held.add(action);
      for (const action of sample.pressed) pressed.add(action);
      move.x += sample.move.x;
      move.y += sample.move.y;
      look.x += sample.look.x;
      look.y += sample.look.y;
      if (sample.active) activeDevices.push(source.device);
    }

    // Keep the current device while it is still active, so two live sources cannot make it flicker.
    const first = activeDevices[0];
    if (first !== undefined && !activeDevices.includes(this.activeDevice)) {
      this.activeDevice = first;
      this.events.emit('device', first);
    }

    for (const action of held) {
      if (!this.previousHeld.has(action)) pressed.add(action);
    }
    this.previousHeld = held;

    const length = Math.hypot(move.x, move.y);
    if (length > 1) {
      move.x /= length;
      move.y /= length;
    }

    return {
      device: this.activeDevice,
      move,
      look,
      held: (action) => held.has(action),
      pressed: (action) => pressed.has(action),
    };
  }
}
