"""Lays the paving of a window of a real tile in seconds, counts what a player would see wrong in it (`look_census.py`)
and draws it from above, for working on how the paving is laid without building a tile each time.

    python paving_window.py prepare L2334E [more tiles]
    python paving_window.py lay L2334E <east> <north> <radius> <out.png> [--view <metres>] [--metres-per-pixel 0.08]
    python paving_window.py built <tiles folder> L2334E <east> <north> <radius> <out.png>

with the pipeline's venv (`pipeline/.venv/Scripts/python`), and in a worktree with `ALAND_DRIVE_DATA` naming the `.data`
that holds the raw downloads. `prepare` reads a tile's roads (once they have given way to its buildings), ground and
buildings as a build does and keeps them in this checkout's `.data/windows/`, to be made again whenever what they are
read by changes. `lay` lays the roads within `radius` of a place (world metres, as `?at=` takes them) and draws the
middle of it, each surface in a colour of its own, a triangle that smears two in pink and each fault ringed; `built`
draws the same picture of a tile already built, to set beside it.

A road cut by the window's rim is not as the tile builds it, and a short window changes which road is laid through a
junction, since the greater road is the longer one: judge the middle, and take a radius of 600 m or more to see a
junction as the tile has it.
"""

import argparse
import json
import math
import pickle
import time
from pathlib import Path

import numpy as np
import shapely
from PIL import Image, ImageDraw

from grid import TILE_SIZE_M, WORLD_ORIGIN, tile_from_name, to_local
from look_census import ASPHALT, LOOSE, SHOULDER, census
from path_surfaces import BED, COBBLE, GRAVEL, LAWN, SLAB, STEPS, TARMAC

KEPT = Path(__file__).resolve().parent.parent / ".data" / "windows"
# The classes a road of no stated surface is asphalt by, as the game takes them (`isPaved`, `art/surfaces/road-attributes.ts`).
PAVED_KINDS = {"primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link", "residential", "living_street"}
LAND = (126, 150, 104)
BLEND = (236, 96, 200)
COLOURS = {ASPHALT: (72, 76, 82), LOOSE: (150, 128, 96), SHOULDER: (176, 172, 160), STEPS: (120, 90, 150), LAWN: (120, 170, 90), BED: (150, 190, 120), GRAVEL: (196, 170, 120), TARMAC: (116, 122, 132), SLAB: (214, 208, 190), COBBLE: (160, 140, 130)}
MARKS = {"sliver": (230, 40, 40), "patch": (240, 130, 0), "spike": (200, 0, 200), "notch": (0, 120, 240)}
MARK_RADIUS = 9


def prepare(name: str) -> None:
    import buildings as solids
    import built_up
    import docks
    import farm
    import landmarks as landmark_sites
    import raised
    import terrain
    import vectors
    from give_way import give_way
    from sources import osm_path

    tile = tile_from_name(name)
    mosaic = terrain.read_with_rim(tile)
    water = terrain.water_around(terrain.flat_water(mosaic), mosaic)
    west, _ = to_local(tile.west, tile.south)
    _, north = to_local(tile.east, tile.north)
    sites = landmark_sites.Landmarks(tile)
    sites.replace_also(farm.windmill_sites(tile))
    sites.replace_also(landmark_sites.lighthouse_sites(tile))
    sites.stand_also(landmark_sites.dealer_sites(tile))
    osm_file = osm_path(tile, False)
    outlines = solids.outlines_near(tile, sites, raised.Lookup(raised.read(osm_file)))
    roads, _, _ = vectors.build(osm_file, tile, lambda whole: give_way(sites.off_raised(whole, osm_file), outlines).roads)
    piers, _ = docks.read(osm_file)
    piers += docks.boardwalks(roads)
    quays = docks.quays(roads, piers)
    roads = docks.off_piers(roads, [pier for pier in piers if pier not in quays])
    kept = {
        "corners": terrain.sample_corners(mosaic),
        "west": west,
        "north": north,
        "rim": terrain.CORNER_RIM,
        "water": water,
        "roads": roads,
        "areas": vectors.paved_areas(osm_file, tile) + vectors.lane_yards(osm_file, tile),
        "whole": vectors.whole_lines(osm_file),
        "outlines": outlines,
        "share": built_up.share_of(tile.name, west, north, TILE_SIZE_M).share,
    }
    KEPT.mkdir(parents=True, exist_ok=True)
    (KEPT / f"{name}.pickle").write_bytes(pickle.dumps(kept))
    print(name, len(roads), "roads,", len(kept["areas"]), "paved areas,", len(outlines), "buildings kept")


def lay(name: str, east: float, north: float, radius: float) -> tuple[np.ndarray, np.ndarray, dict[int, bool]]:
    """The paving's points and triangles for the roads within `radius` of a place, and which of its ways are asphalt."""
    import built_up
    import paving
    import roads as road_surface

    kept = pickle.loads((KEPT / f"{name}.pickle").read_bytes())
    share = built_up.Share.__new__(built_up.Share)
    share.west, share.north, share.share, share.nodes = kept["west"], kept["north"], kept["share"], kept["share"].shape[0]
    here = shapely.Point(east - WORLD_ORIGIN[0], north - WORLD_ORIGIN[1])
    window = here.buffer(radius)
    # The ground is cropped to a small tile of its own round the window, so nothing is worked out for the whole tile.
    half, rim = radius + 40, 30
    size = math.ceil(2 * half / 4) * 4
    west = kept["west"] + math.floor((here.x - half - kept["west"]) / 4) * 4
    top = kept["north"] - math.floor((kept["north"] - (here.y + half)) / 4) * 4
    column, row = int(round((west - kept["west"]) / 2)) + kept["rim"], int(round((kept["north"] - top) / 2)) + kept["rim"]
    count = size // 2 + 1
    corners = kept["corners"][row - rim : row + count + rim, column - rim : column + count + rim]
    water = kept["water"][row - rim : row + count + rim + 1, column - rim : column + count + rim + 1]
    if corners.shape != (count + 2 * rim, count + 2 * rim):
        raise SystemExit("the window reaches past the tile's rim: move it in or make it smaller")
    ground = road_surface.Ground(corners, west, top, rim, water=water, built_up=share)
    box = shapely.box(west - 30, top - size - 30, west + size + 30, top + 30)
    roads = []
    for road in kept["roads"]:
        line = shapely.LineString(road["line"])
        if not line.intersects(window):
            continue
        for part in shapely.get_parts(line.intersection(box)):
            if part.geom_type == "LineString" and part.length > 1:
                roads.append({**{key: value for key, value in road.items() if key != "seams"}, "line": [list(point) for point in part.coords]})
    areas = [area for area in kept["areas"] if area.intersects(window)]
    outlines = [outline for outline in kept["outlines"] if outline.intersects(window.buffer(60))]
    started = time.time()
    paved = paving.lay(roads, ground, areas, kept["whole"], outlines)
    sealed = {}
    for chain in paved.chains:
        town = float(share(np.array([chain.xy[len(chain.xy) // 2]]))[0]) if chain.xy is not None and len(chain.xy) else 0.0
        sealed[chain.index] = chain.sealed if chain.sealed is not None else (chain.kind_name in PAVED_KINDS or town > 0.5)
    print(f"laid {len(roads)} roads as {len(paved.chains)} ways in {time.time() - started:.1f} s")
    return paved.points, paved.triangles, sealed


def built(folder: Path, name: str) -> tuple[np.ndarray, np.ndarray, dict[int, bool]]:
    """The same of a tile already built."""
    import paving_file

    manifest = json.loads((folder / name / "tile.json").read_text(encoding="utf-8"))
    laid = paving_file.read_paving(folder / name, manifest)
    sealed = {index: chain["sealed"] if "sealed" in chain else chain["kind"] in PAVED_KINDS for index, chain in enumerate(manifest["roadSurface"]["chains"])}
    return laid.points, laid.triangles, sealed


def draw(counted, centre: tuple[float, float], view: float, metres_per_pixel: float, out: Path) -> None:
    size = int(2 * view / metres_per_pixel)
    oversampled = 3
    image = Image.new("RGB", (size * oversampled, size * oversampled), LAND)
    pen = ImageDraw.Draw(image)

    def pixel(x: float, y: float, scale: float) -> tuple[float, float]:
        return ((x - centre[0] + view) / metres_per_pixel * scale, (centre[1] + view - y) / metres_per_pixel * scale)

    middle = counted.xy.mean(axis=1)
    near = (np.abs(middle[:, 0] - centre[0]) < view + 20) & (np.abs(middle[:, 1] - centre[1]) < view + 20)
    # Shoulders first, so a carriageway's or a path's edge is never drawn over.
    order = np.argsort(np.where(counted.look[near] == SHOULDER, 0, 1), kind="stable")
    for triangle, look, smeared in zip(counted.xy[near][order], counted.look[near][order], counted.blended[near][order]):
        pen.polygon([pixel(x, y, oversampled) for x, y in triangle], fill=BLEND if smeared else COLOURS[int(look)])
    image = image.resize((size, size), Image.LANCZOS)
    pen = ImageDraw.Draw(image)
    for kind, _, x, y, _ in counted.found:
        px, py = pixel(x, y, 1)
        if 0 <= px < size and 0 <= py < size:
            pen.ellipse([px - MARK_RADIUS, py - MARK_RADIUS, px + MARK_RADIUS, py + MARK_RADIUS], outline=MARKS[kind], width=2)
    image.save(out)


def main() -> None:
    parser = argparse.ArgumentParser(description="Lay, count and draw a window of a tile's paving.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("prepare").add_argument("tiles", nargs="+")
    for command in ("lay", "built"):
        place = commands.add_parser(command)
        if command == "built":
            place.add_argument("folder", type=Path)
        place.add_argument("tile")
        place.add_argument("east", type=float)
        place.add_argument("north", type=float)
        place.add_argument("radius", type=float)
        place.add_argument("out", type=Path)
        place.add_argument("--view", type=float, help="half the picture's side in metres; six tenths of the radius without it")
        place.add_argument("--metres-per-pixel", type=float, default=0.08)
    args = parser.parse_args()
    if args.command == "prepare":
        for name in args.tiles:
            prepare(name)
        return
    points, triangles, sealed = lay(args.tile, args.east, args.north, args.radius) if args.command == "lay" else built(args.folder, args.tile)
    centre = (args.east - WORLD_ORIGIN[0], args.north - WORLD_ORIGIN[1])
    view = args.view or args.radius * 0.6
    within = shapely.box(centre[0] - view, centre[1] - view, centre[0] + view, centre[1] + view)
    counted = census(points, triangles, sealed, within.buffer(15))
    counted.found = [item for item in counted.found if within.contains(shapely.Point(item[2], item[3]))]
    counts = {}
    for kind, *_ in counted.found:
        counts[kind] = counts.get(kind, 0) + 1
    print(json.dumps({"counts": counts, "blend m2": round(counted.blend_m2, 1)}))
    for kind, look, x, y, measure in sorted(counted.found, key=lambda item: (item[0], -item[4]))[:40]:
        print(f"  {kind:7} {look:20} {x + WORLD_ORIGIN[0]:.1f},{y + WORLD_ORIGIN[1]:.1f}  {measure:.2f}")
    draw(counted, centre, view, args.metres_per_pixel, args.out)


if __name__ == "__main__":
    main()
