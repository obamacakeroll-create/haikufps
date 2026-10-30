import { describe, expect, it } from 'vitest';
import { glyph } from '../src/ui/glyphs';

describe('glyph', () => {
  it('names the DualSense button for an action on a gamepad', () => {
    expect(glyph('fire', 'gamepad')).toBe('R2');
    expect(glyph('aim', 'gamepad')).toBe('L2');
    expect(glyph('jump', 'gamepad')).toBe('Cross');
    expect(glyph('pause', 'gamepad')).toBe('Options');
  });

  it('names the key or mouse button for an action on the keyboard', () => {
    expect(glyph('fire', 'keyboard')).toBe('Left click');
    expect(glyph('aim', 'keyboard')).toBe('Right click');
    expect(glyph('jump', 'keyboard')).toBe('Space');
  });

  it('falls back to the action name when a device has no label for it', () => {
    expect(glyph('debug', 'keyboard')).toBe('debug');
    expect(glyph('up', 'gamepad')).toBe('up');
  });
});
