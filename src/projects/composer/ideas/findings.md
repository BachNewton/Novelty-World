# Findings

What the experiments have shown. Nothing here is a verdict on how the music sounds until the owner has listened: Claude can't hear, so the first round's claims are about writing, not about results.

## Round one: one brief, four formats

Pieces: Porch Light (ABC), The Long Way Back (tracker), Porch Light (raw MIDI events), Porch Light Left On (code).

**The writers converged, whatever the format.** Four isolated writers produced three pieces called Porch Light, all four in E flat, three in 6/8, all about 85 seconds, all built on a delayed tonic or a question that finally resolves, all rating themselves 7/10. The brief and the model shaped the piece more than the notation did. To compare formats properly a round needs briefs that push apart, and to get range from Claude at all the brief has to forbid its first instincts: a set key, metre and character rather than "writer's choice".

| | Strongest at | Weakest at | What slipped through silently |
|---|---|---|---|
| **ABC** | Seeing a motif and its transformations on the line; compact | Seeing the voices against each other: each is a separate block | Short bars; dynamics that apply to only one voice |
| **Tracker** | Exact rhythm, and voices stacked so vertical alignment reads | Harmony is invisible; a late entry writes out every rest; long chords | Uneven bars; a note cut at a line's end |
| **Raw MIDI** | Note-by-note timing and dynamics, the only format with expressive timing written in | No repeat or transposition, so 500-odd events cost effort per note, and the accompaniment went uniform | Everything: a wrong number is still a number |
| **Code** | Development as named operations; the form is legible | Can't see the notes without printing them; repetition is so cheap that it pulls toward sameness | A miscounted transposition is still valid code |

Across all four:

- **Every writer built its own analysis script,** for the same few checks: clashes, parallels, overlaps, range, phrase shape. No format stopped a musical error. That is a tool worth building once: a shared check that reads any score, since the score is the one form they all reach.
- **Every writer's top worry was the accompaniment:** a steady figure running for most of the piece. It appeared in every format, so it may be a habit rather than a format's effect.
- **Tempo is fixed.** Every ritardando was faked in note lengths. A score needs a tempo map; expression depends on it.

**Current lean, before listening:** a hybrid. Code for structure and development, with ABC or tracker strings for the notes themselves, so the motif is readable and its development is a function. The code writer's complaint and ABC's strength are the same thing. To be tested, not assumed.

## Writing to a composer's style

Pieces: Turnip Fair at Snoutbury, The Spoon Thief of Gloam Hall, The Patchwork Balloon, all raw MIDI events, written to Grant Kirkhope's style with original tunes. Unheard, like everything else here: what follows is about the writing.

**A named style gave the range an open brief didn't.** The three came out in G, F# minor and D, in 2/4, swung 4/4 and 3/4, at 126, 120 and 152, with a village fair, a burglar and a balloon, and no delayed tonic. Round one's convergence needed forbidding; here a style plus a named place and character was enough, though the brief also set the spread. Giving each piece a character first made the small decisions easy: a dropped spoon is a bar of snare and a falling celesta, then a bar of silence, which no one writes from "a mysterious theme".

**The style names habits, and habits turn into a checklist.** Chromatic neighbours, a side-step on a final cadence, a semitone lift for the last verse: all easy to place, and easy to place too predictably. The stair-step key lifts and the comic wrong note are the likeliest to sound like a recipe. Whether the tunes have the actual cheek can only be judged by ear.

**Nobody writes this directly in numbers.** The events were compiled from a private shorthand of note names with a bar check, since round one's writer found 500 events by hand cost effort per note and its accompaniment went uniform. The bar check caught a miscounted track at once, and the harmony check caught a brass line written against the wrong chords. What the format gave in the end was swing written into the ticks. This points the same way as the lean: write in a readable form, compile to numbers.

**The accompaniment worry can be measured.** The longest run of bars with the same rhythm, per track, showed the problem plainly: a first draft had a 23-bar run of walking quarters in the finale. With sections assigned their own texture up front, the run came down, and the check is cheap: one more for the shared score checker. It can't tell a good texture from a merely changing one.

**The events format can't name an instrument,** and the roles are too coarse for this style: bassoon, clarinet and trumpet all share `lead`, so on a synth performer the piece's woodwind and brass colours, half of the style, are lost. These pieces need a per-track program to be judged fairly.

**A score without pedal can still think in pedal.** For Ce que la marée a laissé, the shorthand kept one list of pedal changes shared by both hands, and a pedalled note's written length ran to the next change. Harmonic blur became one decision per change instead of one per note, and a clash under a held pedal was fixed by adding a change rather than by shortening notes.

**A figuration wants a path, not a register.** For The Undertow, picking each beat's semiquaver cell nearest a target pitch gave a jagged random walk, 40-odd unplayable leaps, however the targets were tuned. Stepping each cell to the next chord tone up or down, with the cell's own peak forced to keep rising or falling, turned it into sweeps with few leaps. A check for identical half-bars then caught what the bar-level one missed: a figure on a static chord that only rocks.

**A keyboard part needs a hand check, not just a range check.** Concerto of the Rising Sixth passed every range check while its harpsichord jumped nearly two octaves between sextuplets, about a tenth of a second apart. Only a count of fast leaps per hand showed it, and the fix was to turn each restart into a wave that goes back up. In the same piece a tutti's doubling hides real parallels: a checker has to tell a whole bar of deliberate octaves from two stray ones.

**A piano piece needs two lengths per note.** The events format has no pedal, so The Drowned Bell writes a pedalled note as lasting until the pedal lifts. That hides what the hand does: a hand-span or held-note check on the finished numbers sees a pedalled bass as a finger still down. The check has to run on the lengths from before the pedal, so the shorthand should keep both. Real pedal in the format would remove the problem, and would let sheet music show it.

**A hardware brief is a checkable one.** The three Pokémon pieces had to fit named channels, so polyphony per channel became a hard pass or fail rather than a matter of taste, and hard limits pushed harmony into the writing, as arpeggios and counter-lines. What the numbers found was smaller than expected and useful: most non-chord flags came from one motif's accented neighbour on beat 3, cured by moving it an eighth later; the parallel-octave check found a bass walking the melody's arpeggio, which reads fine on the page. It over-reports too: a fast arpeggio against a bass is flagged as parallel fifths, and a run's passing eighths as clashes, so a checker needs to weigh a note's length before it calls a clash. Game music also wants a loop, and a piece has no loop point: written to loop means the last note ends exactly on the barline and the melody's last note steps into its first, which only a check of that seam shows.

**A fixed tempo can still lean.** The Rachmaninoff-style concerto movement (The River Under the Ice) writes its rubato as one warp shared by every track: barlines stay on the grid, the middle of a bar arrives early or late by up to about 45 ticks, so hands and orchestra lean together; ritardandos are written by slowing the figuration's note values. Unheard. A clash check on such a score only earns its keep once it ignores notes that both belong to the declared chord, which took it from 229 reports to a handful of real ones.

## Performance

Synths render a 90-second piece in 3 to 6 seconds in the worker, on a desktop. A phone's time isn't measured.

The SoundFont performer renders the 87-second MIDI piece in about a second on a desktop, including the Vorbis decoding of the samples it uses, and repeats to the digit across Node and the browser.

## SoundFont

The first test of a real MIDI synth: SpessaSynth with MuseScore General, a General MIDI bank from 2020 built on Fluid R3. How it sounds is the owner's call. What the numbers show:

- **MIDI's expression plays.** Hand-made files show each one reaching the audio: halving the tempo for four beats at 120 adds two seconds; a piano note with the pedal down carries thousands of times the energy of a dry one after the key lifts; a pitch bend up raises a held flute's zero crossings by 8%.
- **The score loses what the file has.** Humanizing works on the score, so an upload with Humanize on keeps none of that, nor its instruments: each part gets its role's instrument. Moving humanizing onto the MIDI itself would fix it.
- **MIDI has rules a score doesn't.** A note off ends every sounding note of its pitch, so humanizing's lead legato (notes held 3% long) would have cut a repeated note to nothing. `scoreToMidi` now ends a note at the next of its pitch. The arithmetic synths mix notes independently and never had the problem.
- **Roles choose instruments by guesswork.** Flute, piano, cello and strings suit the chamber brief, and any other brief will want its own: a score has no way to name an instrument yet.

## Character over realism

**Decision: Composer stops aiming for realistic instruments and aims for a sound with character.** MIDI stays the format, and a synth that owns being a synth performs it. The first is 16-bit FM, in the style of the Sega Genesis: for game music, rock, metal and Kirkhope-style tunes, and nobody should mistake it for an orchestra.

Unheard, so nothing here says it sounds good. What the numbers show: Porch Light renders on it at 86.4 seconds with every sample finite, and across the patches a hard note is about twice as bright as a soft one at the same pitch. One thing Claude could not have reasoned out by ear: two equal carriers a little detuned cancel fully at the slow end of their beat, a dropout about a second in, so each patch's carriers are set to unequal levels.

## A band per piece

The owner liked The River Under the Ice as a piece and disliked its sound: too thin, chimes up high, and a whine. **Decision: no imitation of real instruments; synths with character, chosen per piece, thick and full.** Nothing here has been heard. What the numbers show:

- **River had been sitting in its fundamentals.** Before this work the 16-bit render had 78.5% of its energy under 80 Hz. On its own band: 14.9% under 80 Hz, 21.4% to 250 Hz, 45.5% to 800 Hz, 16.8% to 2 kHz, 1.4% to 5 kHz. No samples clipped, RMS -17.3 dB against -19.0, side-to-mid -9.2 dB.
- **Whine can be measured, and the line is clear.** The strongest narrow band above 2 kHz in the held part of a note, against the note's own loudest moment: the old flute measured -0.2 dB, the FM pad -1.8, the glass pad -4.1, the bell -7.3, the FM lead -9.7, and the worst of the new library -14. The limit sits at -12 dB. A dark sound can still fail: the FM lead's centroid is under 900 Hz.
- **A saw through a filter is not a high sound's answer.** Filtering alone leaves a near-sine at C7, which is the whine itself, however soft. What moved the number was weight: the note's own layers fall away above C6 while an anchor an octave and two below it stays. The trade is that the very top reads a little lower than written, so the owner should check the highest violin notes.
- **Dark is the first failure of a warm synth.** The first mix had 0.3% above 2 kHz. Only the band measure showed it, and opening the filters by half an octave to an octave still left every instrument under the limit.
- **Tune against band is its own number.** First gains left the tune 3 to 7 dB under the rest in five of six sections, measured dry above 250 Hz. They now read -1.9 to +3.6 dB, and the two below zero are the tuttis, where the rest doubles the tune anyway.
- **A length belongs to the music, not the patch.** Every patch's `seconds` was a guess, and River's longest note is 14.4 s against the 8 s of the 16-bit pad and 7 s of the old strings, so those notes stopped dead. The mixer now scans the score first and renders each cached note to its longest use.
- **An unequal stack beats slowly.** A 0.19 s window on a held pad read 9 dB down at one moment and looked like a note ending early: it was the unison's own beating. Measure a sustain over a second.

Render cost for River: 831 notes rendered once, 677 million oscillator samples, mixed 2,985 times into 205 million samples. The score is 2,707 notes. Peak memory is mostly six full-length float buffers, about 240 MB, which has not been tried on a phone.

## The piano family and hearing the lines

The owner heard River on the first band and said the piano leads, so it must be right, and that the mix was a wall: too much bleeding together to pick out a line. Still unheard by Claude.

- **Two strings must start together.** The first piano engine gave a partial's two strings random phases, and C5 came out 12 dB under C4 on every piano. It is the FM dropout again: nearly equal sines apart in phase cancel. One phase for the pair, and Iron Concert sits within about 2.5 dB from C1 to C7.
- **The top of a piano needs a lift to sound even,** since it dies in moments and level is heard over the first quarter second. Dying fast is also what keeps it from ringing: the rule that a note above C6 dies 1.3 octaves sooner per octave took the whine reading from -14 dB, failing, to well clear.
- **Touch is a spectrum, and it shows most in the bass.** Iron Concert's centre of tone rises 5.6 times from softest to hardest at C2 and 2.8 times at C4.
- **A piano note's length is its strings', not the score's.** A pedalled 15-second note simply runs out of partials, so a long note costs no more than the note's own ring.
- **A separation score has to score every line.** Scored on the tune alone River read 91% clear while the owner couldn't pick anything out. Scored per line, each against everything else at each moment and pitch band, it read 52% with the tune at 11% in the climax, which matched what they heard. Its limits: dry, one channel, no left and right, no hall, and a unison counts its own players as competition.
- **Cutting ranges alone didn't move that score.** Slots, thinner stacks and no doubles took the 250 to 800 Hz pile from 45% to 35% of the energy, but the score stayed near 50%. Sinking the piano and pads while the tune sounds is what moved it: the tune rose to 80% clear.

## Sketchbook, a second band for River

The owner asked for River in the tone of Pokémon Emerald's instruments, without its bit crush. Nobody has heard the result. The little-above-6-kHz theory holds: the Sketchbook band has 0.016% of its energy above 6 kHz against the Synth Orchestra's 0.028%, on under half the oscillator work. Otherwise the two mixes sit within about 3 points of each other in every band, so the difference to listen for is in how each note is built, not in where the mix's energy lies. The first attempt was far too dark, 0.8% above 2 kHz, until the filters opened a long way: it now reads 3.1% against the orchestra's 2.6%, and a single clean saw plainly needs a higher cutoff than a thick stack to read as bright.

## Next, in order

1. **The owner listens,** on all four performers, with humanizing on and off, and uploads a MIDI file of music known to be good: that separates "the synth is weak" from "the composition is weak".
2. **A tempo map,** then a richer performance: pedal, a real final ritardando.
3. **The shared score checker.**
4. **Round two,** with a harder, more divergent brief and the hybrid format beside the best of round one.
5. **Judge the SoundFont performer by ear** as the reference: if it beats every synth by a mile, that sets how far to push the synths.
