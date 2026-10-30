import { Texture } from 'three';
import { type CombatInput } from '../src/combat/combat';
import { type RunAssets } from '../src/game/run';
import { createToonRamp } from '../src/render/toon';

/** Combat input with nothing pressed, so a test can move without shooting. */
export const QUIET: CombatInput = {
  fireHeld: false,
  firePressed: false,
  reloadPressed: false,
  weaponIndex: -1,
  weaponStep: 0,
  aiming: false,
  aimX: 0,
  aimY: 0,
  aimZ: -1,
};

export function runAssets(): RunAssets {
  return { ramp: createToonRamp(), mottle: new Texture(), splat: new Texture() };
}
