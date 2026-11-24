"""Renders a story's lines, one WAV each, cloned from the locked voices. A line is
skipped if its WAV exists and its text and direction are unchanged, so editing a line
re-records only that line. To retake a line unchanged, give it a new `seed` and delete its WAV.

Run in WSL: tools/run_breeze.sh tools/render.py <folder>/audio/lines <folder>
where <folder> is a story, or a chapter of one (stories/<slug>/chapters/<nn>), whose
voices are shared at the story's root.
"""
import sys
import time
from pathlib import Path

import soundfile as sf
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

import breeze  # noqa: E402

FOLDER = Path(__file__).resolve().parent.parent / sys.argv[1]
STORY = FOLDER if (FOLDER / "cast.yaml").exists() else FOLDER.parent.parent
OUT = FOLDER / "audio" / "lines"
OUT.mkdir(parents=True, exist_ok=True)
script = yaml.safe_load((FOLDER / "script.yaml").read_text(encoding="utf-8"))


def reference(speaker: str) -> tuple[str, str]:
    folder = STORY / "voices" / speaker
    return str(folder / "reference.wav"), (folder / "reference.txt").read_text(encoding="utf-8").strip()


for line in script["lines"]:
    path = OUT / f"{line['id']}.wav"
    spec = OUT / f"{line['id']}.txt"
    wanted = f"{line['text']}\n{line['direction']}\n"
    if path.exists() and spec.exists() and spec.read_text(encoding="utf-8") == wanted:
        continue
    ref_audio, ref_text = reference(line["speaker"])
    request = {"id": line["id"], "text": line["text"], "speaker": "S0",
               "ref_audio_path": ref_audio, "ref_text": ref_text,
               "instruction": line["direction"]}
    start = time.time()
    audio = breeze.generate(request, 2.0, int(line.get("seed", 7)))
    tmp = path.with_suffix(".part.wav")
    sf.write(tmp, audio, breeze.sample_rate, subtype="PCM_16")
    tmp.replace(path)
    spec.write_text(wanted, encoding="utf-8")
    print("wrote", path.name, f"in {time.time() - start:.0f}s", flush=True)
print("all done", flush=True)
