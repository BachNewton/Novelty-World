"""People placed in a tile, as the game bakes them into one crowd (`render/people.ts`).

Any module may place people. Each writes its own file in the tile, `people-<source>.json`,
and its own entry under `people` in `tile.json`, so one placing people never touches
another's: the game reads every file the tile lists and bakes them as one crowd.

A figure is its place in the scene (x, y, z), its yaw, its pose, its seed, and
optionally what's fixed about who they are. The yaw turns the figure's +z, the way it
faces, to (sin yaw, cos yaw) in the scene, whose z is south. The pose is one of
`art/people`'s, and its origin is what the pose says: the feet, a seat's footprint, or
a deck's edge with +z over the water. The seed is the person: the same seed is the
same person, so a seed comes from where they are and why, never from a counter.
What's fixed is `art/people`'s `FigureSpec` in part (`age`, `outfit`, ...), and a
`look` (`sailor`, `worker` or `cyclist`) for one of the kit's dressed parts.
"""

import json
import os
import zlib
from dataclasses import dataclass, field
from pathlib import Path

POSES = ("stand", "walk", "chat", "sit-bench", "sit-cafe", "fish", "sit-edge", "sunbathe", "field", "tend-boat", "wave")
CHILD_POSES = ("stand", "walk", "wave")
LOOKS = ("sailor", "worker", "cyclist")


@dataclass
class Figure:
    x: float
    y: float
    z: float
    yaw: float
    pose: str
    seed: int
    spec: dict = field(default_factory=dict)

    def row(self) -> list:
        if self.pose not in POSES:
            raise ValueError(f"no pose called {self.pose}")
        if self.spec.get("age") == "child" and self.pose not in CHILD_POSES:
            raise ValueError(f"a child is never placed in {self.pose}")
        if "look" in self.spec and self.spec["look"] not in LOOKS:
            raise ValueError(f"no look called {self.spec['look']}")
        row = [round(self.x, 2), round(self.y, 2), round(self.z, 2), round(self.yaw, 3), self.pose, self.seed]
        return [*row, self.spec] if self.spec else row


def seed_of(*key) -> int:
    """A person's seed from what placed them, so a rebuild places the same people."""
    return zlib.crc32(":".join(map(str, key)).encode()) & 0x7FFFFFFF


def roll(*key) -> float:
    return zlib.crc32(":".join(map(str, ("roll", *key))).encode()) / 2**32


def write(folder: Path, source: str, figures: list[Figure], licence: dict) -> dict:
    """Writes a source's people in the tile and lists the file in its `tile.json`; returns the entry."""
    file = f"people-{source}.json"
    _replace(folder / file, json.dumps({**licence, "figures": [figure.row() for figure in figures]}, separators=(",", ":")))
    poses: dict[str, int] = {}
    for figure in figures:
        poses[figure.pose] = poses.get(figure.pose, 0) + 1
    entry = {"file": file, "count": len(figures), "poses": dict(sorted(poses.items())), "figure": ["x", "y", "z", "yaw", "pose", "seed", "spec?"]}
    manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
    manifest["people"] = {**manifest.get("people", {}), source: entry}
    _replace(folder / "tile.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return entry


def _replace(path: Path, text: str) -> None:
    """Writes a file anew rather than over itself, so a copy of a tile made of links to another stays apart from it."""
    temporary = path.with_suffix(path.suffix + ".new")
    temporary.write_text(text, encoding="utf-8")
    os.replace(temporary, path)
