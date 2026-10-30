import type { AimMode } from '../core/settings';

/**
 * Aim-down-sights state. In toggle mode a press flips the state, so the button can be released.
 * In hold mode the state follows the button. Callers release it on weapon switch and on death,
 * so toggle aim cannot get stuck on.
 */
export class AimState {
  private on = false;

  constructor(private mode: AimMode) {}

  get active(): boolean {
    return this.on;
  }

  setMode(mode: AimMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.on = false;
  }

  update(held: boolean, pressed: boolean): boolean {
    if (this.mode === 'hold') {
      this.on = held;
    } else if (pressed) {
      this.on = !this.on;
    }
    return this.on;
  }

  release(): void {
    this.on = false;
  }
}
