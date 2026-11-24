# Audio production

Where stories become audio: casting AI voices, rendering a performance, and assembling the chapters the Audiobook player publishes. The stories themselves are written in the Stories project (`src/projects/stories/`, its `CLAUDE.md`); production reads their chapters and never the other way round. It is the Audiobook project's workshop, not a site page.

## Layout

- `stories/<slug>/`, one per story performed, named as the story is in the Stories project:
  - `cast.yaml`, `voices/<role>/`: each role's voice and its locked reference clip.
  - `book/`: the chapter art and `book.json` that go to the player (its cover is the story's own).
  - `audio/` folders: renders, ignored by git.
- `tools/`: the Python audio tools (run in WSL).
- `casting/`: voice designs tried in batches.
- `capabilities.md`: every voice model tried, and what it can and can't perform.
- `ideas/production.md`: ambience, effects, music and mixing, for later.

## Performance

**Audio is paused** while the writing is rebuilt. The best performance heard so far came from ElevenLabs, which read a chapter from a PDF in one voice better than anything made locally, so the next attempt starts by weighing it, not only models that run on this machine. Every local model's verdict is in `capabilities.md`, and its tests were run from `stories/citizens-of-the-federation/chapters/04/audio/vibevoice-test/` (ignored by git), whose `LISTEN.md` lists them. The local tools still read an older narrator-line format; the step that turns a story's `chapter.md` into a performance is built when audio resumes. What holds for it:

- **The performance adapts to the text, never the other way round.** The strong voice models learned from audiobooks of good novels, so good writing is what performs well.
- **Quality and consistency decide the model, never speed.** Anything that fits on this machine is fair, even if a chapter renders all night: it's paid once and heard every time.
- **The narrator is cast by the producer's ear,** from candidates each heard over a long passage that runs through their range, because the listener spends hours with that voice. Every other role is designed from a description that is its whole spec (age, sex, origin, pitch, pace, energy, warmth, personality), in one seeded take with no audition (`tools/design_voices_qwen.py`; the `voice-casting` skill). A wrong voice is fixed by changing its description. A role's clip is locked once made, and every line is cloned from it.
- **The producer's listening is the only verdict on sound,** because Claude can't hear. What it finds goes into `capabilities.md`.
- **Publishing** follows the Audiobook project's `CLAUDE.md`.

The method was proved on the Nana biography (`~/myClaude/projects/nana-biography`), whose `CLAUDE.md` holds the casting findings, and Kalevala's `voice-acting` skill (`~/myClaude/projects/kalevala`) is the precedent for many character voices. Renders run in WSL on the eGPU, which other sessions may be using, so each is queued with the memory it needs (`npm run slot -- cores:2+egpu:9.2 -- wsl ...` for Breeze; "Sharing the machine" in the root `CLAUDE.md`).
