import { type EnemyKind } from '../combat/enemy';
import { type WeaponId } from '../combat/weapons';
import { type AudioEngine, type VoiceTarget } from './engine';
import { burst, tone } from './synth';

export type UiSound = 'move' | 'confirm' | 'back';

/** How each enemy's death sounds: a pitch sweep and how long it rings. */
const KILL_VOICE: Record<EnemyKind, { type: OscillatorType; from: number; to: number; duration: number }> = {
  swarmling: { type: 'triangle', from: 620, to: 180, duration: 0.18 },
  brute: { type: 'sawtooth', from: 150, to: 40, duration: 0.35 },
  spitter: { type: 'triangle', from: 880, to: 300, duration: 0.2 },
  diver: { type: 'square', from: 500, to: 160, duration: 0.22 },
  mimic: { type: 'sawtooth', from: 300, to: 90, duration: 0.4 },
};

/**
 * One-shot effects, all synthesized. Each method does nothing until the engine is unlocked, so the
 * game can call them freely.
 */
export class Sfx {
  constructor(private readonly engine: AudioEngine) {}

  shot(weapon: WeaponId): void {
    this.play((v) => {
      switch (weapon) {
        case 'rifle':
          tone(v, { type: 'square', freq: 880, to: 330, duration: 0.07, gain: 0.05 });
          burst(v, { filter: 'bandpass', freq: 3000, q: 1.5, duration: 0.04, gain: 0.12 });
          tone(v, { type: 'sine', freq: 140, to: 60, duration: 0.12, gain: 0.1 });
          return;
        case 'scatter':
          burst(v, { filter: 'lowpass', freq: 2600, to: 500, q: 0.7, duration: 0.3, gain: 0.5 });
          tone(v, { type: 'sine', freq: 110, to: 45, duration: 0.2, gain: 0.35 });
          return;
        case 'bomb':
          burst(v, { filter: 'bandpass', freq: 400, to: 1400, q: 2, duration: 0.35, gain: 0.25 });
          tone(v, { type: 'triangle', freq: 240, to: 520, duration: 0.3, gain: 0.08 });
          return;
      }
    });
  }

  /** A hit confirm. A kill gets a pop on top, so the player can tell them apart by ear. */
  hit(kill: boolean): void {
    this.play((v) => {
      if (kill) {
        tone(v, { type: 'sine', freq: 1900, to: 900, duration: 0.09, gain: 0.16 });
        tone(v, { type: 'triangle', freq: 420, to: 160, duration: 0.12, gain: 0.12 });
      } else {
        tone(v, { type: 'sine', freq: 1700, to: 1100, duration: 0.05, gain: 0.12 });
        burst(v, { filter: 'highpass', freq: 4000, duration: 0.02, gain: 0.05 });
      }
    });
  }

  kill(kind: EnemyKind): void {
    const { type, from, to, duration } = KILL_VOICE[kind];
    this.play((v) => {
      tone(v, { type, freq: from, to, duration, gain: 0.14 });
      burst(v, { filter: 'bandpass', freq: 900, to: 300, q: 3, duration, gain: 0.12 });
    });
  }

  spit(): void {
    this.play((v) => {
      tone(v, { type: 'sine', freq: 500, to: 260, duration: 0.15, gain: 0.07 });
      burst(v, { filter: 'bandpass', freq: 1200, duration: 0.1, gain: 0.05 });
    });
  }

  hurt(): void {
    this.play((v) => {
      tone(v, { type: 'sawtooth', freq: 120, to: 55, duration: 0.3, gain: 0.22 });
      burst(v, { filter: 'lowpass', freq: 700, duration: 0.25, gain: 0.25 });
    });
  }

  blast(): void {
    this.play((v) => {
      burst(v, { filter: 'lowpass', freq: 1100, to: 90, q: 0.6, duration: 1, gain: 0.8 });
      tone(v, { type: 'sine', freq: 90, to: 28, duration: 0.7, gain: 0.6 });
    });
  }

  /** A tritone over a rising hiss. Dissonant on purpose, since a mimic was hiding in plain sight. */
  reveal(): void {
    this.play((v) => {
      tone(v, { type: 'sawtooth', freq: 196, to: 220, duration: 0.5, gain: 0.12 });
      tone(v, { type: 'sawtooth', freq: 277, duration: 0.5, gain: 0.1 });
      burst(v, { filter: 'bandpass', freq: 400, to: 2400, q: 1, duration: 0.5, gain: 0.1 });
    });
  }

  reloadStart(): void {
    this.play((v) => {
      burst(v, { filter: 'bandpass', freq: 3200, q: 6, duration: 0.03, gain: 0.2 });
      tone(v, { type: 'square', freq: 1200, duration: 0.02, gain: 0.05 });
    });
  }

  reloadDone(): void {
    this.play((v) => {
      burst(v, { filter: 'bandpass', freq: 2400, q: 6, duration: 0.03, gain: 0.25 });
      tone(v, { type: 'square', freq: 1800, to: 1500, duration: 0.05, gain: 0.08, start: 0.02 });
    });
  }

  switchWeapon(): void {
    this.play((v) => {
      tone(v, { type: 'sine', freq: 880, to: 660, duration: 0.05, gain: 0.1 });
    });
  }

  jump(): void {
    this.play((v) => {
      tone(v, { type: 'sine', freq: 220, to: 440, duration: 0.14, gain: 0.12 });
      burst(v, { filter: 'lowpass', freq: 800, duration: 0.12, gain: 0.05 });
    });
  }

  dash(): void {
    this.play((v) => {
      burst(v, { filter: 'bandpass', freq: 400, to: 1800, q: 1.2, duration: 0.2, gain: 0.3 });
      tone(v, { type: 'sawtooth', freq: 300, to: 120, duration: 0.2, gain: 0.05 });
    });
  }

  death(): void {
    this.play((v) => {
      tone(v, { type: 'sawtooth', freq: 220, to: 40, duration: 1.4, gain: 0.2 });
      burst(v, { filter: 'lowpass', freq: 1200, to: 120, duration: 1.4, gain: 0.4 });
    });
  }

  ui(sound: UiSound): void {
    this.play((v) => {
      switch (sound) {
        case 'move':
          tone(v, { type: 'square', freq: 1400, duration: 0.025, gain: 0.05 });
          return;
        case 'confirm':
          tone(v, { type: 'triangle', freq: 660, duration: 0.06, gain: 0.12 });
          tone(v, { type: 'triangle', freq: 990, duration: 0.1, gain: 0.1, start: 0.05 });
          return;
        case 'back':
          tone(v, { type: 'triangle', freq: 330, to: 250, duration: 0.08, gain: 0.1 });
          return;
      }
    });
  }

  private play(build: (voice: VoiceTarget) => void): void {
    const voice = this.engine.voices;
    if (voice) build(voice);
  }
}
