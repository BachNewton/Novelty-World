"""Designs each role's voice from cast.yaml into voices/<role>/reference.wav, once.
A role with a reference already keeps it. To replace a voice, delete its folder.

Run in WSL: tools/run_breeze.sh tools/design_voices.py stories/<slug>/voices stories/<slug>
"""
import sys
from pathlib import Path

import soundfile as sf
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

import breeze  # noqa: E402

STORY = Path(__file__).resolve().parent.parent / sys.argv[1]
CFG = 4.0

cast = yaml.safe_load((STORY / "cast.yaml").read_text(encoding="utf-8"))
for role, voice in cast.items():
    folder = STORY / "voices" / role
    path = folder / "reference.wav"
    if path.exists():
        continue
    folder.mkdir(parents=True, exist_ok=True)
    request = {"id": role, "text": voice["reference_text"], "speaker": "S0",
               "instruction": voice["design"]}
    audio = breeze.generate(request, CFG, int(voice["seed"]))
    tmp = folder / "reference.part.wav"
    sf.write(tmp, audio, breeze.sample_rate, subtype="PCM_16")
    tmp.replace(path)
    (folder / "reference.txt").write_text(voice["reference_text"], encoding="utf-8")
    print("wrote", role, flush=True)
print("all done", flush=True)
