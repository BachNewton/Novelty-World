"""The exported data the engine plays from, and the committed reference games."""

import glob
import os

import torch

from .board import DATA
from .tables import BlitzTables


def best_tables_prefix() -> str:
    """The largest blitz table present: `blitz-256` where it has been exported locally (it is
    gitignored), else the committed `blitz-32`."""
    large = os.path.join(DATA, "blitz-256")
    return large if os.path.exists(large + ".bin") else os.path.join(DATA, "blitz-32")


def load_best(device: torch.device | str) -> BlitzTables:
    return BlitzTables.load(best_tables_prefix(), device)


FIXTURES = os.path.join(os.path.dirname(DATA), "fixtures")


def fixture_paths() -> list[str]:
    """The committed game records of reference games."""
    return sorted(glob.glob(os.path.join(FIXTURES, "*.jsonl*")))
