"""OSM's road lines into one drivable surface, and the land blended into it.

The roads' lines become chains: continuous drives that run through a junction
the way a driver would, the highest class first, so a lesser road ends on the
road it meets. Each chain is rounded along its length, given a smooth height
profile, a crown and banking, and written as a ribbon of cross-sections. Those
ribbons are the surface, drawn and collided with alike. The ground is then cut
or filled to lie just under them, and eases back to the real land beyond.

Everything here is a pure function of the lines and the heights. A tile's edge
row of heights is never changed, and a road crossing that edge ends on a seam
section read only from what both tiles see the same (the whole way's direction
there, its class, and the elevation model round the crossing), so two neighbours
built apart end on the same cross-section.
"""

from dataclasses import dataclass, field, replace

import numpy as np
import shapely
from scipy import ndimage, sparse
from scipy.sparse.linalg import spsolve
from scipy.spatial import cKDTree

STATION_M = 2.0
NODE_STRIDE = 2  # Mesh nodes are every second 2 m corner.

# The surface sits this far above the ground under it, so the ground never shows through.
CLEARANCE_M = 0.12
# Mesh nodes this far beyond a road still shape the triangles under it: a 4 m cell's diagonal.
NODE_REACH_M = 2.9
EDGE_FADE_M = 24.0
EDGE_PIN_RADIUS_M = 24.0
EDGE_PIN_LIFT_M = 0.03
PIN_WEIGHT = 1e7
# Over this run a road eases on to its seam section: straight, level across, and its class's own widths.
SEAM_RUN_M = 40.0
# How obliquely a road's width is read along an edge it crosses: never more than this many half-widths.
SEAM_LONGEST_REACH = 3.0

# How a lesser road meets the one it ends on.
JUNCTION_APPROACH_M = 16.0
UNDER_ANOTHER_ROAD_M = 0.3
SHOULDER_LONGEST_DROP_M = 1.0
BENEATH_GREATER_ROAD_M = 0.05

# A roundabout's ring keeps its real shape: a road's rounding would pull a ring this small out of true.
RING_CORNER_M = 2.0
# Past this rank a road is a track or path, which passes just under any apron it crosses without landing there.
LEAST_APRON_RANK = 4
# How far clear of the greater road's carriageway a lesser road's first full section stands.
APRON_CLEAR_M = 0.05
# The curve of a corner where a road meets another square on, by the lesser road's tier. It shrinks with the sine of
# the angle squared, so a shallow merge keeps its sharp nose and doesn't pave the wedge of land beside it.
APRON_CORNER_M = {"main": 7.0, "minor": 4.5, "track": 2.0}
APRON_LEAST_CORNER_M = 0.3
# Sections of the lesser road's kept end the corner may run along.
APRON_REACH_STATIONS = 12
# Less road than this left between two cuts is paved as part of the apron.
APRON_SHORTEST_STUB_M = 16.0
APRON_SHOULDER_M = 1.5
APRON_SHOULDER_READ_M = 0.3
# How far the land eases back from an apron, by its tier: its roads' own blends.
APRON_BLEND_M = {"main": 12.0, "minor": 8.0, "track": 5.0}
# The aprons tuck this far under the ribbons they join, so no crack shows between them.
APRON_TUCK_M = 0.05
# And sink this far under them there, or two surfaces at one height flicker through each other along the join.
APRON_TUCK_DROP_M = 0.01
APRON_LEAST_AREA_M2 = 0.2
# Within this of a ribbon, an apron's height is that ribbon's.
APRON_PIN_M = 0.2
# Far weaker than any neighbour's pull: it only gives a point cut off from every pinned one a height at all.
APRON_FLOATING_WEIGHT = 1e-6
# Between the centre's paint and the edge line's: an apron is bare road. Past 1 is shoulder, as on a ribbon.
APRON_ACROSS = 0.5
APRON_SHOULDER_INNER = 1.1
APRON_SHOULDER_OUTER = 2.0

# A car park or bus station is one paved surface, and a service way or path with this share of its length on one is an
# aisle, a bay or a walkway of it, not a road of its own: laid as roads, they're a comb of strips each fading to grass.
PAVED_SHARE_INSIDE = 0.6
# A service way's share is measured on the area grown this far, since a bay or an aisle runs on out of the outline to meet
# the street. A path's isn't: a sidewalk runs along the outline, beside the area rather than on it.
PAVED_REACH_M = 2.0
# What such a way has outside the outline stays a road, joining the area to the street, unless it's shorter than this:
# a gap that narrow is paved anyway.
PAVED_STUB_M = 2.0
# A paved area is cut into cells this size, so its surface follows the land across it.
PAVED_CELL_M = 4.0
# Its height is the land's, averaged this far each way, so the 2 m model's bumps don't show.
PAVED_GROUND_READ_M = 2.0
# Where it meets a road it takes the road's height, easing back to the land over this far, as a road eases on to another.
PAVED_EASE_M = 12.0
# A strip of land narrower than this between two roads is paved: that thin, it's a kerb or a gap in the map, never a verge.
GAP_PAVED_M = 3.0
GAP_CELL_M = 4.0
# Roads further apart in height than this keep the land between them: one is on an embankment, or passes over the other.
GAP_MOST_STEP_M = 0.4

# A span is a stretch of road held up over a gap rather than laid on the land: a bridge, or a road the elevation model
# has over water. Shorter than this it's a culvert, and the land under it is filled as for any road.
SPAN_SHORTEST_M = 12.0
# Tagged bridge and water this close together are one span.
SPAN_JOIN_M = 8.0
# A bridge over water rises in the middle, by this share of its length, up to a limit.
SPAN_RISE_SHARE = 0.04
SPAN_RISE_MOST_M = 4.0
SPAN_ABOVE_WATER_M = 1.5
# How hard a span's profile holds to that rise: the road's own stiffness has the last word.
SPAN_WEIGHT = 0.1
# Not quite nothing: a road that is all bridge, with no junction to hold it, still needs somewhere to be.
BRIDGE_WEIGHT = 1e-3

# A cross-section is kept once the ribbon has moved this far from a straight run.
KEEP_WITHIN_M = 0.02
LONGEST_SECTION_M = 14.0

# Banking is the slope that balances a car at this speed, up to each class's limit.
BANK_SPEED_M_S = 25.0
GRAVITY = 9.81
BANK_SMOOTHING_M = 16.0

RINGS = 5  # Outer left, edge left, centre, edge right, outer right.
TIERS = ("main", "minor", "track")


@dataclass(frozen=True)
class RoadClass:
    rank: int  # Lower is the greater road.
    tier: str
    width_m: float
    corner_m: float  # The sigma of the rounding along the line.
    wavelength_m: float  # Height detail shorter than this leaves the profile.
    crown: float
    bank_limit: float
    shoulder_m: float
    blend_m: float


_PRIMARY = RoadClass(0, "main", 7.5, 14, 280, 0.025, 0.05, 2.5, 16)
_SECONDARY = RoadClass(1, "main", 7, 12, 240, 0.025, 0.05, 2.5, 14)
_TERTIARY = RoadClass(2, "main", 6, 10, 180, 0.025, 0.04, 2, 12)
_MINOR = RoadClass(3, "minor", 4.5, 8, 120, 0.02, 0.03, 1.5, 8)
_SERVICE = RoadClass(4, "minor", 3.5, 5, 70, 0.02, 0, 1.2, 6)
_TRACK = RoadClass(5, "track", 2.5, 4, 50, 0.015, 0, 1, 5)
_PATH = RoadClass(6, "track", 2, 3, 30, 0.01, 0, 0.8, 4)
CLASSES = {
    "motorway": _PRIMARY,
    "trunk": _PRIMARY,
    "primary": _PRIMARY,
    "primary_link": _SECONDARY,
    "secondary": _SECONDARY,
    "secondary_link": _TERTIARY,
    "tertiary": _TERTIARY,
    "tertiary_link": _MINOR,
    "unclassified": _MINOR,
    "residential": _MINOR,
    "living_street": _MINOR,
    "service": _SERVICE,
    "track": _TRACK,
}


class Ground:
    """Heights on the corners of the 2 m samples, with a rim beyond the tile."""

    def __init__(self, corners: np.ndarray, west: float, north: float, rim: int, spacing: float = STATION_M, water: np.ndarray | None = None):
        self.corners = corners
        self.west = west
        self.north = north
        self.rim = rim
        self.spacing = spacing
        self.water = water  # True on 2 m samples of lake or sea, with a rim of one sample more than the corners.

    def sample(self, xy: np.ndarray) -> np.ndarray:
        columns = (xy[..., 0] - self.west) / self.spacing + self.rim
        rows = (self.north - xy[..., 1]) / self.spacing + self.rim
        return ndimage.map_coordinates(self.corners, [rows.ravel(), columns.ravel()], order=1, mode="nearest").reshape(rows.shape)

    def is_water(self, xy: np.ndarray) -> np.ndarray:
        if self.water is None:
            return np.zeros(xy.shape[:-1], dtype=bool)
        columns = np.floor((xy[..., 0] - self.west) / self.spacing).astype(int) + self.rim + 1
        rows = np.floor((self.north - xy[..., 1]) / self.spacing).astype(int) + self.rim + 1
        last = self.water.shape[0] - 1
        return self.water[np.clip(rows, 0, last), np.clip(columns, 0, last)]

    def tile_corners(self) -> np.ndarray:
        return self.corners[self.rim : -self.rim, self.rim : -self.rim] if self.rim else self.corners

    @property
    def size_m(self) -> float:
        return (self.corners.shape[0] - 2 * self.rim - 1) * self.spacing


@dataclass
class Edge:
    points: np.ndarray
    road: dict
    start: tuple
    end: tuple
    kind: RoadClass = field(init=False)

    def __post_init__(self):
        kind = class_of(self.road["kind"])
        self.kind = replace(kind, corner_m=RING_CORNER_M, bank_limit=0) if self.is_ring else kind

    @property
    def is_ring(self) -> bool:
        return self.road.get("junction") == "roundabout"

    @property
    def length(self) -> float:
        return float(np.hypot(*np.diff(self.points, axis=0).T).sum())


# OSM's surfaces, as the two a car feels: sealed, or loose. Any other value says nothing, and the road's class decides.
SEALED_SURFACES = {"paved", "asphalt", "concrete", "concrete:plates", "concrete:lanes", "paving_stones", "sett", "cobblestone", "unhewn_cobblestone", "chipseal", "metal"}
LOOSE_SURFACES = {"unpaved", "gravel", "fine_gravel", "compacted", "dirt", "earth", "ground", "grass", "sand", "mud", "pebblestone", "rock", "woodchips", "grass_paver"}


def class_of(kind: str) -> RoadClass:
    return CLASSES.get(kind, _PATH)


@dataclass
class Chain:
    index: int
    edges: list[Edge]
    start_on: int | None  # The chain this one's first end lands on, if any.
    end_on: int | None
    xy: np.ndarray = field(default=None)
    tangent: np.ndarray = field(default=None)
    normal: np.ndarray = field(default=None)  # To the left of the way the chain runs.
    half: np.ndarray = field(default=None)
    height: np.ndarray = field(default=None)
    eased: np.ndarray = field(default=None)  # What easing on to the road it lands on added to the height: a road ending here meets the surface as laid.
    bank: np.ndarray = field(default=None)  # Rise per metre towards the left.
    crown: np.ndarray = field(default=None)
    shoulder: np.ndarray = field(default=None)
    blend: np.ndarray = field(default=None)
    tier: np.ndarray = field(default=None)
    left: np.ndarray = field(default=None)  # (x, y, z) of the road's left edge.
    right: np.ndarray = field(default=None)
    centre: np.ndarray = field(default=None)
    span: np.ndarray = field(default=None)  # True on stations held up over a gap.
    kept: np.ndarray = field(default=None)  # Stations left once the ends are cut to the roads they land on.
    full_left: np.ndarray = field(default=None)  # (x, y) of the left edge at every station, the cut ones included.
    full_right: np.ndarray = field(default=None)
    landings: list = field(default_factory=list)  # (the chain landed on, the station of the cut, whether it's the chain's start).
    seam_stations: list = field(default_factory=list)  # Those ending on a tile's edge, which a junction nearby can't move.
    tree: cKDTree = field(default=None)
    kept_shape: shapely.Geometry = field(default=None)  # What its kept sections cover, made once it's asked for.
    centre_tree: cKDTree = field(default=None)

    @property
    def kind(self) -> RoadClass:
        return min((edge.kind for edge in self.edges), key=lambda kind: kind.rank)

    @property
    def kind_name(self) -> str:
        return min(self.edges, key=lambda edge: edge.kind.rank).road["kind"]

    @property
    def motor(self) -> bool:
        return any(edge.road["motor"] for edge in self.edges)

    @property
    def sealed(self) -> bool | None:
        """Whether OSM says the chain is sealed, going by the most of its length that says either; None where none of it does."""
        sealed = sum(edge.length for edge in self.edges if edge.road.get("surface") in SEALED_SURFACES)
        loose = sum(edge.length for edge in self.edges if edge.road.get("surface") in LOOSE_SURFACES)
        return None if sealed == loose == 0 else sealed >= loose

    def tag(self, key: str):
        return next((edge.road[key] for edge in self.edges if key in edge.road), None)

    def plane(self, xy: np.ndarray) -> np.ndarray:
        """This chain's surface at points, level with its nearest edge beyond the carriageway.

        A shallow merge stops many metres from the road it lands on, and a crown or banking carried on that far would pull it down a slope that isn't there.
        """
        _, nearest = self.tree.query(xy)
        across = np.clip(((xy - self.xy[nearest]) * self.normal[nearest]).sum(-1), -self.half[nearest], self.half[nearest])
        return self.height[nearest] + self.eased[nearest] - self.crown[nearest] * np.abs(across) + self.bank[nearest] * across


def _key(point) -> tuple:
    return (round(float(point[0]), 2), round(float(point[1]), 2))


def split_at_junctions(roads: list[dict]) -> list[Edge]:
    """Every road line cut at each point another line, or the line itself, also passes."""
    seen: dict[tuple, int] = {}
    for road in roads:
        for point in road["line"]:
            seen[_key(point)] = seen.get(_key(point), 0) + 1
    edges = []
    for road in roads:
        line = road["line"]
        first = 0
        for index in range(1, len(line)):
            if index == len(line) - 1 or seen[_key(line[index])] > 1:
                edges.append(Edge(np.array(line[first : index + 1], dtype=float), road, _key(line[first]), _key(line[index])))
                first = index
    return edges


def _heading(edge: Edge, forwards: bool) -> np.ndarray:
    """The way an edge runs at the end it's left by, when walked forwards or backwards."""
    a, b = (edge.points[-2], edge.points[-1]) if forwards else (edge.points[1], edge.points[0])
    step = b - a
    return step / np.hypot(*step)


def chains_from(edges: list[Edge]) -> list[Chain]:
    """The greatest roads first, each run on through junctions the straightest way until it meets a road already laid."""
    at_node: dict[tuple, list[Edge]] = {}
    for edge in edges:
        at_node.setdefault(edge.start, []).append(edge)
        if edge.end != edge.start:
            at_node.setdefault(edge.end, []).append(edge)
    used: set[int] = set()
    claimed: dict[tuple, int] = {}
    chains: list[Chain] = []

    def walk(node: tuple, heading: np.ndarray, own: set[tuple], ring: bool) -> list[tuple[Edge, bool]]:
        walked = []
        while node not in claimed and node not in own:
            own.add(node)
            options = []
            for edge in at_node[node]:
                if id(edge) in used or edge.is_ring != ring:
                    continue
                forwards = edge.start == node
                onward = edge.points[1] - edge.points[0] if forwards else edge.points[-2] - edge.points[-1]
                turn = np.arccos(np.clip(onward @ heading / np.hypot(*onward), -1, 1))
                options.append((turn, edge, forwards))
            if not options:
                break
            turn, edge, forwards = min(options, key=lambda option: option[0])
            if not ring and len(at_node[node]) > 2 and turn > np.radians(55):
                break
            used.add(id(edge))
            walked.append((edge, forwards))
            node = edge.end if forwards else edge.start
            heading = _heading(edge, forwards)
        return walked

    # A ring goes first, whole, so every road ends on it rather than running through part of it.
    for seed in sorted(edges, key=lambda edge: (not edge.is_ring, edge.kind.rank, -edge.length)):
        if id(seed) in used:
            continue
        used.add(id(seed))
        own: set[tuple] = {seed.start}
        ahead = walk(seed.end, _heading(seed, True), own, seed.is_ring)
        behind = walk(seed.start, _heading(seed, False), own - {seed.start}, seed.is_ring)
        walked = [(edge, not forwards) for edge, forwards in reversed(behind)] + [(seed, True)] + ahead
        ordered = []
        for edge, forwards in walked:
            if forwards:
                ordered.append(edge)
            else:
                ordered.append(Edge(edge.points[::-1], edge.road, edge.end, edge.start))
        first, last = ordered[0].start, ordered[-1].end
        index = len(chains)
        chains.append(Chain(index, ordered, claimed.get(first), claimed.get(last)))
        for edge in ordered:
            claimed.setdefault(edge.start, index)
            claimed.setdefault(edge.end, index)
    return chains


def _resample(points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Evenly spaced stations along a line, with the distance each stands at."""
    lengths = np.concatenate(([0], np.cumsum(np.hypot(*np.diff(points, axis=0).T))))
    keep = np.concatenate(([True], np.diff(lengths) > 0))
    points, lengths = points[keep], lengths[keep]
    count = max(int(round(lengths[-1] / STATION_M)), 1) + 1
    along = np.linspace(0, lengths[-1], count)
    return np.column_stack((np.interp(along, lengths, points[:, 0]), np.interp(along, lengths, points[:, 1]))), along


def _round_corners(xy: np.ndarray, sigma_stations: float) -> np.ndarray:
    """A Gaussian along the line that leaves both ends exactly where they were."""
    if len(xy) < 3:
        return xy
    pad = min(int(4 * sigma_stations) + 1, len(xy) - 1)
    head = 2 * xy[0] - xy[pad:0:-1]
    tail = 2 * xy[-1] - xy[-2 : -2 - pad : -1]
    padded = np.concatenate((head, xy, tail))
    smooth = ndimage.gaussian_filter1d(padded, sigma_stations, axis=0, mode="nearest")
    result = smooth[pad : pad + len(xy)]
    result[0], result[-1] = xy[0], xy[-1]
    return result


def _smoothed_profile(ideal: np.ndarray, weights: np.ndarray, wavelength_m: float, pins: list[tuple[int, float]], slopes: list[tuple[int, int, float]]) -> np.ndarray:
    """The Whittaker smoother: as near the ground as a limit on its bending allows."""
    count = len(ideal)
    if count < 3:
        return ideal
    stiffness = (wavelength_m / (2 * np.pi * STATION_M)) ** 4
    bend = sparse.diags([1.0, -2.0, 1.0], [0, 1, 2], shape=(count - 2, count), format="csr")
    weighted = np.array(weights, dtype=float)
    target = np.array(ideal, dtype=float)
    for index, height in pins:
        weighted[index] = PIN_WEIGHT
        target[index] = height
    system = sparse.diags(weighted) + stiffness * (bend.T @ bend)
    right = weighted * target
    for near, far, rise in slopes:
        row = sparse.csr_matrix(([-1.0, 1.0], ([0, 0], [near, far])), shape=(1, count))
        system = system + PIN_WEIGHT * (row.T @ row)
        right = right + PIN_WEIGHT * rise * row.toarray().ravel()
    return spsolve(system.tocsc(), right)


def _edge_pin(ground: Ground, point: np.ndarray, half: float, direction: np.ndarray) -> tuple[float, float, float]:
    """The land's height and gradient at a tile-edge crossing, from what both tiles can see, rounded so both agree."""
    spacing = ground.spacing
    steps = int(EDGE_PIN_RADIUS_M / spacing)
    offsets = np.arange(-steps, steps + 1) * spacing
    east, north = np.meshgrid(offsets, offsets)
    inside = east**2 + north**2 <= EDGE_PIN_RADIUS_M**2
    east, north = east[inside], north[inside]
    heights = ground.sample(np.column_stack((point[0] + east, point[1] + north)))
    fit = np.linalg.lstsq(np.column_stack((east, north, np.ones_like(east))), heights, rcond=None)[0]
    # A road crossing an edge obliquely lies over more of that edge than its width.
    along_row = np.arange(-1, 1 + 1e-6, spacing / half) * half * min(1 / max(abs(direction[1]), 1e-6), SEAM_LONGEST_REACH)
    along_column = np.arange(-1, 1 + 1e-6, spacing / half) * half * min(1 / max(abs(direction[0]), 1e-6), SEAM_LONGEST_REACH)
    row = ground.sample(np.column_stack((point[0] + along_row, np.full_like(along_row, point[1])))).max()
    column = ground.sample(np.column_stack((np.full_like(along_column, point[0]), point[1] + along_column))).max()
    on_row = min(abs(point[1] - ground.north), abs(point[1] - (ground.north - ground.size_m))) < 1e-6
    on_column = min(abs(point[0] - ground.west), abs(point[0] - (ground.west + ground.size_m))) < 1e-6
    clear = float(max(row if on_row else -np.inf, column if on_column else -np.inf))
    return round(max(float(fit[2]), clear + EDGE_PIN_LIFT_M), 3), round(float(fit[0]), 4), round(float(fit[1]), 4)


def _runs(flags: np.ndarray) -> list[tuple[int, int]]:
    """The first and last index of each run of True."""
    edges = np.flatnonzero(np.diff(np.concatenate(([0], flags.astype(np.int8), [0]))))
    return [(int(first), int(past) - 1) for first, past in zip(edges[::2], edges[1::2])]


def find_spans(tagged: np.ndarray, wet: np.ndarray) -> np.ndarray:
    """Which stations are held up: a tagged bridge or a road over water, long enough not to be a culvert."""
    join = int(SPAN_JOIN_M / STATION_M)
    either = ndimage.binary_closing(tagged | wet, np.ones(2 * join + 1)) | tagged | wet
    span = np.zeros(len(tagged), dtype=bool)
    for first, last in _runs(either):
        if (last - first) * STATION_M >= SPAN_SHORTEST_M:
            span[first : last + 1] = True
    return span


def _over_spans(ideal: np.ndarray, weights: np.ndarray, span: np.ndarray, tagged: np.ndarray, wet: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """What a profile aims for across each span: straight from bank to bank, rising over open water."""
    ideal, weights = ideal.copy(), weights.copy()
    for first, last in _runs(span):
        low, high = ideal[max(first - 1, 0)], ideal[min(last + 1, len(ideal) - 1)]
        share = (np.arange(first, last + 1) - first + 1) / (last - first + 2)
        target = low + share * (high - low)
        over = wet[first : last + 1]
        if over.any():
            target = np.maximum(target, float(np.median(ideal[first : last + 1][over])) + SPAN_ABOVE_WATER_M)
            if tagged[first : last + 1].any():
                target += min(SPAN_RISE_SHARE * (last - first) * STATION_M, SPAN_RISE_MOST_M) * np.sin(np.pi * share)
        ideal[first : last + 1] = target
        weights[first : last + 1] = SPAN_WEIGHT
    return ideal, weights


def _on_tile_edge(ground: Ground, point: np.ndarray) -> bool:
    east, north = point[0] - ground.west, ground.north - point[1]
    size = ground.size_m
    return min(east, north, size - east, size - north) < 1e-6


def _seam_at(edge: Edge, point: np.ndarray, ground: Ground) -> np.ndarray | None:
    """The whole road's direction where this end crosses a tile's edge, or None for any other end."""
    if not _on_tile_edge(ground, point):
        return None
    for x, y, east, north in edge.road.get("seams", ()):
        if _key((x, y)) == _key(point):
            return np.array((east, north))
    return None


def lay_chain(chain: Chain, chains: list[Chain], ground: Ground) -> None:
    """A chain's stations: where they stand, how wide, and at what height."""
    points = np.concatenate([edge.points[(0 if index == 0 else 1) :] for index, edge in enumerate(chain.edges)])
    starts_on = chains[chain.start_on] if chain.start_on is not None else None
    ends_on = chains[chain.end_on] if chain.end_on is not None else None
    # The greater road has been rounded by now: land on where it really is.
    if starts_on is not None:
        points[0] = starts_on.xy[starts_on.tree.query(points[0])[1]]
    if ends_on is not None:
        points[-1] = ends_on.xy[ends_on.tree.query(points[-1])[1]]

    sizes = np.cumsum([edge.points.shape[0] - (0 if index == 0 else 1) for index, edge in enumerate(chain.edges)])
    source_lengths = np.concatenate(([0], np.cumsum(np.hypot(*np.diff(points, axis=0).T))))
    ends_at = source_lengths[np.minimum(sizes - 1, len(source_lengths) - 1)]

    stations, along = _resample(points)
    which = np.minimum(np.searchsorted(ends_at, along, side="left"), len(chain.edges) - 1)
    kinds = [chain.edges[index].kind for index in which]
    smooth = lambda values, metres: ndimage.gaussian_filter1d(np.array(values, dtype=float), metres / STATION_M, mode="nearest")

    xy = _round_corners(stations, chain.kind.corner_m / STATION_M)

    # Each end on a tile's edge eases on to the straight line through the crossing, the way the whole road runs there.
    seam_ends = []
    # A short road that dips across an edge and back has two seams, and neither may move the other's end.
    seam_run = min(SEAM_RUN_M, along[-1] / 2)
    for station, seam in ((0, _seam_at(chain.edges[0], points[0], ground)), (len(xy) - 1, _seam_at(chain.edges[-1], points[-1], ground))):
        if seam is None:
            continue
        distance = along if station == 0 else along[-1] - along
        share = 1 - _smoothstep(distance / seam_run)
        forwards = 1.0 if (xy[-1] - xy[0]) @ seam >= 0 else -1.0
        straight = xy[station] + forwards * seam * (along - along[station])[:, None]
        xy = xy + share[:, None] * (straight - xy)
        seam_ends.append((station, share, forwards * seam))

    tangent = np.gradient(xy, axis=0)
    tangent /= np.maximum(np.hypot(tangent[:, 0], tangent[:, 1])[:, None], 1e-9)
    for station, _, direction in seam_ends:
        tangent[station] = direction
    # A closed ring's two ends are one section, or a notch shows where it closes.
    if np.array_equal(xy[0], xy[-1]) and len(xy) > 2:
        closing = xy[1] - xy[-2]
        tangent[0] = tangent[-1] = closing / np.hypot(*closing)
    normal = np.column_stack((-tangent[:, 1], tangent[:, 0]))

    half = smooth([kind.width_m / 2 for kind in kinds], 6)
    crown = smooth([kind.crown for kind in kinds], 6)
    bank_limit = smooth([kind.bank_limit for kind in kinds], 6)
    shoulder = smooth([kind.shoulder_m for kind in kinds], 6)
    blend = smooth([kind.blend_m for kind in kinds], 6)

    heading = np.unwrap(np.arctan2(tangent[:, 1], tangent[:, 0]))
    curvature = np.gradient(heading, STATION_M)
    # A left-hand bend (heading rising) lifts the right side, so the rise towards the left is negative.
    bank = -np.clip(curvature * BANK_SPEED_M_S**2 / GRAVITY, -bank_limit, bank_limit)
    bank = smooth(bank, BANK_SMOOTHING_M)
    for station, share, _ in seam_ends:
        kind = kinds[station]
        half += share * (kind.width_m / 2 - half)
        crown += share * (kind.crown - crown)
        shoulder += share * (kind.shoulder_m - shoulder)
        blend += share * (kind.blend_m - blend)
        bank *= 1 - share

    across = np.linspace(-0.6, 0.6, 3)[None, :, None]
    spread = xy[:, None, :] + normal[:, None, :] * half[:, None, None] * across
    ideal = np.median(ground.sample(spread), axis=1)
    bridge = np.array([chain.edges[index].road.get("bridge") not in (None, "no") for index in which])
    weights = np.where(bridge, BRIDGE_WEIGHT, 1.0)
    wet = ground.is_water(xy)
    # A footbridge is left to cross whatever it crosses: only over water does it need holding up.
    span = find_spans(bridge if chain.motor else np.zeros_like(bridge), wet)
    ideal, weights = _over_spans(ideal, weights, span, bridge, wet)

    pins: list[tuple[int, float]] = []
    slopes: list[tuple[int, int, float]] = []
    for parent, end, station, next_station in ((starts_on, 0, 0, 1), (ends_on, -1, len(xy) - 1, len(xy) - 2)):
        here = xy[station]
        if parent is not None:
            pins.append((station, float(parent.plane(here[None])[0])))
        elif _on_tile_edge(ground, here):
            height, rise_east, rise_north = _edge_pin(ground, here, float(half[station]), tangent[station])
            pins.append((station, height))
            step = xy[next_station] - here
            slopes.append((station, next_station, rise_east * step[0] + rise_north * step[1]))

    chain.xy, chain.tangent, chain.normal, chain.half = xy, tangent, normal, half
    chain.crown, chain.bank = crown, bank
    chain.span = span
    chain.shoulder = shoulder
    chain.blend = blend
    chain.tier = np.array([TIERS.index(kind.tier) for kind in kinds], dtype=np.uint8)
    chain.height = _smoothed_profile(ideal, weights, chain.kind.wavelength_m, pins, slopes)
    # A profile runs from end to end, so round a ring on a slope it's a spiral whose ends don't meet. A ring is a tilted plane.
    if np.array_equal(xy[0], xy[-1]) and len(xy) > 2:
        plane = np.linalg.lstsq(np.column_stack((xy, np.ones(len(xy)))), ideal, rcond=None)[0]
        chain.height = xy @ plane[:2] + plane[2]
    chain.height[[station for station, _ in pins]] = [height for _, height in pins]
    chain.seam_stations = [station for station, _, _ in seam_ends]
    chain.tree = cKDTree(xy)
    _cut_sections(chain, along, starts_on, ends_on)


def _smoothstep(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def _cut_sections(chain: Chain, along: np.ndarray, starts_on: Chain | None, ends_on: Chain | None) -> None:
    """Each station's left, centre and right points, with the ends joined to the roads they land on."""
    length = along[-1]
    falls = chain.crown * chain.half
    rises = chain.bank * chain.half
    left_xy = chain.xy + chain.normal * chain.half[:, None]
    right_xy = chain.xy - chain.normal * chain.half[:, None]
    left_z = chain.height - falls + rises
    right_z = chain.height - falls - rises
    centre_z = chain.height.copy()
    chain.full_left, chain.full_right = left_xy.copy(), right_xy.copy()

    first, last = 0, len(along) - 1
    chain.landings = []
    for parent, distance, keeps_first in ((starts_on, along, True), (ends_on, length - along, False)):
        if parent is None:
            continue
        clear = _clear_of(parent, left_xy) & _clear_of(parent, right_xy) & _clear_of(parent, chain.xy)
        # Walking in from the end: the first section wholly clear of the road it lands on.
        order = np.arange(len(along)) if keeps_first else np.arange(len(along))[::-1]
        found = np.flatnonzero(clear[order])
        cut = int(order[found[0]]) if len(found) else int(order[-1])
        if keeps_first:
            first = max(first, cut if len(found) else len(along))
        else:
            last = min(last, cut if len(found) else -1)
        from_cut = distance - distance[cut]
        near = (from_cut >= 0) & (from_cut < JUNCTION_APPROACH_M)
        share = _smoothstep(1 - from_cut[near] / JUNCTION_APPROACH_M)
        left_z[near] += share * (parent.plane(left_xy[near]) - left_z[near])
        right_z[near] += share * (parent.plane(right_xy[near]) - right_z[near])
        centre_z[near] += share * (parent.plane(chain.xy[near]) - centre_z[near])
        chain.landings.append((parent, cut, keeps_first))

    chain.eased = centre_z - chain.height
    # An end on a tile's edge stays, however close a junction: the neighbour's road ends on it.
    if 0 in chain.seam_stations:
        first, last = 0, max(last, 1)
    if len(along) - 1 in chain.seam_stations:
        first, last = min(first, len(along) - 2), len(along) - 1
    if len(chain.landings) == 2 and (last - first) * STATION_M < APRON_SHORTEST_STUB_M:
        middle = (first + last) // 2
        chain.landings = [(parent, middle, at_start) for parent, _, at_start in chain.landings]
        first, last = len(along), -1

    for station in chain.seam_stations:
        left_xy[station] = chain.xy[station] + chain.normal[station] * chain.half[station]
        right_xy[station] = chain.xy[station] - chain.normal[station] * chain.half[station]
        left_z[station] = chain.height[station] - falls[station] + rises[station]
        right_z[station] = chain.height[station] - falls[station] - rises[station]
        centre_z[station] = chain.height[station]

    keep = np.arange(max(first, 0), min(last, len(along) - 1) + 1)
    chain.left = np.column_stack((left_xy, left_z))[keep]
    chain.right = np.column_stack((right_xy, right_z))[keep]
    chain.centre = np.column_stack((chain.xy, centre_z))[keep]
    chain.kept = keep


def _clear_of(parent: Chain, points: np.ndarray) -> np.ndarray:
    distance, nearest = parent.tree.query(points)
    return distance >= parent.half[nearest] + APRON_CLEAR_M


@dataclass
class Apron:
    """A piece of road joining a lesser road's cut end to what it lands on: a shape of its own, not a section of a chain."""

    points: np.ndarray  # (x, y, z), carriageway first and then the shoulder's points.
    triangles: np.ndarray
    across: np.ndarray  # As a ribbon's: past 1 is shoulder, and the carriageway's value paints nothing.
    tier: int
    outer: np.ndarray  # Indices of the shoulder's outer points, whose heights come from the ground.
    area: bool = False  # A car park or bus station, drawn as paving of its own rather than as the road it joins.


def _strip(left: np.ndarray, right: np.ndarray) -> shapely.Geometry:
    """The ground between two edges, a quad a station, so a tight curve's folds come out as plain overlap."""
    rings = np.stack((left[:-1], left[1:], right[1:], right[:-1], left[:-1]), axis=1)
    return shapely.union_all(shapely.buffer(shapely.polygons(rings), 0))


def _kept_strip(chain: Chain) -> shapely.Geometry:
    if chain.kept_shape is None:
        chain.kept_shape = _strip(chain.left[:, :2], chain.right[:, :2]) if len(chain.kept) >= 2 else shapely.Polygon()
    return chain.kept_shape


def _surface_at(chain: Chain, points: np.ndarray) -> np.ndarray:
    """A chain's kept surface at points, flat beyond its edges."""
    if chain.centre_tree is None:
        chain.centre_tree = cKDTree(chain.centre[:, :2])
    _, nearest = chain.centre_tree.query(points[:, :2])
    centre = chain.centre[nearest]
    towards_left = chain.left[nearest] - centre
    towards_right = chain.right[nearest] - centre
    offset = points[:, :2] - centre[:, :2]
    left_side = ((offset * towards_left[:, :2]).sum(-1) >= 0)[:, None]
    side = np.where(left_side, towards_left, towards_right)
    share = np.clip((offset * side[:, :2]).sum(-1) / np.maximum((side[:, :2] ** 2).sum(-1), 1e-9), 0, 1)
    return centre[:, 2] + share * side[:, 2]


def _landing_shape(chain: Chain, parent: Chain, cut: int, at_start: bool) -> shapely.Geometry:
    """What a lesser road's end needs paved: its own cut stations, and a rounded corner each side where it meets the road."""
    count = len(chain.xy)
    cut = int(np.clip(cut, 0, count - 1))
    if at_start:
        stations = np.arange(0, min(cut + APRON_REACH_STATIONS, count - 1) + 1)
        inner = stations[stations <= cut]
    else:
        stations = np.arange(max(cut - APRON_REACH_STATIONS, 0), count)
        inner = stations[stations >= cut]
    if len(inner) < 2:
        return shapely.Polygon()
    cut_end = _strip(chain.full_left[inner], chain.full_right[inner])
    own = _strip(chain.full_left[stations], chain.full_right[stations])
    landing = chain.xy[0 if at_start else -1]
    reach = STATION_M * len(stations) + 2 * float(parent.half.max()) + APRON_CORNER_M["main"]
    near = np.hypot(*(parent.xy - landing).T) <= reach
    pieces = [_strip(parent.full_left[first : last + 1], parent.full_right[first : last + 1]) for first, last in _runs(near) if last > first]
    if not pieces:
        return cut_end
    _, at_parent = parent.tree.query(chain.xy[cut])
    sine = abs(float(chain.tangent[cut][0] * parent.tangent[at_parent][1] - chain.tangent[cut][1] * parent.tangent[at_parent][0]))
    corner = APRON_CORNER_M.get(TIERS[int(chain.tier.min())], 0.0) * sine**2
    if corner < APRON_LEAST_CORNER_M:
        return cut_end
    rounded = shapely.union_all([own, *pieces]).buffer(corner).buffer(-corner)
    return shapely.intersection(rounded, own.buffer(corner + 1)).union(cut_end)


def _flat(shape: shapely.Geometry) -> list[shapely.Polygon]:
    return [part for part in shapely.get_parts(shape) if isinstance(part, shapely.Polygon) and part.area >= APRON_LEAST_AREA_M2]


def _shoulders(points: np.ndarray, height: np.ndarray, indices: np.ndarray, joined: shapely.Geometry, cover: "ApronCover | None", tile: shapely.Polygon) -> tuple[np.ndarray, np.ndarray]:
    """A strip outward from each free stretch of the triangles' outline: four points and two triangles an edge, numbered after `points`.

    The outline is the edges only one triangle has, so a shoulder meets the surface vertex for vertex however finely it's cut.
    An edge lying along what it meets, the ribbons `joined` or the aprons under `cover`, needs none.
    """
    edges = np.sort(np.concatenate((indices[:, [0, 1]], indices[:, [1, 2]], indices[:, [2, 0]])), axis=1)
    third = np.concatenate((indices[:, 2], indices[:, 0], indices[:, 1]))
    _, first_seen, counts = np.unique(edges, axis=0, return_index=True, return_counts=True)
    outline = first_seen[counts == 1]
    on_tile_edge = shapely.distance(shapely.points(points), tile.exterior) < 1e-3
    middles = points[edges[outline]].mean(axis=1)
    along_joined = shapely.distance(shapely.points(middles), joined) < APRON_PIN_M if not joined.is_empty else np.zeros(len(outline), dtype=bool)
    if cover is not None:
        along_joined |= ~np.isnan(cover.height(middles))
    laid: list[tuple[float, float, float]] = []
    triangles: list[tuple[int, int, int]] = []
    for (at_a, at_b), inside, joins in zip(edges[outline], third[outline], along_joined):
        a, b = points[at_a], points[at_b]
        step = b - a
        length = float(np.hypot(*step))
        # An edge between two points on ribbons can still cross open land, where without a shoulder it stands as a wall.
        # Along the tile's edge the neighbour carries on, so no shoulder.
        if length < 1e-6 or joins or on_tile_edge[at_a] and on_tile_edge[at_b]:
            continue
        out = np.array((step[1], -step[0])) / length * APRON_SHOULDER_M
        if out @ (points[inside] - a) > 0:
            out = -out
        first = len(points) + len(laid)
        laid += [(*a, height[at_a]), (*b, height[at_b]), (*(b + out), height[at_b]), (*(a + out), height[at_a])]
        triangles += [(first, first + 1, first + 2), (first, first + 2, first + 3)]
    return np.array(laid).reshape(-1, 3), np.array(triangles, dtype=int).reshape(-1, 3)


def _triangulated(pieces: list[shapely.Polygon]) -> tuple[np.ndarray, np.ndarray]:
    """The pieces' triangles as points shared to the millimetre, and each triangle's three of them."""
    triangles = [triangle for piece in pieces for triangle in shapely.get_parts(shapely.constrained_delaunay_triangles(piece))]
    corners = shapely.get_coordinates(np.array(triangles)).reshape(-1, 4, 2)[:, :3]
    points, indices = np.unique(np.round(corners.reshape(-1, 2), 3), axis=0, return_inverse=True)
    return points, indices.reshape(-1, 3)


def _apron_of(shape: shapely.Polygon, members: list[Chain], tier: int, tile: shapely.Polygon, cells_m: float | None = None, land: Ground | None = None, cover: "ApronCover | None" = None) -> Apron:
    """A paved shape joined to the roads it meets. Points off them hang between those that are on them, or with `land`, lie on the land."""
    points, indices = _triangulated(_cells(shape, cells_m) if cells_m else [shape])

    laid = [chain for chain in sorted(members, key=lambda chain: chain.index) if len(chain.kept) >= 2]
    height = np.full(len(points), np.nan)
    located = shapely.points(points)
    # The greatest first: where two ribbons meet, the point keeps to the greater.
    for chain in laid:
        strip = _kept_strip(chain)
        pinned = np.isnan(height) & (shapely.distance(located, strip) < APRON_PIN_M)
        if pinned.any():
            height[pinned] = _surface_at(chain, points[pinned])
            tucked = pinned & (shapely.distance(located, strip.buffer(-APRON_TUCK_M / 2)) == 0)
            height[tucked] -= APRON_TUCK_DROP_M
    if cover is not None:
        free = np.isnan(height)
        height[free] = cover.height(points[free])
    free = np.isnan(height)
    if land is not None:
        height[free] = _land_under(land, points[free])
        if (~free).any():
            # Off the land by as much as the nearest point it shares with a road, less with distance from it.
            distance, nearest = cKDTree(points[~free]).query(points[free])
            joined = np.flatnonzero(~free)[nearest]
            off = height[joined] - _land_under(land, points[joined])
            height[free] += off * (1 - _smoothstep(distance / PAVED_EASE_M))
        # The row of heights on a tile's edge never moves, so paving can't press the land down there as it does inside:
        # near the edge it lies just over the land itself, as a road's end does, or the land shows through.
        near_edge = 1 - _smoothstep(shapely.distance(shapely.points(points[free]), tile.exterior) / PAVED_CELL_M)
        under = land.sample(points[free]) + EDGE_PIN_LIFT_M - height[free]
        height[free] += near_edge * np.maximum(under, 0)
    elif free.any():
        # The rest hang between the pinned points like a soap film, so an apron has no ridge of its own.
        pairs = np.concatenate((indices[:, [0, 1]], indices[:, [1, 2]], indices[:, [2, 0]]))
        pairs = np.concatenate((pairs, pairs[:, ::-1]))
        links = sparse.csr_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(len(points), len(points)))
        links.data[:] = 1
        system = sparse.diags(np.asarray(links.sum(1)).ravel()) - links
        known = np.where(free, 0.0, height)
        guess = _surface_at(laid[0], points[free]) if laid else np.full(int(free.sum()), np.nanmean(height))
        floating = APRON_FLOATING_WEIGHT * sparse.identity(int(free.sum()))
        height[free] = spsolve((system[free][:, free] + floating).tocsc(), (links @ known)[free] + APRON_FLOATING_WEIGHT * guess)

    joined = shapely.union_all([_kept_strip(chain) for chain in laid])
    shoulder, shoulder_triangles = _shoulders(points, height, indices, joined, cover, tile)
    surface = np.concatenate((np.column_stack((points, height)), shoulder))
    indices = np.concatenate((indices, shoulder_triangles))
    across = np.full(len(surface), APRON_ACROSS)
    across[len(points) :][np.arange(len(shoulder)) % 4 < 2] = APRON_SHOULDER_INNER
    across[len(points) :][np.arange(len(shoulder)) % 4 >= 2] = APRON_SHOULDER_OUTER
    # The ribbons' triangles wind one way, and a mesh with no back faces has to match them.
    along = surface[indices[:, 1], :2] - surface[indices[:, 0], :2]
    beside = surface[indices[:, 2], :2] - surface[indices[:, 0], :2]
    backwards = along[:, 0] * beside[:, 1] - along[:, 1] * beside[:, 0] < 0
    indices[backwards] = indices[backwards][:, [0, 2, 1]]
    return Apron(surface, indices, across, tier, np.flatnonzero(across == APRON_SHOULDER_OUTER))


def lay_aprons(chains: list[Chain], ground: Ground) -> list[Apron]:
    """Every road end that stopped short of what it lands on, joined to it. Ends that meet become one apron."""
    shapes, members = [], []
    for chain in chains:
        for parent, cut, at_start in chain.landings:
            shape = _landing_shape(chain, parent, cut, at_start)
            if not shape.is_empty:
                shapes.append(shape)
                members.append({chain.index, parent.index})
    if not shapes:
        return []
    tile = _tile_box(ground)
    aprons = []
    for merged in _flat(shapely.intersection(shapely.union_all(shapes), tile)):
        indices = sorted(set().union(*(member for shape, member in zip(shapes, members) if shape.intersects(merged))))
        joined = [chains[index] for index in indices]
        kept = shapely.union_all([_kept_strip(chain).buffer(-APRON_TUCK_M) for chain in joined])
        for part in _flat(merged.difference(kept)):
            aprons.append(_apron_of(part, joined, min(int(chain.tier.min()) for chain in joined), tile))
    return aprons


def _tile_box(ground: Ground) -> shapely.Polygon:
    return shapely.box(ground.west, ground.north - ground.size_m, ground.west + ground.size_m, ground.north)


def _cells(shape: shapely.Geometry, size: float) -> list[shapely.Polygon]:
    """A shape cut on a lattice of the world, so two tiles cut a shape they share alike."""
    west, south, east, north = shape.bounds
    columns = np.arange(np.floor(west / size), np.ceil(east / size)) * size
    rows = np.arange(np.floor(south / size), np.ceil(north / size)) * size
    corner_east, corner_north = (axis.ravel() for axis in np.meshgrid(columns, rows))
    boxes = shapely.box(corner_east, corner_north, corner_east + size, corner_north + size)
    near = boxes[shapely.intersects(boxes, shape)]
    return [part for cut in shapely.intersection(near, shape) for part in _flat(cut)]


def _land_under(ground: Ground, xy: np.ndarray) -> np.ndarray:
    """The land at points, averaged over a few metres round each."""
    steps = np.array([(east, north) for east in (-1, 0, 1) for north in (-1, 0, 1)]) * PAVED_GROUND_READ_M
    return ground.sample(xy[:, None, :] + steps[None]).mean(axis=1)


def _footprint(aprons: list[Apron]) -> shapely.Geometry:
    """Where the aprons' carriageways lie."""
    triangles = ApronCover(aprons).triangles[:, :, :2]
    return shapely.union_all(shapely.polygons(np.concatenate((triangles, triangles[:, :1]), axis=1)))


def _laid_strips(chains: list[Chain]) -> list[tuple[Chain, shapely.Geometry]]:
    """Each laid chain's carriageway on the land: a span's stretch is held up over whatever lies beneath it."""
    strips = []
    for chain in chains:
        if len(chain.kept) < 2:
            continue
        on_land = [_strip(chain.left[first : last + 1, :2], chain.right[first : last + 1, :2]) for first, last in _runs(~chain.span[chain.kept]) if last > first]
        if on_land:
            strips.append((chain, shapely.union_all(on_land)))
    return strips


def on_paved_area(road: dict, areas: shapely.Geometry, reached: shapely.Geometry) -> bool:
    """A service way or path lying mostly on a car park or bus station: part of it. `reached` is `areas` grown by PAVED_REACH_M."""
    if road["motor"] and road["kind"] != "service" or areas.is_empty:
        return False
    line = shapely.LineString(road["line"])
    return line.length > 0 and shapely.intersection(line, reached if road["motor"] else areas).length >= PAVED_SHARE_INSIDE * line.length


def _off_paved(road: dict, areas: shapely.Geometry, reached: shapely.Geometry, whole: dict[int, list]) -> list[dict]:
    """A road as laid: whole, or for one that's part of a paved area, only the stubs outside it that join it to the street.
    Which it is goes by the whole way where `whole` has it, so both tiles a way crosses decide alike."""
    if not on_paved_area({**road, "line": whole.get(road["id"], road["line"])}, areas, reached):
        return [road]
    outside = shapely.difference(shapely.LineString(road["line"]), areas)
    return [{**road, "line": shapely.get_coordinates(part).tolist()} for part in shapely.get_parts(outside) if part.length >= PAVED_STUB_M]


def lay_paved(areas: list[shapely.Polygon], chains: list[Chain], aprons: list[Apron], ground: Ground) -> list[Apron]:
    """Car parks and bus stations as surfaces of their own, on the land, joined to the roads and aprons that meet them."""
    if not areas:
        return []
    tile = _tile_box(ground)
    strips = _laid_strips(chains)
    taken = shapely.union_all([strip.buffer(-APRON_TUCK_M) for _, strip in strips] + ([_footprint(aprons)] if aprons else []))
    cover = ApronCover(aprons) if aprons else None
    paved = []
    for part in _flat(shapely.intersection(shapely.union_all(areas), tile).difference(taken)):
        members = [chain for chain, strip in strips if strip.distance(part) < APRON_PIN_M]
        apron = _apron_of(part, members, TIERS.index("minor"), tile, cells_m=PAVED_CELL_M, land=ground, cover=cover)
        # A sliver left between the roads can be too thin to make a single triangle: there's nothing there to pave.
        if len(apron.points):
            paved.append(replace(apron, area=True))
    return paved


def _shoulders_on_land(aprons: list[Apron], chains: list[Chain]) -> list[Apron]:
    """A shoulder fades its surface into the land. Laid over another road or apron it shows as a pale plate, so there it goes."""
    if not aprons:
        return aprons
    cover = ApronCover(aprons)
    tree = shapely.STRtree([_kept_strip(chain) for chain in chains if len(chain.kept) >= 2])
    cleared = []
    for apron in aprons:
        shoulder = np.flatnonzero(apron.across[apron.triangles].max(1) == APRON_SHOULDER_OUTER)
        middle = apron.points[apron.triangles[shoulder]][:, :, :2].mean(axis=1)
        covered = ~np.isnan(cover.height(middle))
        covered[np.unique(tree.query(shapely.points(middle), predicate="intersects")[0])] = True
        keep = np.ones(len(apron.triangles), dtype=bool)
        keep[shoulder[covered]] = False
        cleared.append(replace(apron, triangles=apron.triangles[keep]))
    return cleared


def lay_gaps(chains: list[Chain], aprons: list[Apron], ground: Ground) -> list[Apron]:
    """The narrow strips of land between roads, car parks and aprons that lie close, paved, so they meet as one surface."""
    strips = _laid_strips(chains)
    if not strips:
        return []
    tile = _tile_box(ground)
    cover = ApronCover(aprons) if aprons else None
    surfaced = shapely.union_all([strip for _, strip in strips] + ([_footprint(aprons)] if aprons else []))
    reach = GAP_PAVED_M / 2
    gaps = shapely.intersection(surfaced.buffer(reach).buffer(-reach).difference(surfaced), tile)
    if gaps.is_empty:
        return []
    tree = shapely.STRtree([strip for _, strip in strips])
    areas = [apron for apron in aprons if apron.area]
    area_footprint = _footprint(areas) if areas else shapely.Polygon()
    kept = []
    for cell in (cell for part in _flat(gaps) for cell in _cells(part, GAP_CELL_M)):
        beside = [strips[index][0] for index in tree.query(cell, predicate="dwithin", distance=APRON_PIN_M)]
        middle = np.array(cell.representative_point().coords)
        heights = [float(_surface_at(chain, middle)[0]) for chain in beside]
        if cover is not None:
            # An apron's height is read where the cell's outline touches it.
            touching = cover.height(shapely.get_coordinates(cell))
            heights += touching[~np.isnan(touching)].tolist()
        if heights and max(heights) - min(heights) <= GAP_MOST_STEP_M:
            kept.append(cell)
    paved = []
    for part in _flat(shapely.union_all(kept)):
        # Tucked under the roads either side, so no crack shows along them.
        grown = _flat(shapely.intersection(part.buffer(APRON_TUCK_M, join_style="mitre"), tile))
        for piece in grown:
            members = [strips[index][0] for index in tree.query(piece, predicate="dwithin", distance=APRON_PIN_M)]
            if members or cover is not None:
                tier = min((int(chain.tier.min()) for chain in members), default=TIERS.index("minor"))
                # Between two car parks there may be no road at all: paving that joins one is part of its paving.
                joins_area = piece.distance(area_footprint) < APRON_PIN_M if areas else False
                apron = _apron_of(piece, members, tier, tile, cells_m=GAP_CELL_M, cover=cover)
                # A sliver beside an apron that lies over none of it and touches no road joins nothing, and has no height to take.
                if members or not np.isnan(apron.points[:, 2]).all():
                    paved.append(replace(apron, area=joins_area))
    return paved


def under_every_apron(conformed: np.ndarray, aprons: list[Apron], ground: Ground, node_stride: int) -> np.ndarray:
    """As under_every_ribbon, for the aprons' carriageways."""
    result = conformed.copy()
    last = (conformed.shape[0] - 1) // node_stride
    node_m = ground.spacing * node_stride
    shares = np.array([(a, b, 1 - a - b) for a in np.linspace(0, 1, 5) for b in np.linspace(0, 1, 5) if a + b <= 1])
    for apron in aprons:
        road = apron.across[apron.triangles].max(1) == APRON_ACROSS
        points = np.einsum("ij,kjl->kil", shares, apron.points[apron.triangles[road]]).reshape(-1, 3)
        column = (points[:, 0] - ground.west) / node_m
        row = (ground.north - points[:, 1]) / node_m
        for rounded_row in (np.floor(row), np.ceil(row)):
            for rounded_column in (np.floor(column), np.ceil(column)):
                r, c = rounded_row.astype(int), rounded_column.astype(int)
                inner = (r > 0) & (r < last) & (c > 0) & (c < last)
                np.minimum.at(result, (r[inner] * node_stride, c[inner] * node_stride), points[inner, 2] - CLEARANCE_M)
    return result


def aprons_on_ground(aprons: list[Apron], nodes: np.ndarray, step: float, west: float, north: float) -> list[Apron]:
    """The aprons with their shoulders run out to the finished ground. Where the land falls away further, as a ribbon's, a shoulder stays a deck: reaching down it would be a wall across whatever passes beneath."""
    finished = []
    for apron in aprons:
        points = apron.points.copy()
        edge = points[apron.outer, 2]
        land = surface_height(nodes, step, west, north, points[apron.outer, :2])
        points[apron.outer, 2] = np.where(land < edge - SHOULDER_LONGEST_DROP_M, edge, land)
        finished.append(replace(apron, points=points))
    return finished


@dataclass
class Fields:
    """For each corner of the tile's 2 m raster, the road station nearest it."""

    distance: np.ndarray  # From the centreline.
    half: np.ndarray
    road_z: np.ndarray
    shoulder: np.ndarray
    blend: np.ndarray
    owner: np.ndarray  # Which chain that station is on: the lower the number, the greater the road.


def _apron_stations(aprons: list[Apron], ground: Ground) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Every 2 m corner under an apron's carriageway, with the height it stands at and how far its land eases back."""
    cover = ApronCover(aprons)
    size = ground.tile_corners().shape[0]
    found: list[tuple[np.ndarray, np.ndarray, np.ndarray]] = []
    for apron in aprons:
        road = apron.points[apron.across == APRON_ACROSS]
        columns = np.arange(max(int((road[:, 0].min() - ground.west) // ground.spacing), 0), min(int((road[:, 0].max() - ground.west) // ground.spacing) + 2, size))
        rows = np.arange(max(int((ground.north - road[:, 1].max()) // ground.spacing), 0), min(int((ground.north - road[:, 1].min()) // ground.spacing) + 2, size))
        if len(columns) == 0 or len(rows) == 0:
            continue
        lattice = np.stack(np.meshgrid(ground.west + columns * ground.spacing, ground.north - rows * ground.spacing), axis=-1).reshape(-1, 2)
        height = cover.height(lattice)
        solid = ~np.isnan(height) & ~ground.is_water(lattice)
        found.append((lattice[solid], height[solid], np.full(int(solid.sum()), APRON_BLEND_M[TIERS[apron.tier]])))
    if not found:
        return np.zeros((0, 2)), np.zeros(0), np.zeros(0)
    return tuple(np.concatenate(parts) for parts in zip(*found))


def road_fields(chains: list[Chain], ground: Ground, aprons: list[Apron] = ()) -> Fields:
    corners = ground.tile_corners()
    size = corners.shape[0]
    seeds = np.full((size, size), -1, dtype=np.int32)
    laid = [chain for chain in chains if len(chain.kept) >= 2]
    xy = np.concatenate([chain.centre[:, :2] for chain in laid])
    normal, shoulder, blend, span = [np.concatenate([getattr(chain, name)[chain.kept] for chain in laid]) for name in ("normal", "shoulder", "blend", "span")]
    owner = np.concatenate([np.full(len(chain.kept), chain.index) for chain in laid])
    middle = np.concatenate([chain.centre[:, 2] for chain in laid])
    left = np.concatenate([chain.left for chain in laid])
    right = np.concatenate([chain.right for chain in laid])
    half_left = np.hypot(*(left[:, :2] - xy).T)
    half_right = np.hypot(*(right[:, :2] - xy).T)
    # An apron shapes the land round it as a ribbon does, or that land stays the raw ground and the apron ends on a step.
    # Its stations come last, so a ribbon keeps any raster cell the two share.
    apron_xy, apron_z, apron_blend = _apron_stations(list(aprons), ground)
    extra = len(apron_xy)
    apron_points = np.column_stack((apron_xy, apron_z))
    xy = np.concatenate((xy, apron_xy))
    normal = np.concatenate((normal, np.tile((1.0, 0.0), (extra, 1))))
    shoulder = np.concatenate((shoulder, np.full(extra, APRON_SHOULDER_M)))
    blend = np.concatenate((blend, apron_blend))
    span = np.concatenate((span, np.zeros(extra, dtype=bool)))
    owner = np.concatenate((owner, np.full(extra, len(chains))))
    middle = np.concatenate((middle, apron_z))
    left = np.concatenate((left, apron_points))
    right = np.concatenate((right, apron_points))
    half_left = np.concatenate((half_left, np.zeros(extra)))
    half_right = np.concatenate((half_right, np.zeros(extra)))
    rows = np.clip(np.round((ground.north - xy[:, 1]) / ground.spacing).astype(int), 0, size - 1)
    columns = np.clip(np.round((xy[:, 0] - ground.west) / ground.spacing).astype(int), 0, size - 1)
    # The greatest roads go last, so they hold a raster cell two stations share. A span shapes no land.
    # A tile whose only road is a pier still needs a nearest station for every cell, and shapes no land either.
    laid_on_land = np.flatnonzero(~span)[::-1] if not span.all() else np.arange(len(span))[::-1]
    seeds[rows[laid_on_land], columns[laid_on_land]] = laid_on_land
    nearest_cell = ndimage.distance_transform_edt(seeds < 0, return_distances=False, return_indices=True)
    station = seeds[nearest_cell[0], nearest_cell[1]]

    grid_rows, grid_columns = np.mgrid[0:size, 0:size]
    east = ground.west + grid_columns * ground.spacing
    north = ground.north - grid_rows * ground.spacing
    offset_east, offset_north = east - xy[station, 0], north - xy[station, 1]
    across = offset_east * normal[station, 0] + offset_north * normal[station, 1]
    half = np.where(across >= 0, half_left[station], half_right[station])
    side = np.where(across >= 0, left[station, 2], right[station, 2])
    share = np.minimum(np.abs(across) / np.maximum(half, 1e-6), 1)
    road_z = middle[station] + share * (side - middle[station])
    distance = np.full_like(offset_east, np.inf) if span.all() else np.hypot(offset_east, offset_north)
    return Fields(distance, half, road_z, shoulder[station], blend[station], owner[station])


def conform_ground(raw: np.ndarray, fields: Fields, spacing: float = STATION_M) -> np.ndarray:
    """The land cut or filled to just under each road, and easing back to itself beyond."""
    flat_to = fields.half + fields.shoulder + NODE_REACH_M
    towards_land = _smoothstep((fields.distance - flat_to) / fields.blend)
    conformed = fields.road_z - CLEARANCE_M + towards_land * (raw - (fields.road_z - CLEARANCE_M))
    size = raw.shape[0]
    index = np.arange(size) * spacing
    from_edge = np.minimum(index, index[::-1])
    fade = np.minimum(from_edge[:, None], from_edge[None, :]) / EDGE_FADE_M
    return raw + np.clip(fade, 0, 1) * (conformed - raw)


def under_every_ribbon(conformed: np.ndarray, chains: list[Chain], ground: Ground, node_stride: int) -> np.ndarray:
    """Presses down any mesh node of a cell a carriageway crosses, so no triangle comes up through a road.

    The nodes on the tile's edge stay: a neighbour shares them.
    """
    result = conformed.copy()
    last = (conformed.shape[0] - 1) // node_stride
    node_m = ground.spacing * node_stride
    for chain in chains:
        if len(chain.kept) < 2:
            continue
        for share in np.linspace(0, 1, 5):
            for side in (chain.left, chain.right):
                points = chain.centre + share * (side - chain.centre)
                column = (points[:, 0] - ground.west) / node_m
                row = (ground.north - points[:, 1]) / node_m
                for rounded_row in (np.floor(row), np.ceil(row)):
                    for rounded_column in (np.floor(column), np.ceil(column)):
                        r, c = rounded_row.astype(int), rounded_column.astype(int)
                        inner = (r > 0) & (r < last) & (c > 0) & (c < last)
                        np.minimum.at(result, (r[inner] * node_stride, c[inner] * node_stride), points[inner, 2] - CLEARANCE_M)
    return result


class ApronCover:
    """How high the aprons' carriageways stand at a place."""

    def __init__(self, aprons: list[Apron]):
        road = [apron.points[apron.triangles[apron.across[apron.triangles].max(1) == APRON_ACROSS]] for apron in aprons]
        self.triangles = np.concatenate(road) if road else np.zeros((0, 3, 3))
        self.tree = shapely.STRtree(shapely.polygons(np.concatenate((self.triangles[:, :, :2], self.triangles[:, :1, :2]), axis=1)))

    def height(self, xy: np.ndarray) -> np.ndarray:
        """NaN where no apron is."""
        height = np.full(len(xy), np.nan)
        at, triangle = self.tree.query(shapely.points(xy), predicate="intersects")
        a, b, c = np.moveaxis(self.triangles[triangle], 1, 0)
        across = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
        solid = np.abs(across) > 1e-9
        offset = xy[at[solid]] - c[solid, :2]
        first = ((b[solid, 1] - c[solid, 1]) * offset[:, 0] + (c[solid, 0] - b[solid, 0]) * offset[:, 1]) / across[solid]
        second = ((c[solid, 1] - a[solid, 1]) * offset[:, 0] + (a[solid, 0] - c[solid, 0]) * offset[:, 1]) / across[solid]
        height[at[solid]] = first * a[solid, 2] + second * b[solid, 2] + (1 - first - second) * c[solid, 2]
        return height


def apron_footprints(aprons: list[Apron]) -> list[tuple[np.ndarray, np.ndarray]]:
    """Each apron triangle as a little ribbon, for what's drawn from ribbons' carriageways: the mask and the clearing of trees."""
    footprints = []
    for apron in aprons:
        road = apron.across[apron.triangles].max(1) == APRON_ACROSS
        a, b, c = np.moveaxis(apron.points[apron.triangles[road]], 1, 0)
        rings = np.zeros((len(a), 2, RINGS, 3), dtype=np.float32)
        rings[:, 0, :] = a[:, None]
        rings[:, 1, :] = c[:, None]
        rings[:, 0, 3] = b
        rings[:, 1, 3] = c
        footprints += [(ring, np.full(2, apron.tier, dtype=np.uint8)) for ring in rings]
    return footprints


def surface_height(nodes: np.ndarray, step: float, west: float, north: float, xy: np.ndarray) -> np.ndarray:
    """The drawn ground at points, on the triangles the game's terrain mesh makes of each cell."""
    last = nodes.shape[0] - 1
    column_at = np.clip((xy[..., 0] - west) / step, 0, last)
    row_at = np.clip((north - xy[..., 1]) / step, 0, last)
    column = np.minimum(np.floor(column_at).astype(int), last - 1)
    row = np.minimum(np.floor(row_at).astype(int), last - 1)
    across = column_at - column
    down = row_at - row
    north_west = nodes[row, column]
    north_east = nodes[row, column + 1]
    south_west = nodes[row + 1, column]
    south_east = nodes[row + 1, column + 1]
    upper = north_west + across * (north_east - north_west) + down * (south_west - north_west)
    lower = south_east + (1 - across) * (south_west - south_east) + (1 - down) * (north_east - south_east)
    return np.where(across + down <= 1, upper, lower)


def _thin_sections(rings: np.ndarray, distance: np.ndarray) -> np.ndarray:
    """Which cross-sections to keep: the fewest that leave the road within KEEP_WITHIN_M of the dense one."""
    carriageway = rings[:, 1:4]
    kept = [0]
    anchor = 0
    index = 2
    while index < len(rings):
        span = distance[index] - distance[anchor]
        between = np.arange(anchor + 1, index)
        share = (distance[between] - distance[anchor]) / span
        straight = carriageway[anchor][None] + share[:, None, None] * (carriageway[index] - carriageway[anchor])[None]
        if span > LONGEST_SECTION_M or np.abs(straight - carriageway[between]).max() > KEEP_WITHIN_M:
            anchor = index - 1
            kept.append(anchor)
        index += 1
    if kept[-1] != len(rings) - 1:
        kept.append(len(rings) - 1)
    return np.array(kept)


def ribbon_of(chain: Chain, nodes: np.ndarray, step: float, west: float, north: float, fields: Fields, spacing: float, ground: Ground, cover: ApronCover) -> tuple[np.ndarray, np.ndarray, list[tuple[int, int]]]:
    """A chain's kept cross-sections as rings of (x, y, z), each section's tier, and the sections each span runs between."""
    keep = chain.kept
    span = chain.span[keep]
    shoulder = chain.shoulder[keep][:, None] * chain.normal[keep]
    outer_left_xy = chain.left[:, :2] + shoulder
    outer_right_xy = chain.right[:, :2] - shoulder
    # Read just past the edge: a thin wedge of apron can lie over a shoulder's inner part and stop short of its outer point.
    just_past = APRON_SHOULDER_READ_M * chain.normal[keep]
    apron_over_left, apron_over_right = cover.height(chain.left[:, :2] + just_past), cover.height(chain.right[:, :2] - just_past)

    def outer(xy: np.ndarray, edge: np.ndarray, apron: np.ndarray) -> np.ndarray:
        height = surface_height(nodes, step, west, north, xy)
        columns = np.clip(np.round((xy[:, 0] - west) / spacing).astype(int), 0, fields.distance.shape[0] - 1)
        rows = np.clip(np.round((north - xy[:, 1]) / spacing).astype(int), 0, fields.distance.shape[0] - 1)
        under = fields.distance[rows, columns] < fields.half[rows, columns] - 0.05
        lowered = np.minimum(height, fields.road_z[rows, columns] - UNDER_ANOTHER_ROAD_M)
        # Where the land falls away (a road on a bridge, or over an underpass) the shoulder stays a deck: reaching
        # down to the ground it would be a wall across whatever passes beneath.
        drawn = np.maximum(np.where(under, lowered, height), edge - SHOULDER_LONGEST_DROP_M)
        laid = np.where(span, edge, drawn)
        # A shoulder running on under an apron stands nearly level with it, and a surface that close flickers through.
        return np.column_stack((xy, np.where(np.isnan(apron), laid, np.minimum(laid, apron - UNDER_ANOTHER_ROAD_M))))

    # A road's own apron is no greater road to it: their heights are pinned to each other.
    own_apron = np.zeros(len(keep), dtype=bool)
    for _, cut, _ in chain.landings:
        own_apron |= np.abs(keep - cut) <= APRON_REACH_STATIONS + 1

    def beneath_greater_roads(points: np.ndarray) -> np.ndarray:
        """Where a lesser road runs across a greater one with no junction, such as a path, it passes just under: the greater road's surface is the one a car meets."""
        columns = np.clip(np.round((points[:, 0] - west) / spacing).astype(int), 0, fields.distance.shape[0] - 1)
        rows = np.clip(np.round((north - points[:, 1]) / spacing).astype(int), 0, fields.distance.shape[0] - 1)
        crossing = (fields.distance[rows, columns] < fields.half[rows, columns] - 0.05) & (fields.owner[rows, columns] < chain.index)
        lowered = np.where(crossing, np.minimum(points[:, 2], fields.road_z[rows, columns] - BENEATH_GREATER_ROAD_M), points[:, 2])
        # An apron is the greater road to any track or path crossing it. The roads it joins stop at its edge by themselves.
        if not chain.motor or chain.kind.rank > LEAST_APRON_RANK:
            apron = cover.height(points[:, :2].astype(float))
            lowered = np.where(np.isnan(apron) | own_apron, lowered, np.minimum(lowered, apron - BENEATH_GREATER_ROAD_M))
        return np.column_stack((points[:, :2], lowered))

    left, centre, right = (beneath_greater_roads(points) for points in (chain.left, chain.centre, chain.right))
    for station in (0, -1):
        if _on_tile_edge(ground, chain.centre[station]):
            left[station], centre[station], right[station] = chain.left[station], chain.centre[station], chain.right[station]
    rings = np.stack((outer(outer_left_xy, left[:, 2], apron_over_left), left, centre, right, outer(outer_right_xy, right[:, 2], apron_over_right)), axis=1)
    # A seam section may reach over the edge, so its outer points take the land both tiles agree on, and it's rounded so they match.
    for station in (0, -1):
        if _on_tile_edge(ground, rings[station, 2, :2]):
            rings[station, [0, 4], 2] = ground.sample(rings[station, [0, 4], :2])
            rings[station] = np.round(rings[station], 3)
    steps = np.hypot(*np.diff(chain.centre[:, :2], axis=0).T)
    distance = np.concatenate(([0], np.cumsum(steps)))
    thin = _thin_sections(rings, distance)
    # A span's first and last stations stay, so its ends are where the land stops and not a section short of it.
    ends = np.flatnonzero(np.diff(span.astype(np.int8)))
    # So do those either side of where a shoulder goes under an apron.
    under_apron = ~(np.isnan(apron_over_left) & np.isnan(apron_over_right))
    tucks = np.flatnonzero(np.diff(under_apron.astype(np.int8)))
    kept = np.union1d(thin, np.concatenate((ends, ends + 1, tucks, tucks + 1)))
    return rings[kept].astype(np.float32), chain.tier[keep][kept], _runs(span[kept])


@dataclass
class Surface:
    chains: list[Chain]
    conformed: np.ndarray  # The ground's heights at every 2 m corner of the tile.
    aprons: list[Apron]
    fields: Fields
    spacing: float
    ground: Ground


def ribbons(surface: Surface, nodes: np.ndarray, step: float, west: float, north: float) -> list[tuple[Chain, np.ndarray, np.ndarray, list[tuple[int, int]]]]:
    """Every chain long enough to have a surface, greatest first, as its rings, tiers and spans."""
    made = []
    cover = ApronCover(surface.aprons)
    for chain in surface.chains:
        if len(chain.kept) >= 2:
            made.append((chain, *ribbon_of(chain, nodes, step, west, north, surface.fields, surface.spacing, surface.ground, cover)))
    return made


def lay_roads(roads: list[dict], ground: Ground, paved: list[shapely.Polygon] = (), whole: dict[int, list] | None = None) -> Surface:
    """Every road on the tile as a surface, with its car parks and bus stations, and the ground fitted to them. `whole` is each
    OSM way's line before it was clipped to the tile."""
    areas = shapely.union_all(list(paved))
    reached = areas.buffer(PAVED_REACH_M)
    chains = chains_from(split_at_junctions([part for road in roads for part in _off_paved(road, areas, reached, whole or {})]))
    for chain in chains:
        lay_chain(chain, chains, ground)
    aprons = lay_aprons(chains, ground)
    aprons += lay_paved(list(paved), chains, aprons, ground)
    aprons += lay_gaps(chains, aprons, ground)
    # The areas last, so the tile can say where they start.
    aprons = sorted(_shoulders_on_land(aprons, chains), key=lambda apron: apron.area)
    fields = road_fields(chains, ground, aprons)
    conformed = under_every_ribbon(conform_ground(ground.tile_corners(), fields, ground.spacing), chains, ground, NODE_STRIDE)
    conformed = under_every_apron(conformed, aprons, ground, NODE_STRIDE)
    return Surface(chains, conformed, aprons, fields, ground.spacing, ground)
