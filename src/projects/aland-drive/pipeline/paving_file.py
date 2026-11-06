"""How a paved tile's road surface and cut ground are written, and read back as the game reads them (`render/tile.ts`).

Both files hold whole numbers rather than floats, which gzip packs far smaller. Points are written in strips of the
tile `STRIP_M` tall, north to south, west to east along each (`in_strips`), so each place, in millimetres east of the
tile's west and south of its north, is a small difference from the last. A height is millimetres off the tile's own
ground grid as the game draws it (`Grid.at`, the game's `surfaceHeight`, on the heights as written), so a point on a node
is that node's height exactly, and paving and cut ground sharing a place and a height decode alike. Triangles are listed
from their least corner, sorted by it, as that corner's difference from the last triangle's and the other two corners'
differences from it, so neighbours in the list are neighbours in the mesh.

A road surface is still every way's rings as float32 and a tier byte a section, then the paving: int32 columns of east,
north, height, along and way, the triangles, then across as int16 and bytes of tier, class and run. A cut ground is its
cells (each the difference from the one before), its points' three int32 columns, then its triangles, walls last.
"""

import gzip
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from paving import POINT_FLOATS, RUN_STEP as WAY_RUN_STEP

RINGS = 5
MM = 1000
# A point's place across its way in 1024ths: a millimetre or two at a wide road's edge, where the paint is.
ACROSS_UNITS = 1024
# How far along its way, in centimetres: dashes and treads are tens of centimetres.
ALONG_UNITS = 100
# A way's run is stored as its doubled angle, which `paving` snaps to whole steps, so a byte holds it exactly.
RUN_STEP = 2 * WAY_RUN_STEP
RUN_STEPS = round(2 * np.pi / RUN_STEP)
NO_RUN = 255
# Points go in strips this tall: measured on L2343C, it packs the places and triangles a sixth smaller than one sort by east.
STRIP_M = 32.0
EAST, NORTH, HEIGHT, ACROSS, TIER, ALONG, WAY, CLASS, RUN_COS, RUN_SIN = range(POINT_FLOATS)


@dataclass
class Grid:
    """A tile's heights as the game decodes them, float32 metres on nodes `step` apart, rows from north to south."""

    heights: np.ndarray
    west: float
    north: float
    step: float

    @staticmethod
    def of(units_m: np.ndarray, west: float, north: float, step: float) -> "Grid":
        return Grid(np.asarray(units_m).astype(np.float32).astype(np.float64), west, north, step)

    @staticmethod
    def read(folder: Path, manifest: dict) -> "Grid":
        info = manifest["heights"]
        deltas = np.frombuffer(gzip.decompress((folder / info["file"]).read_bytes()), "<i2").reshape(info["nodes"], info["nodes"])
        return Grid.of(np.cumsum(deltas.astype(np.int32), axis=1) * info["unitM"], manifest["bounds"]["west"], manifest["bounds"]["north"], info["stepM"])

    def at(self, east: np.ndarray, north: np.ndarray) -> np.ndarray:
        """The drawn ground's height, on the two triangles the game makes of each cell: `surfaceHeight` in `render/tile.ts`."""
        last = self.heights.shape[0] - 1
        column_at = np.clip((east - self.west) / self.step, 0, last)
        row_at = np.clip((self.north - north) / self.step, 0, last)
        column = np.minimum(np.floor(column_at).astype(int), last - 1)
        row = np.minimum(np.floor(row_at).astype(int), last - 1)
        across, down = column_at - column, row_at - row
        north_west, north_east = self.heights[row, column], self.heights[row, column + 1]
        south_west, south_east = self.heights[row + 1, column], self.heights[row + 1, column + 1]
        upper = north_west + across * (north_east - north_west) + down * (south_west - north_west)
        lower = south_east + (1 - across) * (south_west - south_east) + (1 - down) * (north_east - south_east)
        return np.where(across + down <= 1, upper, lower)


def _whole(values: np.ndarray, what: str) -> np.ndarray:
    whole = np.round(values).astype(np.int64)
    if np.abs(whole).max(initial=0) >= 2**31:
        raise ValueError(f"{what} past int32")
    return whole


def in_strips(points: np.ndarray, grid: Grid, last: tuple[int, ...] = ()) -> np.ndarray:
    """The order points are written in: strips `STRIP_M` tall from north to south, west to east along each, with the
    groups of so many points the list ends with (a paving's shoulders no way owns, then its car parks) each kept after the
    one before."""
    starts = len(points) - np.cumsum(last[::-1])[::-1]
    group = np.searchsorted(starts, np.arange(len(points)), side="right")
    return np.lexsort((points[:, 0], np.floor((grid.north - points[:, 1]) / STRIP_M), group))


def in_written_order(points: np.ndarray, triangles: np.ndarray, grid: Grid, last: tuple[int, ...] = ()) -> tuple[np.ndarray, np.ndarray]:
    """Points as a file lists them, and the triangles numbering them so."""
    order = in_strips(points, grid, last)
    where = np.empty(len(order), dtype=np.int64)
    where[order] = np.arange(len(order))
    return points[order], where[np.asarray(triangles, dtype=np.int64)]


def _places(points: np.ndarray, grid: Grid) -> list[np.ndarray]:
    east = _whole((points[:, 0] - grid.west) * MM, "east")
    north = _whole((grid.north - points[:, 1]) * MM, "north")
    height = _whole((points[:, 2] - grid.at(points[:, 0], points[:, 1])) * MM, "height")
    return [np.diff(east, prepend=0), np.diff(north, prepend=0), height]


def _unplaced(east: np.ndarray, north: np.ndarray, height: np.ndarray, grid: Grid) -> np.ndarray:
    x = grid.west + np.cumsum(east.astype(np.int64)) / MM
    y = grid.north - np.cumsum(north.astype(np.int64)) / MM
    return np.column_stack((x, y, grid.at(x, y) + height / MM))


def _coded(triangles: np.ndarray) -> np.ndarray:
    """Each triangle turned to start at its least corner, keeping its winding, sorted, as differences."""
    triangles = np.asarray(triangles, dtype=np.int64).reshape(-1, 3)
    if not len(triangles):
        return np.zeros((0, 3), dtype=np.int64)
    first = np.argmin(triangles, axis=1)
    turned = np.stack([triangles[np.arange(len(triangles)), (first + corner) % 3] for corner in range(3)], axis=1)
    turned = turned[np.lexsort((turned[:, 2], turned[:, 1], turned[:, 0]))]
    return np.column_stack((np.diff(turned[:, 0], prepend=0), turned[:, 1] - turned[:, 0], turned[:, 2] - turned[:, 0]))


def _uncoded(coded: np.ndarray) -> np.ndarray:
    least = np.cumsum(coded[:, 0].astype(np.int64))
    return np.column_stack((least, least + coded[:, 1], least + coded[:, 2]))


def _runs(points: np.ndarray) -> np.ndarray:
    cos, sin = points[:, RUN_COS], points[:, RUN_SIN]
    none = cos**2 + sin**2 < 0.25
    step = np.round(np.arctan2(sin, cos) / RUN_STEP).astype(int) % RUN_STEPS
    if (np.abs(np.cos(step * RUN_STEP) - cos) > 1e-6)[~none].any() or (np.abs(np.sin(step * RUN_STEP) - sin) > 1e-6)[~none].any():
        raise ValueError("a way's run isn't on a step of RUN_STEP")
    return np.where(none, NO_RUN, step).astype(np.uint8)


def _byte(values: np.ndarray, what: str) -> np.ndarray:
    whole = np.round(values).astype(np.int64)
    if whole.min(initial=0) < 0 or whole.max(initial=0) > 255:
        raise ValueError(f"{what} outside a byte")
    return whole.astype(np.uint8)


def paving_bytes(points: np.ndarray, triangles: np.ndarray, grid: Grid, last: tuple[int, ...] = ()) -> bytes:
    """The paving's points, (n, POINT_FLOATS), ending with groups of `last` points (`Paved`'s shoulders no way owns, then
    its car parks), and its triangles, as they follow the rings in a road surface file, in the order of `in_strips`."""
    points, triangles = in_written_order(points, triangles, grid, last)
    across = _whole(points[:, ACROSS] * ACROSS_UNITS, "across")
    if np.abs(across).max(initial=0) >= 2**15:
        raise ValueError("across outside int16")
    words = [*_places(points, grid), _whole(points[:, ALONG] * ALONG_UNITS, "along"), _whole(points[:, WAY], "way")]
    return b"".join(
        [
            *(column.astype("<i4").tobytes() for column in words),
            _coded(triangles).astype("<i4").tobytes(),
            across.astype("<i2").tobytes(),
            _byte(points[:, TIER], "tier").tobytes(),
            _byte(points[:, CLASS], "class").tobytes(),
            _runs(points).tobytes(),
        ]
    )


def paving_of(data: bytes, offset: int, points: int, triangles: int, grid: Grid) -> tuple[np.ndarray, np.ndarray]:
    """The paving's points, (n, POINT_FLOATS) as they were laid, and its triangles, from where they start in a road surface file."""
    words = np.frombuffer(data, "<i4", count=5 * points + 3 * triangles, offset=offset)
    east, north, height, along, way = words[: 5 * points].reshape(5, points)
    coded = words[5 * points :].reshape(-1, 3)
    after = offset + words.nbytes
    across = np.frombuffer(data, "<i2", count=points, offset=after)
    tier, kind, run = np.frombuffer(data, "u1", count=3 * points, offset=after + across.nbytes).reshape(3, points)
    angle = run * RUN_STEP
    out = np.zeros((points, POINT_FLOATS))
    out[:, :3] = _unplaced(east, north, height, grid)
    out[:, ACROSS] = across / ACROSS_UNITS
    out[:, TIER] = tier
    out[:, ALONG] = along / ALONG_UNITS
    out[:, WAY] = way
    out[:, CLASS] = kind
    out[:, RUN_COS] = np.where(run == NO_RUN, 0, np.cos(angle))
    out[:, RUN_SIN] = np.where(run == NO_RUN, 0, np.sin(angle))
    return out, _uncoded(coded)


def ground_cut_bytes(cells: np.ndarray, points: np.ndarray, triangles: np.ndarray, walls: int, grid: Grid) -> bytes:
    """The cut ground: its cells, in order, its points in the order of `in_strips`, and its triangles, the last `walls`
    of them the underpasses' walls."""
    points, triangles = in_written_order(points, triangles, grid)
    cells = np.asarray(cells, dtype=np.int64)
    if (np.diff(cells) <= 0).any():
        raise ValueError("cut cells out of order")
    ground = len(triangles) - walls
    return b"".join(
        [
            np.diff(cells, prepend=0).astype("<i4").tobytes(),
            *(column.astype("<i4").tobytes() for column in _places(points, grid)),
            # Walls apart from the ground, after it: they're drawn as concrete.
            _coded(triangles[:ground]).astype("<i4").tobytes(),
            _coded(triangles[ground:]).astype("<i4").tobytes(),
        ]
    )


@dataclass
class Paving:
    points: np.ndarray  # (n, POINT_FLOATS) for paving, (n, 5) for a ribbon tile's aprons.
    triangles: np.ndarray


def read_paving(folder: Path, manifest: dict) -> Paving:
    """A tile's paving, or a ribbon tile's aprons as float32 points of (east, north, height, across, tier)."""
    surface = manifest["roadSurface"]
    sections = sum(chain["sections"] for chain in surface["chains"])
    data = gzip.decompress((folder / surface["file"]).read_bytes())
    start = sections * RINGS * 12 + sections
    aprons = surface.get("aprons", {"points": 0, "triangles": 0})
    if surface.get("paved"):
        points, triangles = paving_of(data, start, aprons["points"], aprons["triangles"], Grid.read(folder, manifest))
        return Paving(points, triangles)
    points = np.frombuffer(data, "<f4", count=aprons["points"] * 5, offset=start).reshape(-1, 5).astype(np.float64)
    triangles = np.frombuffer(data, "<u4", count=aprons["triangles"] * 3, offset=start + points.size * 4).reshape(-1, 3).astype(np.int64)
    return Paving(points, triangles)


@dataclass
class Cut:
    cells: np.ndarray
    points: np.ndarray
    triangles: np.ndarray
    walls: int


def read_ground_cut(folder: Path, manifest: dict) -> Cut:
    cut = manifest["roadSurface"]["groundCut"]
    data = gzip.decompress((folder / cut["file"]).read_bytes())
    count, points = cut["cells"], cut["points"]
    words = np.frombuffer(data, "<i4")
    cells = np.cumsum(words[:count].astype(np.int64))
    east, north, height = words[count : count + 3 * points].reshape(3, points)
    coded = words[count + 3 * points :].reshape(-1, 3)
    ground = cut["triangles"] - cut["walls"]
    # The walls are coded on their own, from nothing.
    triangles = np.concatenate((_uncoded(coded[:ground]), _uncoded(coded[ground:])))
    return Cut(cells, _unplaced(east, north, height, Grid.read(folder, manifest)), triangles, cut["walls"])
