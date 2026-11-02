"""Where a road meets a building, one of them gives way, before either is laid.

Every building stands as a wall the car hits. OSM's lines and NLS's buildings
come from different surveys, so a farm drive's line can run under a shed that
the laser saw standing there. The building wins that: the road stops at its wall.
A road wins only where it really goes through: a way OSM tags as a passage, or a
public road that enters a building and leaves it again. Then the wall opens as
wide as the road, and nowhere else.

A road that passes beside a building keeps clear of it: where its width would
reach a wall, its line is pushed out, the push fading along the road, so the wall
stands beside the road rather than on it. A junction's point and a tile edge's
stay where they are, so roads still meet and seams still match. Both tiles at an
edge read the same buildings, their neighbours' too, so a road crossing the edge
is cut and pushed the same way on both sides.
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
# Public roads, the ones that win when they run through: unclassified and residential streets and above.
THROUGH_RANK = CLASSES["unclassified"].rank
SAME_POINT_M = 0.01
# Beyond its half width, a road keeps this clear of a wall: room for its rounding through a bend.
CLEARANCE_M = 0.5
# A push fades to nothing over this far along the road either side of where it's needed.
PUSH_FADE_M = 8.0
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


def _goes_through(piece: LineString, outline: Polygon, seam_ends: list[Point]) -> bool:
    """A stretch of road inside a building goes through it when both its ends are on the wall, or carry on over the tile's edge."""
    return all(outline.exterior.distance(end) < SAME_POINT_M or any(end.distance(seam) < SAME_POINT_M for seam in seam_ends) for end in (Point(piece.coords[0]), Point(piece.coords[-1])))


def _wins(road: dict, line: LineString, outline: Polygon, seam_ends: list[Point]) -> bool:
    if passes_as_passage(road):
        return True
    kind = CLASSES.get(road["kind"])
    if kind is None or kind.rank > THROUGH_RANK:
        return False
    return all(_goes_through(piece, outline, seam_ends) for piece in shapely.get_parts(line.intersection(outline)) if piece.geom_type == "LineString")


def give_way(roads: list[dict], outlines: list[Polygon]) -> Meetings:
    """Roads cut where they stop at a wall and pushed clear of one beside them, and where walls open for a road.
    `outlines` are every building standing near the tile."""
    if not outlines:
        return Meetings(roads, [], 0, 0)
    tree = shapely.STRtree(outlines)
    joined = _joined_points(roads)
    kept: list[tuple[dict, set[int]]] = []
    openings: list[Polygon] = []
    stopped = 0
    for road in roads:
        line = LineString(road["line"])
        inside = [index for index in tree.query(line, predicate="intersects") if line.intersection(outlines[index]).length > 0] if road["motor"] else []
        if not inside:
            kept.append((road, set()))
            continue
        seam_ends = [Point(seam[0], seam[1]) for seam in road.get("seams", ())]
        half = _half_width(road)
        blocking, through = [], set()
        for index in inside:
            if _wins(road, line, outlines[index], seam_ends):
                openings.append(line.intersection(outlines[index].buffer(half + CAR_ROOM_M)).buffer(half + CAR_ROOM_M))
                through.add(int(index))
            else:
                blocking.append(outlines[index].buffer(CLEAR_M))
        if not blocking:
            kept.append((road, through))
            continue
        left = line.difference(shapely.union_all(blocking))
        for part in shapely.get_parts(left):
            if not isinstance(part, LineString) or part.is_empty:
                continue
            ends = (Point(part.coords[0]), Point(part.coords[-1]))
            seams = [seam for seam in road.get("seams", ()) if any(end.distance(Point(seam[0], seam[1])) < SAME_POINT_M for end in ends)]
            if part.length < SHORTEST_LEFT_M and not seams:
                continue
            piece = {**road, "line": [[round(x, 2), round(y, 2)] for x, y in part.coords]}
            piece.pop("seams", None)
            if seams:
                piece["seams"] = seams
            kept.append((piece, through))
        stopped += 1
    pushed = 0
    cleared = []
    for road, through in kept:
        if road["motor"] and (line := _clear_of(road, outlines, tree, through, joined)) is not None:
            road = {**road, "line": line}
            pushed += 1
        cleared.append(road)
    return Meetings(cleared, openings, stopped, pushed)


def _half_width(road: dict) -> float:
    return CLASSES[road["kind"]].width_m / 2 if road["kind"] in CLASSES else 1.0


def _joined_points(roads: list[dict]) -> set[tuple[float, float]]:
    """Points where roads meet, and where they leave the tile: these never move."""
    counts = Counter(tuple(point) for road in roads for point in road["line"])
    return {point for point, count in counts.items() if count > 1} | {(seam[0], seam[1]) for road in roads for seam in road.get("seams", ())}


def _clear_of(road: dict, outlines: list[Polygon], tree: shapely.STRtree, through: set[int], joined: set[tuple[float, float]]) -> list[list[float]] | None:
    """The road's line pushed clear of the buildings beside it, or None if it's clear already."""
    reach = _half_width(road) + CLEARANCE_M
    line = LineString(road["line"])
    beside = [int(index) for index in tree.query(line.buffer(reach), predicate="intersects") if int(index) not in through]
    if not beside:
        return None
    points, fixed = _dense(np.array(road["line"], dtype=float), joined)
    along = np.concatenate(([0.0], np.cumsum(np.hypot(*np.diff(points, axis=0).T))))
    # How far along the road each point is from the nearest one that can't move: a push fades to nothing there.
    pinned = np.min(np.abs(along[:, None] - along[fixed][None, :]), axis=1) if fixed.any() else np.full(len(points), np.inf)
    moved = False
    for _ in range(PUSH_ROUNDS):
        needs = np.zeros_like(points)
        for i, point in enumerate(points):
            if not fixed[i]:
                needs[i] = _push(point, [outlines[index] for index in beside], reach)
        size = np.hypot(*needs.T)
        if size.max() < SAME_POINT_M:
            break
        # Each point takes the largest push near it, faded by how far along the road that push is needed.
        fade = np.clip(1 - np.abs(along[:, None] - along[None, :]) / PUSH_FADE_M, 0, None) * size[None, :]
        strongest = fade.argmax(axis=1)
        share = fade[np.arange(len(points)), strongest] / np.maximum(size[strongest], 1e-9)
        points = points + needs[strongest] * (share * np.clip(pinned / PUSH_FADE_M, 0, 1))[:, None]
        moved = True
    if not moved:
        return None
    return [[round(float(x), 2), round(float(y), 2)] for x, y in points]


def _push(point: np.ndarray, outlines: list[Polygon], reach: float) -> np.ndarray:
    """How far a point of the road must move to be `reach` from every wall near it."""
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
