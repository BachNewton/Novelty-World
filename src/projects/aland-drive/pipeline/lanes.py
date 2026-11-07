"""The lane map: the lines traffic drives along, read off the road surface as it was laid.

A lane is one direction of one laid road between two junctions, offset from the
road's centre to the middle of its half, so it lies on the drawn road with its
crown and banking. Lanes join through a junction by connectors, short curves
across the junction from one lane's end to another's start. Each connector lists
the connectors it crosses or merges with that it gives way to.

Right of way follows one rule, the one the signs follow: where `roadside.py`
puts a give-way or stop sign, that road gives way; a roundabout's ring has
priority; a drive, track or path gives way to the road it comes out on; a
signalled junction runs its arms in the heads' two phases; otherwise traffic
gives way to the right, as Finnish law has it, and a left turn gives way to
oncoming traffic. Speed is OSM's limit, read as the speed signs read it, and the
road's class's otherwise.

Paths get lanes too, for cyclists and walkers, and join the roads where they meet
them. A lane crossing a tile's edge ends on the seam section, which both tiles
write to the millimetre, so its two halves find each other by place.

Every lane and connector is checked against the drawn surface: where one can't
sit cleanly on it (leaving the carriageway, running under another road, stepping
or kinking with the ground), the tile's list of issues says where, for the road
fixes to work from. The game draws it all in the lane lab.

Run alone, it adds `lanes.json.gz` to tiles already built, which needs no
rebuild: it reads the road surface, the roads and OSM's signs and signals. Each
motor lane also carries its road's vehicles a day, from Åland's traffic counts
(`traffic_volume.py`), which sets how busy the game makes it.
"""

import argparse
import gzip
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import LineString, Point

import roadside
from grid import WORLD_ORIGIN, neighbour, tile_from_name
from paving_file import read_paving
from progress import Progress
from roadside import CENTRE, EDGE_LEFT, EDGE_RIGHT, OUTER_LEFT, OUTER_RIGHT, Chain, Roadside, other_than_seam, replace_text, roll
from roads import APRON_CORNER_M, CLASSES
from traffic_volume import TrafficVolume

FILE = "lanes.json.gz"
LICENCE = {"license": "ODbL-1.0", "attribution": f"{roadside.LICENCE['attribution']}; traffic counts © Ålands landskapsregering, CC BY 4.0"}
# Where a road's end lands on another: within the other's half width and this.
LANDING_REACH_M = roadside.MOUTH_M
# A junction reaches this far along the road a lesser one lands on, past the lesser road's edges, and its corner more.
CUT_PAD_M = 1.0
CORNER_M = {**APRON_CORNER_M, "track": 2.0}
# How obliquely a lesser road's width is read along the host, and how far a junction reaches along it at most.
LEAST_SINE = 0.3
LONGEST_CUT_M = 20.0
# Junctions overlapping along a road are one, up to this long.
LONGEST_JUNCTION_M = 30.0
# Junctions closer than this along a road are one.
JOIN_GAP_M = 1.0
# A chain whose ends lie this close is a loop: a ring, or a drive round a block.
LOOP_M = 1.0
STRAIGHT = math.radians(30)
# A turn sharper than this at a plain junction is no movement a driver makes.
HAIRPIN = math.radians(150)
ONCOMING = math.cos(math.radians(30))
PARALLEL = math.cos(math.radians(40))
# Connectors are sampled this often, and the audit reads lanes as often.
STEP_M = 1.0
ONE_WAY = {"yes", "true", "1"}
DRIVE_RANK = 4  # Service roads and tracks: drives, yards and field roads, which give way to the road they come out on.
STREET_RANK = roadside.STREET_RANK

# km/h where OSM has no limit. Åland's general limit is 70 outside a built-up area and 50 in one; drives and paths go slower.
GENERAL_LIMIT = (70, 50)
CLASS_LIMIT = {"living_street": 20, "service": 30, "track": 30, "cycleway": 20}
WALKING_LIMIT = 5

# The audit. A lane's middle further off the carriageway than this has a wheel on the shoulder.
OFF_ROAD_M = 0.5
# Another road this far above a lane, and not so high it passes over, buries it. Less is a crossing laid just under the
# greater road on purpose, and the lane rides its top.
BURIED_M = (0.4, 2.5)
# A surface this far above where a connector is expected is a deck it passes under.
OVERHEAD_M = BURIED_M[1]
# A rise or drop between two samples a metre apart.
STEP_RISE_M = 0.15
# A change of grade over a few metres: a road over changing ground that folds rather than curves.
KINK_GRADE = 0.08
KINK_RUN_M = 4.0
# What's written keeps a connector's curve within this of its samples.
THIN_M = 0.02
# Issues closer than this are one place.
ISSUE_CLUSTER_M = 25.0


@dataclass
class Rules:
    """What a junction's right of way and a lane's limit read, from the roadside's own tests."""

    sign: object  # (lesser chain, along its end, greater chain) -> "stop", "give-way" or None.
    signals: list  # Each signalled junction: (centre, [(out direction, phase)]).
    way: object  # (point, the chain's way there) -> (OSM's tags, +1 if the OSM way runs with the chain, -1 against it).
    limits: object  # (chain) -> [(along, km/h)], OSM's limits as the speed signs read them.
    built_up: object  # (point) -> bool.
    daily: object  # (motor chain) -> vehicles a day both ways (`traffic_volume.py`).


@dataclass
class Cut:
    """A stretch of a chain that lies inside a junction."""

    chain: int
    start: float
    end: float
    junction: int


@dataclass
class Arm:
    """Where a stretch of road between junctions meets one."""

    chain: Chain
    along: float  # Where the stretch ends at the junction.
    out: int  # +1 if leaving the junction runs with the chain.
    point: np.ndarray
    direction: np.ndarray  # Leaving the junction, on the ground.
    through: bool  # The chain carries on through the junction.
    lanes_in: list[int] = field(default_factory=list)
    lanes_out: list[int] = field(default_factory=list)
    yields: bool = False
    sign: str | None = None
    phase: float | None = None


@dataclass
class Lane:
    chain: Chain
    points: np.ndarray  # (n, 3) of east, north, height, in the way traffic runs.
    forward: bool  # Runs with the chain.
    span: tuple[float, float]  # Where it runs along its chain.
    index: int  # 0 is the rightmost of its way.
    of: int  # Lanes its way.
    across: float  # Where it runs across the road, as `lane_point` takes it.
    width: float
    speeds: list[tuple[float, int]]
    start: int | None = None  # Junction, or None at a seam.
    end: int | None = None
    seam_start: bool = False
    seam_end: bool = False

    @property
    def path(self) -> bool:
        return not self.chain.motor


@dataclass
class Connector:
    junction: int
    source: int
    target: int
    points: np.ndarray
    turn: str
    arms: tuple[int, int]
    yields: list[int] = field(default_factory=list)
    off_m: float = 0.0


@dataclass
class Link:
    """A path's end on a road's lane: walkers and cyclists step on to the road there, or off it on to the path."""

    path: int
    road: int
    along: float  # Metres along the road lane.
    on_to_road: bool
    points: np.ndarray


@dataclass
class Junction:
    arms: list[Arm] = field(default_factory=list)
    kind: str = "join"
    centre: np.ndarray | None = None
    signalled: bool = False


def thinned(points: np.ndarray, within: float = THIN_M) -> np.ndarray:
    """The fewest points that keep the line within a few centimetres of where it was, ends kept."""
    keep = np.zeros(len(points), dtype=bool)
    keep[[0, -1]] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        if last - first < 2:
            continue
        way = points[last] - points[first]
        length = float(np.linalg.norm(way))
        between = points[first + 1 : last] - points[first]
        off = np.linalg.norm(np.cross(between, way / length), axis=1) if length > 1e-9 else np.linalg.norm(between, axis=1)
        worst = int(np.argmax(off))
        if off[worst] > within:
            keep[first + 1 + worst] = True
            stack += [(first, first + 1 + worst), (first + 1 + worst, last)]
    return points[keep]


def lane_point(ring: np.ndarray, across: float) -> np.ndarray:
    """A point across a ring: -1 the left edge, 0 the centre, +1 the right edge, on the crown between them."""
    edge = ring[EDGE_RIGHT] if across >= 0 else ring[EDGE_LEFT]
    return ring[CENTRE] + (edge - ring[CENTRE]) * abs(across)


def rings_between(chain: Chain, start: float, end: float) -> np.ndarray:
    inside = [chain.rings[index] for index in range(len(chain.rings)) if start < chain.along[index] < end]
    return np.array([chain.ring_at(start), *inside, chain.ring_at(end)])


def unit(vector: np.ndarray) -> np.ndarray:
    return vector / max(float(np.hypot(*vector[:2])), 1e-9)


def turn_of(into: np.ndarray, out: np.ndarray) -> tuple[str, float]:
    angle = math.atan2(into[0] * out[1] - into[1] * out[0], into[0] * out[0] + into[1] * out[1])
    if abs(angle) < STRAIGHT:
        return "straight", angle
    if abs(angle) > HAIRPIN:
        return "back", angle
    return ("left" if angle > 0 else "right"), angle


def hermite(start: np.ndarray, start_way: np.ndarray, end: np.ndarray, end_way: np.ndarray, reach: float = 1.0) -> np.ndarray:
    """A curve on the ground from one point and way to another, a sample every metre or so: as near a circle's arc as a cubic gets, or
    with `reach` under 1 holding each way for less of the curve, so it swings out less."""
    gap = float(np.hypot(*(end - start)))
    turn = abs(math.atan2(start_way[0] * end_way[1] - start_way[1] * end_way[0], float(start_way @ end_way)))
    handle = (gap if turn < 1e-3 else 2 * gap * math.tan(turn / 4) / math.sin(turn / 2)) * reach
    count = max(2, math.ceil(gap * 1.3 / STEP_M) + 1)
    t = np.linspace(0, 1, count)[:, None]
    h00, h10, h01, h11 = 2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t, -2 * t**3 + 3 * t**2, t**3 - t**2
    return h00 * start + h10 * start_way * handle + h01 * end + h11 * end_way * handle


def straight_run(start: np.ndarray, end: np.ndarray) -> np.ndarray:
    """A straight line on the ground, a sample every metre or so, both ends included."""
    count = max(2, math.ceil(float(np.hypot(*(end - start))) / STEP_M) + 1)
    return start + np.linspace(0, 1, count)[:, None] * (end - start)


def corner_of(start: np.ndarray, into: np.ndarray, end: np.ndarray, out: np.ndarray) -> np.ndarray | None:
    """Where the line a lane comes in on meets the line the next leaves on, if it lies ahead of the one and behind the other."""
    across = into[0] * out[1] - into[1] * out[0]
    if abs(across) < 1e-6:
        return None
    gap = end - start
    ahead = (gap[0] * out[1] - gap[1] * out[0]) / across
    behind = (into[0] * gap[1] - into[1] * gap[0]) / across
    if ahead <= 0 or behind <= 0:
        return None
    return start + into * ahead


def cornered(start: np.ndarray, into: np.ndarray, corner: np.ndarray, end: np.ndarray, out: np.ndarray, reach: float) -> np.ndarray:
    """In along one lane's line to `reach` short of the corner, round it, and out along the other's: the corner rounded `reach` metres each way."""
    near, far = corner - into * reach, corner + out * reach
    arc = hermite(near, into, far, out) if reach > 1e-3 else corner[None, :]
    return np.concatenate([straight_run(start, near)[:-1], arc, straight_run(far, end)[1:]])


def tightest_radius(points: np.ndarray) -> float:
    """The tightest bend along a line on the ground, as a circle's radius in metres: how sharp a car must turn to follow it,
    measured as the turn over each `RADIUS_RUN_M` of it, so points a hair apart don't read as a hairpin."""
    steps = np.hypot(*np.diff(points[:, :2], axis=0).T)
    along = np.concatenate([[0.0], np.cumsum(steps)])
    if along[-1] < 2 * RADIUS_RUN_M:
        return math.inf
    stations = np.arange(0.0, along[-1], RADIUS_RUN_M / 4)
    xs, zs = np.interp(stations, along, points[:, 0]), np.interp(stations, along, points[:, 1])
    headings = np.unwrap(np.arctan2(np.diff(zs), np.diff(xs)))
    turns = np.abs(headings[4:] - headings[:-4])
    return math.inf if len(turns) == 0 else float(RADIUS_RUN_M / max(float(turns.max()), 1e-9))


RADIUS_RUN_M = 2.0
# A car can't turn tighter than this, the middle of a mid-sized car at its lock with a little to spare: no turn asks it to.
TURN_RADIUS_M = 5.0
# How much of the room either side of a corner a turn may round it by, widest first: the widest that stays on the paving.
ROUNDINGS = (1.0, 0.8, 0.6, 0.45, 0.3, 0.2, 0.1, 0.0)
# A turn's line keeps this close to the paving: the middle of a lane, not a wheel.
ON_PAVING_M = 0.1
# A corner further from a turn's ends than this many times the gap between them is two lines nearly parallel, not a corner.
CORNER_REACH = 2.0


class Surface:
    """The drawn road as triangles with heights: every ribbon, shoulders and all, and every apron."""

    def __init__(self, chains: list[Chain], aprons: list[np.ndarray]):
        triangles, owners, carriageway = [], [], []
        quads = ((OUTER_LEFT, EDGE_LEFT, False), (EDGE_LEFT, CENTRE, True), (CENTRE, EDGE_RIGHT, True), (EDGE_RIGHT, OUTER_RIGHT, False))
        for chain in chains:
            for section in range(len(chain.rings) - 1):
                here, there = chain.rings[section], chain.rings[section + 1]
                for left, right, paved in quads:
                    for triangle in ((here[left], here[right], there[right]), (here[left], there[right], there[left])):
                        triangles.append(triangle)
                        owners.append(chain.index)
                        carriageway.append(paved)
        for triangle in aprons:
            triangles.append(triangle)
            owners.append(-1)
            carriageway.append(True)
        self.triangles = np.array(triangles, dtype=np.float64).reshape(-1, 3, 3)
        self.owners = np.array(owners, dtype=np.int64)
        shapes = shapely.polygons(self.triangles[:, :, :2])
        self.tree = shapely.STRtree(shapes)
        self.paved = np.array(carriageway, dtype=bool)
        paved_shapes = shapes[self.paved]
        self.paved_tree = shapely.STRtree(paved_shapes)

    def heights(self, points: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Every surface under each point: (point index, triangle, height)."""
        found = self.tree.query(shapely.points(points[:, :2]), predicate="intersects")
        if found.shape[1] == 0:
            return np.zeros(0, int), np.zeros(0, int), np.zeros(0)
        which, triangle = found
        a, b, c = (self.triangles[triangle, corner] for corner in range(3))
        p = points[which, :2]
        v0, v1, v2 = b[:, :2] - a[:, :2], c[:, :2] - a[:, :2], p - a[:, :2]
        denominator = v0[:, 0] * v1[:, 1] - v1[:, 0] * v0[:, 1]
        safe = np.where(np.abs(denominator) < 1e-12, 1e-12, denominator)
        u = (v2[:, 0] * v1[:, 1] - v1[:, 0] * v2[:, 1]) / safe
        v = (v0[:, 0] * v2[:, 1] - v2[:, 0] * v0[:, 1]) / safe
        return which, triangle, a[:, 2] + u * (b[:, 2] - a[:, 2]) + v * (c[:, 2] - a[:, 2])

    def top_heights(self, points: np.ndarray, expected: np.ndarray) -> np.ndarray:
        """The top surface at each point, what's drawn there, but not a bridge's deck over the road expected. NaN off every surface.

        A shoulder runs on under an apron, dropped well clear of it, and a crossing road is laid just under the greater one."""
        which, _, height = self.heights(points)
        best = np.full(len(points), -np.inf)
        reachable = height < expected[which] + OVERHEAD_M
        np.maximum.at(best, which[reachable], height[reachable])
        return np.where(np.isfinite(best), best, np.nan)

    def off_paving(self, points: np.ndarray) -> np.ndarray:
        """How far each point lies off every carriageway and apron, 0 on one."""
        shapes = shapely.points(points[:, :2])
        _, distance = self.paved_tree.query_nearest(shapes, return_distance=True, all_matches=False)
        return distance


class LaneMap:
    def __init__(self, chains: list[Chain], aprons: list[np.ndarray], box: tuple[float, float, float, float], rules: Rules, ground):
        self.chains = [chain for chain in chains if chain.line is not None and chain.length > 0]
        self.by_index = {chain.index: chain for chain in self.chains}
        self.box = box
        self.rules = rules
        self.ground = ground  # (east, north) -> the drawn ground's height.
        self.surface = Surface(self.chains, aprons)
        self.lines = shapely.STRtree([chain.line for chain in self.chains])
        self.cuts: list[Cut] = []
        self.parent: list[int] = []
        self.landings: dict[tuple[int, int], tuple[Chain, str | None]] = {}  # (chain, which end) -> (the chain it lands on, its sign)
        self.lanes: list[Lane] = []
        self.connectors: list[Connector] = []
        self.junctions: dict[int, Junction] = {}
        self.issues: list[dict] = []
        self.rings: dict[int, bool] = {}
        self.path_ends: dict[tuple[int, int], tuple[Chain, float]] = {}  # (path chain, which end) -> (the road, how far along it)
        self.links: list[Link] = []

    # Junctions, as stretches of chains joined into one

    def junction(self) -> int:
        self.parent.append(len(self.parent))
        return len(self.parent) - 1

    def root(self, junction: int) -> int:
        while self.parent[junction] != junction:
            self.parent[junction] = self.parent[self.parent[junction]]
            junction = self.parent[junction]
        return junction

    def join(self, first: int, second: int) -> None:
        self.parent[self.root(first)] = self.root(second)

    def is_loop(self, chain: Chain) -> bool:
        return chain.length > 2 * LOOP_M and float(np.hypot(*(chain.rings[0, CENTRE, :2] - chain.rings[-1, CENTRE, :2]))) < LOOP_M

    def host_of(self, chain: Chain, along: float) -> tuple[Chain, float] | None:
        """The road a chain's end lands on: the greatest within its half width and the reach, then the nearest."""
        end = Point(chain.ring_at(along)[CENTRE, :2])
        best = None
        for index in self.lines.query(end, predicate="dwithin", distance=LANDING_REACH_M + 8.0):
            other = self.chains[index]
            if chain.motor and not other.motor or other.rank > chain.rank:
                continue
            at = other.line.project(end)
            if other is chain and abs(at - along) < 3 * LANDING_REACH_M:
                continue
            ring = other.ring_at(at)
            half = float(np.hypot(*(ring[EDGE_RIGHT, :2] - ring[EDGE_LEFT, :2]))) / 2
            reach = other.line.distance(end) - half
            if reach < LANDING_REACH_M and (best is None or (other.rank, reach) < (best[0].rank, best[2])):
                best = (other, at, reach)
        return None if best is None else (best[0], best[1])

    def cut_landing(self, chain: Chain, along: float, host: Chain) -> tuple[float, float]:
        """How far along the host the junction reaches: the lesser road's edges projected on to it, and its corner."""
        ring = chain.ring_at(along)
        # From the end's centre and the lesser road's width: projecting its edges on to a winding host can land anywhere along it.
        middle = host.line.project(Point(ring[CENTRE, :2]))
        towards = chain.direction_at(min(max(along, 0.5), chain.length - 0.5))
        across = host.direction_at(middle)
        sine = abs(float(towards[0] * across[1] - towards[1] * across[0]))
        half = float(np.hypot(*(ring[EDGE_RIGHT, :2] - ring[EDGE_LEFT, :2]))) / 2
        tier = CLASSES[chain.kind].tier if chain.kind in CLASSES else "track"
        reach = min(half / max(sine, LEAST_SINE), LONGEST_CUT_M)
        # A ring's entries are close together, and traffic on it goes round between them, not across.
        pad = CUT_PAD_M if self.is_ring(host) else CUT_PAD_M + CORNER_M[tier] * sine**2
        return max(0.0, middle - reach - pad), min(host.length, middle + reach + pad)

    def find_junctions(self) -> None:
        for chain in self.chains:
            loop = self.is_loop(chain)
            for end, along in ((0, 0.0), (1, chain.length)):
                point = chain.ring_at(along)[CENTRE, :2]
                if not other_than_seam(point, self.box) or loop:
                    continue
                found = self.host_of(chain, along)
                if found is None:
                    continue
                host, at = found
                # A path meeting a road doesn't cut the road into two: it's a link on to the road's lanes where it meets them.
                if not chain.motor and host.motor:
                    self.path_ends[(chain.index, end)] = (host, at)
                    continue
                start, stop = self.cut_landing(chain, along, host)
                junction = self.junction()
                self.cuts.append(Cut(host.index, start, stop, junction))
                self.cuts.append(Cut(chain.index, along, along, junction))
                self.landings[(chain.index, end)] = (host, self.rules.sign(chain, along, host) if chain.motor else None)
        # Junctions reaching each other along a road are one; a loop's two ends are one place.
        by_chain: dict[int, list[Cut]] = {}
        for cut in self.cuts:
            by_chain.setdefault(cut.chain, []).append(cut)
        self.merged: dict[int, list[Cut]] = {}
        for index, cuts in by_chain.items():
            cuts.sort(key=lambda cut: cut.start)
            runs = [Cut(index, cuts[0].start, cuts[0].end, cuts[0].junction)]
            for cut in cuts[1:]:
                if cut.start - runs[-1].end <= JOIN_GAP_M and max(runs[-1].end, cut.end) - runs[-1].start <= LONGEST_JUNCTION_M:
                    self.join(cut.junction, runs[-1].junction)
                    runs[-1].end = max(runs[-1].end, cut.end)
                elif cut.start - runs[-1].end <= JOIN_GAP_M:
                    # Side roads close together are junctions of their own, with a short stretch of lane between them.
                    middle = (runs[-1].end + cut.start) / 2
                    runs[-1].end = min(runs[-1].end, middle - JOIN_GAP_M / 2)
                    runs.append(Cut(index, max(cut.start, middle + JOIN_GAP_M / 2), max(cut.end, middle + JOIN_GAP_M / 2), cut.junction))
                else:
                    runs.append(Cut(index, cut.start, cut.end, cut.junction))
            chain = self.by_index[index]
            if self.is_loop(chain) and len(runs) > 1 and runs[0].start <= JOIN_GAP_M and chain.length - runs[-1].end <= JOIN_GAP_M:
                self.join(runs[0].junction, runs[-1].junction)
            self.merged[index] = runs

    # Lanes

    def way_of(self, chain: Chain, start: float, end: float) -> tuple[int, int, bool]:
        """How many lanes run with the chain and against it, and whether it's a roundabout's ring."""
        middle = (start + end) / 2
        point = chain.ring_at(middle)[CENTRE, :2]
        tags, along = self.rules.way(point, chain.direction_at(middle))
        ring = tags.get("junction") in ("roundabout", "circular")
        if not chain.motor:
            return 1, 1, False
        oneway = tags.get("oneway")
        total = int(tags["lanes"]) if str(tags.get("lanes", "")).isdigit() and int(tags["lanes"]) > 0 else None
        if oneway in ONE_WAY or oneway is None and ring:
            return (total or 1, 0, ring) if along >= 0 else (0, total or 1, ring)
        if oneway == "-1":
            return (0, total or 1, ring) if along >= 0 else (total or 1, 0, ring)
        each = max(1, (total or 2) // 2)
        return each, each, ring

    def is_ring(self, chain: Chain) -> bool:
        """A roundabout's ring is laid whole as a chain of its own, so its middle says what it is."""
        if chain.index not in self.rings:
            self.rings[chain.index] = chain.motor and self.way_of(chain, chain.length / 2 - 1, chain.length / 2 + 1)[2]
        return self.rings[chain.index]

    def speeds(self, chain: Chain, start: float, end: float, forward: bool) -> list[tuple[float, int]]:
        """Each limit from where it starts along the lane, as the traffic enters it."""
        middle = chain.ring_at((start + end) / 2)[CENTRE, :2]
        if not chain.motor:
            return [(0.0, CLASS_LIMIT.get(chain.kind, WALKING_LIMIT))]
        default = CLASS_LIMIT.get(chain.kind, GENERAL_LIMIT[1] if self.rules.built_up(middle) else GENERAL_LIMIT[0])
        if chain.index not in self.limits:
            self.limits[chain.index] = self.rules.limits(chain)
        runs = self.limits[chain.index]

        def at(along: float) -> int:
            known = [speed for begins, speed in runs if begins <= along]
            return known[-1] if known else default

        length = end - start
        if forward:
            found = [(0.0, at(start))] + [(round(begins - start, 1), speed) for begins, speed in runs if start < begins < end]
        else:
            found = [(0.0, at(end - 1e-6))] + [(round(end - begins, 1), at(begins - 1e-6)) for begins, _ in reversed(runs) if start < begins < end]
        kept = [found[0]]
        for along, speed in found[1:]:
            if speed != kept[-1][1] and along < length:
                kept.append((along, speed))
        return kept

    def stretch(self, chain: Chain, start: float, end: float, first: int | None, last: int | None) -> tuple[list[int], list[int]]:
        """The lanes of one stretch between junctions: the ones running with the chain, then against it."""
        forward, backward, _ = self.way_of(chain, start, end)
        rings = rings_between(chain, start, end)
        width = float(np.mean(np.hypot(*(rings[:, EDGE_RIGHT, :2] - rings[:, EDGE_LEFT, :2]).T)))
        made: tuple[list[int], list[int]] = ([], [])
        for way, count in ((1, forward), (-1, backward)):
            for index in range(count):
                if forward and backward:
                    across = way * (1 - (index + 0.5) / count)
                else:
                    across = way * (1 - 2 * (index + 0.5) / count)
                points = np.array([lane_point(ring, across) for ring in rings])
                lane = Lane(chain, points if way > 0 else points[::-1], way > 0, (start, end), index, count, across, width / max(forward + backward, 1), self.speeds(chain, start, end, way > 0))
                lane.start, lane.end = (first, last) if way > 0 else (last, first)
                at_start, at_end = rings[0, CENTRE, :2], rings[-1, CENTRE, :2]
                seam_first, seam_last = not other_than_seam(at_start, self.box), not other_than_seam(at_end, self.box)
                lane.seam_start, lane.seam_end = (seam_first, seam_last) if way > 0 else (seam_last, seam_first)
                made[0 if way > 0 else 1].append(len(self.lanes))
                self.lanes.append(lane)
        return made

    def build_lanes(self) -> None:
        self.limits: dict[int, list] = {}
        for chain in self.chains:
            runs = self.merged.get(chain.index, [])
            stops = [(0.0, None)]
            for cut in runs:
                stops.append((cut.start, cut.junction))
                stops.append((cut.end, cut.junction))
            stops.append((chain.length, None))
            loop = self.is_loop(chain)
            pieces = []
            for (start, first), (end, last) in zip(stops[::2], stops[1::2]):
                if end - start > JOIN_GAP_M / 2 or first is None and last is None:
                    pieces.append([start, end, first, last])
            # A loop's ends are one place: a junction reaching either end holds the other too.
            if loop and runs and pieces:
                if pieces[-1][3] is None and runs[0].start <= JOIN_GAP_M:
                    pieces[-1][3] = runs[0].junction
                if pieces[0][2] is None and chain.length - runs[-1].end <= JOIN_GAP_M:
                    pieces[0][2] = runs[-1].junction
            # A loop with no junction at its closure runs on through it: its last stretch and its first are one.
            if loop and len(pieces) > 1 and pieces[0][2] is None and pieces[-1][3] is None:
                last = pieces.pop()
                pieces[0] = [last[0] - chain.length, pieces[0][1], last[2], pieces[0][3]]
            for start, end, first, last in pieces:
                first = self.end_junction(chain, start, first)
                last = self.end_junction(chain, end, last)
                if start < 0:
                    forward, backward = self.wrapped(chain, start, end, first, last)
                else:
                    forward, backward = self.stretch(chain, start, end, first, last)
                self.arm(first, chain, start, 1, forward, backward)
                self.arm(last, chain, end, -1, backward, forward)

    def wrapped(self, chain: Chain, start: float, end: float, first: int | None, last: int | None) -> tuple[list[int], list[int]]:
        """A loop's stretch across its closure, laid as one."""
        before = self.stretch(chain, chain.length + start, chain.length, first, last)
        after = self.stretch(chain, 0.0, end, first, last)
        for kept, gone in zip(before[0] + before[1], after[0] + after[1]):
            lane, other = self.lanes[kept], self.lanes[gone]
            lane.points = np.concatenate((lane.points, other.points[1:]) if lane.forward else (other.points, lane.points[1:]))
            lane.speeds = lane.speeds[:1]
            self.lanes[gone] = None
        return before

    def end_junction(self, chain: Chain, along: float, junction: int | None) -> int | None:
        """A stretch's end with no junction: a seam, or a dead end, which is a junction of its own where traffic turns round."""
        if junction is not None:
            return junction
        end = 0 if along <= 0 else 1 if along >= chain.length else None
        if (chain.index, end) in self.path_ends:
            return None
        if not other_than_seam(chain.ring_at(min(max(along, 0.0), chain.length))[CENTRE, :2], self.box):
            return None
        return self.junction()

    def arm(self, junction: int | None, chain: Chain, along: float, out: int, leaving: list[int], coming: list[int]) -> None:
        if junction is None:
            return
        along = min(max(along, 0.0), chain.length)
        ahead = min(max(along + out * 2.0, 0.0), chain.length)
        point = chain.ring_at(along)[CENTRE, :2]
        direction = unit(chain.ring_at(ahead)[CENTRE, :2] - point) if ahead != along else unit(chain.direction_at(along) * out)
        through = any(cut.start - JOIN_GAP_M > 0 and cut.end + JOIN_GAP_M < chain.length and self.root(cut.junction) == self.root(junction) for cut in self.merged.get(chain.index, []))
        arm = Arm(chain, along, out, point, direction, through, [lane for lane in coming if lane is not None], [lane for lane in leaving if lane is not None])
        self.junctions.setdefault(self.root(junction), Junction()).arms.append(arm)

    def link_paths(self) -> None:
        by_chain: dict[int, list[int]] = {}
        for index, lane in enumerate(self.lanes):
            if lane is not None:
                by_chain.setdefault(lane.chain.index, []).append(index)
        for (path_index, end), (road, at) in self.path_ends.items():
            path = self.by_index[path_index]
            point = path.ring_at(0.0 if end == 0 else path.length)[CENTRE, :2]
            for road_lane in by_chain.get(road.index, []):
                lane = self.lanes[road_lane]
                start, stop = lane.span
                if not start <= at <= stop:
                    continue
                along = at - start if lane.forward else stop - at
                on_road = lane_point(road.ring_at(at), lane.across)
                for path_lane in by_chain.get(path_index, []):
                    walked = self.lanes[path_lane]
                    if float(np.hypot(*(walked.points[-1, :2] - point))) < 0.5:
                        self.links.append(Link(path_lane, road_lane, along, True, np.array([walked.points[-1], on_road])))
                    elif float(np.hypot(*(walked.points[0, :2] - point))) < 0.5:
                        self.links.append(Link(path_lane, road_lane, along, False, np.array([on_road, walked.points[0]])))

    # Right of way

    def settle_junctions(self) -> None:
        self.junctions = {key: value for key, value in self.junctions.items() if value.arms}
        for junction in self.junctions.values():
            junction.arms = [arm for arm in junction.arms if arm.lanes_in or arm.lanes_out]
            arms = junction.arms
            if not arms:
                continue
            junction.centre = np.mean([arm.point for arm in arms], axis=0)
            rings = [arm for arm in arms if self.is_ring(arm.chain)]
            for arm in arms:
                landing = self.landings.get((arm.chain.index, 0 if arm.along == 0 else 1)) if not arm.through and arm.along in (0.0, arm.chain.length) else None
                hosts = [other for other in arms if other.through]
                if landing is not None:
                    arm.sign = landing[1]
                ringed = bool(rings) and arm not in rings
                drive = arm.chain.motor and arm.chain.rank >= DRIVE_RANK and any(other.chain.motor and other.chain.rank <= STREET_RANK for other in hosts)
                walked = not arm.chain.motor and any(other.chain.motor for other in arms)
                arm.yields = not arm.through and (ringed or arm.sign is not None or drive or walked)
            for centre, phases in self.rules.signals:
                if np.hypot(*(junction.centre - centre)) < roadside.SIGNAL_CLUSTER_M:
                    junction.signalled = True
                    for arm in arms:
                        reference, phase = phases
                        arm.phase = phase if abs(float(arm.direction @ reference)) > roadside.SIGNAL_SAME_ROAD else (phase + 0.5) % 1.0
                    break
            if len(arms) == 1:
                junction.kind = "end"
            elif rings:
                junction.kind = "roundabout"
            elif junction.signalled:
                junction.kind = "signals"
            elif any(arm.sign == "stop" for arm in arms):
                junction.kind = "stop"
            elif any(arm.sign == "give-way" for arm in arms):
                junction.kind = "give-way"
            elif any(arm.yields for arm in arms):
                junction.kind = "drive"
            elif len(arms) >= 3:
                junction.kind = "right"

    def connect(self) -> None:
        for key, junction in self.junctions.items():
            dead_end = len(junction.arms) == 1
            bend = len(junction.arms) == 2
            first = len(self.connectors)
            for a, source_arm in enumerate(junction.arms):
                for b, target_arm in enumerate(junction.arms):
                    if a == b and not dead_end:
                        continue
                    for source in source_arm.lanes_in:
                        for target in target_arm.lanes_out:
                            self.connector(key, source, target, (a, b), dead_end, bend)
            self.right_of_way(junction, self.connectors[first:], first)

    def connector(self, junction: int, source: int, target: int, arms: tuple[int, int], dead_end: bool, bend: bool) -> None:
        come, go = self.lanes[source], self.lanes[target]
        into = unit(come.points[-1, :2] - come.points[-2, :2])
        # Into itself only on round, as a ring's lane goes: on a stub with both ends in one junction its start lies behind its end, and that way is backwards.
        if source == target and float((come.points[0, :2] - come.points[-1, :2]) @ into) < 0:
            return
        out = unit(go.points[1, :2] - go.points[0, :2])
        turn, angle = turn_of(into, out)
        # Where two roads meet and nothing else, the way on is the only one, however sharply it doubles back.
        if turn == "back" and bend:
            turn = "left" if angle > 0 else "right"
        if turn == "back" and not dead_end:
            return
        if come.of > 1 or go.of > 1:
            if turn == "right" and (come.index != 0 or go.index != 0):
                return
            if turn == "left" and (come.index != come.of - 1 or go.index != go.of - 1):
                return
            if turn == "straight" and go.index != min(come.index, go.of - 1):
                return
        start, end = come.points[-1], go.points[0]
        if come.chain is go.chain and come.forward == go.forward and turn == "straight":
            ground = self.along_chain(come, go)
        else:
            ground = self.turn_on_paving(start[:2], into, end[:2], out, dead_end)
        expected = np.interp(np.linspace(0, 1, len(ground)), (0, 1), (start[2], end[2]))
        heights = self.surface.top_heights(ground, expected)
        bare = np.isnan(heights)
        heights[bare] = [self.ground(*point) for point in ground[bare]]
        points = np.column_stack((ground, heights))
        points[0], points[-1] = start, end
        self.connectors.append(Connector(junction, source, target, points, "back" if dead_end else turn, arms))

    def turn_on_paving(self, start: np.ndarray, into: np.ndarray, end: np.ndarray, out: np.ndarray, dead_end: bool) -> np.ndarray:
        """A turn a car can drive that stays on the paving: the smooth curve from one lane to the next where that's on it, else one built
        from the two roads, in along its lane's line and out along the next one's with the corner where they meet rounded as widely as
        the paving allows, else the curve swung out less, never tighter than a car's turning circle. A turn that stays on at none of
        them keeps the one that leaves it least: that is the road surface's fault, which the audit lists. Turning round at a dead end stands in for however a driver turns in a drive, and is the
        plain curve."""
        smooth = hermite(start, into, end, out)
        if dead_end:
            return smooth
        tries = [smooth]
        corner = corner_of(start, into, end, out)
        gap = float(np.hypot(*(end - start)))
        if corner is not None and max(np.hypot(*(corner - start)), np.hypot(*(end - corner))) <= CORNER_REACH * max(gap, 1.0):
            room = min(float(np.hypot(*(corner - start))), float(np.hypot(*(end - corner))))
            tries += [cornered(start, into, corner, end, out, room * share) for share in ROUNDINGS]
        tries += [hermite(start, into, end, out, share) for share in ROUNDINGS[1:] if share > 0]
        drivable = [ground for ground in tries if tightest_radius(ground) >= TURN_RADIUS_M]
        if not drivable:
            # The lanes' ends leave no room for a car's turning circle: the gentlest turn there is.
            return max(tries, key=tightest_radius)
        best, least = drivable[0], math.inf
        for ground in drivable:
            off = float(self.surface.off_paving(ground).max())
            if off <= ON_PAVING_M:
                return ground
            if off < least:
                best, least = ground, off
        return best

    def along_chain(self, come: Lane, go: Lane) -> np.ndarray:
        """Straight on along one road: the lane's own line across the junction, on the drawn road."""
        chain = come.chain
        start, end = chain.line.project(Point(come.points[-1, :2])), chain.line.project(Point(go.points[0, :2]))
        stations = np.linspace(start, end, max(2, math.ceil(abs(end - start) / STEP_M) + 1))
        shares = np.linspace(0, 1, len(stations))
        return np.array([lane_point(chain.ring_at(at), come.across + (go.across - come.across) * share)[:2] for at, share in zip(stations, shares)])

    def right_of_way(self, junction: Junction, connectors: list[Connector], first: int) -> None:
        lines = [LineString(connector.points[:, :2]) for connector in connectors]
        for i, one in enumerate(connectors):
            for j in range(i + 1, len(connectors)):
                other = connectors[j]
                if one.source == other.source or one.arms[0] == other.arms[0]:
                    continue
                if one.target != other.target and not self.cross(lines[i], lines[j]):
                    continue
                arm_one, arm_two = junction.arms[one.arms[0]], junction.arms[other.arms[0]]
                if arm_one.phase is not None and arm_two.phase is not None and arm_one.phase != arm_two.phase:
                    continue
                yielder = self.who_yields(arm_one, one, arm_two, other)
                # A lane short enough to lie in its junction at both ends: the turn feeding it is behind the turn leaving it, not across it.
                if (yielder == 1 and other.target == one.source) or (yielder == 2 and one.target == other.source):
                    continue
                if yielder == 1:
                    one.yields.append(first + j)
                elif yielder == 2:
                    other.yields.append(first + i)

    @staticmethod
    def cross(first: LineString, second: LineString) -> bool:
        meeting = first.intersection(second)
        if meeting.is_empty:
            return False
        starts = (Point(first.coords[0]), Point(second.coords[0]), Point(first.coords[-1]), Point(second.coords[-1]))
        return any(min(point.distance(start) for start in starts) > 0.3 for point in shapely.get_parts(meeting) if point.geom_type == "Point")

    @staticmethod
    def who_yields(arm_one: Arm, one: Connector, arm_two: Arm, two: Connector) -> int:
        """1 if the first connector gives way, 2 if the second, 0 if neither."""
        if arm_one.yields != arm_two.yields:
            return 1 if arm_one.yields else 2
        into_one, into_two = -arm_one.direction, -arm_two.direction
        if float(into_one @ into_two) < -ONCOMING:
            if (one.turn == "left") != (two.turn == "left"):
                return 1 if one.turn == "left" else 2
            return 0
        # Give way to the right: the other arm lies to the right of the way this one comes in.
        offset = arm_two.point - arm_one.point
        return 1 if into_one[0] * offset[1] - into_one[1] * offset[0] < 0 else 2

    # The audit

    def issue(self, kind: str, point: np.ndarray, detail: str, metres: float, path: bool) -> None:
        self.issues.append({"kind": kind, "at": point, "detail": detail, "metres": metres, "path": path})

    def audit(self) -> None:
        for connector in self.connectors:
            # Turning round at a dead end stands in for however a driver turns in the drive: its shape is no road's.
            if connector.turn == "back":
                continue
            off = self.surface.off_paving(connector.points)
            connector.off_m = float(off.max())
            if connector.off_m > OFF_ROAD_M:
                worst = int(np.argmax(off))
                lane = self.lanes[connector.source]
                self.issue("off-road", connector.points[worst], f"{self.movement(connector)} leaves the drawn road by {connector.off_m:.1f} m", connector.off_m, self.on_path(connector))
            tightest = tightest_radius(connector.points[:, :2])
            if tightest < TURN_RADIUS_M and not self.on_path(connector):
                self.issue("tight", connector.points[len(connector.points) // 2], f"{self.movement(connector)} turns tighter than a car can, a {tightest:.1f} m circle", TURN_RADIUS_M - tightest, False)
            self.check_line(connector.points, None, self.movement(connector), self.on_path(connector))
        for lane in self.lanes:
            if lane is not None:
                self.check_line(self.dense(lane.points), lane.chain.index, self.named(lane.chain), lane.path)
        self.check_reach()
        clusters: list[dict] = []
        for issue in sorted(self.issues, key=lambda issue: -issue["metres"]):
            near = next((cluster for cluster in clusters if cluster["kind"] == issue["kind"] and cluster["path"] == issue["path"] and np.hypot(*(cluster["at"][:2] - issue["at"][:2])) < ISSUE_CLUSTER_M), None)
            if near is None:
                clusters.append({**issue, "count": 1})
            else:
                near["count"] += 1
        self.issues = clusters

    def on_path(self, connector: Connector) -> bool:
        return self.lanes[connector.source].path or self.lanes[connector.target].path

    @staticmethod
    def named(chain: Chain) -> str:
        return chain.name or f"a {chain.kind.replace('_', ' ')}"

    def movement(self, connector: Connector) -> str:
        come, go = self.lanes[connector.source].chain, self.lanes[connector.target].chain
        if connector.turn == "back":
            return f"turning round at the end of {self.named(come)}"
        if connector.turn == "straight":
            return f"straight on along {self.named(come)}" if come is go else f"straight on from {self.named(come)} to {self.named(go)}"
        return f"turning {connector.turn} from {self.named(come)} into {self.named(go)}"

    @staticmethod
    def dense(points: np.ndarray) -> np.ndarray:
        found = [points[0]]
        for a, b in zip(points, points[1:]):
            count = max(1, math.ceil(float(np.hypot(*(b[:2] - a[:2]))) / STEP_M))
            found += [a + (b - a) * (index + 1) / count for index in range(count)]
        return np.array(found)

    def check_line(self, points: np.ndarray, own: int | None, name: str, path: bool) -> None:
        which, triangle, height = self.surface.heights(points)
        above = height - points[which, 2]
        buried = (above > BURIED_M[0]) & (above < BURIED_M[1]) & (self.surface.owners[triangle] != own)
        if own is not None and buried.any():
            worst = int(np.argmax(np.where(buried, above, -np.inf)))
            self.issue("buried", points[which[worst]], f"{name} runs {above[worst]:.1f} m under another road's surface", float(above[worst]), path)
        if len(points) < 3:
            return
        rise = np.abs(np.diff(points[:, 2]))
        run = np.maximum(np.hypot(*np.diff(points[:, :2], axis=0).T), 0.05)
        steps = (rise > STEP_RISE_M) & (run < 1.5 * STEP_M)
        if steps.any():
            worst = int(np.argmax(np.where(steps, rise, 0)))
            self.issue("step", points[worst], f"{name} steps {rise[worst]:.2f} m in {run[worst]:.1f} m", float(rise[worst]), path)
        along = np.concatenate(([0.0], np.cumsum(run)))
        if along[-1] < 2 * KINK_RUN_M:
            return
        stations = np.arange(0, along[-1], KINK_RUN_M / 2)
        heights = np.interp(stations, along, points[:, 2])
        reach = int(round(KINK_RUN_M / (KINK_RUN_M / 2)))
        grades = (heights[reach:] - heights[:-reach]) / KINK_RUN_M
        change = np.abs(grades[reach:] - grades[:-reach])
        if len(change) and change.max() > KINK_GRADE:
            worst = int(np.argmax(change)) + reach
            spot = np.array([np.interp(stations[worst], along, points[:, axis]) for axis in range(3)])
            self.issue("kink", spot, f"{name}: the grade changes by {change.max():.0%} over {2 * KINK_RUN_M:.0f} m", float(change.max()), path)

    def check_reach(self) -> None:
        """Every road lane can be reached from the network and leave it again, a tile's seams counting as the rest of the island."""
        for paths in (False, True):
            # Walkers and cyclists go by the roads too, where a path meets one.
            kept = [index for index, lane in enumerate(self.lanes) if lane is not None and (paths or not lane.path)]
            if not kept:
                continue
            ahead: dict[int, list[int]] = {index: [] for index in kept}
            behind: dict[int, list[int]] = {index: [] for index in kept}
            outside = -1
            ahead[outside], behind[outside] = [], []
            for connector in self.connectors:
                if paths or not self.on_path(connector):
                    ahead[connector.source].append(connector.target)
                    behind[connector.target].append(connector.source)
            for link in self.links if paths else []:
                source, target = (link.path, link.road) if link.on_to_road else (link.road, link.path)
                ahead[source].append(target)
                behind[target].append(source)
            for index in kept:
                lane = self.lanes[index]
                if lane.seam_end:
                    ahead[index].append(outside)
                    behind[outside].append(index)
                if lane.seam_start:
                    ahead[outside].append(index)
                    behind[index].append(outside)
            start = outside if ahead[outside] else max(kept, key=lambda index: len(ahead[index]) + len(behind[index]))
            # The largest piece the rest joins: from the seams, or on a tile with none, from the busiest lane.
            reached_ahead, reached_behind = self.reach(start, ahead), self.reach(start, behind)
            component = reached_ahead & reached_behind
            if len(component) < len(kept) / 2:
                start = max(kept, key=lambda index: len(self.reach(index, ahead)))
                component = self.reach(start, ahead) & self.reach(start, behind)
            for index in kept:
                if index not in component and self.lanes[index].path == paths:
                    lane = self.lanes[index]
                    middle = lane.points[len(lane.points) // 2]
                    way = "can't be reached" if index not in self.reach(start, ahead) else "leads nowhere"
                    self.issue("unreachable", middle, f"a lane of {self.named(lane.chain)} {way}", float(np.hypot(*np.diff(lane.points[:, :2], axis=0).T).sum()), paths)

    @staticmethod
    def reach(start: int, edges: dict[int, list[int]]) -> set[int]:
        seen, todo = {start}, [start]
        while todo:
            for following in edges[todo.pop()]:
                if following not in seen:
                    seen.add(following)
                    todo.append(following)
        return seen

    def build(self) -> "LaneMap":
        self.find_junctions()
        self.build_lanes()
        self.link_paths()
        self.settle_junctions()
        self.connect()
        self.audit()
        return self

    # Writing

    def counts(self) -> dict:
        lanes = [lane for lane in self.lanes if lane is not None]
        kinds: dict[str, int] = {}
        for junction in self.junctions.values():
            kinds[junction.kind] = kinds.get(junction.kind, 0) + 1
        issues: dict[str, int] = {}
        for issue in self.issues:
            kind = f"path {issue['kind']}" if issue["path"] else issue["kind"]
            issues[kind] = issues.get(kind, 0) + 1
        motor = [lane for lane in lanes if not lane.path]
        return {
            "lanes": len(motor),
            "laneKm": round(sum(float(np.hypot(*np.diff(lane.points[:, :2], axis=0).T).sum()) for lane in motor) / 1000, 1),
            "pathLanes": len(lanes) - len(motor),
            "connectors": sum(1 for connector in self.connectors if not self.lanes[connector.source].path and not self.lanes[connector.target].path),
            "pathConnectors": sum(1 for connector in self.connectors if self.lanes[connector.source].path or self.lanes[connector.target].path),
            "pathLinks": len(self.links),
            "junctions": dict(sorted(kinds.items())),
            "issues": dict(sorted(issues.items())),
        }

    def written(self) -> dict:
        numbered = {index: at for at, index in enumerate(index for index, lane in enumerate(self.lanes) if lane is not None)}
        junction_ids = {key: at for at, key in enumerate(self.junctions)}

        def scene(points: np.ndarray) -> list[int]:
            """Scene (x, y, z) in whole centimetres, the first point as it is and each after as the step from the one before."""
            centimetres = np.round(np.column_stack((points[:, 0], points[:, 2], -points[:, 1])) * 100).astype(np.int64)
            return np.concatenate((centimetres[:1], np.diff(centimetres, axis=0))).ravel().tolist()

        lanes = []
        for index, lane in enumerate(self.lanes):
            if lane is None:
                continue
            lanes.append({
                "points": scene(lane.points),
                "kind": lane.chain.kind,
                "chain": lane.chain.index,
                "forward": lane.forward,
                "lane": lane.index,
                "of": lane.of,
                "width": round(lane.width, 2),
                "speeds": [[along, speed] for along, speed in lane.speeds],
                **({"daily": round(self.rules.daily(lane.chain))} if lane.chain.motor else {}),
                **({"from": junction_ids[self.root(lane.start)]} if lane.start is not None and self.root(lane.start) in junction_ids else {}),
                **({"to": junction_ids[self.root(lane.end)]} if lane.end is not None and self.root(lane.end) in junction_ids else {}),
                **({"seamStart": True} if lane.seam_start else {}),
                **({"seamEnd": True} if lane.seam_end else {}),
            })
        connectors = []
        kept_connectors = {}
        for index, connector in enumerate(self.connectors):
            if connector.source in numbered and connector.target in numbered:
                kept_connectors[index] = len(kept_connectors)
        for index, connector in enumerate(self.connectors):
            if index not in kept_connectors:
                continue
            connectors.append({
                "from": numbered[connector.source],
                "to": numbered[connector.target],
                "junction": junction_ids[connector.junction],
                "turn": connector.turn,
                "points": scene(thinned(connector.points)),
                **({"yields": [kept_connectors[other] for other in connector.yields if other in kept_connectors]} if connector.yields else {}),
                **({"offM": round(connector.off_m, 2)} if connector.off_m > OFF_ROAD_M else {}),
            })
        junctions = []
        for junction in self.junctions.values():
            junctions.append({
                "kind": junction.kind,
                "x": round(float(junction.centre[0]), 2),
                "z": round(float(-junction.centre[1]), 2),
                "arms": [{**({"sign": arm.sign} if arm.sign else {}), **({"yields": True} if arm.yields else {}), **({"phase": round(arm.phase, 3)} if arm.phase is not None else {})} for arm in junction.arms],
            })
        issues = [{"kind": issue["kind"], "x": round(float(issue["at"][0]), 2), "y": round(float(issue["at"][2]), 2), "z": round(float(-issue["at"][1]), 2), "detail": issue["detail"], "count": issue["count"], **({"path": True} if issue["path"] else {})} for issue in self.issues]
        links = [{"path": numbered[link.path], "road": numbered[link.road], "along": round(link.along, 2), "onToRoad": link.on_to_road, "points": scene(link.points)} for link in self.links]
        return {**LICENCE, "lanes": lanes, "connectors": connectors, "links": links, "junctions": junctions, "issues": issues}


class Ways:
    """OSM's tags under a point of a laid road, and which way the way runs there against the chain."""

    def __init__(self, roads: list[dict]):
        self.lines = [LineString(road["line"]) for road in roads if len(road["line"]) >= 2]
        self.tags = [road for road in roads if len(road["line"]) >= 2]
        self.tree = shapely.STRtree(self.lines)

    def __call__(self, point: np.ndarray, direction: np.ndarray) -> tuple[dict, int]:
        """The nearest way running along the chain there: by a junction the nearest of all may be the road across it."""
        at = Point(point)
        best, found = roadside.TAG_REACH_M, None
        for index in self.tree.query(at, predicate="dwithin", distance=roadside.TAG_REACH_M):
            line = self.lines[index]
            distance = line.distance(at)
            along = line.project(at)
            ahead = unit(np.array(line.interpolate(min(along + 0.5, line.length)).coords[0]) - np.array(line.interpolate(max(along - 0.5, 0.0)).coords[0]))
            if distance < best and abs(float(ahead @ direction)) > PARALLEL:
                best, found = distance, (index, 1 if float(ahead @ direction) >= 0 else -1)
        return ({}, 1) if found is None else (self.tags[found[0]], found[1])


def signal_phases(side: Roadside) -> list[tuple[np.ndarray, tuple[np.ndarray, float]]]:
    """Each signalled junction as the heads have it: its centre, the way its first arm leaves, and that arm's start in the cycle."""
    found = []
    for centre in side.signal_centres():
        arms = side.arms(centre)
        if arms:
            found.append((centre, (arms[0][3], round(roll(*centre, 5.3) % 1.0, 3))))
    side.signalled = [centre for centre, _ in found]
    return found


def apron_triangles(folder: Path, manifest: dict) -> list[np.ndarray]:
    """The paving a turn may use past the rings' carriageways, as the roadside keeps things off it: a ribbon tile's
    aprons, or a paved tile's carriageways, junction and gap pieces and car parks."""
    laid = read_paving(folder, manifest)
    triangles, _ = roadside.kept_off(manifest["roadSurface"], laid)
    return list(laid.points[triangles][:, :, :3])


def lane_map(name: str, tiles: Path, volume: TrafficVolume) -> LaneMap:
    tile = tile_from_name(name)
    folder = tiles / name
    side = Roadside(tile, folder, tiles)
    roads = json.loads((folder / "roads.json").read_text(encoding="utf-8"))["roads"]

    def limits(chain: Chain) -> list[tuple[float, int]]:
        speeds = [roadside.speed_of(side.ways.at(ring[CENTRE, :2])) for ring in chain.rings]
        return [(float(chain.along[index]), speed) for index, speed in roadside.limit_changes(chain.along, speeds)]

    def daily(chain: Chain) -> float:
        return volume.daily(chain, bool(side.built_up(chain.ring_at(chain.length / 2)[CENTRE, :2])))

    rules = Rules(sign=side.junction_sign, signals=signal_phases(side), way=Ways(roads), limits=limits, built_up=side.built_up, daily=daily)
    return LaneMap(side.chains, apron_triangles(folder, side.manifest) if "roadSurface" in side.manifest else [], side.box, rules, side.heights.at).build()


def bake(name: str, tiles: Path, volume: TrafficVolume) -> dict:
    """Writes a tile's lane map and returns its manifest entry."""
    lanes = lane_map(name, tiles, volume)
    written = lanes.written()
    temporary = tiles / name / (FILE + ".new")
    temporary.write_bytes(gzip.compress(json.dumps(written, separators=(",", ":")).encode(), 9, mtime=0))
    temporary.replace(tiles / name / FILE)
    entry = {"file": FILE, "count": lanes.counts()}
    folder = tiles / name
    manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
    replace_text(folder / "tile.json", json.dumps({**manifest, "lanes": entry}, ensure_ascii=False, indent=2))
    return entry


def link(issue: dict, base: str) -> str:
    """Where to look at an issue in the game: from 60 m above, looking straight down."""
    east, north = issue["x"] + WORLD_ORIGIN[0], -issue["z"] + WORLD_ORIGIN[1]
    return f"{base}?lane-lab&at={east:.0f},{north:.0f},60,0,-1.5708"


def seam_report(names: list[str], tiles: Path) -> list[str]:
    """Every lane end on an edge two built tiles share, against its partner over the edge: same place, same way."""
    ends: dict[str, list[tuple[np.ndarray, bool]]] = {}
    for name in names:
        path = tiles / name / FILE
        if not path.exists():
            continue
        lanes = json.loads(gzip.decompress(path.read_bytes()))["lanes"]
        found = []
        for lane in lanes:
            points = np.cumsum(np.array(lane["points"]).reshape(-1, 3), axis=0) / 100
            if lane.get("seamEnd"):
                found.append((points[-1], True))
            if lane.get("seamStart"):
                found.append((points[0], False))
        ends[name] = found
    lines = []
    for name, found in ends.items():
        tile = tile_from_name(name)
        for east in (-1, 0, 1):
            for north in (-1, 0, 1):
                other = neighbour(tile, east, north).name
                if (east, north) == (0, 0) or abs(east) + abs(north) != 1 or other not in ends or other < name:
                    continue
                theirs = ends[other]
                west, south = tile.west - WORLD_ORIGIN[0], tile.south - WORLD_ORIGIN[1]
                edge_x = west + (6000 if east > 0 else 0) if east else None
                edge_z = south + (6000 if north > 0 else 0) if north else None
                mine = [end for end in found if (edge_x is not None and abs(end[0][0] - edge_x) < 1.5) or (edge_z is not None and abs(-end[0][2] - edge_z) < 1.5)]
                matched = 0
                for point, leaving in mine:
                    partner = [p for p, theirs_leaving in theirs if theirs_leaving != leaving and np.hypot(*(p[[0, 2]] - point[[0, 2]])) < 0.05]
                    if partner:
                        matched += 1
                    else:
                        lines.append(f"  unmatched lane end on {name}/{other} at scene ({point[0]:.1f}, {point[2]:.1f})")
                lines.insert(0, f"{name}/{other}: {matched} of {len(mine)} lane ends meet their partner")
    return lines


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tiles", nargs="*", help="NLS sheet names, such as L2343C; every built tile if none")
    parser.add_argument("--folder", type=Path, default=Path(__file__).resolve().parent.parent / ".data" / "tiles", help="where the built tiles are")
    parser.add_argument("--audit", default=None, help="print each tile's issues with links into the lane lab at this page address")
    arguments = parser.parse_args()
    names = arguments.tiles or sorted(path.parent.name for path in arguments.folder.glob("*/tile.json"))
    bake_tiles(names, arguments.folder)
    if arguments.audit is not None:
        for name in names:
            written = json.loads(gzip.decompress((arguments.folder / name / FILE).read_bytes()))
            print(f"\n{name}:")
            for issue in sorted(written["issues"], key=lambda issue: issue.get("path", False)):
                print(f"  {'path ' if issue.get('path') else ''}{issue['kind']:<12} {issue['detail']}{f' ({issue['count']} here)' if issue['count'] > 1 else ''}  {link(issue, arguments.audit)}")
        print()
        for line in seam_report(names, arguments.folder):
            print(line)


def bake_tiles(names: list[str], tiles: Path) -> None:
    """Adds the lane map to built tiles. It reads each tile's own files, OSM's signs and signals, and the traffic counts
    with every built tile's roads."""
    volume = TrafficVolume.counted(tiles)
    progress = Progress("lanes", len(names))
    for name in names:
        entry = bake(name, tiles, volume)
        print(f"  {name}: {entry['count']}", flush=True)
        progress.finished(name)


if __name__ == "__main__":
    main()
