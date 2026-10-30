# Audio Drama

Original full-cast audio stories, written by Claude and performed by AI voices. It is the Audiobook project's production workshop, not a site page: everything here is made to become a book on its player.

The first focus is the writing, the voices and the performances. Ambience, effects, music and mixing come later: `ideas/production.md`.

## Three layers

- **Writing craft** doesn't depend on any model: story, character, structure, writing for the ear.
- **The performance script** is where the two sides meet: who speaks, the words, and the direction.
- **Production tech** is model-specific: rendering, cloning, takes and retries. Changing models changes only this layer.

**What joins them is `capabilities.md`:** what this cast and model do well and badly. Claude writes with it open. Only the owner's listening updates it, because Claude can't hear the result.

## How a story gets made

1. **Script.** The owner reviews it before any audio: editing text is cheap, and re-recording is expensive.
2. **Cast.** The `voice-casting` skill casts each role without auditions. Its clip is locked, and every line is cloned from it, because designing from a description makes a new person each time.
3. **Render, then listen.** The owner gives notes by line id.
4. **A line that fails is rewritten, not only re-rendered.** The writer can change the words here, unlike the Nana biography.
5. **Notes go into `capabilities.md`**, so the next story is written to fit.

## Layout

- `capabilities.md`: what the actors can do.
- `stories/<slug>/script.yaml`: the performance script. `cast.yaml` beside it: each role and how its voice is designed.
- `stories/<slug>/voices/<role>/`: the locked reference clip and its transcript, committed.
- `stories/<slug>/audio/`: renders, ignored by git and regenerable.
- A story in chapters keeps `cast.yaml` and `voices/` at its root, one voice per role across the book, and each chapter's `script.yaml` and `audio/` in `chapters/<nn>/`. `book/` holds what goes to the player. The tools take the chapter's folder.
- `tools/`: `design_voices.py`, `render.py` (both in WSL under `run_breeze.sh`), then `assemble.py` (Windows).

## Script format

A list of lines, each with an `id`, `speaker`, `text`, `direction` and `pause_after` in seconds. An interruption is a line ending in a dash with `pause_after: 0`. `probe` says what a line is testing, in a story written to find out what the model can do.

Direction describes delivery, never a person, and starts with a verb. Each line is recorded alone, because lines beside each other carry different direction. Its first word also sets its level: a whisper stays quieter than a shout (`tools/assemble.py`).

## Where this comes from

The method was proved on the Nana biography (`~/myClaude/projects/nana-biography`), whose `CLAUDE.md` holds the casting findings and `tools/` the Breeze TTS 2 pipeline. Kalevala's `voice-acting` skill (`~/myClaude/projects/kalevala`) is the other precedent, with many character voices. Renders run in WSL on the eGPU, which other sessions may be using.
