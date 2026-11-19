# What the actors can do

The performance step's notes on each voice model: what it does well and badly, and how to adapt a manuscript to it. The writing never reads this, since a chapter is written for a reader and the performance adapts to it. Only the owner's listening moves a line into "Heard".

## Breeze TTS 2

Clones from a locked reference clip and takes a delivery note as its instruction.

### Heard on the Nana biography (a restrained older woman and a warm narrator)

- A long, intimate, expressive speech holds up, in takes of up to about 40 seconds.
- `(laugh)` and similar inline sounds sound broken and fake. Don't use them.
- A note that describes a person makes the voice drift to someone else. A note that describes delivery keeps it.
- Cloning thins an accent, and direction thins it further.
- Calm words ("steady", "unhurried") flatten a voice. Naming a feeling keeps it alive.
- "Soft", "gentle" and "shy" in a voice description come out muffled. Ask for a clear, close-microphone recording instead.
- A voice can win on a short line and fail at length. Judge on a long passage, and inside hand-offs.
- Nana had audible cut-offs at some line changes, cause unknown. Nothing guards against them: one heard here gets solved as its own problem.

### Heard on Otto and Dot (a playful children's story)

- The whole performance is usable, but a bit cringe. That may be the children's genre or the big, playful direction, not the model: a grounded story will tell the two apart.

### Heard on Citizens of the Federation

- A dull reference clip dulls every line, so voices cloned from different clips can sound like different microphones. Casting now checks this.
- Voices are inconsistent: some hold up, some are bad, and some drift into a different person as a chapter goes on. The owner won't quality-check every voice line by line, so this disqualifies the model for long stories.
- Fast back-and-forth and interruptions between separately recorded voices are hard to follow: the listener loses track of who's talking.
- Finnish words come out broken, and that breaks immersion. A performance on it needs foreign words respelled for English speech, or given in English.
- A reference clip's mood carries into every line. Anna's clip is a complaint ("nobody in this house has ever listened to me"), and her voice came out depressed or annoyed throughout.

### Unknown, with no line-level notes yet

- Shouting and whispering, and whether either keeps the voice.
- Very short lines ("Oh.", "Here.").
- Interruptions: a line cut off mid-sentence, and the reply landing straight on it.
- Fast back-and-forth between separately recorded voices.
- Spoken laughter written as words ("Hee hee!").
- Animal sounds written as words ("Honk!").
- Voices far from an ordinary adult: very deep, very small, comic.
- Direction for a child audience: playful, wide-eyed, sing-song.

## ElevenLabs

Heard by the owner outside this workshop: given the novel as a PDF, one of its voices produced a better reading than any local model here. A cloud service, so it breaks the "runs on this machine" rule the local tests worked under; the next attempt at audio weighs it first.

## Every model so far

- None reads subtext. Each performs a line's surface, and a performance overwrites whatever was layered under it, which is one more reason the manuscript puts what people feel on the page.

## Qwen3-TTS CustomVoice (built-in speakers, with direction)

The best performer heard so far. It takes a direction note per take and keeps a fixed built-in voice, run on the CPU (`tools/qwen_custom_narrate.py`). Its only English men are Aiden and Ryan.

### Heard on the Citizens of the Federation narrator test

- Aiden held up on new material (the Sunday call, the kitchen argument): fine, but not a voice the owner loves. Ryan sounded wrong on it too.
- Aiden, directed, narrating with a note per take and each exchange kept whole in one take: consistent, high quality, emotional, and the lines seem to carry their context. The owner doesn't love his voice's personality.
- Ryan, with the same notes, text and seeds, fell apart: slower on every take, and two takes broke down badly. Each take is sampled step by step, so one bad step can wreck a take; the same seed runs differently for a different voice. Any voice can break this way, so a clearly broken take (far longer than its words) is retaken, which is safe here because a retake keeps the same voice.
- Uncle Fu, a voice built for Chinese, with the same notes: a noticeable accent, which is fine, but the performance is over the top, like a movie-trailer announcer, with its range in the wrong places, and it drifts back to a generic voice over time. A built-in voice holds steady only in the language it was made for, and follows direction well only there.

## Qwen3-TTS cloning (Base)

- Holds a cloned voice for about the first 20 seconds of a take, then slides lower and flatter. Non-streaming mode helps but doesn't fix it.
- Takes no direction, so it is never emotional enough to carry a book in one voice. Out as the performer.

## VibeVoice

- Whole-scene context gives the best dialogue flow of the line-by-line era, but almost every render has a stray artifact somewhere, a sound effect or music. Not consistent enough. Out.
- Large on this CPU produces garbage, even with the sound modules in float32.

## Kokoro

Fixed voices, no cloning and no direction, run on the CPU (`tools/kokoro_render.py`) about three times faster than real time. Pronunciation goes through misaki: Kokoro's own espeak path made the narrator say words strangely.

### Heard on the Citizens of the Federation novel-format test

- Far more consistent than Breeze: a voice stays the same person from line to line.
- Its voices are all adults in their prime: no children and no elderly voices. Those come from Chatterbox clones.
- `bm_lewis` is the owner's narrator.
- Voice quality is passable; the performance is what fails. Speech written down as people really talk (repeated words, fillers like "It's, like", fragments, quick throwaway asides) comes out awkward, because every word gets the same careful weight.

## Chatterbox

Heard on Kalevala as the performer for many character voices. It has an emotion strength control but no direction in words, so a line that changes mood must be split. It's the first alternative if Breeze fails something above.

On this laptop's CPU (`tools/chatterbox_clips.py`, in WSL), it takes 7 to 8 seconds of work per second of speech, so it voices only the roles Kokoro can't. A very short line can run on into invented speech ("Walter works." came out 6.7 seconds long), so a clip far longer than its words is retaken.
