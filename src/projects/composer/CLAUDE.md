# Composer

An experiment, not a product: can Claude write music worth hearing twice, and in what form does it do that best? Nothing here is committed to: no format, synth or view is the chosen one yet. Findings go in `ideas/findings.md`.

## The shape

Everything meets at one form, the score (`types.ts`): tracks of notes, each track with a role (lead, keys, bass, pad, drums). So the three things under test vary independently, and any piece plays on any synth and shows in any view.

- **Formats** are how Claude writes. Each compiles to a score (`formats/`): ABC notation (read by abcjs), the tracker grid (Frogmino's way of writing, one token a sixteenth), raw MIDI events in numbers, and code (motifs as values, development as functions).
- **Performers** are how a score sounds (`synth/`). A performer is a band: a patch for each role, a place in the stereo field and a room. The patches are plain arithmetic, so they render the same anywhere and tests can run them: additive piano, Karplus-Strong harp, bowed strings, flute, FM, and ZzFX's chip voices. `render.ts` mixes a score, with Freeverb's room, and normalises it; it runs in a worker.
- **Humanizing** (`humanize.ts`) sits between: the same notes as someone might play them, seeded so a performance repeats. It can be turned off to compare.
- **Views** are how a score looks: the piano roll, and sheet music through `score-abc.ts`, which turns any score into ABC for abcjs to engrave, at sixteenth-note resolution. An ABC piece is engraved from its own source, with its repeats and dynamics.

MIDI files go both ways (`midi.ts`): a piece downloads to open in any notation program or DAW, and any file uploads to play on these synths, which is the way to judge a synth on music we know is good.

## The experiment

`ideas/brief.md` is the brief. Each piece in `pieces/` was written to it by a Claude that saw only its own format, so no piece is a transcription of another. To run a new round, change the brief, replace the pieces, and keep the isolation.

Claude can't hear what it writes. It checks by numbers and shape; the owner judges by ear.

## Rules from the repo

Original melodies only, as Frogmino's music: styles may be borrowed, tunes may not.
