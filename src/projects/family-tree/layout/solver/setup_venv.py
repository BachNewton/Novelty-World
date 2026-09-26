"""Create (or update) the layout solver's venv beside this script and install
the pinned requirements into it. Run through `npm run setup:family-tree-solver`.
"""

import os
import subprocess
import venv

HERE = os.path.dirname(os.path.abspath(__file__))
VENV = os.path.join(HERE, ".venv")
BIN = "Scripts" if os.name == "nt" else "bin"
PYTHON = os.path.join(VENV, BIN, "python.exe" if os.name == "nt" else "python")

if not os.path.exists(PYTHON):
    venv.create(VENV, with_pip=True)
subprocess.run(
    [PYTHON, "-m", "pip", "install", "--disable-pip-version-check", "-r", os.path.join(HERE, "requirements.txt")],
    check=True,
)
print(f"Layout solver ready: {PYTHON}")
