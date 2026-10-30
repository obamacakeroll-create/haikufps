import { clamp, smoothstep } from '../core/math';
import { type AudioEngine, type VoiceTarget } from './engine';
import { burst, tone } from './synth';

export const BPM = 116;
export const STEP_SECONDS = 60 / BPM / 4;
const STEPS_PER_BAR = 16;
/** How far ahead of the audio clock notes are queued. Small enough that a late tick cannot stutter. */
const LOOKAHEAD_SECONDS = 0.15;
const TICK_MS = 25;
/** The gap at which tension starts to build. It is full when the tide is at the player. */
const TENSION_GAP = 14;
/** Bass plays on these sixteenths within a bar. */
const BASS_STEPS: readonly number[] = [0, 3, 6, 8, 10, 14];

export interface Chord {
  readonly root: number;
  readonly tones: readonly number[];
}

/** MIDI note to frequency. */
export function hz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

const AM: Chord = { root: 45, tones: [57, 60, 64] };
const F: Chord = { root: 41, tones: [53, 57, 60] };
const C: Chord = { root: 48, tones: [60, 64, 67] };
const G: Chord = { root: 43, tones: [55, 59, 62] };
/** The loop repeats every four bars. */
export const PROGRESSION: readonly Chord[] = [AM, F, C, G];

export function chordAt(bar: number): Chord {
  const index = ((bar % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length;
  return PROGRESSION[index] ?? AM;
}

/** Calm to full, from 0 to 1. Difficulty sets the floor and the tide adds pressure on top. */
export function intensityFor(difficulty: number, tension: number): number {
  return clamp(0.2 + 0.5 * difficulty + 0.35 * tension, 0, 1);
}

/** 0 when the tide is far behind, 1 when it is at the player. */
export function tensionFor(gap: number): number {
  return clamp(1 - gap / TENSION_GAP, 0, 1);
}

export interface Layers {
  readonly pad: number;
  readonly bass: number;
  readonly drums: number;
  readonly lead: number;
  readonly dread: number;
}

function ramp(value: number, from: number, to: number): number {
  return smoothstep(clamp((value - from) / (to - from), 0, 1));
}

/**
 * How loud each layer is. Layers enter one at a time, so each change is heard as a new part of the
 * song rather than a sudden jump in volume.
 */
export function layersFor(intensity: number, tension: number): Layers {
  return {
    pad: 0.5 + 0.2 * intensity,
    bass: ramp(intensity, 0.15, 0.4),
    drums: ramp(intensity, 0.3, 0.55),
    lead: ramp(intensity, 0.6, 0.85),
    dread: ramp(tension, 0.2, 0.9),
  };
}

type LayerName = keyof Layers;

interface Graph {
  readonly bed: GainNode;
  readonly layers: Record<LayerName, GainNode>;
}

/**
 * Procedural music: a looping progression scheduled a little ahead of the audio clock. Layers fade in
 * with intensity, and a dread drone and heartbeat come in as the tide closes. Stingers mark reshapes.
 */
export class Music {
  private graph: Graph | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextTime = 0;
  private step = 0;

  constructor(private readonly engine: AudioEngine) {}

  get playing(): boolean {
    return this.timer !== undefined;
  }

  start(): void {
    const voices = this.engine.voices;
    const context = this.engine.audioContext;
    const output = this.engine.musicOutput;
    if (this.timer !== undefined || !voices || !context || !output) return;
    this.graph ??= buildGraph(context, output);
    this.nextTime = voices.time + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  /** Fades the layers out. Notes already queued finish within the fade. */
  stop(): void {
    if (this.timer === undefined || !this.graph) return;
    clearInterval(this.timer);
    this.timer = undefined;
    const now = this.engine.now;
    for (const layer of Object.values(this.graph.layers)) layer.gain.setTargetAtTime(0, now, 0.15);
  }

  /** Lowers the whole bed, for pauses and deaths. `false` brings it back. */
  duck(on: boolean): void {
    if (!this.graph) return;
    this.graph.bed.gain.setTargetAtTime(on ? 0.35 : 1, this.engine.now, 0.25);
  }

  /** Called once per frame while a run is live. */
  update(difficulty: number, gap: number): void {
    if (!this.graph || this.timer === undefined) return;
    const tension = tensionFor(gap);
    const levels = layersFor(intensityFor(difficulty, tension), tension);
    const now = this.engine.now;
    for (const name of Object.keys(levels) as LayerName[]) {
      this.graph.layers[name].gain.setTargetAtTime(levels[name], now, 0.5);
    }
  }

  /** A one-off accent that always plays over the bed, whatever the layers are doing. */
  stinger(kind: 'telegraph' | 'move'): void {
    const voices = this.engine.voices;
    if (!voices || !this.graph || this.timer === undefined) return;
    const voice = { ...voices };
    const out = this.graph.bed;
    if (kind === 'telegraph') {
      tone(voice, { type: 'sawtooth', freq: 200, to: 1200, duration: 0.9, gain: 0.05, out });
      burst(voice, { filter: 'bandpass', freq: 500, to: 3000, q: 1, duration: 0.9, gain: 0.12, out });
      return;
    }
    tone(voice, { type: 'triangle', freq: 55, to: 30, duration: 0.6, gain: 0.4, out });
    for (const note of chordAt(Math.floor(this.step / STEPS_PER_BAR)).tones) {
      tone(voice, { type: 'square', freq: hz(note + 12), duration: 0.8, gain: 0.03, out });
    }
  }

  private schedule(): void {
    const voices = this.engine.voices;
    if (!voices || !this.graph) return;
    while (this.nextTime < voices.time + LOOKAHEAD_SECONDS) {
      this.playStep(this.graph, this.step, this.nextTime, voices);
      this.step++;
      this.nextTime += STEP_SECONDS;
    }
  }

  private playStep(graph: Graph, step: number, time: number, voices: VoiceTarget): void {
    const voice: VoiceTarget = { ...voices, time };
    const s = step % STEPS_PER_BAR;
    const chord = chordAt(Math.floor(step / STEPS_PER_BAR));
    const { layers } = graph;
    const bar = STEP_SECONDS * STEPS_PER_BAR;

    if (s === 0) {
      for (const note of chord.tones) {
        tone(voice, { type: 'triangle', freq: hz(note + 12), duration: bar, gain: 0.035, attack: 0.5, out: layers.pad });
      }
    }
    if (BASS_STEPS.includes(s)) {
      const note = s === 10 ? chord.root + 12 : chord.root;
      tone(voice, { type: 'triangle', freq: hz(note), duration: STEP_SECONDS * 1.6, gain: 0.22, out: layers.bass });
    }
    if (s === 0 || s === 8) {
      tone(voice, { type: 'sine', freq: 120, to: 45, duration: 0.25, gain: 0.5, out: layers.drums });
      // The same thump, quieter and lower, is the heartbeat when the dread layer is up.
      tone(voice, { type: 'sine', freq: 70, to: 40, duration: 0.2, gain: 0.35, out: layers.dread });
    }
    if (s === 4 || s === 12) {
      burst(voice, { filter: 'bandpass', freq: 1800, q: 1, duration: 0.15, gain: 0.25, out: layers.drums });
    }
    if (s % 2 === 1) {
      burst(voice, { filter: 'highpass', freq: 7000, duration: 0.03, gain: s % 4 === 3 ? 0.06 : 0.03, out: layers.drums });
    }
    if (s % 2 === 0) {
      const note = chord.tones[(s / 2) % chord.tones.length] ?? chord.root + 12;
      tone(voice, {
        type: 'square',
        freq: hz(s >= 8 ? note + 12 : note),
        duration: STEP_SECONDS * 1.5,
        gain: 0.03,
        out: layers.lead,
      });
    }
  }
}

function buildGraph(context: AudioContext, output: AudioNode): Graph {
  const bed = context.createGain();
  bed.connect(output);
  const make = (): GainNode => {
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(bed);
    return gain;
  };
  const layers: Record<LayerName, GainNode> = {
    pad: make(),
    bass: make(),
    drums: make(),
    lead: make(),
    dread: make(),
  };
  // A low sawtooth held under a lowpass, so it reads as a drone rather than a buzz.
  const drone = context.createOscillator();
  drone.type = 'sawtooth';
  drone.frequency.value = hz(28);
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 180;
  drone.connect(filter);
  filter.connect(layers.dread);
  drone.start();
  return { bed, layers };
}
