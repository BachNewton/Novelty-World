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

## Performance

Synths render a 90-second piece in 3 to 6 seconds in the worker, on a desktop. A phone's time isn't measured.

## Next, in order

1. **The owner listens,** on all four performers, with humanizing on and off, and uploads a MIDI file of music known to be good: that separates "the synth is weak" from "the composition is weak".
2. **A tempo map,** then a richer performance: pedal, a real final ritardando.
3. **The shared score checker.**
4. **Round two,** with a harder, more divergent brief and the hybrid format beside the best of round one.
5. **Sampled instruments** (a free SoundFont) as a reference: if they beat every synth by a mile, that sets how far to push the synths.
