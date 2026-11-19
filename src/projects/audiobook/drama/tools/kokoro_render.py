"""Renders a narrated-novel text (novel_text.py) with Kokoro, on the CPU.

usage: kokoro_render.py <text file> <out.wav> <cast> [--clips DIR] [--threads N]

<cast> maps speakers to Kokoro voices, "narrator=am_michael,anna=af_heart", with an
optional speed per voice ("walt=am_eric@0.92"). A speaker missing from the cast is read
by the narrator, so "narrator=am_michael" alone gives a single-narrator reading. A line
whose clip is in --clips (chatterbox_clips.py, for voices Kokoro has none of) uses it.
Kokoro's voices are fixed style vectors, not clones, so a voice is the same on every line.

Pronunciation goes through misaki, the dictionary-based G2P Kokoro was trained on, with
espeak only for words misaki doesn't know; kokoro-onnx's own path is espeak alone, which
mispronounces. Needs the venv at ~/.venvs/kokoro and the model files in ~/models/kokoro.
"""

import argparse
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro
from misaki import en, espeak

from novel_text import clip_name, parse

MODELS = Path.home() / "models" / "kokoro"
RATE = 24000
GAP_IN_SENTENCE = 0.08  # a tag splitting a quote: "Not in either one, Dad," / Anna says
GAP_IN_PARAGRAPH = 0.25
GAP_PARAGRAPH = 0.7
GAP_SCENE = 1.6


def parse_cast(spec):
    cast = {}
    for entry in spec.split(","):
        role, voice = entry.split("=")
        name, _, speed = voice.partition("@")
        cast[role] = (name, float(speed or 1.0))
    if "narrator" not in cast:
        raise SystemExit("the cast needs a narrator")
    return cast


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("text", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("cast")
    ap.add_argument("--clips", type=Path)
    ap.add_argument("--threads", type=int, default=4)
    args = ap.parse_args()

    options = ort.SessionOptions()
    options.intra_op_num_threads = args.threads
    session = ort.InferenceSession(str(MODELS / "kokoro-v1.0.onnx"), options)
    kokoro = Kokoro.from_session(session, str(MODELS / "voices-v1.0.bin"))
    g2p = en.G2P(trf=False, british=False, fallback=espeak.EspeakFallback(british=False))
    cast = parse_cast(args.cast)

    pieces, started = [], time.perf_counter()

    def silence(seconds):
        pieces.append(np.zeros(int(seconds * RATE), dtype=np.float32))

    for paragraph in parse(args.text):
        if paragraph == "scene":
            silence(GAP_SCENE - GAP_PARAGRAPH)
            continue
        for i, (speaker, text) in enumerate(paragraph):
            clip = args.clips / clip_name(speaker, text) if args.clips else None
            if clip and clip.exists():
                audio, rate = sf.read(clip, dtype="float32")
                # Chatterbox clips are louder and fuller than Kokoro's; bring them to its level.
                audio *= 0.32 / np.max(np.abs(audio))
            else:
                voice, speed = cast.get(speaker, cast["narrator"])
                phonemes, _ = g2p(text)
                audio, rate = kokoro.create(phonemes, voice=voice, speed=speed, is_phonemes=True)
            assert rate == RATE
            pieces.append(audio.astype(np.float32))
            if i < len(paragraph) - 1:
                silence(GAP_IN_SENTENCE if text.endswith(",") else GAP_IN_PARAGRAPH)
        silence(GAP_PARAGRAPH)

    audio = np.concatenate(pieces)
    audio *= 0.89 / np.max(np.abs(audio))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(args.out, audio, RATE)
    seconds = len(audio) / RATE
    wall = time.perf_counter() - started
    print(f"{args.out.name}: {seconds:.0f}s of audio in {wall:.0f}s wall ({seconds / wall:.1f}x)")


if __name__ == "__main__":
    main()
