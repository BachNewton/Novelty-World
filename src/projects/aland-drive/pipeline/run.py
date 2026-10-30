"""The pipeline's one command: python src/projects/aland-drive/pipeline/run.py L2343C [more tiles]

Stdlib only, because it runs before the environment exists: it makes the
pipeline's own venv on first use, then hands over to build.py inside it.
"""

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

sys.exit(subprocess.run([PYTHON, HERE / "build.py", *sys.argv[1:]]).returncode)
