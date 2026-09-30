import { SOUNDS, type SoundDesign, type SoundId } from "./sounds";
import type { SoundSettings } from "./settings";

// Where sounds go: the thin seam over Web Audio, so the rules for when and
// how a sound plays are testable without an AudioContext.
export interface AudioOutput {
  // The audio clock, in seconds.
  now(): number;
  // Plays a rendered sound at time `at` on the audio clock.
  play(id: SoundId, at: number, rate: number, gain: number): void;
}

export interface PlayOptions {
  // Shifts the pitch, as for a streak climbing a scale.
  semitones?: number;
  // How long from now to play it, in seconds.
  delay?: number;
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
// sound, measured on the audio clock. Muted, nothing plays.
export class SoundPlayer {
  private readonly lastPlayed = new Map<SoundId, number>();

  constructor(
    private readonly output: AudioOutput,
    private readonly settings: () => SoundSettings,
    private readonly random: () => number = Math.random,
  ) {}

  // Whether the sound played; it is dropped when muted or too soon after the
  // last play of the same sound.
  play(id: SoundId, options: PlayOptions = {}): boolean {
    const { muted, volume } = this.settings();
    if (muted) return false;
    const design = SOUNDS[id];
    const at = this.output.now() + (options.delay ?? 0);
    const last = this.lastPlayed.get(id);
    if (last !== undefined && Math.abs(at - last) < design.minGap) return false;
    this.lastPlayed.set(id, at);
    const { rate, gain } = vary(design.variation, this.random);
    this.output.play(id, at, rate * 2 ** ((options.semitones ?? 0) / 12), gain * volume);
    return true;
  }
}
