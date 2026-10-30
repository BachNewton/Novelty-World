---
name: compose-music
description: Compose a piece with the owner in Composer (src/projects/composer), from an idea in their words to a piece on the page with its own band and analysis, then revise it from their feedback. Use whenever the owner describes an idea for a piece, asks for a piece in a composer's or game's style, or gives feedback on a piece, its instruments or its sound.
---

# Composing with the owner

Read `src/projects/composer/CLAUDE.md` and the `music-taste` skill first. The owner brings the idea and the ear. Claude brings the notes, the instruments and the analysis. Claude can't hear, so the ear is the only verdict on how anything sounds.

## From idea to piece

1. **Brief.** Restate the idea as character, form and length, and only ask what can't be decided by default. Forbid first instincts: left alone, Claude converges on E flat, 6/8, about 85 seconds and a delayed tonic, whatever the format. Choose a key, metre and character that serve this idea.
2. **Sound brief.** One line per part: what it does and how it should feel. Then pick from the library, or build what's missing. New instruments go in the library, as data, with a name, a family, a description and a range, and every sound obeys the sound rule.
3. **Sketch before scoring.** Settle the themes, the form and the harmony in words the owner can answer: names, bars, Roman numerals. On a long piece, show this first.
4. **Write the notes** in raw events, in `pieces/<id>.ts`. Original melodies only: styles may be borrowed, tunes may not. Write for the chosen instruments' ranges and attacks. Expression belongs in the piece: real `tempo`, `glide` and `pedal` lines, velocities that shape phrases, rubato in the timing. Nothing adds it later.
5. **Check it,** with a throwaway script outside the repo: bar lengths, ranges, clashes, parallels, overlaps, hand spans for keyboards, the longest stretch of unchanged rhythm, phrase shape. Every writer so far found these worth checking.
6. **Write the analysis** in `pieces/<id>.analysis.ts`, saying what sounds, not what was meant. A plan's comments aren't evidence: `analysis-check.ts` finds stated sevenths that never sound. Mark an honest doubt with `?`.
7. **Band and level.** Write `pieces/<id>.band.ts`, register the piece with its genre, style and `after`, and set its level with `tools/levels.ts`.
8. **Hand over.** Say what was built, what to listen for by bar, and what's only measured. A self-rating isn't evidence: they all land near 7.

## Habits to fight

- A steady accompaniment figure left running for most of a piece. Change texture between sections, thin out, drop parts, let instruments answer.
- Doubling a line for thickness. It costs clarity before it adds weight.
- Treating figuration from a script as finished. It follows the harmony and sounds like a pattern: shape it by hand.
- Fixing a hard-to-follow line with a new sound. That's a composition question first.

## Feedback

Address everything by bar and beat, section, theme name, track and instrument, as the page shows them. Sampler codes name sounds exactly.

- **Writing feedback:** change the notes, then the analysis. `analysis.test.ts` shows what else it broke.
- **Sound feedback:** decide if it's the instrument, which changes every piece using it, or the band, which changes this piece. Say which.
- **Close the session:** propose what belongs in `music-taste` with its evidence, and write it only once the owner agrees. A remark about one bar stays with that bar.

## Rules of the room

- **Never play audio aloud.** To test playback, route the page's output through a zero-gain node in a test-only override, or check the rendered numbers. Listening is the owner's to start.
- Tests only for likely, costly mistakes. The owner wants few.
- Say plainly that nobody has heard a new sound or piece until the owner has.
