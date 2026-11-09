"""A step over built tiles, side by side on several cores: the steps after the tile builds (the roadside, lanes and on).

Each tile's work writes only its own files, but never its `tile.json`: it returns its entry, and this one process writes
every tile's `tile.json` once the whole step is done. A worker reads its neighbours' `tile.json` (their heights, their
buildings), and one written while it reads could be caught half written, or, on Windows, fail to be replaced while
the reader has it open. Nothing a step writes is read by the same step, so the tiles come out the same in any order
and at any number of jobs.
"""

import json
import os
from collections.abc import Callable
from multiprocessing import get_context
from pathlib import Path
from typing import Any

from progress import Progress

# A tile's work: given (name, the tiles' folder), what to say when it's done and its entry for `tile.json`.
Work = Callable[[tuple[str, Path]], tuple[str, Any]]
# How a tile's entry goes into its `tile.json`.
Record = Callable[[dict, Any], dict]


def replace_text(path: Path, text: str) -> None:
    """Writes a file anew rather than over itself, so a copy of a tile made of links to another stays apart from it."""
    temporary = path.with_suffix(path.suffix + ".new")
    temporary.write_text(text, encoding="utf-8")
    os.replace(temporary, path)


def record_in(folder: Path, record: Record, entry: Any) -> None:
    path = folder / "tile.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    replace_text(path, json.dumps(record(manifest, entry), ensure_ascii=False, indent=2))


def run(step: str, names: list[str], tiles: Path, work: Work, record: Record, jobs: int = 1, setup: Callable[[Path], None] | None = None, fresh: bool = False) -> None:
    """Runs a step's work on every tile named, then records each tile's entry. `setup` readies what every tile's work
    shares, once in each process; `fresh` gives each tile a process of its own, for work that holds on to memory."""
    progress = Progress(step, len(names))
    entries: dict[str, Any] = {}
    work_list = [(name, tiles) for name in names]
    if jobs > 1:
        with get_context("spawn").Pool(jobs, initializer=setup, initargs=(tiles,) if setup is not None else (), maxtasksperchild=1 if fresh else None) as pool:
            for (name, _), (said, entry) in zip(work_list, pool.imap(work, work_list)):
                entries[name] = entry
                progress.finished(said)
    else:
        if setup is not None:
            setup(tiles)
        for job in work_list:
            said, entries[job[0]] = work(job)
            progress.finished(said)
    for name in names:
        record_in(tiles / name, record, entries[name])
