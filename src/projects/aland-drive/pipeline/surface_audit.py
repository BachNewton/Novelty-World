"""Where the drawn road surfaces meet, measured on the triangles themselves.

    pipeline/.venv/Scripts/python src/projects/aland-drive/pipeline/surface_audit.py L2343C [more tiles] [--report out.md]

Reads a built tile's road surface (every ribbon's triangles, shoulders and all,
and every apron's) and its drawn ground, the 4 m mesh as the game makes it, and
lays both on a half-metre raster. What a camera sees at a place is the highest
surface there, so each kind of fault is read off that:

- gap: land showing between two carriageways that lie closer than a car's width,
  a strip of grass where one road should run into the other;
- lip: a step in the top surface between neighbouring cells of carriageway, more
  than the slope either side of it explains;
- through: a lesser road's carriageway drawn over a greater one's;
- flicker: two roads' carriageways within half a centimetre of each other, which
  the depth buffer can't tell apart;
- plate: a shoulder, which fades to the ground's colour, drawn over another
  road's carriageway;
- buried: the ground drawn over a carriageway;
- ledge: the surface's outline standing clear of the ground beside it, a step or
  a floating edge, off bridges;
- kink: a road's own profile folding, a change of grade over a few metres.

Each fault is put in a place, clustered, and given its setting: a junction (a
road's end landing on another), a merge (one landing at a shallow angle), roads
running close together with no junction, or the open road. Every place gets a
`?at=` link looking at it from a little south and above.
"""

import argparse
import gzip
import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy import ndimage, sparse
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree
from shapely.geometry import Point

from build import OUTPUT
from grid import TILE_SIZE_M, WORLD_ORIGIN
from roads import CLASSES, surface_height
from roadside import CENTRE, EDGE_LEFT, EDGE_RIGHT, RINGS, Chain, other_than_seam

CELL_M = 0.5
BLOCK_M = 1000.0
# Each block is read with this much of its neighbours, so a fault on a block's edge is seen whole.
PAD_M = 6.0
APRON_FLOATS = 5
APRON_CARRIAGEWAY = 0.5
# As the game drops a ribbon triangle when it makes the mesh (`render/roads.ts`): a cliff of ribbon no car should meet.
CLIFF_RISE_M = 1.2
CLIFF_FLATNESS = math.sqrt(0.5)
SMALLEST_TRIANGLE_M2 = 0.01

CARRIAGEWAY, SHOULDER = 0, 1
APRON_OWNER = 1_000_000
# Who should be on top where two overlap: greater roads, then aprons (which tuck under the roads they join), then tracks
# and paths, which pass under both, except at their own ends: an apron joins those as it does a road's.
APRON_RANK = 1_000_000
UNDER_APRONS_RANK = 2_000_000
LEAST_APRON_RANK = 4
# An end within this of an apron's point lands on it, and its last stretch, as far as an apron reaches along a road, is over it.
OWN_APRON_M = 0.3
OWN_APRON_REACH_M = 26.0

# Thresholds a fault must pass to count. Below these it isn't visible from a car.
GAP_CLOSE_M = 1.5
GAP_LEAST_M2 = 0.5
LIP_M = 0.05
FLICKER_M = 0.005
THROUGH_M = 0.005
PLATE_DEPTH_M = 0.3
BURIED_M = 0.02
LEDGE_M = 0.20
KINK_RUN_M = 4.0
KINK_GRADE = 0.08
LEAST_CELLS = {"gap": 2, "lip": 1, "through": 2, "flicker": 2, "plate": 4, "buried": 2, "ledge": 1, "kink": 1}
KINDS = ("gap", "lip", "through", "flicker", "plate", "buried", "ledge", "kink")
CLUSTER_M = 4.0

# The settings a place is put in.
JUNCTION_REACH_M = 20.0
MERGE_ANGLE = math.radians(35)
LANDING_REACH_M = 6.0
ALONGSIDE_M = 10.0
SETTINGS = ("junction", "merge", "alongside", "road")

LOOK_BACK_M = 16.0
LOOK_HEIGHT_M = 20.0


@dataclass
class Drawn:
    """Every triangle a tile draws as road, with whose it is and what part."""

    triangles: np.ndarray  # (T, 3, 3) of east, north, height.
    owner: np.ndarray  # A chain's index, or APRON_OWNER plus the apron's number.
    rank: np.ndarray  # Lower is the one that should be on top.
    part: np.ndarray  # CARRIAGEWAY or SHOULDER.
    span: np.ndarray  # On a bridge or over water, held up on purpose.


def read_tile(folder: Path) -> tuple[dict, np.ndarray, list[Chain], np.ndarray, np.ndarray]:
    """The manifest, the drawn ground's nodes, the chains, and the aprons' points and triangles."""
    manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
    info = manifest["heights"]
    deltas = np.frombuffer(gzip.decompress((folder / info["file"]).read_bytes()), "<i2").reshape(info["nodes"], info["nodes"])
    nodes = np.cumsum(deltas.astype(np.int32), axis=1) * info["unitM"]
    surface = manifest["roadSurface"]
    sections = sum(chain["sections"] for chain in surface["chains"])
    data = gzip.decompress((folder / surface["file"]).read_bytes())
    rings = np.frombuffer(data, "<f4", count=sections * RINGS * 3).reshape(sections, RINGS, 3).astype(np.float64)
    chains, first = [], 0
    for index, chain in enumerate(surface["chains"]):
        kind = chain["kind"]
        rank = CLASSES[kind].rank if kind in CLASSES else 6
        chains.append(Chain(index, kind, rank, chain["motor"], rings[first : first + chain["sections"]], [tuple(span) for span in chain.get("spans") or []], chain.get("name") or ""))
        first += chain["sections"]
    start = sections * RINGS * 12 + sections
    count = surface["aprons"]["points"]
    points = np.frombuffer(data, "<f4", count=count * APRON_FLOATS, offset=start).reshape(-1, APRON_FLOATS).astype(np.float64)
    triangles = np.frombuffer(data, "<u4", count=surface["aprons"]["triangles"] * 3, offset=start + count * APRON_FLOATS * 4).reshape(-1, 3)
    return manifest, nodes, chains, points, triangles


def _kept(triangles: np.ndarray) -> np.ndarray:
    """The triangles the game keeps when it makes the mesh."""
    u = triangles[:, 1] - triangles[:, 0]
    v = triangles[:, 2] - triangles[:, 0]
    normal = np.cross(u, v)
    length = np.linalg.norm(normal, axis=1)
    rise = triangles[:, :, 2].max(1) - triangles[:, :, 2].min(1)
    return (length > SMALLEST_TRIANGLE_M2) & ~((rise > CLIFF_RISE_M) & (np.abs(normal[:, 2]) / np.maximum(length, 1e-12) < CLIFF_FLATNESS))


def drawn(chains: list[Chain], points: np.ndarray, apron_triangles: np.ndarray) -> Drawn:
    triangles, owner, rank, part, span = [], [], [], [], []
    apron_points = cKDTree(points[np.unique(apron_triangles), :2]) if len(apron_triangles) else None
    for chain in chains:
        rings = chain.rings
        if len(rings) < 2:
            continue
        on_span = np.zeros(len(rings) - 1, dtype=bool)
        for first, last in chain.spans:
            on_span[first:last] = True
        chain_rank = np.full(len(rings) - 1, chain.index if chain.motor and chain.rank <= LEAST_APRON_RANK else UNDER_APRONS_RANK + chain.index)
        if apron_points is not None and chain_rank[0] >= UNDER_APRONS_RANK:
            steps = np.hypot(*np.diff(rings[:, 2, :2], axis=0).T)
            along = np.concatenate(([0], np.cumsum(steps)))
            middle = (along[:-1] + along[1:]) / 2
            for end, from_end in ((0, middle), (-1, along[-1] - middle)):
                if apron_points.query(rings[end, 1:4, :2])[0].min() < OWN_APRON_M:
                    chain_rank[from_end < OWN_APRON_REACH_M] = chain.index
        for lane in range(RINGS - 1):
            here, ahead = rings[:-1], rings[1:]
            # As `render/roads.ts` cuts each quad.
            for a, b, c in ((here[:, lane], here[:, lane + 1], ahead[:, lane]), (ahead[:, lane], here[:, lane + 1], ahead[:, lane + 1])):
                triangles.append(np.stack((a, b, c), axis=1))
                count = len(a)
                owner.append(np.full(count, chain.index))
                rank.append(chain_rank)
                part.append(np.full(count, CARRIAGEWAY if lane in (1, 2) else SHOULDER))
                span.append(on_span)
    if len(apron_triangles):
        # Aprons that share a point are one.
        count = len(points)
        links = sparse.coo_matrix((np.ones(len(apron_triangles) * 2), (np.repeat(apron_triangles[:, 0], 2), apron_triangles[:, 1:].ravel())), shape=(count, count))
        _, which = connected_components(links, directed=False)
        corners = points[apron_triangles]
        triangles.append(corners[:, :, :3])
        component = which[apron_triangles[:, 0]]
        owner.append(APRON_OWNER + component)
        rank.append(APRON_RANK + component)
        part.append(np.where(corners[:, :, 3].max(1) == APRON_CARRIAGEWAY, CARRIAGEWAY, SHOULDER))
        span.append(np.zeros(len(corners), dtype=bool))
    all_triangles = np.concatenate(triangles)
    keep = _kept(all_triangles)
    return Drawn(all_triangles[keep], np.concatenate(owner)[keep], np.concatenate(rank)[keep], np.concatenate(part)[keep].astype(np.int8), np.concatenate(span)[keep])


def fragments(triangles: np.ndarray, west: float, north: float, columns: int, rows: int):
    """Every raster cell centre each triangle covers, in a grid `columns` by `rows` from (west, north): (triangle, cell, height)."""
    xs, ys = triangles[:, :, 0], triangles[:, :, 1]
    first_column = np.maximum(np.ceil((xs.min(1) - west) / CELL_M - 0.5), 0).astype(np.int64)
    last_column = np.minimum(np.floor((xs.max(1) - west) / CELL_M - 0.5), columns - 1).astype(np.int64)
    first_row = np.maximum(np.ceil((north - ys.max(1)) / CELL_M - 0.5), 0).astype(np.int64)
    last_row = np.minimum(np.floor((north - ys.min(1)) / CELL_M - 0.5), rows - 1).astype(np.int64)
    width = np.maximum(last_column - first_column + 1, 0)
    counts = width * np.maximum(last_row - first_row + 1, 0)
    found = ([], [], [])
    order = np.flatnonzero(counts)
    # In batches, so no step holds more than a few million cells.
    budget = 4_000_000
    batches = np.split(order, np.flatnonzero(np.diff(np.cumsum(counts[order]) // budget)) + 1) if len(order) else []
    for batch in batches:
        each = counts[batch]
        which = np.repeat(batch, each)
        within = np.arange(int(each.sum())) - np.repeat(np.cumsum(each) - each, each)
        column = first_column[which] + within % width[which]
        row = first_row[which] + within // width[which]
        x = west + (column + 0.5) * CELL_M
        y = north - (row + 0.5) * CELL_M
        a, b, c = triangles[which, 0], triangles[which, 1], triangles[which, 2]
        area = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
        safe = np.where(np.abs(area) < 1e-12, 1e-12, area)
        first = ((b[:, 1] - c[:, 1]) * (x - c[:, 0]) + (c[:, 0] - b[:, 0]) * (y - c[:, 1])) / safe
        second = ((c[:, 1] - a[:, 1]) * (x - c[:, 0]) + (a[:, 0] - c[:, 0]) * (y - c[:, 1])) / safe
        third = 1 - first - second
        inside = (first >= -1e-9) & (second >= -1e-9) & (third >= -1e-9) & (np.abs(area) >= 1e-12)
        found[0].append(which[inside])
        found[1].append((row * columns + column)[inside])
        found[2].append((first * a[:, 2] + second * b[:, 2] + third * c[:, 2])[inside])
    if not found[0]:
        return np.zeros(0, np.int64), np.zeros(0, np.int64), np.zeros(0)
    return tuple(np.concatenate(parts) for parts in found)


def _first_of_each(cells: np.ndarray, size: int, values: np.ndarray, fill) -> np.ndarray:
    """A dense grid holding, for each cell, the first value given for it (cells sorted as wanted)."""
    grid = np.full(size, fill, dtype=values.dtype)
    unique, first = np.unique(cells, return_index=True)
    grid[unique] = values[first]
    return grid


@dataclass
class Fault:
    kind: str
    east: float
    north: float
    value: float  # Metres, square metres or a grade, by kind.
    owners: tuple[int, ...]


def audit_block(drawn_roads: Drawn, nodes: np.ndarray, step: float, tile_west: float, tile_north: float, west: float, north: float, size_m: float) -> list[Fault]:
    """The faults in one square of the tile, read from its raster."""
    count = int(round(size_m / CELL_M))
    pad = int(PAD_M / CELL_M)
    west_padded, north_padded = west - pad * CELL_M, north + pad * CELL_M
    cells = count + 2 * pad
    t = drawn_roads.triangles
    near = (t[:, :, 0].max(1) >= west_padded) & (t[:, :, 0].min(1) <= west_padded + cells * CELL_M) & (t[:, :, 1].min(1) <= north_padded) & (t[:, :, 1].max(1) >= north_padded - cells * CELL_M)
    index = np.flatnonzero(near)
    if len(index) == 0:
        return []
    which, cell, height = fragments(t[index], west_padded, north_padded, cells, cells)
    which = index[which]
    if len(cell) == 0:
        return []
    total = cells * cells
    owner, rank, part, span = drawn_roads.owner[which], drawn_roads.rank[which], drawn_roads.part[which], drawn_roads.span[which]

    # The top surface and whose it is.
    order = np.lexsort((-height, cell))
    top_h = _first_of_each(cell[order], total, height[order], np.nan)
    top_owner = _first_of_each(cell[order], total, owner[order], -1)
    top_part = _first_of_each(cell[order], total, part[order].astype(np.int8), np.int8(-1))
    top_span = _first_of_each(cell[order], total, span[order], False)
    covered = ~np.isnan(top_h)

    carriage = part == CARRIAGEWAY
    road_cells, road_h, road_owner, road_rank = cell[carriage], height[carriage], owner[carriage], rank[carriage]
    order = np.lexsort((-road_h, road_cells))
    road_top_h = _first_of_each(road_cells[order], total, road_h[order], np.nan)
    road_top_owner = _first_of_each(road_cells[order], total, road_owner[order], -1)
    road_top_rank = _first_of_each(road_cells[order], total, road_rank[order], -1)
    is_road = ~np.isnan(road_top_h)
    # The greatest road at each cell, and its height.
    order = np.lexsort((-road_h, road_rank, road_cells))
    best_rank = _first_of_each(road_cells[order], total, road_rank[order], -1)
    best_h = _first_of_each(road_cells[order], total, road_h[order], np.nan)
    # The highest carriageway of another road than the top one, for flicker.
    other = road_owner != road_top_owner[road_cells]
    order = np.lexsort((-road_h[other], road_cells[other]))
    second_h = _first_of_each(road_cells[other][order], total, road_h[other][order], np.nan)
    second_owner = _first_of_each(road_cells[other][order], total, road_owner[other][order], -1)

    rows, columns = np.divmod(np.arange(total), cells)
    xy = np.column_stack((west_padded + (columns + 0.5) * CELL_M, north_padded - (rows + 0.5) * CELL_M))
    ground = np.full(total, np.nan)
    wanted = ndimage.binary_dilation(covered.reshape(cells, cells), iterations=2).ravel()
    ground[wanted] = surface_height(nodes, step, tile_west, tile_north, xy[wanted])

    inner = np.zeros((cells, cells), dtype=bool)
    inner[pad:-pad, pad:-pad] = True
    # Only cells inside the tile: past its edge the neighbour's surface isn't read.
    inner &= ((xy[:, 0] > tile_west) & (xy[:, 0] < tile_west + TILE_SIZE_M) & (xy[:, 1] < tile_north) & (xy[:, 1] > tile_north - TILE_SIZE_M)).reshape(cells, cells)
    inner = inner.ravel()
    faults: list[Fault] = []

    def add(kind: str, at: np.ndarray, value: np.ndarray, owners_a: np.ndarray, owners_b: np.ndarray | None = None) -> None:
        at = at & inner
        for place, amount, first_owner, second in zip(np.flatnonzero(at), value[at], owners_a[at], owners_b[at] if owners_b is not None else owners_a[at]):
            faults.append(Fault(kind, float(xy[place, 0]), float(xy[place, 1]), float(amount), tuple(sorted({int(first_owner), int(second)}))))

    top_is_road = is_road & (top_part == CARRIAGEWAY)
    # A lesser road on top of a greater, or two too close to tell apart.
    lesser_on_top = is_road & (road_top_rank != best_rank) & (road_top_h - best_h > THROUGH_M)
    add("through", lesser_on_top, road_top_h - best_h, road_top_owner, np.full(total, -1))
    flicker = is_road & ~np.isnan(second_h) & (road_top_h - second_h <= FLICKER_M)
    add("flicker", flicker, road_top_h - second_h, road_top_owner, second_owner)
    plate = is_road & (top_part == SHOULDER) & (top_owner != road_top_owner) & (top_h - road_top_h < PLATE_DEPTH_M)
    add("plate", plate, top_h - road_top_h, top_owner, road_top_owner)
    buried = top_is_road & (ground > top_h + BURIED_M)
    add("buried", buried, ground - top_h, top_owner)

    # Steps in the top surface over the carriageway, beyond the slope either side.
    grid_h = np.where(top_is_road, top_h, np.nan).reshape(cells, cells)
    grid_owner = top_owner.reshape(cells, cells)
    for axis in (0, 1):
        rise = np.diff(grid_h, axis=axis)
        before = np.roll(rise, 1, axis=axis)
        after = np.roll(rise, -1, axis=axis)
        excess = np.abs(rise) - 0.5 * (np.abs(before) + np.abs(after))
        # Where the slope either side is unknown, a step is measured against the steeper one that is.
        lone = np.isnan(excess) & ~np.isnan(rise)
        excess[lone] = np.abs(rise[lone]) - np.fmax(np.abs(before[lone]), np.abs(after[lone]))
        lip = np.zeros((cells, cells), dtype=bool)
        value = np.zeros((cells, cells))
        owners_b = np.full((cells, cells), -1)
        if axis == 0:
            lip[:-1] = excess > LIP_M
            value[:-1] = np.nan_to_num(excess)
            owners_b[:-1] = grid_owner[1:]
        else:
            lip[:, :-1] = excess > LIP_M
            value[:, :-1] = np.nan_to_num(excess)
            owners_b[:, :-1] = grid_owner[:, 1:]
        add("lip", lip.ravel(), value.ravel(), top_owner, owners_b.ravel())

    # The surface's outline standing clear of the ground: off a bridge, a step a camera sees.
    grid_covered = covered.reshape(cells, cells)
    outline = grid_covered & ~ndimage.binary_erosion(grid_covered, border_value=1)
    ledge = outline.ravel() & ~top_span & (top_h - ground > LEDGE_M)
    add("ledge", ledge, top_h - ground, top_owner)

    # Land showing between carriageways that lie closer together than a car is wide.
    grid_road = is_road.reshape(cells, cells)
    reach = int(round(GAP_CLOSE_M / CELL_M))
    disk = np.hypot(*np.mgrid[-reach : reach + 1, -reach : reach + 1]) <= reach
    gap = ndimage.binary_closing(grid_road, structure=disk, border_value=0) & ~grid_road
    labels, found = ndimage.label(gap)
    if found:
        # Which roads each strip lies between.
        grown = ndimage.grey_dilation(labels, size=3)
        touching = grid_road & (grown > 0)
        pairs = np.unique(np.column_stack((grown[touching], road_top_owner.reshape(cells, cells)[touching])), axis=0)
        between: dict[int, set[int]] = {}
        for label, road in pairs:
            between.setdefault(int(label), set()).add(int(road))
        for label, roads in between.items():
            if len(roads) < 2:
                continue
            members = (labels == label).ravel() & inner
            if members.sum() * CELL_M**2 < GAP_LEAST_M2:
                continue
            pair = sorted(roads)[:2]
            add("gap", members, np.full(total, members.sum() * CELL_M**2), np.full(total, pair[0]), np.full(total, pair[1]))
    return faults


def kinks(chains: list[Chain], box: tuple[float, float, float, float]) -> list[Fault]:
    """Where a road's own profile folds: its grade changing by more than KINK_GRADE over KINK_RUN_M either side."""
    found = []
    for chain in chains:
        if chain.length < 2 * KINK_RUN_M + 1:
            continue
        along = np.arange(0, chain.length, 1.0)
        centre = np.column_stack([np.interp(along, chain.along, chain.rings[:, CENTRE, axis]) for axis in range(3)])
        run = int(KINK_RUN_M)
        grade_before = (centre[run:-run, 2] - centre[: -2 * run, 2]) / KINK_RUN_M
        grade_after = (centre[2 * run :, 2] - centre[run:-run, 2]) / KINK_RUN_M
        change = np.abs(grade_after - grade_before)
        on_span = np.array([chain.on_span(a, 4.0) for a in along[run:-run]])
        for index in np.flatnonzero((change > KINK_GRADE) & ~on_span):
            point = centre[run + index]
            if other_than_seam(point[:2], box):
                found.append(Fault("kink", float(point[0]), float(point[1]), float(change[index]), (chain.index,)))
    return found


@dataclass
class Landing:
    chain: int
    host: int
    east: float
    north: float
    merge: bool


def landings(chains: list[Chain], box: tuple[float, float, float, float]) -> list[Landing]:
    """Every road end that lands on another road: a junction."""
    lines = [(chain, chain.line) for chain in chains if chain.line is not None]
    found = []
    for chain, _ in lines:
        for along in (0.0, chain.length):
            point = chain.ring_at(along)[CENTRE, :2]
            if not other_than_seam(point, box) or chain.length < 1:
                continue
            end = Point(point)
            best = None
            for other, line in lines:
                if other is chain:
                    continue
                distance = line.distance(end)
                if distance > 30:
                    continue
                at = line.project(end)
                ring = other.ring_at(at)
                reach = distance - float(np.hypot(*(ring[EDGE_RIGHT, :2] - ring[EDGE_LEFT, :2]))) / 2
                if reach < LANDING_REACH_M and (best is None or (other.rank, reach) < (best[0].rank, best[2])):
                    best = (other, at, reach)
            if best is None:
                continue
            host, at, _ = best
            towards = chain.direction_at(min(max(along, 0.5), chain.length - 0.5))
            across = host.direction_at(at)
            angle = math.acos(min(abs(float(towards @ across)), 1.0))
            found.append(Landing(chain.index, host.index, float(point[0]), float(point[1]), angle < MERGE_ANGLE))
    return found


@dataclass
class Place:
    kind: str
    setting: str
    east: float
    north: float
    worst: float
    cells: int
    owners: tuple[int, ...]


def places(faults: list[Fault], junctions: list[Landing], chains: list[Chain]) -> list[Place]:
    """Faults of a kind near each other are one place, put in the setting it lies in."""
    found: list[Place] = []
    junction_tree = cKDTree([(landing.east, landing.north) for landing in junctions]) if junctions else None
    lines = {chain.index: chain.line for chain in chains if chain.line is not None}
    for kind in KINDS:
        group = [fault for fault in faults if fault.kind == kind]
        if not group:
            continue
        points = np.array([(fault.east, fault.north) for fault in group])
        pairs = cKDTree(points).query_pairs(CLUSTER_M, output_type="ndarray")
        graph = sparse.coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(len(group), len(group))) if len(pairs) else sparse.coo_matrix((len(group), len(group)))
        _, label = connected_components(graph, directed=False)
        for member in range(label.max() + 1):
            inside = np.flatnonzero(label == member)
            if len(inside) < LEAST_CELLS[kind]:
                continue
            worst = max(inside, key=lambda index: group[index].value)
            owners = tuple(sorted({owner for index in inside for owner in group[index].owners if owner >= 0}))
            east, north = group[worst].east, group[worst].north
            setting = "road"
            if junction_tree is not None:
                near = junction_tree.query_ball_point((east, north), JUNCTION_REACH_M)
                if near:
                    setting = "merge" if any(junctions[index].merge for index in near) else "junction"
            if setting == "road":
                # Two roads in one fault with no junction near, or another road close by: roads running close together.
                roads = [owner for owner in owners if owner < APRON_OWNER]
                here = Point(east, north)
                if len(roads) >= 2 or any(index not in owners and line.distance(here) < ALONGSIDE_M for index, line in lines.items()):
                    setting = "alongside"
            value = group[worst].value
            found.append(Place(kind, setting, east, north, value, len(inside), owners))
    return found


def audit(name: str, tiles: Path = OUTPUT) -> tuple[list[Place], list[Chain]]:
    folder = tiles / name
    manifest, nodes, chains, points, triangles = read_tile(folder)
    bounds = manifest["bounds"]
    west, north = bounds["west"], bounds["north"]
    step = manifest["heights"]["stepM"]
    roads = drawn(chains, points, triangles)
    faults: list[Fault] = []
    blocks = int(math.ceil(TILE_SIZE_M / BLOCK_M))
    for row in range(blocks):
        for column in range(blocks):
            faults += audit_block(roads, nodes, step, west, north, west + column * BLOCK_M, north - row * BLOCK_M, BLOCK_M)
    box = (west, north - TILE_SIZE_M, west + TILE_SIZE_M, north)
    faults += kinks(chains, box)
    return places(faults, landings(chains, box), chains), chains


def describe(place: Place, chains: list[Chain]) -> str:
    def road(owner: int) -> str:
        if owner >= APRON_OWNER:
            return "an apron"
        chain = chains[owner]
        return chain.name or f"a {chain.kind}"

    names = " and ".join(dict.fromkeys(road(owner) for owner in place.owners)) or "?"
    amount = {
        "gap": f"{place.worst:.1f} m² of land",
        "lip": f"a {place.worst * 100:.0f} cm step",
        "through": f"{place.worst * 100:.0f} cm over the greater road",
        "flicker": f"{place.worst * 1000:.0f} mm apart",
        "plate": f"{place.cells * CELL_M**2:.0f} m² of shoulder over road",
        "buried": f"ground {place.worst * 100:.0f} cm over the road",
        "ledge": f"edge {place.worst * 100:.0f} cm over the ground",
        "kink": f"grade changes {place.worst * 100:.0f}%",
    }[place.kind]
    return f"{place.kind} at a {place.setting}: {amount}, {names}"


def link(place: Place, base: str) -> str:
    """Looking at the place from a little south of it and above."""
    east, north = place.east + WORLD_ORIGIN[0], place.north + WORLD_ORIGIN[1] - LOOK_BACK_M
    pitch = -math.atan2(LOOK_HEIGHT_M, LOOK_BACK_M)
    return f"{base}?at={east:.1f},{north:.1f},{LOOK_HEIGHT_M:.0f},0,{pitch:.3f}"


def severity(place: Place) -> float:
    """How much a place shows, to sort the worst first: its worst amount, and its size for those measured by area."""
    if place.kind in ("gap", "plate", "through", "flicker", "buried"):
        return place.cells * CELL_M**2 * (1 + place.worst * 10)
    return place.worst * (1 + 0.05 * place.cells)


def report(results: dict[str, tuple[list[Place], list[Chain]]], base: str, worst: int) -> str:
    lines = ["# Where the road surfaces meet", "", f"From `pipeline/surface_audit.py`, on the drawn triangles at {CELL_M} m. Places, by kind of fault and where it lies.", ""]
    header = "| tile | " + " | ".join(KINDS) + " |"
    lines += [header, "|" + "---|" * (len(KINDS) + 1)]
    for name, (found, _) in results.items():
        lines.append(f"| {name} | " + " | ".join(str(sum(place.kind == kind for place in found)) for kind in KINDS) + " |")
    lines += ["", "By setting, all tiles:", "", "| setting | " + " | ".join(KINDS) + " |", "|" + "---|" * (len(KINDS) + 1)]
    for setting in SETTINGS:
        lines.append(f"| {setting} | " + " | ".join(str(sum(place.kind == kind and place.setting == setting for found, _ in results.values() for place in found)) for kind in KINDS) + " |")
    for name, (found, chains) in results.items():
        lines += ["", f"## {name}"]
        for kind in KINDS:
            group = sorted((place for place in found if place.kind == kind), key=severity, reverse=True)
            if not group:
                continue
            settings = ", ".join(f"{sum(place.setting == setting for place in group)} {setting}" for setting in SETTINGS if any(place.setting == setting for place in group))
            lines += ["", f"### {kind}: {len(group)} places ({settings})", ""]
            lines += [f"- {describe(place, chains)}: {link(place, base)}" for place in group[:worst]]
    return "\n".join(lines) + "\n"


def summary(found: list[Place]) -> dict:
    return {kind: {setting: sum(place.kind == kind and place.setting == setting for place in found) for setting in SETTINGS} for kind in KINDS}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tiles", nargs="+")
    parser.add_argument("--from", dest="source", type=Path, default=OUTPUT, help="the folder of built tiles")
    parser.add_argument("--report", type=Path, help="write the places as Markdown here")
    parser.add_argument("--json", type=Path, help="write every place as JSON here")
    parser.add_argument("--base", default="http://localhost:3001/games/3d-games/aland-drive", help="the game's address for the links")
    parser.add_argument("--worst", type=int, default=10, help="places listed per kind and tile")
    arguments = parser.parse_args()
    results = {}
    for name in arguments.tiles:
        results[name] = audit(name, arguments.source)
        print(name, json.dumps({kind: sum(counts.values()) for kind, counts in summary(results[name][0]).items()}))
    if arguments.report:
        arguments.report.write_text(report(results, arguments.base, arguments.worst), encoding="utf-8")
    if arguments.json:
        everything = {name: [{**place.__dict__, "at": link(place, arguments.base)} for place in found] for name, (found, _) in results.items()}
        arguments.json.write_text(json.dumps(everything, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
