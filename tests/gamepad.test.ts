import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/settings';
import {
  PAD,
  pickGamepad,
  radialDeadzone,
  readPad,
  type PadReading,
} from '../src/input/gamepad';

const settings: Settings = { ...DEFAULT_SETTINGS, stickDeadzone: 0.1, stickSensitivity: 100, invertY: false };

interface PadOverrides {
  buttons?: Array<[number, Partial<{ pressed: boolean; value: number }>]>;
  axes?: number[];
}

function pad(overrides: PadOverrides = {}): PadReading {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  for (const [index, patch] of overrides.buttons ?? []) {
    buttons[index] = { pressed: false, value: 0, ...patch };
  }
  const axes = [...(overrides.axes ?? []), 0, 0, 0, 0].slice(0, 4);
  return { buttons, axes };
}

describe('radialDeadzone', () => {
  it('zeroes input inside the dead zone', () => {
    expect(radialDeadzone(0.05, 0.05, 0.1)).toEqual({ x: 0, y: 0 });
  });

  it('reaches full magnitude at the rim and keeps direction', () => {
    const out = radialDeadzone(0, 1, 0.2);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 6);
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeGreaterThan(0);
  });

  it('starts from zero just outside the zone instead of jumping', () => {
    const out = radialDeadzone(0.11, 0, 0.1);
    expect(Math.hypot(out.x, out.y)).toBeLessThan(0.02);
  });
});

describe('readPad', () => {
  it('maps cross to jump and confirm', () => {
    const frame = readPad(pad({ buttons: [[PAD.cross, { pressed: true, value: 1 }]] }), settings, 1 / 60);
    expect(frame.held.has('jump')).toBe(true);
    expect(frame.held.has('confirm')).toBe(true);
  });

  it('treats analog triggers as held past the threshold', () => {
    const light = readPad(pad({ buttons: [[PAD.r2, { value: 0.2 }]] }), settings, 1 / 60);
    const firm = readPad(pad({ buttons: [[PAD.r2, { value: 0.6 }]] }), settings, 1 / 60);
    const aim = readPad(pad({ buttons: [[PAD.l2, { value: 0.9 }]] }), settings, 1 / 60);
    expect(light.held.has('fire')).toBe(false);
    expect(firm.held.has('fire')).toBe(true);
    expect(aim.held.has('aim')).toBe(true);
  });

  it('maps the left stick so that pushing up moves forward', () => {
    const frame = readPad(pad({ axes: [0, -1] }), settings, 1 / 60);
    expect(frame.move.y).toBeGreaterThan(0.9);
    expect(frame.move.x).toBeCloseTo(0, 6);
  });

  it('maps the right stick so that pushing up looks up', () => {
    const frame = readPad(pad({ axes: [0, 0, 0, -1] }), settings, 1 / 60);
    expect(frame.look.y).toBeGreaterThan(0);
  });

  it('flips vertical look when invertY is on', () => {
    const frame = readPad(pad({ axes: [0, 0, 0, -1] }), { ...settings, invertY: true }, 1 / 60);
    expect(frame.look.y).toBeLessThan(0);
  });

  it('scales look by stick sensitivity and frame time', () => {
    const frame = readPad(pad({ axes: [0, 0, 1, 0] }), settings, 0.5);
    expect(frame.look.x).toBeCloseTo(50, 6);
  });

  it('maps the d-pad to menu directions', () => {
    const frame = readPad(pad({ buttons: [[PAD.dpadUp, { pressed: true }]] }), settings, 1 / 60);
    expect(frame.held.has('up')).toBe(true);
  });
});

describe('pickGamepad', () => {
  const pads = (...entries: Array<Partial<{ connected: boolean; mapping: string; id: string }> | null>) =>
    entries as Array<{ connected: boolean; mapping: string; id: string } | null>;

  it('prefers a standard-mapped pad', () => {
    const picked = pickGamepad(
      pads({ connected: true, mapping: '', id: 'generic' }, { connected: true, mapping: 'standard', id: 'dualsense' }),
    );
    expect(picked?.id).toBe('dualsense');
  });

  it('skips disconnected pads and null slots', () => {
    const picked = pickGamepad(
      pads(null, { connected: false, mapping: 'standard', id: 'gone' }, { connected: true, mapping: 'standard', id: 'here' }),
    );
    expect(picked?.id).toBe('here');
  });

  it('falls back to any connected pad', () => {
    const picked = pickGamepad(pads({ connected: true, mapping: '', id: 'odd' }));
    expect(picked?.id).toBe('odd');
  });

  it('returns null when nothing is connected', () => {
    expect(pickGamepad(pads(null, null))).toBeNull();
  });
});
