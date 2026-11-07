"""The faults left on a paved tile (`build.py --paving`), counted by their cause.

    pipeline/.venv/Scripts/python src/projects/aland-drive/pipeline/paving_audit.py L2334E [more tiles] [--report out.md]

`surface_audit.py` measures the old ribbons and aprons; one paved surface can't have most of what it counts. This reads a
paved tile's paving (`roadSurface.aprons`, `pointFloats` floats a point) and the ground cut round it, and counts what is
left, each cause on its own:

- sliver: a strip of ground under 1.5 m wide between two pieces of paving, by which ways it lies between (a street and
  a path beside it, two paths, two streets) and what the ground in it does: a ridge standing over both sides, a bank
  between two heights, or flat ground that could have been paved;
- steep: paving tilted more than a path could be, steps aside;
- step: an upright face closing a gap where cut ground and paving disagree in height at points they share;
- path under a street: a path's own edge drawn as a motor road's, alongside it (the street took the path's width) or
  across a driveway (a service way's asphalt breaking the sidewalk);
- sidewalk tags: a street whose OSM way maps a sidewalk on itself, with no separate way drawn beside it.

Every place gets a `?at=` link and `tools/look.mjs` arguments, looking at it from a little south and above.
"""

import argparse
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import shapely
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

from build import OUTPUT
from grid import WORLD_ORIGIN
from path_surfaces import STEPS
from paving import CLASS, HEIGHT, WAY
from paving_file import read_ground_cut
from roads import GAP_MOST_STEP_M
from sources import RAW
from surface_audit import read_tile
from vectors import line_to_grid

SLIVER_M = 1.5
SLIVER_LEAST_M2 = 0.5
# Closing's own rounding round a curve, not a strip of ground.
ROUNDING_M = 0.03
# The paving either side of a sliver is read this far out from it.
SIDE_M = 0.6
RIDGE_M = 0.15
STEEP_GRADE = 0.35
# A tilt under this much rise is a sliver of a triangle, its slope unseen.
STEEP_RISE_M = 0.15
STEP_M = 0.05
EDGE_INSIDE_M = 0.1
SIDEWALK_SINE = 0.35
SIDEWALK_BESIDE_M = 6.0
SIDEWALK_SHARE = 0.5
ON_SIDEWALK = {"both", "left", "right", "yes"}
CLUSTER_M = 4.0
LOOK_BACK_M = 16.0
LOOK_HEIGHT_M = 20.0


@dataclass
class Place:
    cause: str
    east: float
    north: float
    amount: float  # The cause's own measure: metres, square metres or metres of height.
    size: int = 1
    ways: set = field(default_factory=set)


def read_paving(folder: Path):
    manifest, _, chains, points, triangles = read_tile(folder)
    cut = read_ground_cut(folder, manifest)
    return manifest, chains, points, triangles, cut.points, cut.triangles[: len(cut.triangles) - cut.walls]


def clustered(found: list[Place]) -> list[Place]:
    """Faults within a few metres of each other as one place, at its worst."""
    if not found:
        return []
    xy = np.array([(place.east, place.north) for place in found])
    pairs = cKDTree(xy).query_pairs(CLUSTER_M, output_type="ndarray")
    from scipy import sparse

    graph = sparse.coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(len(found), len(found))) if len(pairs) else sparse.coo_matrix((len(found), len(found)))
    _, label = connected_components(graph, directed=False)
    places = []
    for group in np.unique(label):
        members = [found[index] for index in np.flatnonzero(label == group)]
        worst = max(members, key=lambda place: place.amount)
        places.append(Place(worst.cause, worst.east, worst.north, sum(place.amount for place in members) if worst.cause.startswith("sliver") else worst.amount, sum(place.size for place in members), set().union(*(place.ways for place in members))))
    return places


def slivers(chains, points, triangles, cut_points, cut_triangles) -> list[Place]:
    corners = points[triangles]
    plan = shapely.polygons(np.concatenate((corners[:, :, :2], corners[:, :1, :2]), axis=1))
    paved = shapely.union_all(plan, grid_size=0.001)
    closed = paved.buffer(SLIVER_M / 2, quad_segs=4).buffer(-SLIVER_M / 2, quad_segs=4)
    strips = shapely.get_parts(closed.difference(paved.buffer(ROUNDING_M)))
    strips = strips[shapely.area(strips) >= SLIVER_LEAST_M2]
    point_tree = cKDTree(points[:, :2])
    ground = cut_points[np.unique(cut_triangles)]
    ground_tree = cKDTree(ground[:, :2])
    found = []
    for strip in strips:
        edge = shapely.get_coordinates(shapely.segmentize(strip.exterior, 0.5))
        near = np.unique(np.concatenate(point_tree.query_ball_point(edge, SIDE_M)).astype(int))
        ways = {int(way) for way in points[near, WAY] if way >= 0}
        if not ways:
            continue
        motor = {chains[way].motor for way in ways}
        between = "street and path" if motor == {True, False} else "streets" if motor == {True} else "paths"
        inside = ground[[index for index in ground_tree.query_ball_point(shapely.get_coordinates(strip.representative_point())[0], SLIVER_M) if shapely.contains_xy(strip.buffer(ROUNDING_M * 2), *ground[index, :2])]]
        # The paving either side, by way: each way's nearest points' heights.
        sides = [float(np.median(points[near[points[near, WAY] == way], HEIGHT])) for way in ways]
        top = max(sides)
        if len(inside) and float(inside[:, 2].max()) - top > RIDGE_M:
            ground_does = "ridge"
        elif max(sides) - min(sides) > GAP_MOST_STEP_M:
            ground_does = "bank"
        else:
            ground_does = "flat"
        middle = strip.representative_point()
        found.append(Place(f"sliver {ground_does}, {between}", middle.x, middle.y, float(strip.area), 1, ways))
    return found


def steep(points, triangles) -> list[Place]:
    corners = points[triangles]
    normal = np.cross(corners[:, 1, :3] - corners[:, 0, :3], corners[:, 2, :3] - corners[:, 0, :3])
    grade = np.hypot(normal[:, 0], normal[:, 1]) / np.maximum(np.abs(normal[:, 2]), 1e-9)
    rise = corners[:, :, HEIGHT].max(1) - corners[:, :, HEIGHT].min(1)
    tilted = (grade > STEEP_GRADE) & (rise > STEEP_RISE_M) & (corners[:, 0, CLASS] != STEPS) & (np.abs(normal[:, 2]) > 1e-6)
    middle = corners[tilted, :, :2].mean(axis=1)
    return [Place("steep", float(x), float(y), float(g), 1, {int(w)}) for (x, y), g, w in zip(middle, grade[tilted], corners[tilted, 0, WAY])]


def steps(cut_points, cut_triangles) -> list[Place]:
    """The upright faces the cut ground closes its cracks with: each pair is a quad, whose height is the step."""
    corners = cut_points[cut_triangles]
    plan = np.abs((corners[:, 1, 0] - corners[:, 0, 0]) * (corners[:, 2, 1] - corners[:, 0, 1]) - (corners[:, 1, 1] - corners[:, 0, 1]) * (corners[:, 2, 0] - corners[:, 0, 0]))
    upright = plan < 1e-6
    rise = corners[upright, :, 2].max(1) - corners[upright, :, 2].min(1)
    middle = corners[upright, :, :2].mean(axis=1)
    big = rise > STEP_M
    return [Place("step", float(x), float(y), float(r)) for (x, y), r in zip(middle[big], rise[big])]


def paths_under_streets(chains, points, triangles) -> list[Place]:
    """Each path's carriageway edges, every metre, where the paving there is a motor road's."""
    corners = points[triangles]
    tree = shapely.STRtree(shapely.polygons(np.concatenate((corners[:, :, :2], corners[:, :1, :2]), axis=1)))
    owner = corners[:, 0, WAY].astype(int)
    found = []
    for chain in chains:
        if chain.motor or chain.line is None:
            continue
        for ring in (1, 3):
            # Just inside the edge: on it, a sample lies on the line between two pieces, in neither.
            edge = chain.rings[:, ring, :2] + EDGE_INSIDE_M * (chain.rings[:, 2, :2] - chain.rings[:, ring, :2]) / np.maximum(np.hypot(*(chain.rings[:, 2, :2] - chain.rings[:, ring, :2]).T), 1e-9)[:, None]
            line = shapely.LineString(edge)
            if line.length < 1:
                continue
            samples = shapely.get_coordinates(shapely.segmentize(line, 1.0))
            at, held = tree.query(shapely.points(samples), predicate="within")
            for sample, triangle in zip(at, held):
                way = owner[triangle]
                if way < 0 or not chains[way].motor:
                    continue
                street = chains[way]
                station = int(np.argmin(np.hypot(*(street.rings[:, 2, :2] - samples[sample]).T)))
                theirs = street.rings[min(station + 1, len(street.rings) - 1), 2, :2] - street.rings[max(station - 1, 0), 2, :2]
                mine_at = int(np.argmin(np.hypot(*(chain.rings[:, 2, :2] - samples[sample]).T)))
                mine = chain.rings[min(mine_at + 1, len(chain.rings) - 1), 2, :2] - chain.rings[max(mine_at - 1, 0), 2, :2]
                sine = abs(float(theirs[0] * mine[1] - theirs[1] * mine[0])) / max(float(np.hypot(*theirs) * np.hypot(*mine)), 1e-9)
                if sine < SIDEWALK_SINE:
                    cause = "path under its street"
                elif street.kind == "service":
                    cause = "driveway across a path"
                else:
                    continue
                found.append(Place(cause, float(samples[sample, 0]), float(samples[sample, 1]), 1.0, 1, {chain.index, way}))
    return found


def sidewalk_tags(name: str, chains, bounds, points) -> list[Place]:
    """Streets whose OSM way maps a sidewalk on itself, with no path drawn beside it on that side, in metres: a path's line,
    or a street's own paving wearing a path's surface (the sidewalk its tags map)."""
    osm = json.loads((RAW / "osm" / f"{name}.json").read_text(encoding="utf-8"))
    paths = [chain for chain in chains if not chain.motor and chain.line is not None]
    way = points[:, WAY].astype(int)
    worn = points[(way >= 0) & (points[:, CLASS] != 0) & np.array([chains[index].motor if index >= 0 else False for index in way]), :2]
    xy = np.concatenate([chain.rings[:, 2, :2] for chain in paths] + [worn])
    tree = cKDTree(xy)
    tile = shapely.box(bounds["west"], bounds["south"], bounds["east"], bounds["north"])
    found = []
    for element in osm["elements"]:
        tags = element.get("tags", {})
        if element["type"] != "way" or "highway" not in tags:
            continue
        sides = set()
        both = tags.get("sidewalk", "")
        if both in ON_SIDEWALK:
            sides |= {"left", "right"} if both in ("both", "yes") else {both}
        for side in ("left", "right"):
            if tags.get(f"sidewalk:{side}") == "yes" or tags.get("sidewalk:both") == "yes":
                sides.add(side)
        if not sides:
            continue
        line = line_to_grid(element["geometry"]) - np.array(WORLD_ORIGIN)
        clipped = shapely.intersection(shapely.LineString(line), tile)
        if clipped.is_empty:
            continue
        for part in shapely.get_parts(clipped):
            samples = shapely.get_coordinates(shapely.segmentize(part, 2.0))
            if len(samples) < 2:
                continue
            tangent = np.gradient(samples, axis=0)
            tangent /= np.maximum(np.hypot(*tangent.T), 1e-9)[:, None]
            normal = np.column_stack((-tangent[:, 1], tangent[:, 0]))
            for side in sides:
                sign = 1 if side == "left" else -1
                near = tree.query_ball_point(samples, SIDEWALK_BESIDE_M)
                beside = np.array([any(sign * float((xy[index] - sample) @ across) > 1 for index in indices) for sample, across, indices in zip(samples, normal, near)])
                if beside.mean() < SIDEWALK_SHARE:
                    middle = samples[len(samples) // 2]
                    found.append(Place("sidewalk tag, no path", float(middle[0]), float(middle[1]), float(part.length), 1, {element["id"]}))
    return found


def audit(name: str, tiles: Path) -> list[Place]:
    manifest, chains, points, triangles, cut_points, cut_triangles = read_paving(tiles / name)
    found = clustered(slivers(chains, points, triangles, cut_points, cut_triangles))
    found += clustered(steep(points, triangles))
    found += clustered(steps(cut_points, cut_triangles))
    found += clustered(paths_under_streets(chains, points, triangles))
    found += sidewalk_tags(name, chains, manifest["bounds"], points)
    return found


def look(place: Place) -> str:
    east, north = place.east + WORLD_ORIGIN[0], place.north + WORLD_ORIGIN[1] - LOOK_BACK_M
    return f"{east:.1f},{north:.1f},{LOOK_HEIGHT_M:.0f},0,{-math.atan2(LOOK_HEIGHT_M, LOOK_BACK_M):.3f}"


def measure(place: Place) -> str:
    if place.cause.startswith("sliver"):
        return f"{place.amount:.1f} m² in {place.size}"
    if place.cause == "steep":
        return f"grade {place.amount:.2f}, {place.size} triangles"
    if place.cause == "step":
        return f"{place.amount * 100:.0f} cm, {place.size} faces"
    if place.cause == "sidewalk tag, no path":
        return f"{place.amount:.0f} m"
    return f"{place.size} m of edge"


def weight(place: Place) -> float:
    return place.amount if place.cause.startswith("sliver") or place.cause == "sidewalk tag, no path" else place.amount * place.size


def report(results: dict[str, list[Place]], base: str, worst: int) -> str:
    causes = sorted({place.cause for found in results.values() for place in found})
    lines = ["# What's left on the paving", "", "From `pipeline/paving_audit.py`. Places by cause, and their total measure.", ""]
    lines += ["| cause | " + " | ".join(results) + " |", "|---|" + "---|" * len(results)]
    for cause in causes:
        lines.append(f"| {cause} | " + " | ".join(f"{sum(p.cause == cause for p in found)} ({sum(weight(p) for p in found if p.cause == cause):.0f})" for found in results.values()) + " |")
    for name, found in results.items():
        lines += ["", f"## {name}"]
        for cause in causes:
            group = sorted((place for place in found if place.cause == cause), key=weight, reverse=True)
            if group:
                lines += ["", f"### {cause}: {len(group)}", ""]
                lines += [f"- {measure(place)}: {base}?at={look(place)}  look `{look(place)}`" for place in group[:worst]]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tiles", nargs="+")
    parser.add_argument("--from", dest="source", type=Path, default=OUTPUT, help="the folder of built tiles")
    parser.add_argument("--report", type=Path, help="write the places as Markdown here")
    parser.add_argument("--base", default="http://localhost:3187/games/3d-games/aland-drive", help="the game's address for the links")
    parser.add_argument("--worst", type=int, default=3, help="places listed per cause and tile")
    arguments = parser.parse_args()
    results = {name: audit(name, arguments.source) for name in arguments.tiles}
    for name, found in results.items():
        counts = {}
        for place in found:
            counts[place.cause] = counts.get(place.cause, 0) + 1
        print(name, json.dumps(dict(sorted(counts.items()))))
    if arguments.report:
        arguments.report.write_text(report(results, arguments.base, arguments.worst), encoding="utf-8")


if __name__ == "__main__":
    main()
