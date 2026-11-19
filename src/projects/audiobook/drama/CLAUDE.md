# Drama workshop

Original stories, written by Claude and produced by the owner, which become books on the Audiobook player, performed by AI voices. It is the Audiobook project's workshop, not a site page.

## The producer and the writer

The owner is the producer. A producer designs a book without writing it, as an architect designs software without implementing it: the world, the outline and structure, the style, the taste, and the final judgement, made by reading. Claude is the writer: the storytelling craft, a recommendation whenever there's a choice, and honest pushback when an idea has a problem. When the producer hands over judgement on something, Claude takes it.

The producer's notes describe the reading: where it lost them, what fell flat, what rang false. Finding the cause, and fixing it there, is the writer's work.

- **Ideas arrive rough:** a sentence, a feeling, "I'm not sure yet". Take each seriously, shape it, and keep it open rather than forcing a decision. The producer's instinct has often beaten the writer's first version.
- **Explain anything the producer hasn't seen.** Give a character's or an idea's context before referring to it.
- **What's still open is kept in the story's `open-questions.md`,** with its context and a recommendation, until the producer comes back to it.

## The writing comes first

A chapter is a novel chapter, written for a reader. Nothing about how it will be performed shapes it: the strong voice models learned from audiobooks of good novels, so good writing is what performs well, and the performance adapts to the text, never the other way round.

## A book is a web, not modules

Good code is modular, so that its parts can change without each other. A novel is the opposite: its chapters depend on each other on purpose, through themes, plants and payoffs, and echoes. So the writing is never done. A chapter can be added anywhere (before, between or after the others) at any time, and adding or changing one means rereading the rest and revising them until the threads run through all of it again. Any chapter can be rewritten whole, and a rewrite is a fresh draft from the decisions, never a patch on the old text.

## How the work is done

The `write-fiction` skill is how Claude writes, rewrites and reviews: the steps, the producer's standards for prose (its `craft.md`), and the cold read by an agent that gets only the text. Every date, weekday, age, interval and time of day in a story is computed from the story's timeline by `tools/story-dates-cli.ts`, never worked out by hand.

## Layout

- `stories/<slug>/`, one story each:
  - `CLAUDE.md`: what the story is, its values and reader, and the producer's standing decisions.
  - `voice.md`: its narrator, with a reference passage.
  - `outline.md`: what each chapter is for, and the threads between them.
  - `people.md`, `timeline.ts`: who everyone is, and every date the story rests on.
  - `open-questions.md`: what the producer still has to decide or come back to.
  - `chapters/<nn>/chapter.md`: the manuscript.
  - `cast.yaml`, `voices/<role>/`: each role's voice and its locked reference clip. `book/`: the art and `book.json` that go to the player. `audio/` folders: renders, ignored by git.
- `tools/`: the date tool, and the Python audio tools (run in WSL).
- `capabilities.md`: every voice model tried, and what it can and can't perform.
- `ideas/production.md`: ambience, effects, music and mixing, for later.

## Performance

**Audio is paused** while the writing is rebuilt. The best performance heard so far came from ElevenLabs, which read a chapter from a PDF in one voice better than anything made locally, so the next attempt starts by weighing it, not only models that run on this machine. Every local model's verdict is in `capabilities.md`, and its tests were run from `stories/citizens-of-the-federation/chapters/01/audio/vibevoice-test/` (ignored by git), whose `LISTEN.md` lists them. The local tools still read an older narrator-line format; the step that turns a `chapter.md` into a performance is built when audio resumes. What holds for it:

- **Quality and consistency decide the model, never speed.** Anything that fits on this machine is fair, even if a chapter renders all night: it's paid once and heard every time.
- **The narrator is cast by the producer's ear,** from candidates each heard over a long passage that runs through their range, because the listener spends hours with that voice. Every other role is designed from a description that is its whole spec (age, sex, origin, pitch, pace, energy, warmth, personality), in one seeded take with no audition (`tools/design_voices_qwen.py`; the `voice-casting` skill). A wrong voice is fixed by changing its description. A role's clip is locked once made, and every line is cloned from it.
- **The producer's listening is the only verdict on sound,** because Claude can't hear. What it finds goes into `capabilities.md`.
- **Publishing** follows the Audiobook project's `CLAUDE.md`.

The method was proved on the Nana biography (`~/myClaude/projects/nana-biography`), whose `CLAUDE.md` holds the casting findings, and Kalevala's `voice-acting` skill (`~/myClaude/projects/kalevala`) is the precedent for many character voices. Renders run in WSL on the eGPU, which other sessions may be using.
