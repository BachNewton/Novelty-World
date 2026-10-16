"""Create (or update) the repo's Python venv (`.venv` at the repo root) and
install the layout solver's pinned requirements into it. Run through
`npm run setup:family-tree-solver`. The solver finds it by looking upward from
its own folder, so a worktree nested in the main checkout uses this one.
"""

import os
import subprocess
import venv

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", ".."))
VENV = os.path.join(REPO_ROOT, ".venv")
BIN = "Scripts" if os.name == "nt" else "bin"
PYTHON = os.path.join(VENV, BIN, "python.exe" if os.name == "nt" else "python")

if not os.path.exists(PYTHON):
    venv.create(VENV, with_pip=True)
subprocess.run(
    [PYTHON, "-m", "pip", "install", "--disable-pip-version-check", "-r", os.path.join(HERE, "requirements.txt")],
    check=True,
)
print(f"Layout solver ready: {PYTHON}")
