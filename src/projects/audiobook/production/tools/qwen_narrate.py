"""One voice reads a whole narrated-novel text (novel_text.py), as a human audiobook narrator would.

usage: qwen_narrate.py <text file> <out.wav> <reference clip> <reference text file> [--non-streaming]

Qwen3-TTS's Base model clones the reference clip (given with the words it says) and reads
one scene per generation, dialogue and all, so every line hears the rest of its scene.
Each scene is seeded, so a reading is the same every run. A scene that runs to the length
cap without ending fails loudly. Runs in WSL from ~/.venvs/qwen-voice (torch on the CPU).
"""

import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

sys.path.insert(0, str(Path(__file__).parent))
from novel_text import parse  # noqa: E402

MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
CAP = 4096  # sound frames at 12 Hz, about 5.7 minutes: far past any scene
GAP_SCENE = 1.6


def scenes(path):
    """Each scene as prose: dialogue in quotes, narration as written."""
    out, current = [], []
    for paragraph in parse(path):
        if paragraph == "scene":
            out.append(" ".join(current))
            current = []
            continue
        words = []
        for speaker, text in paragraph:
            words.append(text if speaker == "narrator" else f"“{text}”")
        current.append(" ".join(words))
    if current:
        out.append(" ".join(current))
    return [s for s in out if s.strip()]


def main():
    args = [a for a in sys.argv[1:] if a != "--non-streaming"]
    # Qwen's own tracker reports the clone model speeding up through long texts in its
    # default (simulated streaming) mode, and steady pacing in non-streaming mode.
    non_streaming = "--non-streaming" in sys.argv
    text_path, out = Path(args[0]), Path(args[1])
    clip, clip_text = args[2], Path(args[3]).read_text(encoding="utf-8").strip()
    torch.set_num_threads(4)
    tts = Qwen3TTSModel.from_pretrained(MODEL, device_map="cpu", dtype=torch.float32)
    prompt = tts.create_voice_clone_prompt(ref_audio=clip, ref_text=clip_text)

    pieces, rate = [], None
    for i, scene in enumerate(scenes(text_path)):
        torch.manual_seed(i)
        wavs, rate = tts.generate_voice_clone(
            text=scene, language="English", voice_clone_prompt=prompt,
            non_streaming_mode=non_streaming, do_sample=True, max_new_tokens=CAP,
        )
        seconds = len(wavs[0]) / rate
        if seconds >= CAP / 12 - 1:
            raise SystemExit(f"scene {i + 1} ran to the length cap without ending")
        print(f"scene {i + 1}: {seconds:.0f}s, {len(scene.split())} words", flush=True)
        pieces += [np.asarray(wavs[0], dtype=np.float32), np.zeros(int(GAP_SCENE * rate), np.float32)]

    audio = np.concatenate(pieces)
    sf.write(out, audio * (0.89 / np.max(np.abs(audio))), rate)
    print("all done")


if __name__ == "__main__":
    main()
