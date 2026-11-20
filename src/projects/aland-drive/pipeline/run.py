"""The pipeline's one command: python src/projects/aland-drive/pipeline/run.py L2343C [more tiles]

Stdlib only, because it runs before the environment exists: it makes the
pipeline's own venv on first use, then hands over to build.py inside it.

A worktree has no `.data` of its own, and a trial is built beside the tiles the
game has, never over them:

    run.py --data <a checkout's .data> --tiles <a folder> L2343C

reads that checkout's raw downloads, with its venv, and writes the tiles to the
folder named. A step that reads a tile's neighbours finds them in that folder
too, so a trial's folder starts as a copy of the tiles it rebuilds and those
round them: a copy, not links, since a build writes over its files in place.
"""

import os
import subprocess
import sys
import venv
from pathlib import Path

HERE = Path(__file__).resolve().parent


def taken(name: str) -> str | None:
    """An option of this script's own, taken out of the arguments build.py is handed."""
    for index, argument in enumerate(sys.argv):
        if argument == name and index + 1 < len(sys.argv):
            del sys.argv[index]
            return sys.argv.pop(index)
        if argument.startswith(name + "="):
            return sys.argv.pop(index).split("=", 1)[1]
    return None


data = taken("--data")
tiles = taken("--tiles")
# The checkout that keeps the data keeps the environment its tiles were built with.
home = Path(data).resolve().parent / "pipeline" if data else HERE
VENV = home / ".venv"
PYTHON = VENV / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")

if not PYTHON.exists():
    venv.create(VENV, with_pip=True)
    subprocess.run(
        [PYTHON, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "-r", home / "requirements.txt"],
        check=True,
    )

environment = {
    **os.environ,
    # NumPy's exp, log and pow, and OpenBLAS's kernels, round differently by which instructions the CPU has, so two
    # machines built different tiles from the same data. Held to what every x86 machine since 2015 has (AVX2), any
    # machine builds the same numbers its platform's other machines do.
    "NPY_DISABLE_CPU_FEATURES": "X86_V4 AVX512_ICL AVX512_SPR",
    "OPENBLAS_CORETYPE": "Haswell",
    # Read at import by `sources.py` and `build.py`.
    **({"ALAND_DRIVE_DATA": str(Path(data).resolve())} if data else {}),
    **({"ALAND_DRIVE_TILES": str(Path(tiles).resolve())} if tiles else {}),
}
sys.exit(subprocess.run([PYTHON, HERE / "build.py", *sys.argv[1:]], env=environment).returncode)
