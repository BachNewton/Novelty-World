"""The pipeline's one command: python src/projects/aland-drive/pipeline/run.py L2343C [more tiles]

Stdlib only, because it runs before the environment exists: it makes the
pipeline's own venv on first use, then hands over to build.py inside it.
"""

import os
import subprocess
import sys
import venv
from pathlib import Path

HERE = Path(__file__).resolve().parent
VENV = HERE / ".venv"
PYTHON = VENV / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")

if not PYTHON.exists():
    venv.create(VENV, with_pip=True)
    subprocess.run(
        [PYTHON, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "-r", HERE / "requirements.txt"],
        check=True,
    )

environment = {
    **os.environ,
    # NumPy's exp, log and pow, and OpenBLAS's kernels, round differently by which instructions the CPU has, so two
    # machines built different tiles from the same data. Held to what every x86 machine since 2015 has (AVX2), any
    # machine builds the same numbers its platform's other machines do.
    "NPY_DISABLE_CPU_FEATURES": "X86_V4 AVX512_ICL AVX512_SPR",
    "OPENBLAS_CORETYPE": "Haswell",
}
sys.exit(subprocess.run([PYTHON, HERE / "build.py", *sys.argv[1:]], env=environment).returncode)
