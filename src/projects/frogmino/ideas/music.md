# Frogmino's music: the brief

What Frogmino's music is for and how it is written: the brief every theme is composed to, and the craft of writing it in ZzFXM. The decided parts that the code holds (which theme plays where, the mix, rendering, the note format) are the Music section of the project's `CLAUDE.md`.

## What the music is

- **Playful, fun, unique and creative.** Every theme is a character piece with an idea of its own, something a player would hum after the game and would know as Frogmino's. A theme that only fills silence has missed the brief.
- **It may be in the foreground.** The music is part of the game's character, not background filler: it plays at about the level of the sound effects, and a theme may have a tune bold enough to notice. The one thing it must never do is hide the sounds that carry information (see The mix).
- **A theme's character comes from its course's idea,** its pair of pieces and what they do together, never from how hard the course is. **Its intensity never follows a course's difficulty**: the last course isn't the loudest, fastest or most urgent, and the first isn't the quietest. A pair that climbs gets climbing music; a pair of identical blocks gets music about two of the same thing.
- **Every course's theme has a style of its own.** No two themes share a genre, a lead instrument or a metre-and-tempo pairing, so seven courses sound like seven places.
- **The inspiration** is Grant Kirkhope (Banjo-Kazooie) and Junichi Masuda, Go Ichinose and Morikazu Aoki (Pokémon), and explicitly not only them: any style that serves a course's idea is open. What those composers show is the attitude: cheeky, characterful instruments, tunes with a hook, jazzy changes and sudden key lifts, the bright Game Boy pulse lead, a bass line with a personality of its own, a world theme turned into a different place by its arrangement.

## The rules

- **Original melodies only.** A theme never quotes, arranges or closely paraphrases a melody from those games, from any other game, or any copyrighted tune, however short. Styles, instruments, grooves and forms may be borrowed; tunes may not. This keeps the same distance from protected work as the look keeps from Tetris (see the legal note in `ideas/tetris-worlds-look.md`).
- **A loop of two minutes at most, in sections.** A theme is a loop of a minute to two, built from sections that change (a verse, a contrast, a bridge, a key lift, a breakdown), never one short phrase repeated, so a run never hears the same eight bars on end.

## The shared sign-off

Every theme ends its loop on the same two notes, **the ribbit**: a short low note and the octave above it, landing on the key's home note, played by whatever voice leads that theme, just before the loop comes round. It is a sonic signature, not a motif to develop: the themes' tunes are their own, so the seven can differ as much as their courses do, and the ribbit is what says they are all the same game. A shared melodic motif reworked in every theme was weighed and not chosen: it would pull seven characters toward one tune.

## Writing for ZzFXM

- **A channel is one voice.** A note rings until its sound ends, the next note in its channel starts, or a dash releases it. A chord is several channels, a held chord is long notes in each, and a drum kit is a channel per drum.
- **A note's length is its instrument's envelope,** not the rows it spans: rests let it ring, but only as long as its attack, decay, sustain and release last. A plucked voice decays to a low sustain on its own; a held voice needs a long sustain and a dash to end it.
- **Drums are ZzFX sounds too:** a sine falling fast in pitch is a kick, noise through a low-pass a snare, and very short high noise a hat. `x` plays a drum at its instrument's own pitch.
- **Tremolo needs ZzFX's repeat time,** which also restarts any pitch slide, so a voice has one or the other.
- **The helpers** (`writing.ts`): lines on coarser grids, a bar per chord, a bar repeated, transposing for a key lift, and moving a line along a scale, for answers in mirror image and parallel thirds.

## The instrument palette

The instruments (`instruments.ts`) are ZzFX sounds tuned to a base pitch, soft by default, as the sound effects are: sine and triangle waves, mostly through a low-pass filter. A theme may reach for a brighter colour where its style needs one (a Game Boy pulse lead, a buzzing kazoo, a fiddle's saw), kept quiet and low-passed so it sings rather than beeps. Each theme picks its own band from the palette, and an instrument added for one theme is shared with the rest.

## The mix

- **Music and effects have about equal billing,** and the player sets the music's level with its own slider under the master volume.
- **The information sounds cut through.** The bonk, the pass pop and the hop tell the players what happened, so each must stand clear of every theme's loudest stretch, at any music setting: a slow test measures each against each theme, broadband and in the effect's own band, and fails a theme that buries one. A theme that fails is turned down or thinned in that band; the effects are never made harsher to compensate.

## Checking music without ears

An agent can't hear what it writes, so it checks music by numbers, and the owner judges by ear:

- **The tests hold the form:** every bar full, every note in its instrument's range, every loop within two minutes, every render the right length, with a peak loud enough to hear and short of clipping.
- **The mix test holds the balance,** as above.
- **Read the shape:** before writing notes, say what each section does (who leads, what the bass does, where the key lifts) and check the result against it; counting where a tune's highest and lowest notes fall shows whether a climb really climbs.
- **Give the owner something to hear.** Themes have no audio files: the `?music` page renders and plays them.

## Open

- **Rendering ahead can queue up.** A host flicking through many courses renders each in turn in the background, so on a phone the latest pick may be a few seconds late.
- **Write theme files as UTF-8.** A script that rewrote a theme file in the Windows code page once broke the build.
