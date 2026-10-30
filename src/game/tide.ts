/**
 * The ink tide chases the player. `gap` is the distance in meters between the tide's front and the
 * player. The gap closes fast when the player is slower than the pace, grows slowly when faster,
 * and reaching zero ends the run.
 */
export const TIDE = {
  startGap: 22,
  maxGap: 46,
  /** The tide holds still for this long at the start, so the first moves are not punished. */
  graceSeconds: 2.5,
  /** Gap meters lost per meter per second the player is behind pace. */
  shrinkRate: 1,
  /** Gap meters gained per meter per second the player is ahead of pace. */
  growRate: 0.25,
} as const;

export function stepGap(gap: number, forwardSpeed: number, pace: number, dt: number): number {
  const deficit = forwardSpeed - pace;
  const rate = deficit < 0 ? deficit * TIDE.shrinkRate : deficit * TIDE.growRate;
  return Math.min(TIDE.maxGap, Math.max(0, gap + rate * dt));
}
