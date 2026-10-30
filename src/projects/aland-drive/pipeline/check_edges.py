"""What real tiles do at the edges: the sea, the shore, and the seam between two neighbours.

    pipeline/.venv/Scripts/python pipeline/check_edges.py

Builds its tiles into .data/edge-tiles, so the game's own folder is untouched,
then decodes them and prints what it finds.
"""

import gzip
import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from scipy import ndimage

import build
import terrain
from grid import neighbour, tile_from_name
from sources import RAW, dem_path

OUT = Path(__file__).resolve().parent.parent / ".data" / "edge-tiles"
SEA_TILES = ("K2444F", "L2334B")
SHORE_TILES = ("L2343D", "L2343F")
SEAM = ("L2343C", "L2343E")
SEAM_ROWS = ("L2343C", "L2343D")
SHORE_SAMPLES = 3


def raw(name: str) -> np.ndarray:
    path = dem_path(tile_from_name(name))
    assert path is not None, name
    with rasterio.open(path) as dataset:
        return dataset.read(1)


def built_heights(name: str) -> np.ndarray:
    manifest = json.loads((OUT / name / "tile.json").read_text(encoding="utf-8"))
    nodes = manifest["heights"]["nodes"]
    deltas = np.frombuffer(gzip.decompress((OUT / name / "heights.bin.gz").read_bytes()), dtype="<i2").reshape(nodes, nodes)
    return np.cumsum(deltas.astype(np.int32), axis=1)


def built_shade(name: str) -> np.ndarray:
    return np.asarray(Image.open(OUT / name / "shade.webp").convert("L"), dtype=np.int16)


def built_water(name: str) -> np.ndarray:
    """At the mask's 4 m, so the raw samples beside it are taken every second one."""
    return np.asarray(Image.open(OUT / name / "mask.png"))[..., 0] > 127


def road_ends(name: str, side: str, value: float) -> np.ndarray:
    roads = json.loads((OUT / name / "roads.json").read_text(encoding="utf-8"))["roads"]
    axis = 0 if side == "east" else 1
    ends = [point for road in roads for point in (road["line"][0], road["line"][-1]) if point[axis] == value]
    return np.array(ends).reshape(-1, 2)


def report_sea(name: str) -> None:
    samples = raw(name)[::2, ::2]
    water = built_water(name)
    values, counts = np.unique(np.round(samples[water], 2), return_counts=True)
    common = sorted(zip(counts, values), reverse=True)[:4]
    print(
        f"{name}: {water.mean():.1%} water, {(samples == -9999).sum()} nodata samples; "
        f"samples {samples.min():.3f} to {samples.max():.3f} m; water levels (share, m) "
        + ", ".join(f"{count / water.sum():.0%} {value:.2f}" for count, value in common)
    )
    neighbours = [neighbour(tile_from_name(name), east, north) for east in (-1, 0, 1) for north in (-1, 0, 1)]
    absent = [tile.name for tile in neighbours if dem_path(tile) is None]
    size = sum(path.stat().st_size for path in (OUT / name).iterdir()) / 1e6
    print(f"  built tile {size:.2f} MB; neighbours the mirror doesn't have: {absent or 'none'}")


def report_shore(name: str) -> None:
    samples = raw(name)[::2, ::2]
    water = built_water(name)
    land = ~water
    shore_land = land & ndimage.binary_dilation(water, iterations=SHORE_SAMPLES)
    print(
        f"{name}: {water.mean():.1%} water; land within {SHORE_SAMPLES * 2} m of it has median height "
        f"{np.median(samples[shore_land]):.2f} m, P5 {np.percentile(samples[shore_land], 5):.2f}, P95 {np.percentile(samples[shore_land], 95):.2f}; "
        f"water level {np.median(samples[water]):.3f} m; "
        f"land at or below 0 m: {(samples[land] <= 0).mean():.2%}, flat water it missed: "
        f"{((ndimage.maximum_filter(samples, 3) - ndimage.minimum_filter(samples, 3) <= terrain.WATER_FLATNESS_M) & land).mean():.2%} of the tile"
    )


def report_seam(first: str, second: str, across_columns: bool) -> None:
    """`second` lies east of `first` when across_columns, else north of it."""
    a, b = built_heights(first), built_heights(second)
    shared_a, shared_b = (a[:, -1], b[:, 0]) if across_columns else (a[0, :], b[-1, :])
    inner = np.abs(a[:, -1] - a[:, -2]) if across_columns else np.abs(a[0, :] - a[1, :])
    print(f"{first}|{second} shared height row: {(shared_a == shared_b).mean():.2%} equal; largest difference {np.abs(shared_a - shared_b).max()} cm; the next node over differs by a median {np.median(inner):.0f} cm")

    raw_a, raw_b = raw(first), raw(second)
    edge_a, edge_b = (raw_a[:, -1], raw_b[:, 0]) if across_columns else (raw_a[0, :], raw_b[-1, :])
    next_a = raw_a[:, -2] if across_columns else raw_a[1, :]
    print(f"  raw samples across the seam: median step {np.median(np.abs(edge_b - edge_a)) * 100:.1f} cm, P99 {np.percentile(np.abs(edge_b - edge_a), 99) * 100:.0f} cm, mean {np.mean(edge_b - edge_a) * 100:+.1f} cm; one sample inside the tile: median {np.median(np.abs(edge_a - next_a)) * 100:.1f} cm, P99 {np.percentile(np.abs(edge_a - next_a), 99) * 100:.0f} cm")

    shade_a, shade_b = built_shade(first), built_shade(second)
    edge_a, edge_b = (shade_a[:, -1], shade_b[:, 0]) if across_columns else (shade_a[0, :], shade_b[-1, :])
    next_a = shade_a[:, -2] if across_columns else shade_a[1, :]
    print(f"  shade across the seam: median step {np.median(np.abs(edge_b - edge_a)):.0f}/255, P99 {np.percentile(np.abs(edge_b - edge_a), 99):.0f}; inside the tile: median {np.median(np.abs(edge_a - next_a)):.0f}, P99 {np.percentile(np.abs(edge_a - next_a), 99):.0f}")

    water_a, water_b = built_water(first), built_water(second)
    edge_a, edge_b = (water_a[:, -1], water_b[:, 0]) if across_columns else (water_a[0, :], water_b[-1, :])
    print(f"  water along the seam: {edge_a.sum()} and {edge_b.sum()} samples, disagreeing at {(edge_a != edge_b).sum()}")

    if not (OUT / first / "roads.json").exists() or not (OUT / second / "roads.json").exists():
        print("  roads crossing: not checked, OSM isn't fetched for both tiles")
        return
    manifest = json.loads((OUT / first / "tile.json").read_text(encoding="utf-8"))
    side, value = ("east", manifest["bounds"]["east"]) if across_columns else ("north", manifest["bounds"]["north"])
    ends_a, ends_b = road_ends(first, side, value), road_ends(second, side, value)
    gaps = [np.abs(ends_b - end).sum(axis=1).min() for end in ends_a] if len(ends_b) else []
    print(f"  roads crossing: {len(ends_a)} ends on one side, {len(ends_b)} on the other; largest gap between partners {max(gaps) if gaps else 0:.2f} m")


def main() -> None:
    build.OUTPUT = OUT
    for name in dict.fromkeys((*SEA_TILES, *SHORE_TILES, *SEAM, *SEAM_ROWS)):
        # OSM's only needed at the seams, and only tiles already fetched: the public servers are often down.
        build.build_tile(tile_from_name(name), False, with_vectors=(RAW / "osm" / f"{name}.json").exists())
    print()
    for name in SEA_TILES:
        report_sea(name)
    for name in SHORE_TILES:
        report_shore(name)
    report_seam(*SEAM, across_columns=True)
    report_seam(*SEAM_ROWS, across_columns=False)


if __name__ == "__main__":
    main()
