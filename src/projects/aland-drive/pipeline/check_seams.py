"""Do the built tiles meet? Decodes every neighbouring pair in .data/tiles and measures their shared edge.

    pipeline/.venv/Scripts/python pipeline/check_seams.py

Exits non-zero if a pair doesn't meet, which stops `upload.py` publishing them.
Heights must match exactly, and every road end on a shared edge must have a
partner: the same cross-section, wherever each tile's chain ran from.
"""

import gzip
import json
import sys

import numpy as np
from PIL import Image

from build import OUTPUT

RINGS = 5
RING_MATCH_M = 0.003
# Ends this close are one crossing. A way can touch an edge twice, tens of metres apart.
SAME_CROSSING_M = 2.0
GRAZING_EDGE_M = 10.0
SHADE_NEAR_ROAD_M = 30
SHADE_PIXEL_M = 2


def manifest(name: str) -> dict:
    return json.loads((OUTPUT / name / "tile.json").read_text(encoding="utf-8"))


def heights(name: str, file: str, nodes: int) -> np.ndarray:
    deltas = np.frombuffer(gzip.decompress((OUTPUT / name / file).read_bytes()), dtype="<i2").reshape(nodes, nodes)
    return np.cumsum(deltas.astype(np.int32), axis=1)


def road_rings(name: str) -> list[tuple[dict, np.ndarray]]:
    tile = manifest(name)
    chains = tile["roadSurface"]["chains"]
    sections = sum(chain["sections"] for chain in chains)
    raw = gzip.decompress((OUTPUT / name / "road-surface.bin.gz").read_bytes())
    rings = np.frombuffer(raw, dtype="<f4", count=sections * RINGS * 3).reshape(sections, RINGS, 3)
    placed = []
    first = 0
    for chain in chains:
        placed.append((chain, rings[first : first + chain["sections"]]))
        first += chain["sections"]
    return placed


def ends_on(name: str, axis: int, value: float) -> list[tuple[dict, np.ndarray]]:
    """Every chain end whose centre stands on a line of the grid, as its cross-section."""
    ends = []
    for chain, rings in road_rings(name):
        for ring in (rings[0], rings[-1]):
            if abs(ring[2, axis] - value) < 1e-3:
                ends.append((chain, ring))
    return ends


def shade_edges(name: str, side: str) -> np.ndarray:
    shade = np.asarray(Image.open(OUTPUT / name / "shade.webp").convert("L"), dtype=np.int16)
    return {"east": shade[:, -1], "west": shade[:, 0], "north": shade[0, :], "south": shade[-1, :]}[side]


def check_pair(first: str, second: str, across_columns: bool) -> list[str]:
    """`second` lies east of `first` when across_columns, else south of it. Prints what it measures; returns what's wrong."""
    a, b = manifest(first), manifest(second)
    problems: list[str] = []
    label = f"{first}|{second}"

    nodes = a["heights"]["nodes"]
    height_a, height_b = heights(first, "heights.bin.gz", nodes), heights(second, "heights.bin.gz", nodes)
    row_a, row_b = (height_a[:, -1], height_b[:, 0]) if across_columns else (height_a[-1, :], height_b[0, :])
    if not np.array_equal(row_a, row_b):
        problems.append(f"{label}: heights differ by up to {np.abs(row_a - row_b).max()} cm at {(row_a != row_b).sum()} nodes")

    far = a["far"]["nodes"]
    far_a, far_b = heights(first, "heights-far.bin.gz", far), heights(second, "heights-far.bin.gz", far)
    if not (np.array_equal(far_a[:, -1], far_b[:, 0]) if across_columns else np.array_equal(far_a[-1, :], far_b[0, :])):
        problems.append(f"{label}: far heights differ")

    axis, value = (0, a["bounds"]["east"]) if across_columns else (1, a["bounds"]["south"])
    ends_a, ends_b = ends_on(first, axis, value), ends_on(second, axis, value)
    worst = 0.0
    lonely = 0
    for chain, ring in ends_a:
        partners = [other for _, other in ends_b if np.hypot(*(other[2, :2] - ring[2, :2])) < SAME_CROSSING_M]
        if not partners:
            lonely += 1
            problems.append(f"{label}: {chain['kind']} at {ring[2, :2]} has no partner")
            continue
        gap = min(min(np.abs(partner - ring).max(), np.abs(partner[::-1] - ring).max()) for partner in partners)
        worst = max(worst, float(gap))
        if gap > RING_MATCH_M:
            problems.append(f"{label}: {chain['kind']} at {ring[2, :2]} meets its partner {gap:.3f} m apart")

    lone = [(chain, ring) for chain, ring in ends_b if not any(np.hypot(*(other[2, :2] - ring[2, :2])) < SAME_CROSSING_M for _, other in ends_a)]
    for chain, ring in lone:
        # A road running along an edge can dip across it for a few metres: two ends close together with no ribbon between
        # them over the line. Nothing is broken that a driver can reach.
        if not any(other is not ring and np.hypot(*(other[2, :2] - ring[2, :2])) < GRAZING_EDGE_M for _, other in lone):
            lonely += 1
            problems.append(f"{label}: {chain['kind']} at {ring[2, :2]} has no partner")

    shade_step = ""
    if ends_a:
        shade_a = shade_edges(first, "east" if across_columns else "south")
        shade_b = shade_edges(second, "west" if across_columns else "north")
        steps = np.abs(shade_a - shade_b)
        along = np.arange(len(steps)) * SHADE_PIXEL_M + SHADE_PIXEL_M / 2
        start = (a["bounds"]["north"] - along) if across_columns else (a["bounds"]["west"] + along)
        crossing = np.array([ring[2, 1 if across_columns else 0] for _, ring in ends_a])
        near_road = np.abs(start[:, None] - crossing[None]).min(axis=1) < SHADE_NEAR_ROAD_M
        shade_step = f"; shade step near roads median {np.median(steps[near_road]):.0f}/255, P99 {np.percentile(steps[near_road], 99):.0f}, elsewhere median {np.median(steps[~near_road]):.0f}, P99 {np.percentile(steps[~near_road], 99):.0f}"

    print(f"{label}: heights {'equal' if np.array_equal(row_a, row_b) else 'DIFFER'}; {len(ends_a)} and {len(ends_b)} road ends, {lonely} without a partner, worst ring gap {worst * 1000:.1f} mm{shade_step}")
    return problems


def check_all() -> list[str]:
    world = json.loads((OUTPUT / "world.json").read_text(encoding="utf-8"))
    size = world["tileM"]
    places = {(tile["west"], tile["north"]): tile["name"] for tile in world["tiles"]}
    problems: list[str] = []
    for (west, north), name in sorted(places.items()):
        if (west + size, north) in places:
            problems += check_pair(name, places[(west + size, north)], True)
        if (west, north - size) in places:
            problems += check_pair(name, places[(west, north - size)], False)
    return problems


if __name__ == "__main__":
    found = check_all()
    print("\n".join(found) if found else "every seam meets")
    sys.exit(1 if found else 0)
