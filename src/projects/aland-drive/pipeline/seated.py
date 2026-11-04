"""People sitting on the street furniture's seats, sparse as a quiet summer's day on Åland.

Read off the seats `pipeline/furniture.py` wrote in the tile's `roadside.json`, so it needs
no rebuild, only the roadside first. Every bench and café table writes its two seats one
after the other, so a seat's partner is the one beside it in the list. Each bench or table
rolls from where it stands whether anyone is there, and whether it's one or a pair:

- **A café table** is busy anywhere, since its terrace is out because the place is open,
  and busier in town (`town.py`'s test, the roadside's too). A taken table
  is as often a pair, facing each other across it, as someone alone.
- **A bench** is quieter, much more so out of town, a park's included, now and then a
  pair side by side, and its sitters lean older.

A sitter's seed comes from their seat, so a rebuild seats the same people. No child sits:
the kit has no sitting child.

Run alone, it adds `people-seated.json` to tiles already built (see `people.py`).
"""

import argparse
import json
from pathlib import Path

import numpy as np

from people import Figure, roll, seed_of, write
from roadside import FILE
from town import town_of

SOURCE = "seated"
# Placed from OSM's benches, cafés and buildings, so the list is ODbL, as the roadside is.
LICENCE = {"license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors; National Land Survey of Finland, CC BY 4.0"}

# Of the benches and café tables, the share with anyone at them, in town and in the country; and of those, the share that are two.
TAKEN = {"sit-cafe": {"town": 0.35, "country": 0.25}, "sit-bench": {"town": 0.12, "country": 0.05}}
PAIR = {"sit-cafe": 0.45, "sit-bench": 0.25}
# On a bench, the share of sitters fixed as older, on top of the kit's own roll.
BENCH_OLDER = 0.25


def bake_seats(seats: dict[str, list[list[float]]], built_up) -> list[Figure]:
    """Who sits where, from a tile's seats; `built_up` says whether a place on the ground (east, north) is in town."""
    figures = []
    for pose, places in seats.items():
        for first in range(0, len(places) - 1, 2):
            pair = places[first : first + 2]
            middle = np.mean([[x, -z] for x, _, z, _ in pair], axis=0)
            key = (SOURCE, pose, round(float(middle[0]), 1), round(float(middle[1]), 1))
            where = "town" if built_up(middle) else "country"
            if roll(*key, "taken") >= TAKEN[pose][where]:
                continue
            taken = pair if roll(*key, "pair") < PAIR[pose] else [pair[int(roll(*key, "which") * 2)]]
            for x, y, z, yaw in taken:
                spec = {"age": "older"} if pose == "sit-bench" and roll(*key, x, z, "older") < BENCH_OLDER else {}
                figures.append(Figure(x, y, z, yaw, pose, seed_of(SOURCE, round(x, 2), round(z, 2)), spec))
    return figures


def figures_of(folder: Path) -> list[Figure]:
    entry = folder / FILE
    seats = json.loads(entry.read_text(encoding="utf-8")).get("seats", {}) if entry.exists() else {}
    return bake_seats(seats, town_of(folder.name)) if any(seats.values()) else []


def bake(name: str, tiles: Path) -> dict:
    folder = tiles / name
    return write(folder, SOURCE, figures_of(folder), LICENCE)


def bake_tiles(names: list[str], tiles: Path) -> None:
    """Seats people on built tiles: after the roadside, which writes the seats. A tile the mirror hasn't is sea, and has none."""
    for name in (name for name in names if (tiles / name / "tile.json").exists()):
        entry = bake(name, tiles)
        print(name, entry["count"], "seated")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tiles", nargs="*", help="NLS sheet names, such as L2343C; every built tile if none")
    parser.add_argument("--folder", type=Path, default=Path(__file__).resolve().parent.parent / ".data" / "tiles", help="where the built tiles are")
    parser.add_argument("--count", action="store_true", help="count who would be seated, and write nothing")
    arguments = parser.parse_args()
    totals: dict[str, int] = {}
    for name in arguments.tiles or sorted(path.parent.name for path in arguments.folder.glob("*/tile.json")):
        figures = figures_of(arguments.folder / name)
        if not arguments.count:
            write(arguments.folder / name, SOURCE, figures, LICENCE)
        poses = {pose: sum(figure.pose == pose for figure in figures) for pose in sorted({figure.pose for figure in figures})}
        for pose, count in poses.items():
            totals[pose] = totals.get(pose, 0) + count
        print(name, len(figures), poses)
    print("all", sum(totals.values()), dict(sorted(totals.items())))


if __name__ == "__main__":
    main()
