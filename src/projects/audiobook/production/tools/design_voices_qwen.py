"""Designs each role's voice with Qwen3-TTS VoiceDesign: one take from its description.

usage: design_voices_qwen.py <story dir> <out dir> <role> [<role> ...]

Each role's `design` (the description) and `reference_text` come from the story's
cast.yaml, and its `seed` fixes the take, so a voice is the same every time it's
rebuilt. The description is the whole spec: there is no judge and no choosing between
takes, and a voice the owner doesn't like is fixed by changing its description. Nothing
checks a take's length or sound, since a check that misfires would silently swap in a
different person; only a take that never ends stops the run. The take becomes
<out>/<role>.wav, the clip VibeVoice clones from.

Runs in WSL from ~/.venvs/qwen-voice (torch on the CPU).
"""

import argparse
from pathlib import Path

import soundfile as sf
import torch
import yaml
from qwen_tts import Qwen3TTSModel

MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("story", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("roles", nargs="+")
    ap.add_argument("--threads", type=int, default=4)
    args = ap.parse_args()

    torch.set_num_threads(args.threads)
    cast = yaml.safe_load((args.story / "cast.yaml").read_text(encoding="utf-8"))
    args.out.mkdir(parents=True, exist_ok=True)
    tts = Qwen3TTSModel.from_pretrained(MODEL, device_map="cpu", dtype=torch.float32)

    for role in args.roles:
        out = args.out / f"{role}.wav"
        if out.exists():
            continue
        design, text = cast[role]["design"].strip(), cast[role]["reference_text"].strip()
        torch.manual_seed(cast[role]["seed"])
        # 12 Hz codec, so this cap is twice a slow reading of the text. Only a take that
        # never ends reaches it, and that fails loudly rather than becoming someone else.
        cap = int(2 * 0.6 * len(text.split()) * 12)
        wavs, sr = tts.generate_voice_design(
            text=text, instruct=design, language="English", do_sample=True,
            max_new_tokens=cap,
        )
        seconds = len(wavs[0]) / sr
        if seconds >= cap / 12 - 0.5:
            raise SystemExit(f"{role}: the take ran to the length cap without ending")
        sf.write(out, wavs[0], sr)
        print(f"{role}: {seconds:.1f}s", flush=True)
    print("all done")


if __name__ == "__main__":
    main()
