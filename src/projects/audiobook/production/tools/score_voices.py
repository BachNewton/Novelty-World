"""Scores every finished voice in a casting batch from 1 to 5 on how clearly it was
recorded, into casting/audio/<batch>/scores.json. The score is a claim to test against
the owner's ears, so the measures it rests on stay in the file beside it.

Energy in the highs reads as clarity, but hiss, breath and rasp put energy there too.
Those are noise-like, so a voice whose highs are too flat counts as fuzzy, whatever
its clarity, and can't score above FUZZY_SCORE.

Run in WSL: ~/.venvs/nana-breeze/bin/python tools/score_voices.py casting/<batch>.yaml
"""
import json
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from scipy.signal import welch

# (score, clarity floor, top end floor), both in dB against 500 Hz-3 kHz.
BANDS = [(5, -12.0, -24.0), (4, -15.0, -27.0), (3, -18.0, -30.0), (2, -24.0, -42.0)]
FUZZ_LIMIT = 0.03  # spectral flatness above 3 kHz: 0 is pure tone, 1 is pure noise
FUZZY_SCORE = 2


def fuzz(audio: np.ndarray, sr: int) -> float:
    win = sr // 50
    n = len(audio) // win
    frames = audio[:n * win].reshape(n, win)
    rms = np.sqrt((frames ** 2).mean(1))
    power = np.abs(np.fft.rfft(frames[rms > np.percentile(rms, 90) * 0.3] * np.hanning(win), axis=1)) ** 2
    highs = power[:, np.fft.rfftfreq(win, 1 / sr) > 3000] + 1e-20
    return float(np.median(np.exp(np.log(highs).mean(1)) / highs.mean(1)))


def measure(audio: np.ndarray, sr: int) -> dict:
    f, p = welch(audio, sr, nperseg=2048)
    band = lambda lo, hi: 10 * np.log10(p[(f >= lo) & (f < hi)].mean() + 1e-20)
    mid = band(500, 3000)
    y = librosa.resample(audio, orig_sr=sr, target_sr=16000)
    f0, voiced, _ = librosa.pyin(y, fmin=50, fmax=700, sr=16000)
    return {"clarity": round(float(band(3000, 6000) - mid), 1),
            "top": round(float(band(6000, 8000) - mid), 1),
            "fuzz": round(fuzz(audio, sr), 3),
            "pitch": round(float(np.median(f0[voiced])))}


def score(m: dict) -> int:
    clean = next((s for s, clarity, top in BANDS if m["clarity"] >= clarity and m["top"] >= top), 1)
    return min(clean, FUZZY_SCORE) if m["fuzz"] > FUZZ_LIMIT else clean


if __name__ == "__main__":
    folder = Path(__file__).resolve().parent.parent / "casting" / "audio" / Path(sys.argv[1]).stem
    results = {}
    for wav in sorted(folder.glob("*.wav")):
        if wav.name.endswith(".part.wav"):
            continue
        audio, sr = sf.read(wav)
        m = measure(audio, sr)
        results[wav.stem] = {**m, "score": score(m)}
        print(wav.stem, results[wav.stem], flush=True)
    (folder / "scores.json").write_text(json.dumps(results, indent=1), encoding="utf-8")
