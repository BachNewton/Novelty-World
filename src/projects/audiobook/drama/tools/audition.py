"""Designs every voice in a casting batch, one WAV each, and skips ones already there.

Run in WSL: tools/run_breeze.sh tools/audition.py casting/audio/<batch> casting/<batch>.yaml
"""
import sys
from pathlib import Path

import soundfile as sf
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

import breeze  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
batch_file = ROOT / sys.argv[1]
OUT = ROOT / "casting" / "audio" / batch_file.stem
OUT.mkdir(parents=True, exist_ok=True)
batch = yaml.safe_load(batch_file.read_text(encoding="utf-8"))

for voice in batch["voices"]:
    path = OUT / f"{voice['id']}.wav"
    if path.exists():
        continue
    request = {"id": voice["id"], "text": batch["text"], "speaker": "S0",
               "instruction": voice["design"]}
    audio = breeze.generate(request, 4.0, int(voice["seed"]))
    tmp = path.with_suffix(".part.wav")
    sf.write(tmp, audio, breeze.sample_rate, subtype="PCM_16")
    tmp.replace(path)
    print("wrote", path.name, flush=True)
print("all done", flush=True)
