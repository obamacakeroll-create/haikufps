import { Color } from 'three';

const hex = (value: string): Color => new Color(value);

/** Ink-canyon palette. Every color in the game comes from here. */
export const PALETTE = {
  ink: hex('#120e18'),
  skyTop: hex('#1d2a4a'),
  skyHorizon: hex('#f4a261'),
  fog: hex('#4a3340'),
  floorLight: hex('#8a5f4f'),
  floorDark: hex('#4d3140'),
  strata: [
    hex('#d9a066'),
    hex('#b5583a'),
    hex('#efdcb0'),
    hex('#4f7f86'),
    hex('#5b3f5e'),
    hex('#8a5e3b'),
  ],
  vermilion: hex('#ff5a36'),
  teal: hex('#3cc4b0'),
} as const;
