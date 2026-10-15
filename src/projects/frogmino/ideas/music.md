# Composing Frogmino's music

What composing the courses' themes has taught, gathered ahead of a skill for writing music. The decided parts (which theme plays where, the motif, the touchstones, the mix, rendering, the note format) are the Music section of the project's `CLAUDE.md`; this is the craft behind them. The themes in `audio/music/` are the worked examples.

## What the owner wants

- **Fun to listen to while playing.** The music lifts the game and never asks for attention, and it sits under the sound effects.
- **The touchstones are Grant Kirkhope's Banjo-Kazooie and the music of Pokémon,** for style only. Beyond those, a musical identity of Frogmino's own.
- **The earlier sketches aren't the direction.** None of the first ideas (the Frogger and Tetris styles, the Ievan Polkka themes) was settled on, and the courses' themes don't build on them.
- **The first in-game themes landed well.** They still need refinement from playtesting.

## How a theme is made

- **One motif, reworked per course.** The Frogmino motif is hop, hop, a leap up the chord and a tumble down: a call landing short, then an answer landing home. Each theme reworks it in its own key, metre and style, the way Kirkhope reorchestrates one world theme for each area. The motif is what makes seven different themes sound like one game.
- **A theme plays its course's idea.** The strongest themes turn the course's pair or mechanic into music:

  | Course | Theme | How it plays the course | Style |
  |---|---|---|---|
  | Block Party (O + O) | Two Squares Waltz | Two blocks, three beats: gentle and square | Pokémon town theme as a music-box waltz, F major, 3/4 |
  | Tea for Two (T + T) | Tee Time | The tune is split note by note between two steel pans, so the halves interlock like the Ts | Kirkhope beach-world calypso, G major |
  | Long and Short (I + O) | Tall and Square | A tuba and a piccolo double act, as the I and the O split their jobs | Kirkhope, swung, B-flat with a sudden lift to D-flat |
  | Zig Zag Alley (S + Z) | Mirror, Mirror | A two-part invention where each phrase is answered by its mirror image, like the S and the Z | Kirkhope haunted-house harpsichord, E minor |
  | Chain Reaction (T + L) | Hurry Up and Wait | A ride, a half-time wait, a sixteenth-note dash and a stop-go break, as the course's gaps hurry and hold the team | Pokémon bicycle and Surf, D major |
  | The hard course (to come) | Final Stretch | Everything at full tilt, with a heroic turn and a last lift up a key | Pokémon trainer battle, A minor, 168 BPM |
  | A course to come | Hop Along Route | An adventure: out on the road, then a quiet town section | Pokémon route march, C major |

- **Borrow traits, never tunes.** Name the traits a theme takes from each touchstone:
  - **Kirkhope:** walking tuba or bass, chromatic staccato tunes, cheeky woodwind-like leads, jazzy changes, sudden key shifts.
  - **Pokémon:** bright square-wave leads, driving route marches, punchy bass, adventurous major-key hooks, battle urgency, the town-against-route contrast.

  A melody that sounds like a recognisable tune from either is out, however short.
- **Sections, not one loop.** A theme about a course's length (a minute to a minute and a half), in sections that change rather than repeat, so a run never hears the same eight bars on end. A key lift or a half-time section partway through keeps a long loop fresh.
- **The square-wave exception.** The sound effects avoid harsh square beeps, but Pokémon-style leads need a square wave. In the music it's kept quiet and low-passed: a deliberate exception, to revisit if it sounds too bright.
- **Shared tools:** the instruments are shared (`instruments.ts`, extended with a soft pulse, a snare and a pluck), and `writing.ts` has helpers for writing at coarser grids, a bar per chord, transposing, and moving a line along a scale for mirrors and thirds.

## Checking music without ears

An agent can't hear what it writes, so it checks music by numbers, and the owner judges by ear:

- **The tests hold the form:** every bar full, every note in its instrument's range, every loop within its length limit, every render the right length, with a peak between 0.1 and 0.5.
- **Measure loudness to set the mix.** The themes came out as loud as the sound effects (about 0.05–0.07 RMS), which is why the music plays some 9 dB under the master volume.
- **Measure render time.** A full theme renders in about a fifth of a second on a desktop and around a second on a phone, which is why themes render in a worker, ahead of play.
- **Give the owner something to hear.** Themes have no audio files: they're rendered from code in the browser. The `?music` page plays them, or a theme can be rendered to a WAV in Node with ZzFX and ZzFXM, as the slow theme test does, and opened in any audio player. A small render-to-WAV command would make that one step.

## Open

- **No separate music volume.** Mute and the master volume cover both. A music on/off switch is the obvious next step if players want effects without music.
- **Rendering ahead can queue up.** A host flicking through many courses renders each in turn in the background, so on a phone the latest pick may be a few seconds late.
- **Write theme files as UTF-8.** A script that rewrote a theme file in the Windows code page once broke the build.
