/** The forward pace the tide expects, in meters per second. Rises steadily over the run. */
export const PACE = {
  start: 6.5,
  gainPerSecond: 0.07,
  max: 14,
} as const;

export function paceAt(runSeconds: number): number {
  return Math.min(PACE.max, PACE.start + PACE.gainPerSecond * Math.max(0, runSeconds));
}
