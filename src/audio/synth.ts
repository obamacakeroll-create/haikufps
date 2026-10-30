import { type VoiceTarget } from './engine';

export interface ToneSpec {
  readonly type: OscillatorType;
  readonly freq: number;
  /** Pitch at the end of the note. Omit for a steady tone. */
  readonly to?: number;
  /** Seconds after the voice's start time. */
  readonly start?: number;
  readonly duration: number;
  readonly gain: number;
  readonly attack?: number;
  /** Where the tone is routed. Defaults to the voice's output. */
  readonly out?: AudioNode;
}

export interface NoiseSpec {
  readonly filter: BiquadFilterType;
  readonly freq: number;
  /** Filter frequency at the end of the burst. Omit for a steady filter. */
  readonly to?: number;
  readonly q?: number;
  readonly start?: number;
  readonly duration: number;
  readonly gain: number;
  readonly attack?: number;
  readonly out?: AudioNode;
}

/** Exponential ramps cannot reach zero, so envelopes fall to this floor instead. */
const FLOOR = 0.0001;

/** A pitched burst with a fast attack and an exponential decay. */
export function tone(voice: VoiceTarget, spec: ToneSpec): void {
  const { context } = voice;
  const start = voice.time + (spec.start ?? 0);
  const end = start + spec.duration;
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.freq, start);
  if (spec.to !== undefined) osc.frequency.exponentialRampToValueAtTime(spec.to, end);
  amp.gain.setValueAtTime(FLOOR, start);
  amp.gain.exponentialRampToValueAtTime(spec.gain, start + (spec.attack ?? 0.004));
  amp.gain.exponentialRampToValueAtTime(FLOOR, end);
  osc.connect(amp);
  amp.connect(spec.out ?? voice.out);
  osc.start(start);
  osc.stop(end + 0.02);
}

/** A filtered burst of noise, optionally with a sweeping filter. */
export function burst(voice: VoiceTarget, spec: NoiseSpec): void {
  const { context } = voice;
  const start = voice.time + (spec.start ?? 0);
  const end = start + spec.duration;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const amp = context.createGain();
  source.buffer = voice.noise;
  // A random offset into the noise buffer keeps repeated bursts from sounding identical.
  const offset = Math.random() * Math.max(0, voice.noise.duration - spec.duration);
  filter.type = spec.filter;
  filter.Q.value = spec.q ?? 1;
  filter.frequency.setValueAtTime(spec.freq, start);
  if (spec.to !== undefined) filter.frequency.exponentialRampToValueAtTime(spec.to, end);
  amp.gain.setValueAtTime(FLOOR, start);
  amp.gain.exponentialRampToValueAtTime(spec.gain, start + (spec.attack ?? 0.004));
  amp.gain.exponentialRampToValueAtTime(FLOOR, end);
  source.connect(filter);
  filter.connect(amp);
  amp.connect(spec.out ?? voice.out);
  source.start(start, offset, spec.duration + 0.05);
  source.stop(end + 0.02);
}
