# Composer

An experiment, not a product: can Claude write music worth hearing twice? Findings go in `ideas/findings.md`.

Every piece has a genre and a style, which is how the track selector shelves it; a new piece names both.

## Who the page is for

**On a phone, it is for listening.** The priority is playing a piece and watching the visualization: passive, with nothing to read or operate beyond choosing a track, play and the scrubber.

**On a desktop, it is a composition aid and a collaborator.** The priority is showing what the owner needs to talk to Claude about a piece: sections, themes, harmony, instruments, sounds and their names, everything addressable, always to hand.

## The shape

Everything meets at one form, the score (`types.ts`): tracks of notes in beats, each track with a role (lead, keys, bass, pad, drums), a tempo map, and the sustain pedal, for the whole score or for one track.

- **Writing** is in one format: raw MIDI events in numbers (`formats/events.ts`), with `tempo` and `glide` lines for the tempo map and `pedal` lines for the pedal. A written ritardando is a glide and a pedalled note is a short note under a pedal, so neither is faked in the lengths. Each piece's text, band and analysis sit side by side in `pieces/`.
- **Time** goes through `tempo.ts`: `timingOf` turns beats into seconds and back, exactly through a glide, and `soundedEnd` says where a note stops under the pedal. Nothing else converts between the two; there is no single beat length.
- **A piece's band** (`synth/band.ts`) is how it sounds: plain data in its own file (`pieces/<piece>.band.ts`), seating every named track on instruments of the library with its own gain, pan, hall send, chorus, its slot in the spectrum (low and high cuts) and how far it sinks under the tune, and a fixed `level`. A track may sit in several chairs, which doubles a line (at an octave, if asked) without touching its notes. A piece's `band` is its default; `otherBands` are named alternatives over the same notes (`pieces/<piece>.<band>.band.ts`), each with its own `level`, every track seated. The band picker beside the track selector, on a desktop only and only for a piece with more than one, swaps them, stops playback, and the legend's instrument names follow. The mix is built so each line can be picked out and the band still reads as one instrument: a shared dark hall kept off the low parts, the low-mids cleared from everything but the bass, parts apart left to right, no doubles for their own sake, and a master bus of gentle compression and tape saturation.
- **The library** (`synth/library.ts`) is every sound that can play, and the Instruments tab is that catalogue, generated from it: a band can only name an instrument here, "used by" is read off every band of every piece, each entry auditions on examples suited to it (a kit gets hits and a pattern, not a scale; a sound whose point a scale would miss names its `showcase`), and an instrument no band or the piano picker can reach is deleted. Each has a stable name, a family, a character and the range it is made for, as data for one of five engines: the subtractive synth (`synth/analog.ts`: detuned unison stacks across the stereo field, a warm low-pass opening with velocity, slow per-voice drift), the struck engine for the pianos (`synth/struck.ts`: decaying stretched partials, each a pair of strings, with touch moving the spectrum a long way), 16-bit FM (`synth/genesis.ts`: the Sega Genesis's YM2612 in the chip's own register numbers, four operators in its eight algorithms, stepped envelopes, feedback, a 9-bit DAC, with a harder note brighter as well as louder), the console's drum samples, and a soft synthesised kit (`synth/soft-kit.ts`). A band with a piano can have it swapped for any other struck instrument (`withPiano`), whichever band is active, the picker beside the band picker; the star marks the piano recommended for that band, and a band with no piano has no picker. New sounds go in the library for later pieces to reuse. The Sketchbook family is a friendly sketch of each instrument, after the tone of Pokémon Emerald's and nothing else of it (no samples, bit crush, low rate or voice limit): one or two clean voices a note on simple waves, upper instruments with a quick start and a soft decay, basses that hold fully with slow movement inside (`filter.motion`, `pulseSwing`) and enough harmonics to speak on a small speaker, in a small short room. A note is cached by pitch, strength and take, rendered as long as its longest use needs, and dropped after its last.
- **Playback streams** (`player.ts`, `synth/render.worker.ts`, `synth/stream-worklet.ts`). `BandStream` renders a score a chunk at a time, on request, carrying every filter, delay line and the hall across the joins, and an AudioWorklet plays the chunks off one sample counter, so a join can't gap or click and the views' clock is exact. The render runs at the context's sample rate, so nothing is resampled. Play starts when the first chunk is in. Seeking to what has arrived is instant; seeking past it restarts the render there, losing the hall's tail from before. Running out fades, waits and picks up with a spinner, rather than glitching. Stopping or changing piece or piano drops it all: rendered audio lives for that play only, and nothing is saved in the browser. A stream can't see ahead, so nothing normalises: a band's `level` is worked out once by `tools/levels.ts`, and is rerun when a piece or band changes (tape takes any excess gently). The sampler's short clips render whole, through `prepare` and `play`.
- **The pedal in the band:** a note lifted under the pedal rings until it lifts, and on a piano with `sympathy`, the pedal raises every damper, so all twelve open strings answer.
- **Views** are how a score looks: the piano roll, and sheet music, with the analysis over both: the harmony lane (chords, marks, the tempo curve and the pedal) and the section ribbon, and on a desktop the track legend and theme picker. A picked theme lights by written place (`noteKey`). Sheet music has two stages. `notation/` transcribes, purely and under test, and is where notation's judgment lives: MIDI numbers have no note values, voices, spellings or key changes, so `quantise.ts` puts time on a grid chosen beat by beat and recovers written lengths from gated ones (staccato, swing as straight eighths with a marking), `metre.ts` cuts values, ties and rests by the metre, `spell.ts` finds the keys and spells every note on the line of fifths, and `transcribe.ts` builds staves and voices; `mei.ts` writes that down as MEI, with the pedal and tempo marks. Then Verovio (LGPL, a WebAssembly build, loaded only when the view opens, in `notation/engrave.worker.ts`) engraves one endless system, and `components/sheet-music.tsx` scrolls it under a fixed playhead against the player's clock, with `notation/timeline.ts` turning Verovio's timemap into motion.

## Talking about a piece

A piece's analysis is the owner's and Claude's common language. **Address a place by bar and beat, section, and theme name:** "the Doze's return at bar 33", "bar 43 beat 3, change the IV to a ♭VI", "the strings' figuration in A′". Bars count from 1, and beats count from 1 in the metre's unit. Tracks and instruments are named as the page shows them. Everything on the page answers to those words, so a request made in them finds one place in the notes.

## Every piece comes with an analysis

A new piece is written with `pieces/<id>.analysis.ts` beside it, typed in `analysis.ts` and set as `analysis` on its `Piece`; a piece without one still plays. Write it while the notes are fresh, and say what sounds, not what was meant:

- **Sections** cover every bar: a name, a form letter (A and A′ share a colour on the ribbon) and a line of `about`. **Movements** only where the piece has a large form.
- **Themes and motifs** get names of their own. `places` lists every occurrence by bar.beat, track, length in beats and transformation; the first is the literal statement the others are held to. `voice=loud` or `voice=top` picks the line from a busy track. Descriptions may name instruments.
- **Patterns** are ostinati, sequences, figuration, accompaniments and pedals with their extents, and `every` claims a period the rhythm has to keep.
- **`chart`** holds the harmony on bar.beat: chord symbol, Roman numeral in the local key (`-` where it has no function), a cadence (PAC, IAC, HC, DC, PC), `?` for an honest doubt, and `--` for a note. `key` lines mark modulations and how they happen; `tempo` lines mark tempo words and anything written into the note lengths; the tempo itself is the score's map, and shows as a curve in the harmony lane.

Dynamics aren't written: `dynamics.ts` reads them off the velocities, so they can't disagree with the notes.

`analysis-check.ts` holds it against the score: every chord's tones sound and the bass is right, a Roman numeral spells its chord in its key, a cadence has its dominant, every occurrence matches its statement in rhythm and pitch under its stated transformation, and sections leave no gaps. Fix the analysis when it fails, or mark the doubt, and never loosen the check to pass. A piece's comments are a plan, not evidence: analysts here found many a stated seventh that never sounds.

## The sound rule

**Native, not imitation.** A sound is judged on its own terms, never on how close it gets to a real instrument: imitation is fake meat.

**No chimes, bells, glassy or tinkling timbres by default, and no whine.** The owner wants rich, thick, full sound. No thin, nasal, sustained high narrow-band tone; no exposed sine or square above about C6 held for long; no resonant filter squeal; no pitch-bent thin leads. A sustained high line is thick and soft-edged, and loses its highs as it rises. The synth does this itself above C6 (top and level fall, and a sustained sound grows an `anchor` of soft body an octave or two below), and `synth/whine.ts` measures it: the strongest narrow band above 2 kHz in the held part of a note, against the note's loudest moment, with the centroid. `synth/band.test.ts` fails an instrument of the library for being whiny at the top of its range. A sound that a bell, cymbal or celesta would have made is a bloom or a wash here.

## The experiment

`ideas/brief.md` is the first brief and `ideas/findings.md` the history of what came of it.

Claude can't hear what it writes. It checks by numbers and shape; the owner judges by ear.

## Rules from the repo

Original melodies only, as Frogmino's music: styles may be borrowed, tunes may not.
