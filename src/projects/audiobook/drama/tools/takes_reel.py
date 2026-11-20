"""Joins every designed take into one reel to listen through, in the judge's rank order.

usage: takes_reel.py <voices dir> <out.wav> <role> [<role> ...]

Reads each role's <role>-scores.json (design_voices_qwen.py) and plays its takes from
rank one down, each after a spoken label ("Anna, rank one, take two") in a Kokoro voice
none of the cast uses, so the owner can check the judge against their ears.
Runs on Windows from ~/.venvs/kokoro.
"""

import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro
from misaki import en, espeak

MODELS = Path.home() / "models" / "kokoro"
RATE = 24000
WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]


def main():
    folder, out, roles = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:]
    session = ort.InferenceSession(str(MODELS / "kokoro-v1.0.onnx"))
    kokoro = Kokoro.from_session(session, str(MODELS / "voices-v1.0.bin"))
    g2p = en.G2P(trf=False, british=False, fallback=espeak.EspeakFallback(british=False))
    pieces = []

    def say(text):
        audio, _ = kokoro.create(g2p(text)[0], voice="af_nova", speed=1.1, is_phonemes=True)
        pieces.append(audio.astype(np.float32) * 0.6)
        pieces.append(np.zeros(int(0.4 * RATE), dtype=np.float32))

    for role in roles:
        scores = json.loads((folder / f"{role}-scores.json").read_text(encoding="utf-8"))
        for rank, take in enumerate(scores["ranking"], 1):
            say(f"{role.capitalize()}, rank {WORDS[rank]}, take {WORDS[int(take[-1])]}.")
            audio, rate = sf.read(folder / f"{take}.wav", dtype="float32")
            assert rate == RATE
            pieces.append(audio * (0.7 / np.max(np.abs(audio))))
            pieces.append(np.zeros(int(1.0 * RATE), dtype=np.float32))
        pieces.append(np.zeros(int(1.0 * RATE), dtype=np.float32))

    sf.write(out, np.concatenate(pieces), RATE)
    print("wrote", out)


if __name__ == "__main__":
    main()
