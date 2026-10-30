"""Casts each role in cast.yaml into voices/<role>/reference.wav, once. A role with a
reference already keeps it. To replace a voice, delete its folder.

Tries seeds from the role's `seed` up, and locks the first that scores at least
PASS_SCORE (tools/score_voices.py). Every candidate is kept in <story>/audio/design/<role>/, and a role with no passing
seed is reported and left without a voice.

Run in WSL: tools/run_breeze.sh tools/design_voices.py stories/<slug>/audio/design stories/<slug>
"""
import sys
from pathlib import Path

import soundfile as sf
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

import breeze  # noqa: E402
from score_voices import measure, score  # noqa: E402

STORY = Path(__file__).resolve().parent.parent / sys.argv[1]
OUT = STORY / "audio" / "design"
CFG = 4.0
TRIES = 8
PASS_SCORE = 3

cast = yaml.safe_load((STORY / "cast.yaml").read_text(encoding="utf-8"))
for role, voice in cast.items():
    folder = STORY / "voices" / role
    path = folder / "reference.wav"
    if path.exists():
        continue
    request = {"id": role, "text": voice["reference_text"], "speaker": "S0",
               "instruction": voice["design"]}
    chosen = None
    for seed in range(int(voice["seed"]), int(voice["seed"]) + TRIES):
        candidate = OUT / role / f"{seed}.wav"
        candidate.parent.mkdir(parents=True, exist_ok=True)
        audio = breeze.generate(request, CFG, seed)
        sf.write(candidate, audio, breeze.sample_rate, subtype="PCM_16")
        m = measure(audio.astype("float64"), breeze.sample_rate)
        passes = score(m) >= PASS_SCORE
        print(f"{role} seed {seed}: {m} score {score(m)} {'PASS' if passes else 'fail'}", flush=True)
        if passes:
            chosen = audio
            break
    if chosen is None:
        print(f"NO VOICE for {role}: no seed passed", flush=True)
        continue
    folder.mkdir(parents=True, exist_ok=True)
    tmp = folder / "reference.part.wav"
    sf.write(tmp, chosen, breeze.sample_rate, subtype="PCM_16")
    tmp.replace(path)
    (folder / "reference.txt").write_text(voice["reference_text"], encoding="utf-8")
    print("wrote", role, flush=True)
print("all done", flush=True)
