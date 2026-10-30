import { describe, expect, it } from 'vitest';
import { Emitter } from '../src/core/events';
import type { Action, InputDevice, InputSource, Vec2 } from '../src/input/actions';
import { InputManager, type InputEvents } from '../src/input/input';

interface Step {
  held?: Action[];
  pressed?: Action[];
  move?: Vec2;
  look?: Vec2;
  active?: boolean;
}

/** Plays a script one step per sample, then repeats the last step. */
function fakeSource(device: InputDevice, script: Step[]): InputSource {
  let index = 0;
  return {
    device,
    sample: () => {
      const step = script[Math.min(index, script.length - 1)] ?? {};
      index++;
      return {
        held: new Set(step.held),
        pressed: new Set(step.pressed),
        move: step.move ?? { x: 0, y: 0 },
        look: step.look ?? { x: 0, y: 0 },
        active: step.active ?? false,
      };
    },
  };
}

describe('InputManager actions', () => {
  it('reports a press once when an action goes from up to held', () => {
    const source = fakeSource('keyboard', [{ held: ['fire'] }, { held: ['fire'] }, { held: [] }]);
    const manager = new InputManager([source], new Emitter<InputEvents>());

    expect(manager.poll(1 / 60).pressed('fire')).toBe(true);
    expect(manager.poll(1 / 60).pressed('fire')).toBe(false);
    expect(manager.poll(1 / 60).held('fire')).toBe(false);
  });

  it('keeps taps that a source latched between steps', () => {
    const source = fakeSource('keyboard', [{ pressed: ['jump'] }]);
    const manager = new InputManager([source], new Emitter<InputEvents>());
    expect(manager.poll(1 / 60).pressed('jump')).toBe(true);
  });

  it('normalizes diagonal movement across sources', () => {
    const source = fakeSource('keyboard', [{ move: { x: 1, y: 1 }, active: true }]);
    const manager = new InputManager([source], new Emitter<InputEvents>());
    const { move } = manager.poll(1 / 60);
    expect(Math.hypot(move.x, move.y)).toBeCloseTo(1, 6);
  });
});

describe('InputManager active device', () => {
  it('stays on the keyboard while both sources are active', () => {
    const events: InputDevice[] = [];
    const emitter = new Emitter<InputEvents>();
    emitter.on('device', (device) => events.push(device));

    const keyboard = fakeSource('keyboard', [{ active: true }]);
    const gamepad = fakeSource('gamepad', [{ active: true }]);
    const manager = new InputManager([keyboard, gamepad], emitter);

    manager.poll(1 / 60);
    manager.poll(1 / 60);
    expect(manager.device).toBe('keyboard');
    expect(events).toEqual([]);
  });

  it('switches to the gamepad once when only the pad is active', () => {
    const events: InputDevice[] = [];
    const emitter = new Emitter<InputEvents>();
    emitter.on('device', (device) => events.push(device));

    const keyboard = fakeSource('keyboard', [{ active: false }]);
    const gamepad = fakeSource('gamepad', [{ active: true }, { active: true }]);
    const manager = new InputManager([keyboard, gamepad], emitter);

    manager.poll(1 / 60);
    manager.poll(1 / 60);
    expect(manager.device).toBe('gamepad');
    expect(events).toEqual(['gamepad']);
  });
});
