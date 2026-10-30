"""OSM's road lines into one drivable surface, and the land blended into it.

The roads' lines become chains: continuous drives that run through a junction
the way a driver would, the highest class first, so a lesser road ends on the
road it meets. Each chain is rounded along its length, given a smooth height
profile, a crown and banking, and written as a ribbon of cross-sections. Those
ribbons are the surface, drawn and collided with alike. The ground is then cut
or filled to lie just under them, and eases back to the real land beyond.

Everything here is a pure function of the lines and the heights. A tile's edge
row of heights is never changed, and a road crossing that edge takes its height
and slope from the elevation model round the crossing, which both tiles see the
same, so two neighbours built apart meet.
"""

from dataclasses import dataclass, field

import numpy as np
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

# How a lesser road meets the one it ends on.
JUNCTION_APPROACH_M = 16.0
JUNCTION_FLARE_M = 12.0
UNDER_ANOTHER_ROAD_M = 0.3

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
    flare_m: float


_PRIMARY = RoadClass(0, "main", 7.5, 14, 280, 0.025, 0.05, 2.5, 16, 2.5)
_SECONDARY = RoadClass(1, "main", 7, 12, 240, 0.025, 0.05, 2.5, 14, 2.5)
_TERTIARY = RoadClass(2, "main", 6, 10, 180, 0.025, 0.04, 2, 12, 2.5)
_MINOR = RoadClass(3, "minor", 4.5, 8, 120, 0.02, 0.03, 1.5, 8, 2)
_SERVICE = RoadClass(4, "minor", 3.5, 5, 70, 0.02, 0, 1.2, 6, 1.5)
_TRACK = RoadClass(5, "track", 2.5, 4, 50, 0.015, 0, 1, 5, 1)
_PATH = RoadClass(6, "track", 2, 3, 30, 0.01, 0, 0.8, 4, 0)
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

    def __init__(self, corners: np.ndarray, west: float, north: float, rim: int, spacing: float = STATION_M):
        self.corners = corners
        self.west = west
        self.north = north
        self.rim = rim
        self.spacing = spacing

    def sample(self, xy: np.ndarray) -> np.ndarray:
        columns = (xy[..., 0] - self.west) / self.spacing + self.rim
        rows = (self.north - xy[..., 1]) / self.spacing + self.rim
        return ndimage.map_coordinates(self.corners, [rows.ravel(), columns.ravel()], order=1, mode="nearest").reshape(rows.shape)

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
        self.kind = class_of(self.road["kind"])

    @property
    def length(self) -> float:
        return float(np.hypot(*np.diff(self.points, axis=0).T).sum())


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
    bank: np.ndarray = field(default=None)  # Rise per metre towards the left.
    crown: np.ndarray = field(default=None)
    shoulder: np.ndarray = field(default=None)
    blend: np.ndarray = field(default=None)
    tier: np.ndarray = field(default=None)
    left: np.ndarray = field(default=None)  # (x, y, z) of the road's left edge.
    right: np.ndarray = field(default=None)
    centre: np.ndarray = field(default=None)
    kept: np.ndarray = field(default=None)  # Stations left once the ends are cut to the roads they land on.
    tree: cKDTree = field(default=None)

    @property
    def kind(self) -> RoadClass:
        return min((edge.kind for edge in self.edges), key=lambda kind: kind.rank)

    @property
    def kind_name(self) -> str:
        return min(self.edges, key=lambda edge: edge.kind.rank).road["kind"]

    @property
    def motor(self) -> bool:
        return any(edge.road["motor"] for edge in self.edges)

    def tag(self, key: str):
        return next((edge.road[key] for edge in self.edges if key in edge.road), None)

    def plane(self, xy: np.ndarray) -> np.ndarray:
        """This chain's surface at points, its nearest cross-section carried on past the edges."""
        _, nearest = self.tree.query(xy)
        across = ((xy - self.xy[nearest]) * self.normal[nearest]).sum(-1)
        return self.height[nearest] - self.crown[nearest] * np.abs(across) + self.bank[nearest] * across


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

    def walk(node: tuple, heading: np.ndarray, own: set[tuple]) -> list[tuple[Edge, bool]]:
        walked = []
        while node not in claimed and node not in own:
            own.add(node)
            options = []
            for edge in at_node[node]:
                if id(edge) in used:
                    continue
                forwards = edge.start == node
                onward = edge.points[1] - edge.points[0] if forwards else edge.points[-2] - edge.points[-1]
                turn = np.arccos(np.clip(onward @ heading / np.hypot(*onward), -1, 1))
                options.append((turn, edge, forwards))
            if not options:
                break
            turn, edge, forwards = min(options, key=lambda option: option[0])
            if len(at_node[node]) > 2 and turn > np.radians(55):
                break
            used.add(id(edge))
            walked.append((edge, forwards))
            node = edge.end if forwards else edge.start
            heading = _heading(edge, forwards)
        return walked

    for seed in sorted(edges, key=lambda edge: (edge.kind.rank, -edge.length)):
        if id(seed) in used:
            continue
        used.add(id(seed))
        own: set[tuple] = {seed.start}
        ahead = walk(seed.end, _heading(seed, True), own)
        behind = walk(seed.start, _heading(seed, False), own - {seed.start})
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


def _edge_pin(ground: Ground, point: np.ndarray, half: float) -> tuple[float, float, float]:
    """The land's height and gradient at a tile-edge crossing, from what both tiles can see."""
    spacing = ground.spacing
    steps = int(EDGE_PIN_RADIUS_M / spacing)
    offsets = np.arange(-steps, steps + 1) * spacing
    east, north = np.meshgrid(offsets, offsets)
    inside = east**2 + north**2 <= EDGE_PIN_RADIUS_M**2
    east, north = east[inside], north[inside]
    heights = ground.sample(np.column_stack((point[0] + east, point[1] + north)))
    fit = np.linalg.lstsq(np.column_stack((east, north, np.ones_like(east))), heights, rcond=None)[0]
    along = np.arange(-half, half + spacing, spacing)
    row = ground.sample(np.column_stack((point[0] + along, np.full_like(along, point[1])))).max()
    column = ground.sample(np.column_stack((np.full_like(along, point[0]), point[1] + along))).max()
    on_row = min(abs(point[1] - ground.north), abs(point[1] - (ground.north - ground.size_m))) < 1e-6
    on_column = min(abs(point[0] - ground.west), abs(point[0] - (ground.west + ground.size_m))) < 1e-6
    clear = float(max(row if on_row else -np.inf, column if on_column else -np.inf))
    return max(float(fit[2]), clear + EDGE_PIN_LIFT_M), float(fit[0]), float(fit[1])


def _on_tile_edge(ground: Ground, point: np.ndarray) -> bool:
    east, north = point[0] - ground.west, ground.north - point[1]
    size = ground.size_m
    return min(east, north, size - east, size - north) < 1e-6


def _ends_of(chain: Chain) -> tuple[np.ndarray, np.ndarray]:
    return chain.edges[0].points[0], chain.edges[-1].points[-1]


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
    tangent = np.gradient(xy, axis=0)
    tangent /= np.maximum(np.hypot(tangent[:, 0], tangent[:, 1])[:, None], 1e-9)
    normal = np.column_stack((-tangent[:, 1], tangent[:, 0]))

    half = smooth([kind.width_m / 2 for kind in kinds], 6)
    crown = smooth([kind.crown for kind in kinds], 6)
    bank_limit = smooth([kind.bank_limit for kind in kinds], 6)

    heading = np.unwrap(np.arctan2(tangent[:, 1], tangent[:, 0]))
    curvature = np.gradient(heading, STATION_M)
    # A left-hand bend (heading rising) lifts the right side, so the rise towards the left is negative.
    bank = -np.clip(curvature * BANK_SPEED_M_S**2 / GRAVITY, -bank_limit, bank_limit)
    bank = smooth(bank, BANK_SMOOTHING_M)

    across = np.linspace(-0.6, 0.6, 3)[None, :, None]
    spread = xy[:, None, :] + normal[:, None, :] * half[:, None, None] * across
    ideal = np.median(ground.sample(spread), axis=1)
    bridge = np.array([chain.edges[index].road.get("bridge") not in (None, "no") for index in which])
    weights = np.where(bridge, 0.0, 1.0)

    pins: list[tuple[int, float]] = []
    slopes: list[tuple[int, int, float]] = []
    for parent, end, station, next_station in ((starts_on, 0, 0, 1), (ends_on, -1, len(xy) - 1, len(xy) - 2)):
        here = xy[station]
        if parent is not None:
            pins.append((station, float(parent.plane(here[None])[0])))
        elif _on_tile_edge(ground, here) and len(xy) > 2:
            height, rise_east, rise_north = _edge_pin(ground, here, float(half[station]))
            pins.append((station, height))
            step = xy[next_station] - here
            slopes.append((station, next_station, rise_east * step[0] + rise_north * step[1]))

    chain.xy, chain.tangent, chain.normal, chain.half = xy, tangent, normal, half
    chain.crown, chain.bank = crown, bank
    chain.shoulder = smooth([kind.shoulder_m for kind in kinds], 6)
    chain.blend = smooth([kind.blend_m for kind in kinds], 6)
    chain.tier = np.array([TIERS.index(kind.tier) for kind in kinds], dtype=np.uint8)
    chain.height = _smoothed_profile(ideal, weights, chain.kind.wavelength_m, pins, slopes)
    chain.tree = cKDTree(xy)
    _cut_sections(chain, along, starts_on, ends_on)


def _smoothstep(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def _cut_sections(chain: Chain, along: np.ndarray, starts_on: Chain | None, ends_on: Chain | None) -> None:
    """Each station's left, centre and right points, with the ends joined to the roads they land on."""
    length = along[-1]
    flare = chain.kind.flare_m
    half = chain.half.copy()
    if starts_on is not None:
        half += flare * (1 - np.clip(along / JUNCTION_FLARE_M, 0, 1)) ** 2
    if ends_on is not None:
        half += flare * (1 - np.clip((length - along) / JUNCTION_FLARE_M, 0, 1)) ** 2
    falls = chain.crown * chain.half
    rises = chain.bank * chain.half
    left_xy = chain.xy + chain.normal * half[:, None]
    right_xy = chain.xy - chain.normal * half[:, None]
    left_z = chain.height - falls + rises
    right_z = chain.height - falls - rises
    centre_z = chain.height.copy()

    first, last = 0, len(along) - 1
    for parent, distance, keeps_first in ((starts_on, along, True), (ends_on, length - along, False)):
        if parent is None:
            continue
        near = distance < JUNCTION_APPROACH_M
        share = _smoothstep(1 - distance[near] / JUNCTION_APPROACH_M)
        left_z[near] += share * (parent.plane(left_xy[near]) - left_z[near])
        right_z[near] += share * (parent.plane(right_xy[near]) - right_z[near])
        centre_z[near] += share * (parent.plane(chain.xy[near]) - centre_z[near])
        left_inside = _slide_to_edge(parent, left_xy, left_z, near)
        right_inside = _slide_to_edge(parent, right_xy, right_z, near)
        inside = left_inside & right_inside
        if keeps_first:
            outside = np.nonzero(~inside)[0]
            first = max(first, int(outside[0]) - 1) if len(outside) else first
        else:
            outside = np.nonzero(~inside)[0]
            last = min(last, int(outside[-1]) + 1) if len(outside) else last

    keep = np.arange(max(first, 0), min(last, len(along) - 1) + 1)
    chain.left = np.column_stack((left_xy, left_z))[keep]
    chain.right = np.column_stack((right_xy, right_z))[keep]
    chain.centre = np.column_stack((chain.xy, centre_z))[keep]
    chain.kept = keep


def _slide_to_edge(parent: Chain, xy: np.ndarray, z: np.ndarray, near: np.ndarray) -> np.ndarray:
    """Moves points on the greater road's carriageway out to its edge. True where a point was on it."""
    inside = np.zeros(len(xy), dtype=bool)
    indices = np.nonzero(near)[0]
    if len(indices) == 0:
        return inside
    _, nearest = parent.tree.query(xy[indices])
    offset = xy[indices] - parent.xy[nearest]
    across = (offset * parent.normal[nearest]).sum(-1)
    ahead = (offset * parent.tangent[nearest]).sum(-1)
    on_it = (np.abs(across) < parent.half[nearest]) & (np.abs(ahead) <= STATION_M)
    moved = parent.xy[nearest] + parent.normal[nearest] * (np.sign(across) * parent.half[nearest])[:, None]
    xy[indices[on_it]] = moved[on_it]
    z[indices[on_it]] = parent.plane(moved[on_it])
    inside[indices[on_it]] = True
    return inside


@dataclass
class Fields:
    """For each corner of the tile's 2 m raster, the road station nearest it."""

    distance: np.ndarray  # From the centreline.
    half: np.ndarray
    road_z: np.ndarray
    shoulder: np.ndarray
    blend: np.ndarray


def road_fields(chains: list[Chain], ground: Ground) -> Fields:
    corners = ground.tile_corners()
    size = corners.shape[0]
    seeds = np.full((size, size), -1, dtype=np.int32)
    laid = [chain for chain in chains if len(chain.kept) >= 2]
    xy = np.concatenate([chain.centre[:, :2] for chain in laid])
    normal, shoulder, blend = [np.concatenate([getattr(chain, name)[chain.kept] for chain in laid]) for name in ("normal", "shoulder", "blend")]
    middle = np.concatenate([chain.centre[:, 2] for chain in laid])
    left = np.concatenate([chain.left for chain in laid])
    right = np.concatenate([chain.right for chain in laid])
    half_left = np.hypot(*(left[:, :2] - xy).T)
    half_right = np.hypot(*(right[:, :2] - xy).T)
    rows = np.clip(np.round((ground.north - xy[:, 1]) / ground.spacing).astype(int), 0, size - 1)
    columns = np.clip(np.round((xy[:, 0] - ground.west) / ground.spacing).astype(int), 0, size - 1)
    # The greatest roads go last, so they hold a raster cell two stations share.
    seeds[rows[::-1], columns[::-1]] = np.arange(len(xy))[::-1]
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
    return Fields(np.hypot(offset_east, offset_north), half, road_z, shoulder[station], blend[station])


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


def ribbon_of(chain: Chain, nodes: np.ndarray, step: float, west: float, north: float, fields: Fields, spacing: float) -> tuple[np.ndarray, np.ndarray]:
    """A chain's kept cross-sections as rings of (x, y, z), and each section's tier."""
    keep = chain.kept
    shoulder = chain.shoulder[keep][:, None] * chain.normal[keep]
    outer_left_xy = chain.left[:, :2] + shoulder
    outer_right_xy = chain.right[:, :2] - shoulder

    def outer(xy: np.ndarray) -> np.ndarray:
        height = surface_height(nodes, step, west, north, xy)
        columns = np.clip(np.round((xy[:, 0] - west) / spacing).astype(int), 0, fields.distance.shape[0] - 1)
        rows = np.clip(np.round((north - xy[:, 1]) / spacing).astype(int), 0, fields.distance.shape[0] - 1)
        under = fields.distance[rows, columns] < fields.half[rows, columns] - 0.05
        lowered = np.minimum(height, fields.road_z[rows, columns] - UNDER_ANOTHER_ROAD_M)
        return np.column_stack((xy, np.where(under, lowered, height)))

    rings = np.stack((outer(outer_left_xy), chain.left, chain.centre, chain.right, outer(outer_right_xy)), axis=1)
    steps = np.hypot(*np.diff(chain.centre[:, :2], axis=0).T)
    distance = np.concatenate(([0], np.cumsum(steps)))
    thin = _thin_sections(rings, distance)
    return rings[thin].astype(np.float32), chain.tier[keep][thin]


@dataclass
class Surface:
    chains: list[Chain]
    conformed: np.ndarray  # The ground's heights at every 2 m corner of the tile.
    fields: Fields
    spacing: float


def ribbons(surface: Surface, nodes: np.ndarray, step: float, west: float, north: float) -> list[tuple[Chain, np.ndarray, np.ndarray]]:
    """Every chain long enough to have a surface, greatest first, as its rings and tiers."""
    made = []
    for chain in surface.chains:
        if len(chain.kept) >= 2:
            rings, tiers = ribbon_of(chain, nodes, step, west, north, surface.fields, surface.spacing)
            made.append((chain, rings, tiers))
    return made


def lay_roads(roads: list[dict], ground: Ground) -> Surface:
    """Every road on the tile as a surface, and the ground fitted to them."""
    chains = chains_from(split_at_junctions(roads))
    for chain in chains:
        lay_chain(chain, chains, ground)
    fields = road_fields(chains, ground)
    conformed = under_every_ribbon(conform_ground(ground.tile_corners(), fields, ground.spacing), chains, ground, NODE_STRIDE)
    return Surface(chains, conformed, fields, ground.spacing)
