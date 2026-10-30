---
name: voice-casting
description: Cast AI voices for an audio story in the Audiobook drama workshop (src/projects/audiobook/drama) without the owner auditioning them. Use whenever a story gets a new character, a voice is replaced, or the owner says a voice sounds dull, muffled, unclear or like a different microphone.
---

# Casting a voice

A character needs a good voice that fits its description, not one right voice, so casting runs without auditions. Claude can't hear, so a score stands in for ears on the one thing it can check: how clearly the voice was recorded.

## Why casting is where this is decided

Cloning copies a reference clip's recording as well as its person. Every line inherits the clip's dullness or brightness, and EQ can't restore highs that aren't there. So a voice is judged at casting, before any line is rendered, and a voice that sounds badly recorded is re-cast, not re-rendered.

## The steps

1. Add the role to the story's `cast.yaml`: `role`, `seed`, `design` and `reference_text`. The description sets the pitch: the owner trusts it to, so casting doesn't check it.
2. Run `tools/design_voices.py` from `src/projects/audiobook/drama` (the usage is in its header). It tries up to eight seeds and locks the first that scores at least 3 of 5.
3. If it reports `NO VOICE`, read the candidates' measures in its log. Change the description, or start from a new `seed`, and run it again. Rewording alone may not be enough.
4. Commit the new `voices/<role>/` folder, and set the role's `seed` to the one that passed.
5. Render as usual. Keep one voice per role across a whole book.

To replace a voice, delete its `voices/<role>/` folder and run step 2. Then delete that speaker's rendered lines so they re-render.

## The score

`tools/score_voices.py` scores 1 to 5 from three measures, the first two against the voice's own 500 Hz to 3 kHz:

- **Clarity**, 3 to 6 kHz: where speech is understood. This is the one that tracked the owner's ears best.
- **Top end**, 6 to 8 kHz.
- **Fuzz**, how noise-like everything above 3 kHz is: the owner doesn't want to hear fuzziness or muffling.

The owner calibrated it by listening to a batch of test voices (`casting/batch-1.yaml`), and said it's imperfect but good enough to go on. The reference points from chapter 1 of Citizens of the Federation:

| Voice | Heard as | Clarity | Top end |
|---|---|---|---|
| Ben | Good | −9 | −20 |
| Walt | Fine, and the pass line | −18 | −29 |
| Narrator | Not clear enough | −22 | −47 |
| Anna | Terrible | −23 | −51 |
| Ruth | A disaster | −29 | −38 |

## What it can't tell you

- **Taste and fit.** Whether a voice is likeable or suits the character is the owner's call when they listen to the story.
- **Fuzz is only approximated.** Breath, hiss and rasp sit in the same frequencies as clarity, so the score also measures how noise-like the highs are and caps a fuzzy voice at 2. That limit was set from the test batch's suspicious voices, not from the owner's verdicts on them.
- **Description wording doesn't reliably set the score.** "Clear, crisp, close-microphone" helps, but seeds of one description can land far apart, which is why casting tries several.

When the owner disagrees with a score, believe them, and update this skill and the bands in `score_voices.py`.
