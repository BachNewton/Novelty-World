"""The tile's buildings: NLS's 3D solids where there are any, and a generated shape on every other footprint.

The 3D sheets give real roofs and nothing else, and a building crossing a sheet's
edge lives in one sheet only, so a tile reads its own sheet and its neighbours'
and keeps what has its middle in the tile. The Topographic Database's footprints
give what a building is, and a shape for every building the 3D sheets lack.

Everything comes out as faces, a kind and a ring of 3D points, and goes through
one path: walls are grouped into facades that know their width and eaves, so the
wall shader can draw their windows, roofs get an overhang, and the lot is merged
into 600 m cells, one mesh each. The outlines go out too, as what the car hits.
"""

import gzip
import hashlib
import io
import math
import xml.etree.ElementTree as ElementTree
import zipfile
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import numpy as np
import shapefile
import shapely
from PIL import Image, ImageDraw
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import split, unary_union

from grid import SAMPLE_M, SAMPLES, TILE_SIZE_M, Tile, neighbour, to_local
from sources import buildings3d_path, topographic_path

CELL_M = 600
UNIT_M = 0.02
GML = "{http://www.opengis.net/gml}"
BUILDING = "{http://www.opengis.net/citygml/building/2.0}"
SURFACES = {"WallSurface": "wall", "RoofSurface": "roof"}

# Topographic Database classes.
HOUSE = 42211
APARTMENTS = 42212
COMMERCIAL = (42221, 42222)
PUBLIC = 42231
INDUSTRIAL = 42241
OUTBUILDINGS = (42260, 42261, 42270)
BUILDING_CLASSES = range(42000, 43000)

ROOF, TIMBER, PLASTER, BOARDS = 0, 1, 2, 3
# Indices into the wall colours of the render's palette (`--color-aland-drive-wall-*`), each with its chance.
RED, WHITE, YELLOW, CREAM, GREY, PALE = range(6)
HOUSE_COLOURS = ((RED, 0.66), (WHITE, 0.13), (YELLOW, 0.11), (CREAM, 0.10))
PLASTER_COLOURS = ((CREAM, 0.4), (PALE, 0.3), (WHITE, 0.2), (YELLOW, 0.1))

SMALL_SHED_M2 = 40.0
LARGE_TOWN_BUILDING_M2 = 300.0
OVERHANG_M = 0.4
FLAT_ROOF_SLOPE = 0.06
SINK_M = 0.4
ROOF_PITCH = math.tan(math.radians(35))
LOWEST_EAVES_M = 2.3
TOUCHES_ROAD_M2 = 0.5
# A car on the very edge of a road still fits past a wall this far away.
CAR_ROOM_M = 1.2
# (eaves, ridge) when the laser saw nothing there, and the tallest ridge believed when it did, by class: it sees trees too.
SHAPE = {HOUSE: (3.0, 6.5, 10.0), APARTMENTS: (9.0, 11.0, 28.0), PUBLIC: (5.0, 8.0, 16.0), INDUSTRIAL: (6.0, 8.0, 16.0)}
SMALL_SHAPE = (2.3, 4.2, 7.0)
OTHER_SHAPE = (3.5, 6.0, 14.0)


@dataclass
class Face:
    kind: str
    ring: np.ndarray  # (n, 3) of (east, north, height), not closed.


@dataclass
class Solid:
    footprint: Polygon
    faces: list[Face]
    name: str
    modelled: bool


@dataclass
class Footprint:
    shape: Polygon
    kind: int


@dataclass
class Cell:
    positions: list = field(default_factory=list)
    facades: list = field(default_factory=list)
    tints: list = field(default_factory=list)
    indices: list = field(default_factory=list)
    count: int = 0


# Reading


def _polygons(element) -> list[np.ndarray]:
    return [np.array(ring.text.split(), float).reshape(-1, 3)[:-1] for ring in element.iter(f"{GML}posList")]


@lru_cache(maxsize=None)
def read_solids(path: Path) -> tuple[Solid, ...]:
    """The CityGML's buildings, as untrusted data: no document type or entities, so the parser expands nothing."""
    with path.open("rb") as raw:
        head = raw.read(65536)
    if b"<!DOCTYPE" in head or b"<!ENTITY" in head:
        raise ValueError(f"{path.name} declares a document type, which NLS's sheets don't")
    solids = []
    for _, element in ElementTree.iterparse(path, events=("end",)):
        if element.tag != f"{BUILDING}Building":
            continue
        faces, ground = [], []
        for bounded in element.findall(f"{BUILDING}boundedBy"):
            for surface in bounded:
                local = surface.tag.split("}")[1]
                for polygon in surface.iter(f"{GML}Polygon"):
                    rings = _polygons(polygon)
                    if local in SURFACES:
                        faces.extend(Face(SURFACES[local], ring) for ring in rings[:1] if len(ring) >= 3)
                    elif local == "GroundSurface":
                        ground.append(rings[0][:, :2])
        outline = _outline(faces, ground)
        if outline is not None and any(face.kind == "wall" for face in faces):
            solids.append(Solid(outline, faces, element.get(f"{GML}id"), True))
        element.clear()
    return tuple(solids)


def _outline(faces: list[Face], ground: list[np.ndarray]) -> Polygon | None:
    """What a solid covers on the map, repaired: joined buildings and broken rings come out as one clean polygon."""
    parts = [shapely.make_valid(Polygon(ring)) for ring in ground if len(ring) >= 3]
    if not parts:
        parts = [shapely.make_valid(Polygon(face.ring[:, :2])) for face in faces if face.kind == "roof"]
    merged = unary_union(parts).buffer(0.05).buffer(-0.05)
    if merged.is_empty:
        return None
    return merged if merged.geom_type == "Polygon" else max(merged.geoms, key=lambda part: part.area)


def read_footprints(tile: Tile) -> list[Footprint]:
    """The Topographic Database's buildings with their middle in the tile."""
    found = []
    with zipfile.ZipFile(topographic_path(tile)) as archive:
        for base in sorted(name[:-4] for name in archive.namelist() if name.startswith("r_") and name.endswith("_p.shp")):
            reader = shapefile.Reader(shp=io.BytesIO(archive.read(f"{base}.shp")), shx=io.BytesIO(archive.read(f"{base}.shx")), dbf=io.BytesIO(archive.read(f"{base}.dbf")), encoding="latin1")
            kinds = [entry[0] for entry in reader.fields[1:]].index("LUOKKA")
            for shape_record in reader.iterShapeRecords():
                kind = shape_record.record[kinds]
                if kind not in BUILDING_CLASSES:
                    continue
                points = shape_record.shape.points
                ends = [*shape_record.shape.parts, len(points)]
                polygon = shapely.make_valid(Polygon(points[ends[0] : ends[1]]))
                if polygon.geom_type != "Polygon":
                    polygon = max(polygon.geoms, key=lambda part: part.area)
                middle = polygon.centroid
                if tile.west <= middle.x < tile.east and tile.south <= middle.y < tile.north:
                    found.append(Footprint(polygon, kind))
    return found


def solids_near(tile: Tile) -> list[Solid]:
    """Every solid in the tile's sheet and its neighbours'. An absent sheet just adds none."""
    solids: list[Solid] = []
    for steps_north in (-1, 0, 1):
        for steps_east in (-1, 0, 1):
            path = buildings3d_path(neighbour(tile, steps_east, steps_north))
            if path is not None:
                solids.extend(read_solids(path))
    return solids


# Generated shapes


class Heights:
    """Heights on the tile's 2 m corners, read from world metres."""

    def __init__(self, corners: np.ndarray, west: float, north: float):
        self.corners, self.west, self.north = corners, west, north

    def at(self, east: np.ndarray, north: np.ndarray) -> np.ndarray:
        last = self.corners.shape[0] - 1
        columns = np.clip(np.round((np.asarray(east) - self.west) / SAMPLE_M).astype(int), 0, last)
        rows = np.clip(np.round((self.north - np.asarray(north)) / SAMPLE_M).astype(int), 0, last)
        return self.corners[rows, columns]


def _cells_of(polygon: Polygon, west: float, north: float) -> tuple[slice, slice, np.ndarray] | None:
    """A polygon rasterised on the tile's 2 m cells: the window, and a mask for it. None if it's off the tile."""
    left, bottom, right, top = polygon.bounds
    first_column, last_column = max(int((left - west) / SAMPLE_M), 0), min(int((right - west) / SAMPLE_M) + 1, SAMPLES)
    first_row, last_row = max(int((north - top) / SAMPLE_M), 0), min(int((north - bottom) / SAMPLE_M) + 1, SAMPLES)
    if first_column >= last_column or first_row >= last_row:
        return None
    canvas = Image.new("1", (last_column - first_column, last_row - first_row), 0)
    outline = [((x - west) / SAMPLE_M - first_column, (north - y) / SAMPLE_M - first_row) for x, y in polygon.exterior.coords]
    ImageDraw.Draw(canvas).polygon(outline, fill=1, outline=1)
    return slice(first_row, last_row), slice(first_column, last_column), np.array(canvas)


def _generated_shape(footprint: Footprint, local: Polygon, above: np.ndarray, west: float, north: float, ground: float) -> tuple[list[Face], float]:
    """Eaves and a ridge along the long side, as tall as the laser saw, or flat if it's a big plain box. Returns the faces and the ridge height."""
    area = local.area
    if footprint.kind in SHAPE:
        eaves, ridge, tallest = SHAPE[footprint.kind]
    else:
        eaves, ridge, tallest = SMALL_SHAPE if area < SMALL_SHED_M2 else OTHER_SHAPE
    seen = _cells_of(local, west, north)
    if seen is not None and seen[2].any():
        heights = above[seen[0], seen[1]][seen[2]]
        top = float(np.percentile(heights, 90))
        if top > LOWEST_EAVES_M:
            ridge = min(top, tallest)
    corners = np.array(local.minimum_rotated_rectangle.exterior.coords)[:4]
    sides = corners[1:] - corners[:-1]
    long_side = sides[np.argmax(np.hypot(*sides.T))]
    along = long_side / np.hypot(*long_side)
    across = np.array([-along[1], along[0]])
    centre = corners.mean(axis=0)
    half = float(np.ptp((corners - centre) @ across)) / 2
    flat = area > LARGE_TOWN_BUILDING_M2 and footprint.kind != HOUSE
    eaves = ridge if flat else max(LOWEST_EAVES_M, ridge - half * ROOF_PITCH)
    slope = 0 if flat else (ridge - eaves) / max(half, 0.1)

    def roof_at(points: np.ndarray) -> np.ndarray:
        return ground + ridge - slope * np.abs((points - centre) @ across)

    reach = float(np.ptp((corners - centre) @ along)) + 10
    ridge_line = LineString([centre - along * reach, centre + along * reach])
    pieces = [local] if flat else [piece for piece in split(local, ridge_line).geoms if piece.area > 0.01]
    faces = []
    for piece in pieces:
        ring = np.array(piece.exterior.coords)[:-1]
        tops = roof_at(ring)
        faces.append(Face("roof", np.column_stack((ring, tops))))
        for here in range(len(ring)):
            ahead = (here + 1) % len(ring)
            # Skips the cut along the ridge, which is no wall.
            if local.exterior.distance(Point((ring[here] + ring[ahead]) / 2)) > 0.01:
                continue
            bottom = ground - SINK_M
            faces.append(Face("wall", np.array([[*ring[here], bottom], [*ring[ahead], bottom], [*ring[ahead], tops[ahead]], [*ring[here], tops[here]]])))
    return faces, ridge


# Looks


def _pick(seed: int, choices: tuple) -> int:
    roll = (seed % 1000) / 1000
    for value, chance in choices:
        roll -= chance
        if roll < 0:
            return value
    return choices[0][0]


def _material(kind: int, area: float, seed: int) -> tuple[int, int]:
    """A wall's style and palette colour, from what the building is and how big."""
    if kind in OUTBUILDINGS or (kind == 0 and area < SMALL_SHED_M2):
        return BOARDS, GREY
    if kind in (APARTMENTS, INDUSTRIAL, *COMMERCIAL, PUBLIC) or area > LARGE_TOWN_BUILDING_M2:
        return PLASTER, GREY if kind == INDUSTRIAL else _pick(seed, PLASTER_COLOURS)
    return TIMBER, _pick(seed, HOUSE_COLOURS)


def _roof_colour(polygon: Polygon, photo: np.ndarray, west: float, north: float) -> tuple[int, int, int]:
    inner = polygon.buffer(-1.0)
    shape = inner if not inner.is_empty and inner.geom_type == "Polygon" else polygon
    seen = _cells_of(shape, west, north)
    if seen is None or not seen[2].any():
        return (120, 110, 105)
    red, green, blue = np.median(photo[seen[0], seen[1]][seen[2]], axis=0)
    # Blue here is the sky on a dark roof, not paint.
    return (int(red), int(green), int(min(blue, max(red, green))))


def _seed(name: str) -> int:
    return int.from_bytes(hashlib.sha256(name.encode()).digest()[:4], "little")


# Meshing


def _triangles(ring: np.ndarray) -> np.ndarray | None:
    """A planar ring as (n, 3, 3) triangles, repaired if it crosses itself. None if nothing's left."""
    normal = np.zeros(3)
    for a, b in zip(ring, np.roll(ring, -1, axis=0)):
        normal += np.cross(a - ring[0], b - ring[0])
    length = np.linalg.norm(normal)
    if length < 1e-6:
        return None
    normal /= length
    drop = int(np.abs(normal).argmax())
    keep = [axis for axis in range(3) if axis != drop]
    if len(ring) == 3:
        return ring[None]
    flat = shapely.make_valid(Polygon(ring[:, keep]))
    triangles = []
    for polygon in shapely.get_parts(flat):
        if polygon.geom_type == "Polygon" and polygon.area > 1e-4:
            for triangle in shapely.get_parts(shapely.constrained_delaunay_triangles(polygon)):
                corners = np.array(triangle.exterior.coords)[:3]
                third = ring[0, drop] - ((corners - ring[0, keep]) @ normal[keep]) / normal[drop]
                solved = np.empty((3, 3))
                solved[:, keep] = corners
                solved[:, drop] = third
                triangles.append(solved)
    return np.array(triangles) if triangles else None


def _add(cell: Cell, ring: np.ndarray, facade: tuple[np.ndarray, np.ndarray, float, float, float] | None, tint: tuple[int, int, int, int]) -> None:
    triangles = _triangles(ring)
    if triangles is None:
        return
    unique, inverse = np.unique(np.round(triangles.reshape(-1, 3), 3), axis=0, return_inverse=True)
    cell.positions.append(unique)
    if facade is None:
        cell.facades.append(np.zeros((len(unique), 4)))
    else:
        origin, axis, base, width, eaves = facade
        along = (unique[:, :2] - origin) @ axis
        cell.facades.append(np.column_stack((along, unique[:, 2] - base, np.full(len(unique), width), np.full(len(unique), eaves))))
    cell.tints.append(np.tile(tint, (len(unique), 1)))
    cell.indices.append(inverse.ravel() + cell.count)
    cell.count += len(unique)


def _facades(walls: list[Face], base: float) -> dict[tuple, tuple]:
    """Walls on one plane are one facade: one frame to count windows along, one width, one line of eaves."""
    groups: dict[tuple, list[Face]] = {}
    for wall in walls:
        edge = wall.ring[:, :2]
        span = edge - edge[0]
        axis = span[np.argmax(np.hypot(*span.T))]
        length = np.hypot(*axis)
        if length < 1e-3:
            continue
        axis = axis / length
        if axis[0] < 0 or (axis[0] == 0 and axis[1] < 0):
            axis = -axis
        normal = np.array([-axis[1], axis[0]])
        groups.setdefault((round(math.atan2(axis[1], axis[0]) / 0.09), round(float(edge[0] @ normal) / 0.4)), []).append(wall)
    frames = {}
    for key, faces in groups.items():
        points = np.concatenate([face.ring for face in faces])
        span = points[:, :2] - points[0, :2]
        axis = span[np.argmax(np.hypot(*span.T))]
        axis = axis / np.hypot(*axis)
        along = (points[:, :2] - points[0, :2]) @ axis
        low = along.min()
        origin = points[0, :2] + axis * low
        # The lowest top of any wall in the facade: a gable's point is above it.
        tops = [face.ring[:, 2].max() for face in faces]
        rims = [z for face in faces for z in face.ring[:, 2] if z > base + 1.0]
        eaves = (min(rims) if rims else min(tops)) - base
        frames[key] = (origin, axis, float(np.ptp(along)), float(eaves), faces)
    return frames


def _overhang(cell: Cell, roofs: list[Face], tint: tuple[int, int, int, int]) -> None:
    """A strip beyond every edge of a sloped roof that no other roof face shares, in that face's own plane."""
    key = lambda point: tuple(np.round(point, 1))
    seen: dict[tuple, int] = {}
    for face in roofs:
        for a, b in zip(face.ring, np.roll(face.ring, -1, axis=0)):
            edge = tuple(sorted((key(a), key(b))))
            seen[edge] = seen.get(edge, 0) + 1
    for face in roofs:
        middle = face.ring.mean(axis=0)
        normal = np.cross(face.ring[1] - face.ring[0], face.ring[2] - face.ring[0])
        if np.linalg.norm(normal) < 1e-6 or math.hypot(normal[0], normal[1]) < FLAT_ROOF_SLOPE * abs(normal[2]):
            continue
        normal /= np.linalg.norm(normal)
        for a, b in zip(face.ring, np.roll(face.ring, -1, axis=0)):
            if seen[tuple(sorted((key(a), key(b))))] > 1 or np.linalg.norm(b - a) < 0.3:
                continue
            outward = np.cross(b - a, normal)
            outward /= np.linalg.norm(outward)
            if outward @ ((a + b) / 2 - middle) < 0:
                outward = -outward
            _add(cell, np.array([a, b, b + outward * OVERHANG_M, a + outward * OVERHANG_M]), None, tint)


def _street_facade(frames: dict[tuple, tuple], middle: np.ndarray, street: shapely.STRtree, lines: list[LineString]) -> tuple | None:
    """The facade most nearly facing the nearest road: where the door goes."""
    wide = {key: frame for key, frame in frames.items() if frame[2] >= 2.5}
    if not wide:
        return None
    at = Point(middle)
    nearest = lines[street.nearest(at)]
    towards = np.array(nearest.interpolate(nearest.project(at)).coords[0]) - middle
    towards = towards / max(np.hypot(*towards), 0.01)

    def facing(frame: tuple) -> float:
        origin, axis, width = frame[:3]
        centre = origin + axis * width / 2 - middle
        return float(towards @ (centre / max(np.hypot(*centre), 0.01)))

    return max(wide, key=lambda key: facing(wide[key]))


def _mesh_solid(cell: Cell, solid_faces: list[Face], base: float, material: tuple[int, int], roof_colour: tuple[int, int, int], seed: int, middle: np.ndarray, street: shapely.STRtree | None, lines: list[LineString]) -> None:
    style, colour = material
    walls = [face for face in solid_faces if face.kind == "wall"]
    roofs = [face for face in solid_faces if face.kind == "roof"]
    frames = _facades(walls, base)
    door = _street_facade(frames, middle, street, lines) if street is not None and style != BOARDS else None
    shade = (seed >> 8) % 256
    for key, (origin, axis, width, eaves, faces) in frames.items():
        tint = (colour, 255 if key == door else 0, shade, style)
        for face in faces:
            _add(cell, face.ring, (origin, axis, base, width, eaves), tint)
    tint = (*roof_colour, ROOF)
    for face in roofs:
        _add(cell, face.ring, None, tint)
    _overhang(cell, roofs, tint)


def _with_walls_to_ground(faces: list[Face], heights: Heights) -> list[Face]:
    """A wall's foot goes down past the ground under it, for the few that float."""
    lowest = min(float(face.ring[:, 2].min()) for face in faces if face.kind == "wall")
    moved = []
    for face in faces:
        ring = face.ring.copy()
        if face.kind == "wall":
            low = ring[:, 2] <= lowest + 0.6
            ring[low, 2] = np.minimum(ring[low, 2], heights.at(*to_local(ring[low, 0], ring[low, 1])) - SINK_M)
        moved.append(Face(face.kind, ring))
    return moved


# Writing


def _deltas(column: np.ndarray) -> bytes:
    return np.diff(column.astype(np.int64), prepend=0).astype("<i2").tobytes()


def _encode(cells: dict[tuple[int, int], Cell], walls: np.ndarray) -> tuple[bytes, list[dict]]:
    """Per cell, in order: i16 columns as differences, then RGBA, then u16 indices; then every wall as four f32."""
    parts = []
    table = []
    for (column, row), cell in sorted(cells.items()):
        if cell.count == 0:
            continue
        if cell.count > 65535:
            raise ValueError(f"a cell with {cell.count} vertices is too many for 16-bit indices")
        positions = np.concatenate(cell.positions)
        facades = np.concatenate(cell.facades)
        centre = ((column + 0.5) * CELL_M, (row + 0.5) * CELL_M)
        local = np.column_stack((positions[:, 0] - centre[0], positions[:, 2], -positions[:, 1] - centre[1]))
        columns = np.round(np.column_stack((local, facades)) / UNIT_M)
        if np.abs(columns).max() > 32767:
            raise ValueError("a building won't fit its cell's 16-bit units")
        parts.extend(_deltas(columns[:, axis]) for axis in range(columns.shape[1]))
        parts.append(np.concatenate(cell.tints).astype(np.uint8).tobytes("F"))
        indices = np.concatenate(cell.indices)
        parts.append(indices.astype("<u2").tobytes())
        table.append({"x": centre[0], "z": centre[1], "vertices": cell.count, "indices": len(indices)})
    parts.append(walls.astype("<f4").tobytes())
    return gzip.compress(b"".join(parts), 9, mtime=0), table


def _road_shapes(ribbons: list[tuple[np.ndarray, np.ndarray]]) -> tuple[list[Polygon], list[LineString]]:
    """Every road's carriageway in world metres, section by section, and its centreline."""
    strips, lines = [], []
    for rings, _ in ribbons:
        if len(rings) < 2:
            continue
        lines.append(LineString(rings[:, 2, :2]))
        for section in range(len(rings) - 1):
            quad = Polygon([rings[section, 1, :2], rings[section, 3, :2], rings[section + 1, 3, :2], rings[section + 1, 1, :2]])
            if quad.is_valid and quad.area > 0:
                strips.append(quad)
    return strips, lines


def build(tile: Tile, corners: np.ndarray, above: np.ndarray, photo: np.ndarray, ribbons: list[tuple[np.ndarray, np.ndarray]], folder: Path) -> tuple[dict, np.ndarray]:
    """Writes `solids.bin.gz`. Returns its manifest, and which of the tile's 2 m cells lie under a building."""
    west, north = to_local(tile.west, tile.north)
    heights = Heights(corners, west, north)
    footprints = read_footprints(tile)
    tree = shapely.STRtree([footprint.shape for footprint in footprints])
    solids = solids_near(tile)
    solid_tree = shapely.STRtree([solid.footprint for solid in solids]) if solids else None
    strips, lines = _road_shapes(ribbons)
    road_tree = shapely.STRtree(strips) if strips else None
    street = shapely.STRtree(lines) if lines else None

    cells: dict[tuple[int, int], Cell] = {}
    outlines: list[Polygon] = []
    through = 0
    counts = {"modelled": 0, "generated": 0}

    def place(faces: list[Face], local: Polygon, kind: int, name: str, base: float) -> None:
        nonlocal through
        seed = _seed(name)
        middle = np.array(local.representative_point().coords[0])
        cell = cells.setdefault((math.floor(middle[0] / CELL_M), math.floor(-middle[1] / CELL_M)), Cell())
        roof_colour = _roof_colour(local, photo, west, north)
        _mesh_solid(cell, faces, base, _material(kind, local.area, seed), roof_colour, seed, middle, street, lines)
        beside = local.buffer(CAR_ROOM_M)
        on_road = sum(strips[index].intersection(beside).area for index in road_tree.query(beside)) if road_tree is not None else 0
        if on_road > TOUCHES_ROAD_M2:
            through += 1
        else:
            outlines.append(local)
        canvas = _cells_of(local, west, north)
        if canvas is not None:
            built[canvas[0], canvas[1]] |= canvas[2]

    built = np.zeros((SAMPLES, SAMPLES), dtype=bool)
    for solid in solids:
        middle = solid.footprint.centroid
        if not (tile.west <= middle.x < tile.east and tile.south <= middle.y < tile.north):
            continue
        hits = [index for index in tree.query(solid.footprint) if footprints[index].shape.intersects(solid.footprint)]
        kind = footprints[max(hits, key=lambda index: footprints[index].shape.intersection(solid.footprint).area)].kind if hits else 0
        faces = [Face(face.kind, np.column_stack((*to_local(face.ring[:, 0], face.ring[:, 1]), face.ring[:, 2]))) for face in solid.faces]
        local = shapely.transform(solid.footprint, lambda points: np.column_stack(to_local(points[:, 0], points[:, 1])))
        base = float(np.median(heights.at(*np.array(local.exterior.coords).T)))
        place(_with_walls_to_ground(faces, heights), local, kind, solid.name, base)
        counts["modelled"] += 1

    for index, footprint in enumerate(footprints):
        if solid_tree is not None:
            covered = sum(solids[hit].footprint.intersection(footprint.shape).area for hit in solid_tree.query(footprint.shape))
            if covered > 0.5 * footprint.shape.area:
                continue
        local = shapely.transform(footprint.shape, lambda points: np.column_stack(to_local(points[:, 0], points[:, 1]))).simplify(0.25)
        if local.geom_type != "Polygon" or local.area < 4:
            continue
        base = float(np.median(heights.at(*np.array(local.exterior.coords).T)))
        faces, _ = _generated_shape(footprint, local, above, west, north, base)
        place(faces, local, footprint.kind, f"{tile.name}-{index}", base)
        counts["generated"] += 1

    walls = []
    for outline in outlines:
        for ring in (outline.simplify(0.2).exterior, *outline.interiors):
            points = np.array(ring.coords)
            walls.append(np.column_stack((points[:-1, 0], -points[:-1, 1], points[1:, 0], -points[1:, 1])))
    wall_array = np.concatenate(walls) if walls else np.zeros((0, 4))
    (folder / "solids.bin.gz").write_bytes((data := _encode(cells, wall_array))[0])
    triangles = sum(entry["indices"] for entry in data[1]) // 3
    print(f"  {counts['modelled']} modelled, {counts['generated']} generated, {triangles} triangles, {len(data[0]) / 1e6:.2f} MB, {through} over a road and left without collision")
    return {"file": "solids.bin.gz", "unitM": UNIT_M, "cells": data[1], "walls": len(wall_array), "encoding": "gzip; per cell: x, y, z, along, up, width, eaves as int16le differences, tint as four byte columns, indices as uint16le; then walls as four float32le (x1, z1, x2, z2)", "overRoads": through, "modelled": counts["modelled"], "generated": counts["generated"]}, built
