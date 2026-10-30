"""Pitch of each WAV, to check a designed voice against its character.
Usage: python tools/voice_stats.py <wav>..."""
import sys

import librosa
import numpy as np

for path in sys.argv[1:]:
    y, sr = librosa.load(path, sr=16000)
    f0, voiced, _ = librosa.pyin(y, fmin=50, fmax=700, sr=sr)
    f0 = f0[voiced]
    print(f"{path}: pitch {np.median(f0):.0f} Hz "
          f"(range {np.percentile(f0, 10):.0f}-{np.percentile(f0, 90):.0f}), "
          f"{len(y) / sr:.1f} s")
