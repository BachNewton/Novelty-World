# Audio drama: the production layer

An idea, not a plan. The project starts with the writing, the voices and the performances. Everything here is what comes after that, kept so it isn't lost. Nothing below is decided or tested, and the model facts need rechecking when the work starts: these leaderboards move month to month.

## What it builds on

The Nana biography (`~/myClaude/projects/nana-biography`) made a whole audiobook with locked voices and a script of directed lines, and its `CLAUDE.md` holds what that taught. The Audiobook player already plays any book of MP3 chapters, so a drama needs no new player. Its export is mono, 64 kbps, 24 kHz, because it was speech only. A drama wants stereo and a higher bitrate, which is an export change, not a player change.

## The layers

Voices alone make a reading. These make it a place:

- **Space.** TTS voices come out dry and close. A scene needs each voice placed in its room and at its distance, with reverb, tone and stereo position. This is likely the cheapest change that does the most.
- **Ambience.** A continuous bed for each location, so the listener knows where they are before anyone speaks.
- **Sound effects.** Footsteps, doors and objects, used to carry action the script would otherwise have to say aloud.
- **Music.** A small set of cues generated once and reused, like locked voices, so a theme can return. Generated music is unlikely to hold a melody across separate generations.

## How it could work

- **Cues are anchored to script lines, not timestamps.** The script says a door slams after a given line. Then re-rendering a line never breaks the mix.
- **Stems.** Dialogue, ambience, effects and music render separately, so a change to the mix doesn't re-render anything.
- **The mix is code.** Background layers dip under speech automatically. Loudness is judged on the dialogue, since that is what a listener rides. Research finds people vary widely in how far they like the background lowered, so this gets set by ear.
- **Review stays by id.** The Nana review page, with its notes against line ids, extends to cues.

## Model candidates

| Job | Candidate | What's known | Open question |
|---|---|---|---|
| Ambience and effects | Stable Audio 3 Small SFX | Up to about two minutes. Stability's Community License: free under $1M revenue, per press coverage | Official card and memory needs not read |
| Ambience and effects | Sony Woosh | Weights are CC-BY-NC, which suits a non-commercial project | Memory needs and clip length not stated |
| Music | ACE-Step 1.5 | The model card says MIT, some third parties say Apache-2.0. Reported to run on a modest GPU | Fit for underscoring untested |

Recorded sound libraries may beat generation for everyday sounds such as footsteps and doors. Anything third-party shown on the site needs a credit (see Credits in the root `CLAUDE.md`).
