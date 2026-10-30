/** Simulation runs at a fixed 60 Hz regardless of display refresh rate. */
export const FIXED_STEP = 1 / 60;

const MAX_FRAME_SECONDS = 0.25;
const MAX_STEPS_PER_FRAME = 8;

export interface LoopHandlers {
  update(step: number): void;
  /** `alpha` is how far the render sits between the last two simulation steps, in [0, 1). */
  render(alpha: number): void;
}

export interface LoopStats {
  fps: number;
  frameMs: number;
}

export interface Loop {
  readonly stats: LoopStats;
  start(): void;
  stop(): void;
}

export function createLoop(handlers: LoopHandlers): Loop {
  const stats: LoopStats = { fps: 0, frameMs: 0 };
  let running = false;
  let frameId = 0;
  let last = 0;
  let accumulator = 0;
  let fpsFrames = 0;
  let fpsWindow = 0;

  const frame = (now: number): void => {
    if (!running) return;
    frameId = requestAnimationFrame(frame);

    const rawSeconds = (now - last) / 1000;
    last = now;
    stats.frameMs = rawSeconds * 1000;

    accumulator += Math.min(rawSeconds, MAX_FRAME_SECONDS);
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
      handlers.update(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
    handlers.render(accumulator / FIXED_STEP);

    fpsFrames++;
    fpsWindow += rawSeconds;
    if (fpsWindow >= 0.5) {
      stats.fps = fpsFrames / fpsWindow;
      fpsFrames = 0;
      fpsWindow = 0;
    }
  };

  return {
    stats,
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      accumulator = 0;
      frameId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(frameId);
    },
  };
}
