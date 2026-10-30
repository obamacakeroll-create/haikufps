import type { Settings } from '../core/settings';
import type { Action, InputSource, SourceSample, Vec2 } from './actions';

/** Keys are `KeyboardEvent.code` values, and mouse buttons are `Mouse0`/`Mouse2`. */
const BINDINGS: Readonly<Record<string, readonly Action[]>> = {
  KeyW: ['up'],
  KeyS: ['down'],
  KeyA: ['left'],
  KeyD: ['right'],
  ArrowUp: ['up'],
  ArrowDown: ['down'],
  ArrowLeft: ['left'],
  ArrowRight: ['right'],
  Space: ['jump'],
  ShiftLeft: ['dash'],
  ShiftRight: ['dash'],
  KeyR: ['reload'],
  KeyE: ['weaponNext'],
  KeyQ: ['weaponPrev'],
  Digit1: ['weapon1'],
  Digit2: ['weapon2'],
  Digit3: ['weapon3'],
  Enter: ['confirm'],
  Backspace: ['back'],
  Escape: ['pause'],
  F3: ['debug'],
  Mouse0: ['fire'],
  Mouse2: ['aim'],
};

const MOUSE_CODES = ['Mouse0', 'Mouse2'] as const;

/**
 * Mouse look is ignored for this long after pointer lock starts. Browsers can report a jump in movement
 * as the lock takes hold, and a jump that size would spin the view.
 */
const LOCK_SETTLE_MS = 250;
/**
 * A single mouse event this large is a jump from the pointer lock, not a flick. Flicks come in
 * events far below it, so an event this big is dropped rather than applied.
 */
const MAX_LOOK_PIXELS = 100;

export class KeyboardMouseSource implements InputSource {
  readonly device = 'keyboard';
  private readonly codesDown = new Set<string>();
  private readonly codesLatched = new Set<string>();
  private lookX = 0;
  private lookY = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly settings: () => Settings,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    window.addEventListener('blur', this.reset);
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  sample(): SourceSample {
    const held = new Set<Action>();
    for (const code of this.codesDown) {
      for (const action of BINDINGS[code] ?? []) held.add(action);
    }
    const pressed = new Set<Action>();
    for (const code of this.codesLatched) {
      for (const action of BINDINGS[code] ?? []) pressed.add(action);
    }
    this.codesLatched.clear();

    const settings = this.settings();
    const yDirection = settings.invertY ? 1 : -1;
    const look: Vec2 = {
      x: this.lookX * settings.mouseSensitivity,
      y: this.lookY * settings.mouseSensitivity * yDirection,
    };
    this.lookX = 0;
    this.lookY = 0;

    const move: Vec2 = {
      x: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
      y: (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0),
    };
    const active =
      pressed.size > 0 || look.x !== 0 || look.y !== 0 || move.x !== 0 || move.y !== 0;
    return { held, pressed, move, look, active };
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (BINDINGS[event.code] === undefined) return;
    event.preventDefault();
    if (!event.repeat) this.codesLatched.add(event.code);
    this.codesDown.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.codesDown.delete(event.code);
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    const code = `Mouse${event.button}`;
    if (!(MOUSE_CODES as readonly string[]).includes(code)) return;
    this.codesDown.add(code);
    this.codesLatched.add(code);
  };

  private readonly onMouseUp = (): void => {
    for (const code of MOUSE_CODES) this.codesDown.delete(code);
  };

  private lockedAt = Number.NEGATIVE_INFINITY;

  private readonly onLockChange = (): void => {
    if (document.pointerLockElement === this.canvas) this.lockedAt = performance.now();
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas) return;
    if (performance.now() - this.lockedAt < LOCK_SETTLE_MS) return;
    if (Math.abs(event.movementX) > MAX_LOOK_PIXELS || Math.abs(event.movementY) > MAX_LOOK_PIXELS) return;
    this.lookX += event.movementX;
    this.lookY += event.movementY;
  };

  private readonly reset = (): void => {
    this.codesDown.clear();
    this.codesLatched.clear();
    this.lookX = 0;
    this.lookY = 0;
  };
}
