"""How good are OpenStreetMap's roads, judged by the 2 m heights?

    pipeline/.venv/Scripts/python pipeline/audit.py L2343C

Needs the tile built, and the NLS Topographic Database sheet in
.data/raw/mtk/ (the mirror's maastotietokanta/2025/shp/ folder). Three questions:

1. Offset. A road's laser profile is a raised strip with lower ground on both
   sides. Across each centreline, every 10 m, this finds the strip and how far
   it is from the line. The same on the NLS centrelines gives the method's own
   floor, and on lines moved 40 m off the road gives what it finds by chance.
2. Share of visible roads. Long raised strips are found in the heights alone,
   with no map, then asked whether OSM or NLS has a line along them.
3. Agreement with NLS, line against line.

Prints its numbers, and leaves an overlay picture in .data/audit/.
"""

import io
import json
import sys
import zipfile
from pathlib import Path

import numpy as np
import shapefile
from PIL import Image
from scipy import ndimage, signal
from scipy.spatial import cKDTree
from skimage import morphology

from grid import SAMPLE_M, SAMPLES, Tile, tile_from_name, to_local
from terrain import RIM_SAMPLES, read_with_rim, water_mask

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / ".data"
TILES = HERE.parent / ".data" / "tiles"

# NLS road classes: paved and gravel roads by size, then tracks and paths.
NLS_ROADS = {12121: "road IIa", 12122: "road IIb", 12131: "road IIIa", 12132: "road IIIb", 12141: "drive"}
NLS_PATHS = {12313: "path", 12314: "track", 12316: "tractor way"}

STATION_SPACING_M = 10
PROFILE_REACH_M = 24
STACK_REACH_M = 12  # Profiles averaged along the road, which raises a faint strip out of the noise.
STRIP_WIDTHS_M = (4, 6, 8)
FLANK_M = 4
STRIP_MIN_RISE_M = 0.12
CONTROL_SHIFT_M = 40

RIDGE_LENGTH_SAMPLES = 31
RIDGE_ANGLES = 16
STRIP_SEED_RISE_M = 0.2
STRIP_SEED_BEND_M = 0.25
STRIP_MAX_CREST_RATIO = 1.5
STRIP_GROW_RISE_M = 0.1
STRIP_GROW_BEND_M = 0.4
STRIP_MIN_SEED_SAMPLES = 25
STRIP_MIN_LENGTH_M = 200
HAS_A_LINE_WITHIN_M = 15
STRIPS_LISTED = 16


def densify(line: np.ndarray, spacing: float) -> np.ndarray:
    lengths = np.hypot(*np.diff(line, axis=0).T)
    along = np.concatenate(([0], np.cumsum(lengths)))
    stations = np.arange(0, along[-1] + 1e-6, spacing)
    return np.column_stack((np.interp(stations, along, line[:, 0]), np.interp(stations, along, line[:, 1])))


def nls_lines(tile: Tile) -> dict[str, list[np.ndarray]]:
    half = "L" if (tile.name[5] in "ABCD") else "R"
    sheet = f"{tile.name[:5]}{half}"
    archive = zipfile.ZipFile(DATA / "raw" / "mtk" / f"{sheet}.shp.zip")
    stem = f"l_{sheet}_v"
    reader = shapefile.Reader(
        shp=io.BytesIO(archive.read(stem + ".shp")),
        dbf=io.BytesIO(archive.read(stem + ".dbf")),
        shx=io.BytesIO(archive.read(stem + ".shx")),
    )
    lines: dict[str, list[np.ndarray]] = {}
    for item in reader.iterShapeRecords():
        label = {**NLS_ROADS, **NLS_PATHS}.get(item.record["LUOKKA"])
        if label is None:
            continue
        line = np.array(item.shape.points)
        if line[:, 0].max() < tile.west or line[:, 0].min() > tile.east or line[:, 1].max() < tile.south or line[:, 1].min() > tile.north:
            continue
        lines.setdefault(label, []).append(line)
    return lines


def osm_lines(tile: Tile) -> dict[str, list[np.ndarray]]:
    manifest = json.loads((TILES / tile.name / "tile.json").read_text(encoding="utf-8"))
    origin = manifest["worldOrigin"]
    roads = json.loads((TILES / tile.name / "roads.json").read_text(encoding="utf-8"))["roads"]
    lines: dict[str, list[np.ndarray]] = {}
    for road in roads:
        lines.setdefault(road["kind"], []).append(np.array(road["line"]) + (origin["east"], origin["north"]))
    return lines


class Heights:
    def __init__(self, tile: Tile) -> None:
        self.tile = tile
        self.mosaic = read_with_rim(tile)

    def at(self, east: np.ndarray, north: np.ndarray) -> np.ndarray:
        # Sample centres sit half a sample in from the mosaic's edge.
        rows = (self.tile.north - north) / SAMPLE_M + RIM_SAMPLES - 0.5
        columns = (east - self.tile.west) / SAMPLE_M + RIM_SAMPLES - 0.5
        return ndimage.map_coordinates(self.mosaic, [rows, columns], order=1)


def strip_offsets(heights: Heights, line: np.ndarray, shift: float = 0) -> list[float | None]:
    """Offset of the strip from each station on the line, None where no strip stands out."""
    if np.hypot(*(line[-1] - line[0])) < 1:
        return []
    stations = densify(line, STATION_SPACING_M)
    if len(stations) < 3:
        return []
    tangents = np.gradient(stations, axis=0)
    tangents /= np.maximum(np.hypot(*tangents.T), 1e-6)[:, None]
    normals = np.column_stack((-tangents[:, 1], tangents[:, 0]))
    stations = stations + normals * shift
    across = np.arange(-PROFILE_REACH_M, PROFILE_REACH_M + 1, 1.0)
    along = np.arange(-STACK_REACH_M, STACK_REACH_M + 1, 2.0)
    results: list[float | None] = []
    for station, tangent, normal in zip(stations, tangents, normals):
        grid_across, grid_along = np.meshgrid(across, along)
        east = station[0] + grid_across * normal[0] + grid_along * tangent[0]
        north = station[1] + grid_across * normal[1] + grid_along * tangent[1]
        profile = heights.at(east.ravel(), north.ravel()).reshape(east.shape).mean(axis=0)
        best_rise, best_offset = 0.0, None
        for width in STRIP_WIDTHS_M:
            half = width / 2
            for index, centre in enumerate(across):
                if abs(centre) > PROFILE_REACH_M - half - FLANK_M:
                    continue
                strip = np.abs(across - centre) <= half
                left = (across < centre - half - 0.5) & (across >= centre - half - FLANK_M - 0.5)
                right = (across > centre + half + 0.5) & (across <= centre + half + FLANK_M + 0.5)
                level = profile[strip].mean()
                rise = min(level - profile[left].mean(), level - profile[right].mean())
                if rise > best_rise:
                    best_rise, best_offset = rise, float(centre)
        results.append(best_offset if best_rise >= STRIP_MIN_RISE_M else None)
    return results


def summarise_offsets(name: str, lines: list[np.ndarray], heights: Heights, shift: float = 0) -> None:
    offsets = [value for line in lines for value in strip_offsets(heights, line, shift)]
    found = np.abs([value for value in offsets if value is not None])
    if not len(found):
        print(f"  {name}: no strips in {len(offsets)} stations")
        return
    print(
        f"  {name}: {len(offsets)} stations, strip found at {len(found) / len(offsets):.0%}; "
        f"offset median {np.median(found):.1f} m, P75 {np.percentile(found, 75):.1f}, P90 {np.percentile(found, 90):.1f}, "
        f"within 3 m {np.mean(found <= 3):.0%}, within 5 m {np.mean(found <= 5):.0%}"
    )


def _strip_measures(mosaic: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """At each sample, along the best-standing direction: rise above both near flanks, rise
    above both far flanks, and how far the strip bends up or down along its length."""
    half = RIDGE_LENGTH_SAMPLES // 2
    reach = half + 12
    rows, columns = np.mgrid[-reach : reach + 1, -reach : reach + 1]
    rise = np.full(mosaic.shape, -np.inf, dtype=np.float32)
    crest = np.zeros(mosaic.shape, dtype=np.float32)
    bend = np.zeros(mosaic.shape, dtype=np.float32)

    def mean_over(kernel: np.ndarray) -> np.ndarray:
        return signal.fftconvolve(mosaic, kernel / kernel.sum(), mode="same").astype(np.float32)

    for index in range(RIDGE_ANGLES):
        angle = np.pi * index / RIDGE_ANGLES
        along = columns * np.cos(angle) + rows * np.sin(angle)
        across = -columns * np.sin(angle) + rows * np.cos(angle)
        inside = np.abs(along) <= half
        strip = np.abs(across) <= 1.5
        centre = mean_over(inside & strip)
        near = np.minimum(
            centre - mean_over(inside & (across >= 2.5) & (across <= 5.5)),
            centre - mean_over(inside & (across <= -2.5) & (across >= -5.5)),
        )
        far = np.minimum(
            centre - mean_over(inside & (across >= 7.5) & (across <= 11)),
            centre - mean_over(inside & (across <= -7.5) & (across >= -11)),
        )
        ends = mean_over(strip & (along >= -half) & (along < -half / 3)) + mean_over(strip & (along > half / 3) & (along <= half))
        bent = np.abs(ends - 2 * mean_over(strip & (np.abs(along) <= half / 3)))
        better = near > rise
        rise[better], crest[better], bend[better] = near[better], far[better], bent[better]
    return rise, crest, bend


def visible_strips(heights: Heights) -> np.ndarray:
    """Centre-lines of what reads as a road in the heights alone, as a grid of the tile's samples.

    A rise over its flanks isn't enough: every bedrock crest here has one. A road keeps a
    steady grade along its length (a low bend) and doesn't go on falling away beyond its
    flanks (a crest close to the rise), so seeds must pass both, and grow through weaker ground.
    """
    rise, crest, bend = _strip_measures(heights.mosaic)
    seed = (rise >= STRIP_SEED_RISE_M) & (bend <= STRIP_SEED_BEND_M) & (crest <= STRIP_MAX_CREST_RATIO * rise)
    grown = (rise >= STRIP_GROW_RISE_M) & (bend <= STRIP_GROW_BEND_M)
    labels, _ = ndimage.label(grown, structure=np.ones((3, 3)))
    seeds = np.bincount(labels[seed], minlength=labels.max() + 1)
    seeds[0] = 0
    skeleton = morphology.skeletonize(seeds[labels] >= STRIP_MIN_SEED_SAMPLES)
    labels, count = ndimage.label(skeleton, structure=np.ones((3, 3)))
    sizes = np.bincount(labels.ravel(), minlength=count + 1)
    sizes[0] = 0
    long_enough = sizes[labels] * SAMPLE_M >= STRIP_MIN_LENGTH_M
    return long_enough[RIM_SAMPLES:-RIM_SAMPLES, RIM_SAMPLES:-RIM_SAMPLES] & ~water_mask(heights.mosaic)


def near_mask(lines: list[np.ndarray], tile: Tile, reach: float) -> np.ndarray:
    """Samples within `reach` of any line."""
    marked = np.ones((SAMPLES, SAMPLES), dtype=bool)
    for line in lines:
        points = densify(line, SAMPLE_M / 2)
        rows = ((tile.north - points[:, 1]) / SAMPLE_M).astype(int)
        columns = ((points[:, 0] - tile.west) / SAMPLE_M).astype(int)
        inside = (rows >= 0) & (rows < SAMPLES) & (columns >= 0) & (columns < SAMPLES)
        marked[rows[inside], columns[inside]] = False
    return ndimage.distance_transform_edt(marked) * SAMPLE_M <= reach


def line_agreement(name: str, lines: list[np.ndarray], against: list[np.ndarray], tile: Tile) -> None:
    points = np.concatenate([densify(line, 5) for line in lines if len(line) > 1])
    inside = (points[:, 0] >= tile.west) & (points[:, 0] <= tile.east) & (points[:, 1] >= tile.south) & (points[:, 1] <= tile.north)
    points = points[inside]
    tree = cKDTree(np.concatenate([densify(line, 1) for line in against]))
    distance, _ = tree.query(points)
    matched = distance[distance <= HAS_A_LINE_WITHIN_M]
    print(
        f"  {name}: {len(points) * 5 / 1000:.1f} km, {len(matched) / len(points):.0%} has a line within {HAS_A_LINE_WITHIN_M} m; "
        f"where it does, median gap {np.median(matched):.1f} m, P90 {np.percentile(matched, 90):.1f} m"
    )


def main() -> None:
    tile = tile_from_name(sys.argv[1])
    heights = Heights(tile)
    osm = osm_lines(tile)
    nls = nls_lines(tile)
    motor_kinds = ("primary", "secondary", "tertiary", "unclassified", "residential", "service", "track", "living_street")
    osm_motor = [line for kind in motor_kinds for line in osm.get(kind, [])]
    osm_all = [line for lines in osm.values() for line in lines]
    nls_motor = [line for label in NLS_ROADS.values() for line in nls.get(label, [])]
    nls_all = [line for lines in nls.values() for line in lines]

    print("OSM length by kind (km):", {kind: round(sum(np.hypot(*np.diff(line, axis=0).T).sum() for line in lines) / 1000, 1) for kind, lines in sorted(osm.items())})
    print("NLS length by class (km):", {label: round(sum(np.hypot(*np.diff(line, axis=0).T).sum() for line in lines) / 1000, 1) for label, lines in sorted(nls.items())})

    print("Offset of the strip in the heights from the centreline:")
    for kind in motor_kinds:
        if kind in osm:
            summarise_offsets(f"OSM {kind}", osm[kind], heights)
    summarise_offsets("OSM all motor", osm_motor, heights)
    summarise_offsets("NLS all roads (the method's floor)", nls_motor, heights)
    summarise_offsets(f"OSM motor moved {CONTROL_SHIFT_M} m off (chance)", osm_motor, heights, CONTROL_SHIFT_M)

    print("Line against line:")
    line_agreement("OSM motor against NLS roads and tracks", osm_motor, nls_all, tile)
    line_agreement("NLS roads against OSM motor", nls_motor, osm_motor, tile)
    for label, lines in sorted(nls.items()):
        line_agreement(f"NLS {label} against all OSM", lines, osm_all, tile)

    strips = visible_strips(heights)
    near_osm = near_mask(osm_all, tile, HAS_A_LINE_WITHIN_M)
    near_nls = near_mask(nls_all, tile, HAS_A_LINE_WITHIN_M)
    total = strips.sum()
    both = (strips & near_osm & near_nls).sum()
    only_osm = (strips & near_osm & ~near_nls).sum()
    only_nls = (strips & ~near_osm & near_nls).sum()
    neither = (strips & ~near_osm & ~near_nls).sum()
    print(f"Strips seen in the heights alone: {total * SAMPLE_M / 1000:.1f} km")
    print(f"  on both maps {both * SAMPLE_M / 1000:.1f} km, OSM only {only_osm * SAMPLE_M / 1000:.1f}, NLS only {only_nls * SAMPLE_M / 1000:.1f}, neither {neither * SAMPLE_M / 1000:.1f}")
    on_a_map = both + only_osm + only_nls
    print(f"  OSM has {(both + only_osm) / total:.0%} of all strips, and {(both + only_osm) / on_a_map:.0%} of those some map confirms as a way")

    picture = np.zeros((SAMPLES, SAMPLES, 3), dtype=np.uint8) + 40
    picture[near_mask(osm_all, tile, 1)] = (100, 100, 100)
    shown = ndimage.binary_dilation(strips, iterations=2)
    picture[shown & near_osm] = (60, 220, 90)
    picture[shown & ~near_osm & near_nls] = (255, 170, 0)
    picture[shown & ~near_osm & ~near_nls] = (255, 50, 50)
    audit = DATA / "audit"
    audit.mkdir(exist_ok=True)
    Image.fromarray(picture).resize((1500, 1500), Image.Resampling.BOX).save(audit / f"{tile.name}-strips.png")
    missed, _ = ndimage.label(strips & ~near_osm, structure=np.ones((3, 3)))
    longest = np.argsort(np.bincount(missed.ravel())[1:])[::-1][:STRIPS_LISTED]
    print("Longest strips OSM has no line along (centre east, north, length m, share on NLS), to check by eye on the orthophoto:")
    for index in longest:
        rows, columns = np.nonzero(missed == index + 1)
        print(f"  {tile.west + columns.mean() * SAMPLE_M:.0f}, {tile.north - rows.mean() * SAMPLE_M:.0f}, {len(rows) * SAMPLE_M}, {near_nls[rows, columns].mean():.0%}")


if __name__ == "__main__":
    main()
