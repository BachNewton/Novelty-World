"""Measures a built tile's road surface, in numbers, against the raw heights.

    pipeline/.venv/Scripts/python src/projects/aland-drive/pipeline/road_audit.py L2343C

Reads only the tile's own files and the kept raw data: it answers whether the
surface a car drives on is smooth, stays on the real line, and sits on the land
with nothing showing through.
"""

import gzip
import json
import sys

import numpy as np
from scipy.spatial import cKDTree

import terrain
from build import OUTPUT
from grid import tile_from_name
from roads import Ground, surface_height

RINGS = 5
SPACING_M = 1.0
SPEEDS_M_S = (25, 55)
GRAVITY = 9.81


def load(name: str):
    folder = OUTPUT / name
    manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
    info = manifest["heights"]
    nodes = info["nodes"]
    units = np.frombuffer(gzip.decompress((folder / "heights.bin.gz").read_bytes()), "<i2").reshape(nodes, nodes)
    heights = np.cumsum(units, axis=1) * info["unitM"]
    data = gzip.decompress((folder / manifest["roadSurface"]["file"]).read_bytes())
    sections = sum(chain["sections"] for chain in manifest["roadSurface"]["chains"])
    raw = np.frombuffer(data[: sections * RINGS * 12], "<f4").reshape(sections, RINGS, 3)[..., [0, 2, 1]]  # To (east, height, north).
    tiers = np.frombuffer(data[sections * RINGS * 12 :], "u1")
    chains = []
    first = 0
    for chain in manifest["roadSurface"]["chains"]:
        chains.append({**chain, "rings": raw[first : first + chain["sections"]], "tiers": tiers[first : first + chain["sections"]]})
        first += chain["sections"]
    return manifest, heights, chains


def along_line(points: np.ndarray, spacing: float = SPACING_M) -> tuple[np.ndarray, np.ndarray]:
    lengths = np.concatenate(([0], np.cumsum(np.hypot(np.diff(points[:, 0]), np.diff(points[:, 2])))))
    stations = np.arange(0, lengths[-1], spacing)
    return np.column_stack([np.interp(stations, lengths, points[:, axis]) for axis in range(3)]), stations


def profile_numbers(heights: np.ndarray, spacing: float = SPACING_M) -> dict:
    grade = np.diff(heights) / spacing
    chord = 10
    bend = (heights[chord * 2 :] - 2 * heights[chord:-chord] + heights[: -chord * 2]) / (chord * spacing) ** 2
    worst = float(np.abs(bend).max())
    short = heights[6:] - 2 * heights[3:-3] + heights[:-6]
    return {
        "max grade %": round(float(np.abs(grade).max()) * 100, 2),
        "rough mm (rms over 6 m chord)": round(float(np.sqrt((short**2).mean())) * 1000, 2),
        "worst vertical curve radius m": round(1 / worst) if worst > 0 else None,
        **{f"worst lift at {speed} m/s (g)": round(speed**2 * worst / GRAVITY, 3) for speed in SPEEDS_M_S},
    }


def audit(name: str) -> None:
    manifest, heights, chains = load(name)
    step = manifest["heights"]["stepM"]
    west, north = manifest["bounds"]["west"], manifest["bounds"]["north"]
    tile = tile_from_name(name)
    mosaic = terrain.read_with_rim(tile)
    corners = terrain.sample_corners(mosaic)
    ground = Ground(corners, west, north, terrain.CORNER_RIM)

    roads = json.loads((OUTPUT / name / "roads.json").read_text(encoding="utf-8"))["roads"]
    lines = []
    for road in roads:
        points = np.array(road["line"], dtype=float)
        lengths = np.hypot(*np.diff(points, axis=0).T)
        fine = np.concatenate([np.linspace(a, b, max(int(np.hypot(*(b - a))), 2)) for a, b in zip(points[:-1], points[1:])])
        lines.append(fine)
    osm_tree = cKDTree(np.concatenate(lines))

    route = chains[0]
    centre, stations = along_line(route["rings"][:, 2])
    raw_heights = ground.sample(centre[:, [0, 2]])
    print(f"{route.get('ref')} {route.get('name')}: {stations[-1] / 1000:.2f} km in {route['sections']} sections")
    print("  raw model along the same line:", profile_numbers(raw_heights))
    print("  surface:", profile_numbers(centre[:, 1]))
    print(f"  surface minus raw model: {np.abs(centre[:, 1] - raw_heights).max():.2f} m at worst, {np.abs(centre[:, 1] - raw_heights).mean():.2f} m on average")
    offset, _ = osm_tree.query(centre[:, [0, 2]])
    print(f"  off OSM's line: {offset.max():.2f} m at worst, {np.median(offset):.2f} m median")

    by_kind: dict[str, list[dict]] = {}
    for chain in chains:
        by_kind.setdefault(chain["kind"], []).append(chain)
    for kind, group in by_kind.items():
        off, roughest, tallest, poke, gap, folds = [], [], [], [], [], 0
        length = 0.0
        for chain in group:
            rings = chain["rings"]
            if len(rings) < 2:
                continue
            middle, stations = along_line(rings[:, 2])
            length += stations[-1] if len(stations) else 0
            off.append(osm_tree.query(middle[:, [0, 2]])[0])
            if len(middle) > 25:
                numbers = profile_numbers(middle[:, 1])
                roughest.append(numbers["rough mm (rms over 6 m chord)"])
                tallest.append(numbers["worst lift at 25 m/s (g)"])
            # The ground must stay under the carriageway everywhere, not only at a ring's points.
            for share in (0.25, 0.5, 0.75, 1):
                for left, right in ((1, 2), (3, 2)):
                    samples = rings[:, right] + share * (rings[:, left] - rings[:, right])
                    between = (samples[:-1] + samples[1:]) / 2
                    for points in (samples, between):
                        poke.append((surface_height(heights, step, west, north, points[:, [0, 2]]) - points[:, 1]))
            gap.append(np.abs(surface_height(heights, step, west, north, rings[:, 0][:, [0, 2]]) - rings[:, 0, 1]))
            tangent = np.diff(rings[:, 2][:, [0, 2]], axis=0)
            for side in (1, 3):
                edge = np.diff(rings[:, side][:, [0, 2]], axis=0)
                folds += int(((edge * tangent).sum(-1) <= 0).sum())
        off = np.concatenate(off)
        poke = np.concatenate(poke)
        gap = np.concatenate(gap)
        print(
            f"{kind:13} {len(group):3} chains {length / 1000:5.1f} km | off OSM p50 {np.median(off):.2f} max {off.max():.2f} m"
            f" | rough max {max(roughest, default=0):.1f} mm, lift@25 {max(tallest, default=0):.2f} g"
            f" | ground above road: max {poke.max() * 100:.1f} cm, {(poke > 0).mean():.2%} of samples"
            f" | outer ring off ground: max {gap.max() * 100:.1f} cm | folds {folds}"
        )
    # What the car would gain from 2 m heights off the road: how far the 4 m mesh sits from them.
    raw = terrain.tile_corners(corners)
    rows, columns = np.mgrid[0 : raw.shape[0] : 3, 0 : raw.shape[0] : 3]
    points = np.column_stack(((west + columns.ravel() * 2.0), (north - rows.ravel() * 2.0)))
    distance, _ = cKDTree(np.concatenate([chain["rings"][:, 2][:, [0, 2]] for chain in chains if chain["motor"]])).query(points, distance_upper_bound=60)
    off_road = np.isinf(distance)
    gap = np.abs(surface_height(heights, step, west, north, points) - raw[rows.ravel(), columns.ravel()])[off_road]
    print(f"4 m mesh against 2 m heights, far from roads: p50 {np.percentile(gap, 50) * 100:.1f} cm, p99 {np.percentile(gap, 99) * 100:.1f} cm, max {gap.max():.2f} m")
    print(f"sections {sum(chain['sections'] for chain in chains)}, triangles {sum(max(chain['sections'] - 1, 0) * 8 for chain in chains)}")


if __name__ == "__main__":
    for tile_name in sys.argv[1:]:
        audit(tile_name)
