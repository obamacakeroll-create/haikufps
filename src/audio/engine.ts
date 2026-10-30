/** Linear gains for the three volume sliders, each from 0 to 1. */
export interface Volumes {
  readonly master: number;
  readonly music: number;
  readonly sfx: number;
}

/**
 * The Web Audio graph. Browsers keep audio silent until a user gesture, so the context is created on
 * the first input. Until then every sound is a no-op, which keeps tests and headless runs away from
 * Web Audio entirely.
 */
export class AudioEngine {
  private context: AudioContext | undefined;
  private masterBus: GainNode | undefined;
  private sfxBus: GainNode | undefined;
  private musicBus: GainNode | undefined;
  private noise: AudioBuffer | undefined;
  private volumes: Volumes = { master: 0.8, music: 0.6, sfx: 0.9 };

  /** Creates the context on the first call and resumes it after a pause or a tab switch. */
  unlock(): void {
    try {
      if (this.context) {
        // A resume outside a user gesture is refused. The next gesture will try again.
        if (this.context.state === 'suspended') this.context.resume().catch(() => undefined);
        return;
      }
      if (typeof AudioContext === 'undefined') return;
      const context = new AudioContext();
      const master = context.createGain();
      master.connect(context.destination);
      this.sfxBus = context.createGain();
      this.sfxBus.connect(master);
      this.musicBus = context.createGain();
      this.musicBus.connect(master);
      this.masterBus = master;
      this.noise = createNoise(context);
      this.context = context;
      this.applyVolumes();
    } catch {
      // Sound is optional. A browser that refuses audio still runs the game.
      this.context = undefined;
    }
  }

  setVolumes(volumes: Volumes): void {
    this.volumes = volumes;
    this.applyVolumes();
  }

  get ready(): boolean {
    return this.context !== undefined;
  }

  /** Seconds on the audio clock, or 0 before the context exists. */
  get now(): number {
    return this.context?.currentTime ?? 0;
  }

  /** The voice set for one-shot effects, or undefined until the engine is ready. */
  get voices(): VoiceTarget | undefined {
    const { context, sfxBus, noise } = this;
    if (!context || !sfxBus || !noise) return undefined;
    return { context, out: sfxBus, noise, time: context.currentTime };
  }

  /** The bus music layers feed into. Undefined until the engine is ready. */
  get musicOutput(): AudioNode | undefined {
    return this.musicBus;
  }

  get audioContext(): AudioContext | undefined {
    return this.context;
  }

  private applyVolumes(): void {
    if (!this.context || !this.masterBus || !this.sfxBus || !this.musicBus) return;
    const now = this.context.currentTime;
    this.masterBus.gain.setTargetAtTime(this.volumes.master, now, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, now, 0.02);
    this.musicBus.gain.setTargetAtTime(this.volumes.music, now, 0.02);
  }
}

/** Everything a one-shot voice needs to schedule itself. */
export interface VoiceTarget {
  readonly context: AudioContext;
  readonly out: AudioNode;
  readonly noise: AudioBuffer;
  readonly time: number;
}

function createNoise(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
