import { type Action, type InputDevice } from '../input/actions';

/** Keyboard and mouse names for each action. */
const KEYBOARD: Partial<Record<Action, string>> = {
  confirm: 'Enter',
  back: 'Esc',
  pause: 'Esc',
  jump: 'Space',
  dash: 'Shift',
  fire: 'Left click',
  aim: 'Right click',
  reload: 'R',
  weaponNext: 'Wheel',
  weapon1: '1',
  weapon2: '2',
  weapon3: '3',
};

/** DualSense names for each action, in the standard mapping's layout. */
const GAMEPAD: Partial<Record<Action, string>> = {
  confirm: 'Cross',
  back: 'Circle',
  pause: 'Options',
  jump: 'Cross',
  dash: 'Circle',
  fire: 'R2',
  aim: 'L2',
  reload: 'Square',
  weaponNext: 'Triangle',
};

/** The name to show for an action on the active device, so prompts match what the player presses. */
export function glyph(action: Action, device: InputDevice): string {
  const table = device === 'gamepad' ? GAMEPAD : KEYBOARD;
  return table[action] ?? action;
}
