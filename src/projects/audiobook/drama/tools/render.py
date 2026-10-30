"""Renders a story's lines, one WAV each, cloned from the locked voices, and re-records
a line whose edges sound cut. A line is skipped if its WAV exists and its text and
direction are unchanged, so editing a line re-records only that line.

A line ending in a dash is cut off on purpose, so its loud ending isn't a fault.

Run in WSL: tools/run_breeze.sh tools/render.py stories/<slug>/audio/lines stories/<slug>
"""
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

import breeze  # noqa: E402

TRIES = 4
END_MAX_DB = -30.0    # last 30 ms, relative to the loudest 10 ms
START_MAX_DB = -12.0  # first 20 ms

STORY = Path(__file__).resolve().parent.parent / sys.argv[1]
OUT = STORY / "audio" / "lines"
OUT.mkdir(parents=True, exist_ok=True)
script = yaml.safe_load((STORY / "script.yaml").read_text(encoding="utf-8"))


def reference(speaker: str) -> tuple[str, str]:
    folder = STORY / "voices" / speaker
    return str(folder / "reference.wav"), (folder / "reference.txt").read_text(encoding="utf-8").strip()


def problems(audio: np.ndarray, sr: int, cut_off: bool) -> tuple[list[str], float]:
    win = sr // 100
    n = len(audio) // win
    rms = np.sqrt((audio[:n * win].reshape(n, win) ** 2).mean(1)) + 1e-9
    db = lambda x: float(20 * np.log10(x / rms.max()))
    end, start = db(rms[-3:].mean()), db(rms[:2].mean())
    found = []
    if end > END_MAX_DB and not cut_off:
        found.append(f"ends loud ({end:.0f} dB)")
    if start > START_MAX_DB:
        found.append(f"starts loud ({start:.0f} dB)")
    return found, end


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
    cut_off = line["text"].rstrip().endswith("—")
    start, best = time.time(), None
    for i in range(TRIES):
        seed = int(line.get("seed", 7)) + i
        audio = breeze.generate(request, 2.0, seed)
        found, end = problems(audio, breeze.sample_rate, cut_off)
        if best is None or end < best[3]:
            best = (audio, seed, found, end)
        if not found:
            best = (audio, seed, found, end)
            break
        print(f"  {line['id']} seed {seed}: {', '.join(found)}; retrying", flush=True)
    audio, seed, found, _ = best
    tmp = path.with_suffix(".part.wav")
    sf.write(tmp, audio, breeze.sample_rate, subtype="PCM_16")
    tmp.replace(path)
    spec.write_text(wanted, encoding="utf-8")
    note = f" FLAGGED: {', '.join(found)}" if found else ""
    print("wrote", path.name, f"seed {seed} in {time.time() - start:.0f}s{note}", flush=True)
print("all done", flush=True)
