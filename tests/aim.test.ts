import { describe, expect, it } from 'vitest';
import { AimState } from '../src/input/aim';

describe('AimState in toggle mode', () => {
  it('flips on each press and ignores held state', () => {
    const aim = new AimState('toggle');
    expect(aim.update(true, true)).toBe(true);
    expect(aim.update(false, false)).toBe(true);
    expect(aim.update(true, false)).toBe(true);
    expect(aim.update(false, true)).toBe(false);
  });

  it('releases on demand, such as weapon switch or death', () => {
    const aim = new AimState('toggle');
    aim.update(false, true);
    aim.release();
    expect(aim.active).toBe(false);
    expect(aim.update(false, false)).toBe(false);
  });
});

describe('AimState in hold mode', () => {
  it('is active only while the button is held', () => {
    const aim = new AimState('hold');
    expect(aim.update(true, true)).toBe(true);
    expect(aim.update(true, false)).toBe(true);
    expect(aim.update(false, false)).toBe(false);
  });

  it('ignores presses that are not held', () => {
    const aim = new AimState('hold');
    expect(aim.update(false, true)).toBe(false);
  });
});

describe('AimState mode changes', () => {
  it('clears aim when the mode changes', () => {
    const aim = new AimState('toggle');
    aim.update(false, true);
    aim.setMode('hold');
    expect(aim.active).toBe(false);
  });

  it('is a no-op when the mode is unchanged', () => {
    const aim = new AimState('toggle');
    aim.update(false, true);
    aim.setMode('toggle');
    expect(aim.active).toBe(true);
  });
});
