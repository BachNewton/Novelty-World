import type { SoundSettings } from "../settings";

// The music's place in the mix. The sound effects play at the master volume;
// the music at the master volume, times the player's music volume, times
// this level, which puts every theme's loudest stretch within a few decibels
// of the effects (about equal billing), while the sounds that carry
// information (the bonk, the pass, the hop) still cut through it. The slow
// music test measures that.
export const MUSIC_LEVEL = 0.9;

// The music's gain for the player's settings: mute and the master volume
// govern it with everything else, and the music volume turns it down alone.
export function musicGain({ muted, volume, music }: SoundSettings): number {
  return muted ? 0 : volume * music * MUSIC_LEVEL;
}
