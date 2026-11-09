"""How far each place is from the nearest building, as an image per tile: what every tree and planting keeps its crown clear by.

A tree is a lattice place in a shader, with no list to test against buildings, so what it reads is this: the signed
distance to whatever a tile draws as a building, at the canopy's 4 m, negative inside. A distance across a straight
wall is a straight line, which a bilinear read gives back exactly, so 4 m is fine enough even for a bush at a wall's
foot, where a mask of what's built would blur by a whole pixel.

What counts as a building is what the game draws or stops the car at, read off the built tiles: every triangle of
`solids.bin.gz` seen from above (modelled, generated and raised buildings, whose roofs cover their footprints) and
its walls (every outline, a raised building's posts and a landmark's plan among them), and the rural kit's sheds,
boathouses and windmills, which stand in `models.json` and `tile.json` rather than as shapes, and every sea mark
that stands ashore (`sea/marks.json`: leading marks, cairns, skerry lights, lighthouses, radar and fixed marks, as
discs their foot's size), which a tree would otherwise stand through. A neighbour's buildings are read too, so a
building over a tile's edge clears its trees on both sides.

It reads only finished tiles, so it runs after they're all built, and alone it adds the image to tiles already built:

    python clearing.py [--folder FOLDER] L2343C [more tiles]
"""

import argparse
import gzip
import json
import math
from pathlib import Path

import numpy as np
import shapely
from PIL import Image, ImageDraw
from scipy import ndimage

from canopy import PIXELS
from grid import TILE_SIZE_M, neighbour, tile_from_name, to_local
import tile_steps

FILE = "clearing.png"
UNIT_M = 0.125
# The byte that is a building's outline: below it is inside, down to 8 m in, and above it out to past the widest crown the tallest tree spreads.
ZERO = 64
MANIFEST = {
    "file": FILE,
    "pixels": PIXELS,
    "unitM": UNIT_M,
    "zero": ZERO,
    "encoding": "8-bit grey PNG, rows north to south, west to east: the signed distance from each 4 m pixel's middle to the nearest building, (byte - zero) × unitM metres, negative inside",
}
REACH_M = (255 - ZERO) * UNIT_M
# The raster the distances are measured on.
RASTER_M = 1
BUILDING_MODELS = ("shed-", "boathouse-")
SOLIDS_COLUMNS = 7
SEA_MARKS = Path(__file__).resolve().parent.parent / "sea" / "marks.json"
# How far out from its middle each kind of sea mark ashore stands on the ground, by its model's name's start: a
# lighthouse's tower, a skerry light's, a cairn's or a leading mark's frame. A tree keeps its crown clear of that.
SEA_MARK_FOOT_M = {"lighthouse": 4.0, "skerry-light": 2.5, "cairn": 1.5, "leading-": 1.5, "radar-": 1.5, "fixed-": 1.0}
DISC_SIDES = 8


def solid_shapes(folder: Path) -> tuple[list[np.ndarray], np.ndarray]:
    """A tile's buildings as `solids.bin.gz` holds them: each triangle's corners in the scene's x and z, and the walls as (x1, z1, x2, z2)."""
    cells = json.loads((folder / "tile.json").read_text(encoding="utf-8"))["solids"]
    data = gzip.decompress((folder / cells["file"]).read_bytes())
    unit = cells["unitM"]
    at = 0
    triangles = []
    for cell in cells["cells"]:
        vertices, indices = cell["vertices"], cell["indices"]
        # The differences wrap as 16-bit numbers, so the running sum must too.
        columns = [np.cumsum(np.frombuffer(data, "<i2", vertices, at + column * vertices * 2), dtype=np.int16) for column in range(SOLIDS_COLUMNS)]
        at += SOLIDS_COLUMNS * vertices * 2 + 4 * vertices
        corners = np.column_stack((cell["x"] + columns[0] * unit, cell["z"] + columns[2] * unit))
        triangles.append(corners[np.frombuffer(data, "<u2", indices, at).reshape(-1, 3)])
        at += indices * 2
    walls = np.frombuffer(data, "<f4", cells["walls"] * 4, at).reshape(-1, 4)
    if at + walls.nbytes != len(data):
        raise ValueError(f"{folder.name}: solids.bin.gz is {len(data)} bytes, expected {at + walls.nbytes}")
    return triangles, walls


def model_boxes(folder: Path) -> list[np.ndarray]:
    """The rural kit's buildings on a tile, each the four corners of its foot in the scene's x and z."""
    manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
    places = [place for model, listed in json.loads((folder / "models.json").read_text(encoding="utf-8"))["models"].items() if model.startswith(BUILDING_MODELS) for place in listed]
    places += manifest.get("windmills", [])
    boxes = []
    for x, _, z, yaw, wide, long in places:
        # A model's own x lies along (cos yaw, -sin yaw) in the scene, and its z along (sin yaw, cos yaw).
        across, along = np.array([np.cos(yaw), -np.sin(yaw)]) * wide / 2, np.array([np.sin(yaw), np.cos(yaw)]) * long / 2
        boxes.append(np.array([x, z]) + np.array([across + along, along - across, -across - along, across - along]))
    return boxes


def sea_mark_outlines(marks: list[list] | None = None) -> list[np.ndarray]:
    """Every sea mark that stands ashore or on a rock, as an octagon its foot's size, in the scene's x and z. A floating mark has no ground to clear."""
    if marks is None:
        marks = json.loads(SEA_MARKS.read_text(encoding="utf-8"))["marks"]
    angles = np.linspace(0, 2 * np.pi, DISC_SIDES, endpoint=False)
    # Its corners out past the foot's circle, so the octagon holds the whole of it.
    ring = np.column_stack((np.cos(angles), np.sin(angles))) / np.cos(np.pi / DISC_SIDES)
    outlines = []
    for model, x, z, _, floats, _ in marks:
        foot = next((metres for start, metres in SEA_MARK_FOOT_M.items() if model.startswith(start)), None)
        if floats or foot is None:
            continue
        outlines.append(np.array([x, z]) + ring * foot)
    return outlines


def around(name: str, tiles: Path) -> list[Path]:
    """The folders of a tile and the built tiles round it, whose buildings may reach over its edge."""
    tile = tile_from_name(name)
    folders = [tiles / neighbour(tile, east, north).name for east in (-1, 0, 1) for north in (-1, 0, 1)]
    return [folder for folder in folders if (folder / "tile.json").exists()]


def drawn(folders: list[Path]) -> tuple[list[np.ndarray], np.ndarray]:
    """The buildings of the folders given seen from above, in the scene's x and z: outlines (each roof's triangles and each
    model's box, as its corners) and walls, as (x1, z1, x2, z2)."""
    outlines, lines = [], [np.zeros((0, 4))]
    for folder in folders:
        triangles, walls = solid_shapes(folder)
        roofs = np.concatenate([cell.reshape(-1, 3, 2) for cell in triangles] or [np.zeros((0, 3, 2))])
        # A wall's triangles stand on edge: from above they're its line, which the walls hold.
        (ax, az), (bx, bz) = np.moveaxis(roofs[:, 1] - roofs[:, 0], -1, 0), np.moveaxis(roofs[:, 2] - roofs[:, 0], -1, 0)
        outlines += [*roofs[np.abs(ax * bz - az * bx) > 1e-3], *model_boxes(folder)]
        lines.append(walls)
    return outlines, np.concatenate(lines)


def building_shapes(folders: list[Path], west: float, south: float, east: float, north: float) -> list[shapely.Geometry]:
    """The buildings of the folders given within a box in local east and north, as shapes in local east and north: outlines
    as polygons, walls as lines."""
    outlines, walls = drawn(folders)
    inside = lambda points: points[:, 0].max() >= west and points[:, 0].min() <= east and -points[:, 1].min() >= south and -points[:, 1].max() <= north
    to_local = lambda points: points * np.array([1, -1])
    return [shapely.Polygon(to_local(corners)) for corners in outlines if inside(corners)] + [shapely.LineString(to_local(ends)) for ends in walls.reshape(-1, 2, 2) if inside(ends)]


def distances(outlines: list[np.ndarray], walls: np.ndarray, west: float, top: float) -> np.ndarray:
    """The signed distance at each pixel's middle of the tile whose north-west corner is at scene `west`, `top`, from buildings `drawn` gives."""
    pixel_m = TILE_SIZE_M / PIXELS
    # Raster cells are centred on whole multiples of RASTER_M from the tile's first pixel middle, so every pixel middle is a cell's.
    first = math.ceil(REACH_M / RASTER_M)
    origin = np.array([west + pixel_m / 2, top + pixel_m / 2]) - first * RASTER_M
    across = round((TILE_SIZE_M - pixel_m) / RASTER_M) + 2 * first + 1
    canvas = Image.new("1", (across, across), 0)
    pen = ImageDraw.Draw(canvas)
    to_raster = lambda points: [tuple(point) for point in (points - origin) / RASTER_M]
    low, high = origin - RASTER_M, origin + across * RASTER_M
    near = lambda points: bool(np.all(points.max(axis=0) >= low) and np.all(points.min(axis=0) <= high))
    for corners in outlines:
        if near(corners):
            pen.polygon(to_raster(corners), fill=1, outline=1)
    for ends in walls.reshape(-1, 2, 2):
        if near(ends):
            pen.line(to_raster(ends), fill=1, width=1)
    built = np.array(canvas)
    if not built.any():
        return np.full((PIXELS, PIXELS), REACH_M)
    # A cell on the outline is half in: its middle is half a cell from the edge either way.
    signed = np.where(built, -ndimage.distance_transform_edt(built, sampling=RASTER_M), ndimage.distance_transform_edt(~built, sampling=RASTER_M)) - RASTER_M / 2 * np.where(built, -1, 1)
    step = round(pixel_m / RASTER_M)
    picked = (slice(first, first + PIXELS * step, step),) * 2
    kept = np.minimum(signed[picked], REACH_M)
    # The GPU clamps a read past the outer pixels' middles to their value, so each of them holds the nearest anywhere out to the edge.
    nearest = ndimage.minimum_filter(signed, size=step + 1)[picked]
    for edge in (0, -1):
        kept[edge, :], kept[:, edge] = np.minimum(kept[edge, :], nearest[edge, :]), np.minimum(kept[:, edge], nearest[:, edge])
    return kept


def encode(signed: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(np.round(signed / UNIT_M) + ZERO, 0, 255).astype(np.uint8))


def bake_named(job: tuple[str, Path]) -> tuple[str, dict]:
    """Writes the tile's `clearing.png`, saying the share of the tile within a crown's reach of a building."""
    name, tiles = job
    tile = tile_from_name(name)
    west, north = to_local(tile.west, tile.north)
    outlines, walls = drawn(around(name, tiles))
    signed = distances(outlines + sea_mark_outlines(), walls, west, -north)
    encode(signed).save(tiles / name / FILE, optimize=True)
    return f"{name} ({float((signed < REACH_M).mean()):.1%} near a building)", MANIFEST


def recorded(manifest: dict, entry: dict) -> dict:
    return {**manifest, "clearing": entry}


def bake_tiles(names: list[str], tiles: Path, jobs: int = 1) -> None:
    """Adds the clearing to built tiles, once their neighbours are built too."""
    tile_steps.run("clearing", names, tiles, bake_named, recorded, jobs)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tiles", nargs="+", help="NLS sheet names, such as L2343C")
    parser.add_argument("--folder", type=Path, default=Path(__file__).resolve().parent.parent / ".data" / "tiles", help="where the built tiles are")
    arguments = parser.parse_args()
    bake_tiles(arguments.tiles, arguments.folder)


if __name__ == "__main__":
    main()
