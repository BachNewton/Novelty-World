"""Clones the lines Kokoro has no voice for (children, the elderly) with Chatterbox, on the CPU.

usage: chatterbox_clips.py <text file> <story dir> <clips dir> <speaker>[=exaggeration] ...

Each listed speaker's lines in the narrated-novel text are cloned from the speaker's locked
reference clip (<story dir>/voices/<speaker>/reference.wav) and written to the clips dir,
named by a hash of speaker and text, which kokoro_render.py takes with --clips. A clip
already there is skipped. Runs in WSL from the Kalevala Chatterbox venv (torch on CPU).
"""

import sys
import time
from pathlib import Path

import torch
import torchaudio
from chatterbox.tts import ChatterboxTTS

sys.path.insert(0, str(Path(__file__).parent))
from novel_text import clip_name, parse  # noqa: E402

TAKES = 3


def main():
    args = sys.argv[1:]
    builtin = "--builtin" in args  # every speaker in Chatterbox's own voice, not a clone
    args = [a for a in args if a != "--builtin"]
    text_path, story, clips = Path(args[0]), Path(args[1]), Path(args[2])
    speakers = dict(
        (s.split("=")[0], float(s.split("=")[1]) if "=" in s else 0.5) for s in args[3:]
    )
    clips.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(4)
    model = ChatterboxTTS.from_pretrained(device="cpu")
    for paragraph in parse(text_path):
        if paragraph == "scene":
            continue
        for speaker, text in paragraph:
            if speaker not in speakers:
                continue
            out = clips / clip_name(speaker, text)
            if out.exists():
                continue
            # A runaway take keeps talking past its words: anything far slower than any
            # real speaker is one. It's kept beside the retake, as <clip>.bad<n>.wav.
            limit = 1.5 + 0.6 * len(text.split())
            for attempt in range(1, TAKES + 1):
                started = time.perf_counter()
                wav = model.generate(
                    text,
                    audio_prompt_path=None if builtin else str(story / "voices" / speaker / "reference.wav"),
                    exaggeration=speakers[speaker],
                    cfg_weight=0.5,
                )
                seconds = wav.shape[-1] / model.sr
                wall = time.perf_counter() - started
                good = seconds <= limit
                target = out if good else out.with_suffix(f".bad{attempt}.wav")
                torchaudio.save(str(target), wav, model.sr)
                verdict = "" if good else f"  RUNAWAY (limit {limit:.1f}s)"
                print(f"{speaker}: {seconds:.1f}s in {wall:.0f}s  {text[:50]}{verdict}", flush=True)
                if good:
                    break
            else:
                raise SystemExit(f"{speaker}: every take ran away: {text}")
    print("all done")


if __name__ == "__main__":
    main()
