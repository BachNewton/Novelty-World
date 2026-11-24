"""A Qwen CustomVoice speaker narrates directed takes: one voice, a direction note per take.

usage: qwen_custom_narrate.py <takes.yaml> <out.wav> <speaker> [<seed base>]
       qwen_custom_narrate.py --speakers

The takes file is a list of {direction, text}. CustomVoice's speakers are built into the
model, so a voice is the same on every take, and each take follows its direction note.
Each take is seeded, so a reading is the same every run. A take that runs to the length
cap without ending fails loudly. Runs in WSL from ~/.venvs/qwen-voice (torch on the CPU).
"""

import sys

import numpy as np
import soundfile as sf
import torch
import yaml
from qwen_tts import Qwen3TTSModel

MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
GAP = 0.7


def main():
    torch.set_num_threads(4)
    tts = Qwen3TTSModel.from_pretrained(MODEL, device_map="cpu", dtype=torch.float32)
    if sys.argv[1] == "--speakers":
        print(tts.get_supported_speakers())
        return
    takes = yaml.safe_load(open(sys.argv[1], encoding="utf-8"))
    out, speaker = sys.argv[2], sys.argv[3]
    # A different seed base gives a second, independent performance of the same takes.
    seed_base = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    pieces, rate = [], None
    for i, take in enumerate(takes):
        torch.manual_seed(seed_base + i)
        cap = int(2 * 0.6 * len(take["text"].split()) * 12) + 60
        wavs, rate = tts.generate_custom_voice(
            text=take["text"], speaker=speaker, language="English",
            instruct=take["direction"], do_sample=True, max_new_tokens=cap,
        )
        seconds = len(wavs[0]) / rate
        if seconds >= cap / 12 - 0.5:
            raise SystemExit(f"take {i + 1} ran to the length cap without ending")
        print(f"take {i + 1}: {seconds:.0f}s", flush=True)
        pieces += [np.asarray(wavs[0], dtype=np.float32), np.zeros(int(GAP * rate), np.float32)]
    audio = np.concatenate(pieces)
    sf.write(out, audio * (0.89 / np.max(np.abs(audio))), rate)
    print("all done")


if __name__ == "__main__":
    main()
