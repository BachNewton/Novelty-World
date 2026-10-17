import type { SoundDesign } from "./design";

// What a player needs of the sound settings: whether sound is muted, and the
// master volume, from 0 to 1.
export interface SoundSettings {
  muted: boolean;
  volume: number;
}

// Where sounds go: the thin seam over Web Audio, so the rules for when and
// how a sound plays are testable without an AudioContext.
export interface AudioOutput<Id extends string = string> {
  // The audio clock, in seconds.
  now(): number;
  // Plays a rendered sound at time `at` on the audio clock.
  play(id: Id, at: number, rate: number, gain: number): void;
}

export interface PlayOptions {
  // Shifts the pitch, as for a streak climbing a scale.
  semitones?: number;
  // How long from now to play it, in seconds.
  delay?: number;
  // Whose it is, as a player's slot: each voice keeps its own minimum gap,
  // so one player's sound never swallows another's.
  voice?: number;
}

// One play's random strays: a playback rate within `pitch` of 1 either way,
// and a gain up to `volume` below 1.
export function vary(variation: SoundDesign["variation"], random: () => number): { rate: number; gain: number } {
  return {
    rate: 1 + (random() * 2 - 1) * variation.pitch,
    gain: 1 - random() * variation.volume,
  };
}

// Plays the rendered sounds with the anti-annoyance rules: a random stray in
// pitch and volume on every play, and a minimum gap between two plays of one
// sound in one voice, measured on the audio clock. Muted, nothing plays.
export class SoundPlayer<Id extends string> {
  private readonly lastPlayed = new Map<string, number>();

  constructor(
    private readonly designs: Readonly<Record<Id, SoundDesign>>,
    private readonly output: AudioOutput<Id>,
    private readonly settings: () => SoundSettings,
    private readonly random: () => number = Math.random,
  ) {}

  // Whether the sound played; it is dropped when muted or too soon after the
  // last play of the same sound in the same voice.
  play(id: Id, options: PlayOptions = {}): boolean {
    const { muted, volume } = this.settings();
    if (muted) return false;
    const design = this.designs[id];
    const at = this.output.now() + (options.delay ?? 0);
    const key = `${id}:${String(options.voice ?? 0)}`;
    const last = this.lastPlayed.get(key);
    if (last !== undefined && Math.abs(at - last) < design.minGap) return false;
    this.lastPlayed.set(key, at);
    const { rate, gain } = vary(design.variation, this.random);
    this.output.play(id, at, rate * 2 ** ((options.semitones ?? 0) / 12), gain * volume);
    return true;
  }
}
