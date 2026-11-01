"""Plants a built tile's lattice from its stands image, and sets the result beside what MS-NFI says.

    python stand_audit.py [--folder FOLDER] L2343C [more tiles]

The stands image says what should stand; this rolls what the render will, place by
place, and measures it: the mix, the trees per hectare and the ground the crowns
cover, over the land MS-NFI holds. It prints a table in Markdown, and the laser's
height against MS-NFI's, stand by stand, to test the render's height range.
"""

import argparse
from dataclasses import dataclass
from multiprocessing import get_context
from pathlib import Path

import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

import stands
from grid import TILE_SIZE_M, tile_from_name
from sources import MSNFI_PIXEL_M, msnfi_path

SHORTEST_M = 3
COVER_POINTS = 400_000
# More crowns than can reach one point of ground on a 6 m lattice.
NEAREST_TREES = 16
HECTARE_M2 = 10_000
# Trees this much of the ground under them, so the stand's top is the laser's own.
WELL_WOODED = 0.8
HEIGHT_BINS_M = (6, 9, 12, 15, 18, 21, 24)


@dataclass
class Planted:
    east: np.ndarray
    south: np.ndarray
    height: np.ndarray
    species: np.ndarray


def plant(canopy_m: np.ndarray, shares: np.ndarray, occupancy: np.ndarray, rng: np.random.Generator, thin: bool = True) -> Planted:
    """The lattice over a tile, with the tree each place holds, in metres from its north-west corner."""
    across = TILE_SIZE_M // stands.LATTICE_M
    rows, columns = np.mgrid[0:across, 0:across]
    reach = stands.JITTER * stands.LATTICE_M
    east = (columns + 0.5) * stands.LATTICE_M + (rng.uniform(size=columns.shape) - 0.5) * reach
    south = (rows + 0.5) * stands.LATTICE_M + (rng.uniform(size=rows.shape) - 0.5) * reach

    def read(image: np.ndarray, pixel_m: float) -> np.ndarray:
        return ndimage.map_coordinates(image, [south / pixel_m - 0.5, east / pixel_m - 0.5], order=1, mode="nearest")

    height = read(canopy_m, TILE_SIZE_M / canopy_m.shape[0]) * rng.uniform(*stands.HEIGHT_RANGE, east.shape)
    standing = height >= SHORTEST_M
    if thin:
        standing &= rng.uniform(size=east.shape) < read(occupancy, stands.PIXEL_M)
    place_shares = np.stack([read(share, stands.PIXEL_M) for share in shares])
    species = (rng.uniform(size=east.shape) > np.cumsum(place_shares, axis=0)).sum(axis=0).clip(0, len(stands.SPECIES) - 1)
    return Planted(east[standing], south[standing], height[standing], species[standing])


def covered(trees: Planted, east: np.ndarray, south: np.ndarray) -> np.ndarray:
    """Whether a crown is over each point of ground, seen from above, crowns as discs. Exact: stamped on a grid, a crown's area is off by a third."""
    radii = np.append(stands.CROWN_SHARE[trees.species] * trees.height, 0)
    if len(trees.east) == 0:
        return np.zeros(len(east), dtype=bool)
    distances, nearest = cKDTree(np.column_stack([trees.east, trees.south])).query(np.column_stack([east, south]), k=NEAREST_TREES, distance_upper_bound=radii.max())
    return (distances <= radii[nearest]).any(axis=1)


def audit(name: str, folder: Path) -> dict:
    with np.load(msnfi_path(tile_from_name(name))) as kept:
        cut = {theme: kept[theme] for theme in kept.files}
    real = stands.read_stands(cut)
    canopy_m = stands.read_canopy(folder / name)
    shares, occupancy = stands.decode((folder / name / stands.FILE).read_bytes())

    rim = (cut["pine"].shape[0] - stands.MSNFI_PIXELS) // 2
    inner = (slice(rim, -rim),) * 2
    known = real.known
    volumes = np.array([cut[species][inner][known].astype(np.float64).sum() for species in stands.SPECIES])
    land_ha = known.sum() * MSNFI_PIXEL_M**2 / HECTARE_M2

    rng = np.random.default_rng(int.from_bytes(name.encode(), "little") % 2**32)
    full, thinned = plant(canopy_m, shares, occupancy, rng, thin=False), plant(canopy_m, shares, occupancy, rng)

    def on_land(east: np.ndarray, south: np.ndarray) -> np.ndarray:
        last = known.shape[0] - 1
        return known[(south / MSNFI_PIXEL_M).astype(int).clip(0, last), (east / MSNFI_PIXEL_M).astype(int).clip(0, last)]

    east, south = rng.uniform(0, TILE_SIZE_M, (2, COVER_POINTS))
    ground = on_land(east, south)
    mine = on_land(thinned.east, thinned.south)
    counts = np.bincount(thinned.species[mine], minlength=4)
    crowns = np.bincount(thinned.species[mine], weights=(stands.CROWN_SHARE[thinned.species[mine]] * thinned.height[mine]) ** 2, minlength=4)
    tree_share, canopy_height = stands.laser_stands(canopy_m)
    wooded = known & (tree_share >= WELL_WOODED)
    return {
        "tile": name,
        "forest": known.mean(),
        "real_mix": volumes / max(volumes.sum(), 1),
        "count_mix": counts / max(counts.sum(), 1),
        "crown_mix": crowns / max(crowns.sum(), 1e-9),
        "real_cover": real.cover[known].mean() if known.any() else 0,
        "full_cover": covered(full, east[ground], south[ground]).mean() if ground.any() else 0,
        "new_cover": covered(thinned, east[ground], south[ground]).mean() if ground.any() else 0,
        "full_ha": on_land(full.east, full.south).sum() / max(land_ha, 1e-9),
        "new_ha": mine.sum() / max(land_ha, 1e-9),
        "stems_ha": real.stems_ha[known].mean() if known.any() else 0,
        "land_ha": land_ha,
        "volumes": volumes,
        "counts": counts,
        "crowns": crowns,
        "heights": (real.mean_height_m[wooded], canopy_height[wooded]),
    }


def percent(mix: np.ndarray) -> str:
    return "/".join(f"{share * 100:.0f}" for share in mix)


def row(r: dict) -> str:
    return f"| {r['tile']} | {r['forest']:.0%} | {percent(r['real_mix'])} | {percent(r['count_mix'])} | {percent(r['crown_mix'])} | {r['real_cover']:.0%} | {r['full_cover']:.0%} | {r['new_cover']:.0%} | {r['full_ha']:.0f} | {r['new_ha']:.0f} | {r['stems_ha']:.0f} |"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tiles", nargs="+")
    parser.add_argument("--folder", type=Path, default=Path(__file__).resolve().parent.parent / ".data" / "tiles")
    parser.add_argument("--jobs", type=int, default=1)
    arguments = parser.parse_args()
    with get_context("spawn").Pool(arguments.jobs) as pool:
        results = pool.starmap(audit, [(name, arguments.folder) for name in arguments.tiles], chunksize=1)

    print("Mix is pine/spruce/birch/other, %. Cover and trees per hectare are over the land MS-NFI holds.\n")
    print("| Tile | MS-NFI land | Real mix, volume | Trees planted | Crown area | Real cover | Cover, full lattice | Cover, thinned | Trees/ha, full | Trees/ha, thinned | Real stems/ha |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    for result in results:
        print(row(result))
    weights = np.array([result["land_ha"] for result in results])
    sum_of = lambda key: np.sum([result[key] for result in results], axis=0)
    mean_of = lambda key: float(np.average([result[key] for result in results], weights=weights))
    print(row({
        "tile": "all",
        "forest": float(np.mean([result["forest"] for result in results])),
        "real_mix": sum_of("volumes") / sum_of("volumes").sum(),
        "count_mix": sum_of("counts") / sum_of("counts").sum(),
        "crown_mix": sum_of("crowns") / sum_of("crowns").sum(),
        **{key: mean_of(key) for key in ("real_cover", "full_cover", "new_cover", "full_ha", "new_ha", "stems_ha")},
    }))

    nfi = np.concatenate([result["heights"][0] for result in results])
    laser = np.concatenate([result["heights"][1] for result in results])
    print(f"\nHeight over {len(nfi)} well-wooded 16 m pixels, each read through a stand's kernel: MS-NFI's basal-weighted mean height over the canopy image's.\n")
    print("| MS-NFI mean height, m | Pixels | Laser canopy, m | Ratio, median | 10th | 90th |")
    print("|---|---|---|---|---|---|")
    edges = (0, *HEIGHT_BINS_M, 99)
    for low, high in [*zip(edges, edges[1:]), (0, 99)]:
        chosen = (nfi >= low) & (nfi < high) & (laser > 0)
        if chosen.any():
            ratio = nfi[chosen] / laser[chosen]
            print(f"| {low}–{high} | {chosen.sum()} | {np.median(laser[chosen]):.1f} | {np.median(ratio):.2f} | {np.percentile(ratio, 10):.2f} | {np.percentile(ratio, 90):.2f} |")


if __name__ == "__main__":
    main()
