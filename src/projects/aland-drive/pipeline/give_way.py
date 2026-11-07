"""Where a road meets a building, one of them gives way, before either is laid.

Every building stands as a wall the car hits. OSM's lines and NLS's buildings
come from different surveys, so a farm drive's line can run under a shed that
the laser saw standing there. The building wins that: the road stops at its wall.
A road wins only where it really goes through, a way OSM tags as a passage: then
the wall opens as wide as the road, and nowhere else.

A public road is cut only as a last resort, since the network needs it whole.
One whose line clips a building, entering it and leaving it again a few metres
in from one side, is OSM's line off the building's edge, not a road through it.
So it is pushed clear as a road beside a building is, and the building keeps
every wall: a building drawn on a road with its walls opened was a house the car
drove through. A road no push gets clear stops at the walls like any other.

A road that passes beside a building keeps clear of it: where its width would
reach a wall, its line is pushed out, the push fading along the road, so the wall
stands beside the road rather than on it. A junction's point stays where it is, so
roads still meet.

All of this happens to OSM's whole ways, before they're cut into tiles. A push
near a tile's edge moves the point where the road crosses it, and both tiles at
the edge read the same ways and the same buildings near it, so both move the road
alike and its two halves still meet. A tile that pushed only its own half could
never move that point, and the road builder runs a road straight through the
crossing for a stretch either side, which dragged a road pushed near an edge back
over the building.
"""

from collections import Counter
from dataclasses import dataclass

import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import nearest_points

from roads import CLASSES

# A car on the very edge of a road still fits past a wall this far away.
CAR_ROOM_M = 1.2
# A road that gives way ends this far short of the wall, so its last section is clear of it.
CLEAR_M = 0.5
# What's left of a cut road shorter than this is no road, unless it carries on over the tile's edge.
SHORTEST_LEFT_M = 4.0
# Public roads, the ones pushed clear of a building their line clips rather than cut: unclassified and residential streets and above.
THROUGH_RANK = CLASSES["unclassified"].rank
# A public road's line this far into a building, across the road, is OSM's line off the building's edge: on the island it's
# never more than 2.7 m. Deeper than this, the road would bend round the building, and stops at its wall instead.
CLIP_M = 4.0
SAME_POINT_M = 0.01
# A road's drawn edge on a building by less than this is rounding, not a road on a building.
SAME_AREA_M2 = 0.05
# Beyond its verges, a road keeps this clear of a wall: the eaves overhang it and the ground paints a road's edge a little wide,
# so less than this reads as the road touching the building.
CLEARANCE_M = 2.0
# A road this near a building that has nowhere better to go is still clear of its eaves.
EAVES_ROOM_M = 0.5
# How far across the road a point of it looks for somewhere to stand, either way.
ACROSS_M = 12.0
ACROSS_STEP_M = 0.25
# A push fades to nothing over this far along the road either side of where it's needed, at least,
PUSH_FADE_M = 8.0
# and over this many times its own size: a road moved metres aside bends there gently, as it would have been built, not in a jog.
PUSH_TAPER = 12.0
# Points along a road being pushed, at most this far apart.
PUSH_STEP_M = 2.0
# A road between two buildings is pushed from each in turn, this many times.
PUSH_ROUNDS = 3


@dataclass
class Meetings:
    roads: list[dict]
    openings: list[Polygon]  # Where a wall gives way to a road, in the tile's own metres.
    stopped: int  # Road parts that stopped at a wall.
    pushed: int  # Road parts pushed clear of a wall beside them.


def passes_as_passage(road: dict) -> bool:
    return road.get("tunnel") == "building_passage" or road.get("covered") == "yes"


def _goes_through(piece: LineString, outline: Polygon) -> bool:
    """A stretch of road inside a building goes through it when both its ends are on the wall."""
    return all(outline.exterior.distance(end) < SAME_POINT_M for end in (Point(piece.coords[0]), Point(piece.coords[-1])))


def _clips(road: dict, line: LineString, outline: Polygon) -> bool:
    """A public road whose line enters a building and leaves it again near one of its sides: it's pushed clear rather than cut."""
    kind = CLASSES.get(road["kind"])
    if kind is None or kind.rank > THROUGH_RANK:
        return False
    pieces = [piece for piece in shapely.get_parts(line.intersection(outline)) if piece.geom_type == "LineString"]
    return all(_goes_through(piece, outline) and _depth_across(piece, outline) <= CLIP_M for piece in pieces)


def _depth_across(piece: LineString, outline: Polygon) -> float:
    """How far a stretch of road inside a building lies from the building's nearer side, across the road."""
    start, end = np.asarray(piece.coords[0]), np.asarray(piece.coords[-1])
    way = (end - start) / max(float(np.hypot(*(end - start))), 1e-9)
    sides = (np.asarray(outline.exterior.coords) - start) @ np.array([-way[1], way[0]])
    return min(max(float(sides.max()), 0.0), max(float(-sides.min()), 0.0))


def give_way(roads: list[dict], outlines: list[Polygon]) -> Meetings:
    """Roads cut where they stop at a wall and pushed clear of one beside them, and where walls open for a road. `roads` are
    OSM's whole ways, not yet cut into tiles, and `outlines` every building standing near enough the tile to move a road in it."""
    if not outlines:
        return Meetings(roads, [], 0, 0)
    tree = shapely.STRtree(outlines)
    roads = _junctions_out_of_buildings(roads, outlines, tree, _joined_points(roads))
    joined = _joined_points(roads)
    kept: list[tuple[dict, set[int]]] = []
    openings: list[Polygon] = []
    stopped = 0
    for road in roads:
        line = LineString(road["line"])
        inside = [index for index in tree.query(line, predicate="intersects") if line.intersection(outlines[index]).length > 0] if road["motor"] else []
        half = half_width(road)
        blocking, through = [], set()
        for index in inside:
            if passes_as_passage(road):
                openings.append(line.intersection(outlines[index].buffer(half + CAR_ROOM_M)).buffer(half + CAR_ROOM_M))
                through.add(int(index))
            elif not _clips(road, line, outlines[index]):
                blocking.append(outlines[index])
        if blocking:
            stopped += 1
        kept += [(piece, through) for piece in _cut(road, blocking)]
    pushed = 0
    cleared = []
    for road, through in kept:
        if road["motor"] and (line := _clear_of(road, outlines, tree, through, joined)) is not None:
            road = {**road, "line": line}
            pushed += 1
        # A public road no push could get out of a building stops at its walls, as any other road would.
        if still := _still_inside(road, outlines, tree, through):
            stopped += 1
            cleared += _cut(road, still)
        else:
            cleared.append(road)
    for road in cleared:
        if not passes_as_passage(road) and (still := _still_inside(road, outlines, tree, set())):
            raise ValueError(f"road {road['id']} ({road['kind']}) runs inside a building at {still[0].centroid.coords[0]}")
    return Meetings(cleared, openings, stopped, pushed)


def _cut(road: dict, blocking: list[Polygon]) -> list[dict]:
    """What's left of a road stopped at these buildings' walls, each part ending a little short of them."""
    if not blocking:
        return [road]
    pieces = []
    left = LineString(road["line"]).difference(shapely.union_all([outline.buffer(CLEAR_M) for outline in blocking]))
    for part in shapely.get_parts(left):
        if isinstance(part, LineString) and part.length >= SHORTEST_LEFT_M:
            pieces.append({**road, "line": [list(point) for point in part.coords]})
    return pieces


def _still_inside(road: dict, outlines: list[Polygon], tree: shapely.STRtree, through: set[int]) -> list[Polygon]:
    """The buildings that haven't opened for a road its line still runs inside."""
    if not road["motor"]:
        return []
    line = LineString(road["line"])
    return [outlines[index] for index in tree.query(line, predicate="intersects") if int(index) not in through and line.intersection(outlines[index]).length > CLEAR_M]


def _junctions_out_of_buildings(roads: list[dict], outlines: list[Polygon], tree: shapely.STRtree, joined: set[tuple[float, float]]) -> list[dict]:
    """A junction never moves in a push, so one a public road meets inside a building would hold that road inside it: it
    moves out first, the same for every road meeting there, as far as the widest of them needs. Where only lesser roads meet,
    they stop at the wall instead."""
    reach: dict[tuple[float, float], float] = {}
    public: set[tuple[float, float]] = set()
    for road in roads:
        if road["motor"]:
            for point in road["line"]:
                if (key := tuple(point)) in joined:
                    reach[key] = max(reach.get(key, 0.0), drawn_half_width(road) + CLEARANCE_M)
                    if road["kind"] in CLASSES and CLASSES[road["kind"]].rank <= THROUGH_RANK:
                        public.add(key)
    moves = {}
    for key in public:
        at = Point(key)
        if not any(outlines[index].contains(at) for index in tree.query(at)):
            continue
        beside = [outlines[index] for index in tree.query(at.buffer(reach[key] + PUSH_FADE_M))]
        moved = np.array(key)
        for _ in range(PUSH_ROUNDS):
            moved = moved + _push(moved, beside, reach[key])
        moves[key] = [float(moved[0]), float(moved[1])]
    if not moves:
        return roads
    return [{**road, "line": [moves.get(tuple(point), point) for point in road["line"]]} for road in roads]


def half_width(road: dict) -> float:
    return CLASSES[road["kind"]].width_m / 2 if road["kind"] in CLASSES else 1.0


def drawn_half_width(road: dict) -> float:
    """Half of all the road that's drawn, its verges too: on gravel a verge reads as road, so a building on one stands on the road."""
    return half_width(road) + (CLASSES[road["kind"]].shoulder_m if road["kind"] in CLASSES else 0.0)


def _joined_points(roads: list[dict]) -> set[tuple[float, float]]:
    """Points where roads meet: these never move in a push."""
    counts = Counter(tuple(point) for road in roads for point in road["line"])
    return {point for point, count in counts.items() if count > 1}


def _clear_of(road: dict, outlines: list[Polygon], tree: shapely.STRtree, through: set[int], joined: set[tuple[float, float]]) -> list[list[float]] | None:
    """The road's line moved clear of the buildings beside it, or None if it's clear already. Each point of the road too
    near a building looks across the road for where to stand: the nearest place with the room it wants, if one is nearer
    than the nearest gap; otherwise the middle of the nearest gap the whole drawn road fits through, so a road between two
    buildings runs down the middle rather than being shoved off one on to the other. The moves are then eased along the
    road into one smooth bend."""
    half = drawn_half_width(road)
    wants, fits = half + CLEARANCE_M, half + EAVES_ROOM_M
    line = LineString(road["line"])
    if not [index for index in tree.query(line.buffer(wants), predicate="intersects") if int(index) not in through]:
        return None
    walls = shapely.union_all([outlines[index] for index in tree.query(line.buffer(wants + ACROSS_M)) if int(index) not in through])
    points, fixed = _dense(np.array(road["line"], dtype=float), joined)
    step = np.gradient(points, axis=0)
    across = np.column_stack((-step[:, 1], step[:, 0])) / np.maximum(np.hypot(*step.T), 1e-9)[:, None]
    along = np.concatenate(([0.0], np.cumsum(np.hypot(*np.diff(points, axis=0).T))))
    # How far along the road each point is from the nearest one that can't move: a move fades to nothing there.
    pinned = np.min(np.abs(along[:, None] - along[fixed][None, :]), axis=1) if fixed.any() else np.full(len(points), np.inf)
    offsets = np.arange(-ACROSS_M, ACROSS_M + ACROSS_STEP_M / 2, ACROSS_STEP_M)
    moved = False
    for _ in range(PUSH_ROUNDS):
        crowded = np.flatnonzero((shapely.distance(shapely.points(points), walls) < wants) & ~fixed)
        if len(crowded) == 0:
            break
        tried = points[crowded][:, None, :] + offsets[None, :, None] * across[crowded][:, None, :]
        room = shapely.distance(shapely.points(tried.reshape(-1, 2)), walls).reshape(tried.shape[:2])
        target = np.zeros(len(points))
        target[crowded] = [_place(offsets, row, wants, fits) for row in room]
        size = np.abs(target)
        if size.max() < SAME_POINT_M:
            break
        # Each point takes the largest move near it, faded by how far along the road that move is needed. Only the points
        # that need one can give one, which keeps this small on a whole way kilometres long.
        giving = np.flatnonzero(size >= SAME_POINT_M)
        reach_along = np.maximum(PUSH_FADE_M, PUSH_TAPER * size[giving])
        left = np.clip(1 - np.abs(along[:, None] - along[giving][None, :]) / reach_along[None, :], 0, None)
        # Eased at both ends, so the bend has no corner where it starts or where it peaks.
        fade = left * left * (3 - 2 * left) * size[giving][None, :]
        strongest = fade.argmax(axis=1)
        share = fade[np.arange(len(points)), strongest] / size[giving][strongest]
        points = points + (target[giving][strongest] * share * np.clip(pinned / PUSH_FADE_M, 0, 1))[:, None] * across
        moved = True
    if not moved:
        return None
    return points.tolist()


def _place(offsets: np.ndarray, room: np.ndarray, wants: float, fits: float) -> float:
    """Where across the road one point should stand, from the room it has at each offset: the nearest offset with all the
    room it wants, unless a gap the road fits through is nearer, whose middle it takes; and with nowhere to fit, the offset
    with the most room."""
    nearest = lambda among: float(among[np.abs(among).argmin()])
    if not (room >= fits).any():
        return nearest(offsets[room >= room.max() - SAME_POINT_M])
    runs = np.split(np.arange(len(offsets)), np.flatnonzero(np.diff(room >= fits)) + 1)
    run = min((run for run in runs if room[run[0]] >= fits), key=lambda run: np.abs(offsets[run]).min())
    if (room[run] >= wants).any():
        return nearest(offsets[run][room[run] >= wants])
    return nearest(offsets[run][room[run] >= room[run].max() - SAME_POINT_M])


def _push(point: np.ndarray, outlines: list[Polygon], reach: float) -> np.ndarray:
    """How far a point must move to be `reach` from every wall near it."""
    at = Point(point)
    need = np.zeros(2)
    for outline in outlines:
        away = point - np.array(nearest_points(outline.exterior, at)[0].coords[0])
        gap = float(np.hypot(*away))
        if gap < 1e-6:
            continue
        if outline.contains(at):
            away, gap = -away, -gap
        if gap < reach:
            need += away / abs(gap) * (reach - gap)
    return need


def _dense(line: np.ndarray, joined: set[tuple[float, float]]) -> tuple[np.ndarray, np.ndarray]:
    """The line with points at most a push step apart, and which of them are fixed."""
    points, fixed = [line[0]], [tuple(line[0]) in joined]
    for start, end in zip(line[:-1], line[1:]):
        steps = max(1, int(np.ceil(np.hypot(*(end - start)) / PUSH_STEP_M)))
        for step in range(1, steps + 1):
            points.append(start + (end - start) * step / steps)
            fixed.append(step == steps and tuple(end) in joined)
    return np.array(points), np.array(fixed)


def open_walls(outline: Polygon, openings: list[Polygon]) -> list[LineString]:
    """An outline's walls as lines, less where they open for a road."""
    rings = [LineString(ring.coords) for ring in (outline.exterior, *outline.interiors)]
    near = [opening for opening in openings if opening.intersects(outline)]
    if not near:
        return rings
    gaps = shapely.union_all(near)
    left = [ring.difference(gaps) for ring in rings]
    return [part for walls in left for part in shapely.get_parts(walls) if isinstance(part, LineString) and not part.is_empty]


def drawn_over_buildings(rings: list[np.ndarray], outlines: list[Polygon], openings: list[Polygon], eaves_m: float) -> list[tuple[float, Point]]:
    """Where a road as drawn, verges and all, lies on a building, its eaves `eaves_m` past its walls, and how much: the road surface's rings
    (outer left to outer right at each section) against every building but where its wall opened for the road. The line
    a road is laid from can clear a building that the laid road doesn't: the laying rounds it, and eases it on to the
    straight line through a tile's edge."""
    if not outlines or not rings:
        return []
    roofs = [outline.buffer(eaves_m, join_style="mitre") for outline in outlines]
    tree = shapely.STRtree(roofs)
    opened = shapely.union_all(openings) if openings else None
    found = []
    for ring in rings:
        strips = [Polygon([a[0, :2], a[4, :2], b[4, :2], b[0, :2]]).buffer(0) for a, b in zip(ring[:-1], ring[1:])]
        drawn = shapely.union_all([strip for strip in strips if not strip.is_empty])
        for index in tree.query(drawn, predicate="intersects"):
            over = drawn.intersection(roofs[index])
            if opened is not None:
                over = over.difference(opened)
            if over.area > SAME_AREA_M2:
                found.append((float(over.area), over.centroid))
    return found
