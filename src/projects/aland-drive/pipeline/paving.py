"""The road network as one paved surface, and the ground built round it (`docs/ROAD-SURFACES.md`).

Every way's outline is merged with the others' into one paved shape for each level, so a junction, a merge, a sidewalk
along its street and a car park are parts of one shape with nothing to join. The shape is cut along each way's own
outline, so every piece still knows whose it is and keeps that way's look. Its heights come from one solve: each piece
leans towards its own way's cross-section, the greater way more stiffly, and neighbouring points keep the differences
that way's surface has between them, so where two ways' surfaces disagree the lesser bends to meet the greater, with
no step anywhere. The ground isn't pressed under the paving but cut along its edge: every 4 m cell the paving touches is
triangulated between its own corners and the paving's edge, so the two share their points, and beyond the edge the land
may rise or fall away no faster than a bank or a cutting.
"""

from dataclasses import dataclass

import numpy as np
import shapely
from scipy import ndimage, sparse
from scipy.sparse.linalg import spsolve
from scipy.spatial import cKDTree

from path_surfaces import HARD_SURFACES, NONE, SLAB, way_class
from roads import (
    APRON_ACROSS,
    APRON_CORNER_M,
    APRON_LEAST_CORNER_M,
    CLEARANCE_M,
    EDGE_FADE_M,
    GAP_MOST_STEP_M,
    GAP_PAVED_M,
    LONGEST_SECTION_M,
    NODE_STRIDE,
    PAVED_GROUND_READ_M,
    PAVED_REACH_M,
    PIN_WEIGHT,
    RINGS,
    STATION_M,
    TIERS,
    Chain,
    Ground,
    _flat,
    _off_paved,
    _runs,
    _smoothed_profile,
    _thin_sections,
    _tile_box,
    chains_from,
    lay_chain,
    split_at_junctions,
    surface_height,
)

BELOW, GROUND, ABOVE = -1, 0, 1
# Pieces of paving no single way's outline holds (a junction's corner, a gap closed between two ways), and car parks.
JUNCTION = -1
AREA = -2
AREA_RANK = 6
JUNCTION_RANK = 99
# How a piece no way's outline holds is drawn: as a shoulder, which in town is a kerb's paving.
JUNCTION_ACROSS = 1.5
# Where a piece wears a path's own surface, its points stand this far across: inside an edge, where nothing is painted.
OWN_SURFACE_ACROSS = 0.5
# Room for every way's index when an owner and its rank are packed into one number.
OWNER_CODES = 1_000_000
# The floats each point of paving carries: east, north, height, across, tier, along, its way (or JUNCTION, AREA), the
# class its way's own tags give it (`path_surfaces`), and the way its way runs, as the cosine and sine of twice its angle.
POINT_FLOATS = 10
# A way's run is snapped to steps of this, as the town's paving is (`town_ground.ALIGN_STEP`).
RUN_STEP = np.pi / 64

# Paving's outline is kept within this of each way's, which drops the 2 m stations along a straight run.
OUTLINE_WITHIN_M = 0.02
# Joins found by closing the shape: a sliver thinner than this is the closing's own rounding, not a gap.
SLIVER_M = 0.02
GRID_M = 0.02
# A point this near a triangle lies on it: a few times the millimetre points are rounded to.
ON_EDGE_M = 0.005
# How far into a triangle of cut ground the paving it borders is looked for.
BESIDE_STEP_M = 0.01
# Twice the area under which a triangle is a fold, not paving.
FLAT_TRIANGLE_M2 = 1e-6
# Ways' surfaces are compared at points this far apart round where they meet, and at most this many of them.
AGREE_SAMPLE_M = 2.0
AGREE_SAMPLES = 24
# A gap is judged a piece of this lattice at a time: judged whole, a strip running a hundred metres between a street and
# its path was left as ground all along wherever the two disagreed at any one place on it.
GAP_PIECE_M = 4.0
# Two ways that touch stand this far apart in height, along most of where they touch, when one is on a bank above the other.
BANK_STEP_M = 1.0
# A way whose surface disagrees with a greater one it touches stands this far back from it, leaving room for a bank.
KEEP_APART_M = 0.5
# No gap is closed and no corner rounded this near a tile's edge: the neighbour can't see the ways on this side.
EDGE_BAND_M = 8.0
# A way ending on a tile's edge runs on past it this far before its outline is cut there, so both tiles cut it alike.
SEAM_REACH_M = 4.0
# Within this of a tile's edge the paving is only the seam sections of the ways that cross it, which both tiles lay alike.
SEAM_BAND_M = 1.0
# A way's own surface holds its pieces this stiffly, halving with each rank down: a main road hardly bends, a path bends
# over several metres to meet it.
STIFFNESS = 1.0
SMOOTHNESS = 1.0
# Far weaker than anything else: only gives a point no way owns a height to start from.
FLOATING_WEIGHT = 1e-6
# A path within this sine of a street's direction, about 20 degrees, runs alongside it; the nearest of so many of its
# stations round each of the street's is looked at. A sidewalk nearer the street's line than this share of its half-width
# is a line drawn on the road, and the street's edges ease over this many stations where one starts or ends, and back to
# the class's own over the run into a tile's edge.
SIDEWALK_SINE = 0.35
SIDEWALK_NEIGHBOURS = 16
SIDEWALK_LEAST_SHARE = 0.5
SIDEWALK_SMOOTH_STATIONS = 2.0
SIDEWALK_SEAM_RUN_M = 40.0
# How many of the nearest paths' stations are looked at for the one a piece beside them wears.
WORN_NEIGHBOURS = 32
# Of a street's shoulder beside a sidewalk, the kerb's strip: past it, to the sidewalk, is the sidewalk's.
KERB_STRIP_M = 0.3
# Narrower than this, a sidewalk is the smoothing's own tail, not a band of paving.
LEAST_WALK_M = 0.01
# A sidewalk OSM maps on its street's own way rather than as a way of its own: this wide where it gives no width, and at
# most this wide where it does.
TAGGED_SIDEWALK_M = 2.0
TAGGED_SIDEWALK_MOST_M = 5.0
# A way meeting another at more than this sine of their angle, about 30 degrees, crosses it rather than running beside it.
CROSSING_SINE = 0.5
# A way passing under another keeps this much room under the deck above it.
UNDERPASS_CLEAR_M = 2.5
# How deep a deck's edge is drawn over an underpass, and how far under the deck an underpass's walls stop.
DECK_DEPTH_M = 0.6

# Beside the paving the land may rise or fall away no faster than this: a bank or a cutting.
EMBANKMENT_SLOPE = 0.6
# How far out a bank can reach, in passes of a corner each.
EMBANKMENT_PASSES = 24
# Cells round those the paving touches that are cut too, so the cut ground meets the plain grid on whole cell edges.
CUT_MARGIN_CELLS = 1
CUT_BLOCK_CELLS = 16
# Two triangles of cut ground further apart than this along an edge they share have a crack between them to close.
CRACK_M = 0.002


@dataclass
class Piece:
    shape: shapely.Geometry
    owner: int
    level: int
    walk: bool = False  # Its street's paving past the kerb, beside a sidewalk: it wears the sidewalk's surface.
    look: int = JUNCTION  # The path whose surface it wears, if it isn't its owner's own.


@dataclass
class GroundCut:
    cells: np.ndarray  # Row * cells + column of every 4 m cell whose ground is the cut mesh, not the grid's.
    points: np.ndarray  # (x, y, z) of the cut ground.
    triangles: np.ndarray  # The underpasses' walls last, which are drawn as concrete rather than ground.
    walls: int


@dataclass
class Paved:
    chains: list[Chain]
    conformed: np.ndarray  # The ground at every 2 m corner of the tile, as the paving shapes it.
    points: np.ndarray  # (n, POINT_FLOATS), the car parks' last.
    triangles: np.ndarray
    area_points: int
    cut_from: shapely.Geometry  # The paving's outline on every level the cut ground meets.
    cut_paving: np.ndarray  # (n, 3, 3) the paving's triangles the cut ground meets.
    walls: tuple[np.ndarray, np.ndarray]  # The underpasses' walls' points and triangles.
    crosses: dict[int, "Cross"]  # How each way's paving spreads either side of its line.
    ground: Ground

    def ground_cut(self, nodes: np.ndarray) -> GroundCut:
        """The cut ground round the paving, meeting the grid on `nodes`: the tile's heights as finally written, after
        whatever reshapes the ground once the roads are laid (the seabed under the water), so the two share every node."""
        if nodes.shape != self.conformed[::NODE_STRIDE, ::NODE_STRIDE].shape:
            raise ValueError(f"the cut ground needs the tile's {self.conformed[::NODE_STRIDE, ::NODE_STRIDE].shape} nodes, not {nodes.shape}")
        cells, points, triangles = cut_ground(self.cut_from, self.cut_paving, nodes, self.ground.spacing * NODE_STRIDE, self.ground)
        wall_points, wall_triangles = self.walls
        return GroundCut(cells, np.concatenate((points, wall_points)), np.concatenate((triangles, wall_triangles + len(points))), len(wall_triangles))


def station_levels(chain: Chain) -> np.ndarray:
    """Each station's level as OSM tags it: above on a span, below on a stretch tagged as a tunnel, the ground's everywhere
    else. `under_others` then keeps a tunnel below only where it passes under another way."""
    tunnel = np.array([chain.edges[index].road.get("tunnel") not in (None, "no", "building_passage") for index in chain.edge_at])
    return np.where(chain.span, ABOVE, np.where(tunnel, BELOW, GROUND))


def _quads(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    rings = np.stack((left[:-1], left[1:], right[1:], right[:-1], left[:-1]), axis=1)
    return shapely.buffer(shapely.polygons(rings), 0)


@dataclass
class Cross:
    """How a way's paving spreads either side of its line at each station: to its carriageway's edge, and to its paving's
    edge past that, on its left and on its right."""

    half_left: np.ndarray
    half_right: np.ndarray
    reach_left: np.ndarray
    reach_right: np.ndarray
    # How much of the paving's edge, each side, is sidewalk: past a kerb's strip of a street's shoulder, beside a sidewalk.
    walk_left: np.ndarray
    walk_right: np.ndarray

    @property
    def carriageway(self) -> tuple[np.ndarray, np.ndarray]:
        return self.half_left, self.half_right

    @property
    def paving(self) -> tuple[np.ndarray, np.ndarray]:
        return self.reach_left, self.reach_right

    @property
    def kerb(self) -> tuple[np.ndarray, np.ndarray]:
        """To the paving's edge short of its sidewalk."""
        return self.reach_left - self.walk_left, self.reach_right - self.walk_right


def cross_of(chain: Chain) -> Cross:
    """A way's own cross-section by its class: a motor road's shoulder is part of its paving, where a town street has its
    kerb and paving and a country road its stone edge; a path's ends at its edge.

    Whether a station is a motor road's is its own OSM way's: a chain carries on through a junction into a path, and which
    ways a chain holds depends on the tile, so a path ending on a tile's edge would have a shoulder on one tile only."""
    motor = np.array([chain.edges[index].road["motor"] for index in chain.edge_at], dtype=bool)
    reach = chain.half + np.where(motor, chain.shoulder, 0)
    none = np.zeros(len(chain.half))
    return Cross(chain.half.copy(), chain.half.copy(), reach.copy(), reach.copy(), none, none.copy())


def tagged_sidewalks(chain: Chain) -> tuple[np.ndarray, np.ndarray]:
    """The sidewalks a street's own OSM ways map on it, at each station: their widths, and their surfaces' classes, on the
    chain's left and on its right."""
    width = np.zeros((len(chain.xy), 2))
    surface = np.full((len(chain.xy), 2), NONE)
    for index, edge in enumerate(chain.edges):
        mine = np.flatnonzero(chain.edge_at == index)
        sides = _sidewalk_sides(edge.road)
        if not len(mine) or not sides:
            continue
        # OSM names a side as its way runs, which may be against the chain.
        line = shapely.LineString(edge.road["line"])
        along = shapely.line_locate_point(line, shapely.points(chain.xy[mine]))
        ahead = shapely.get_coordinates(shapely.line_interpolate_point(line, np.minimum(along + 1, line.length)))
        behind = shapely.get_coordinates(shapely.line_interpolate_point(line, np.maximum(along - 1, 0)))
        forwards = float(((ahead - behind) * chain.tangent[mine]).sum()) >= 0
        for side, (wide, kind) in sides.items():
            column = 0 if (side == "left") == forwards else 1
            width[mine, column], surface[mine, column] = wide, kind
    return width, surface


def _sidewalk_sides(road: dict) -> dict[str, tuple[float, int]]:
    """The sidewalks OSM maps on a way, by its side as the way runs, each one's width and surface class. `separate` says
    one is mapped as a way of its own, which `along_sidewalks` finds beside the street."""
    sides = set()
    if road.get("sidewalk") in ("both", "yes") or road.get("sidewalk:both") == "yes":
        sides |= {"left", "right"}
    elif road.get("sidewalk") in ("left", "right"):
        sides.add(road["sidewalk"])
    for side in ("left", "right"):
        if road.get(f"sidewalk:{side}") == "yes":
            sides.add(side)
        elif road.get(f"sidewalk:{side}") in ("no", "none", "separate"):
            sides.discard(side)
    found = {}
    for side in sides:
        keys = (f"sidewalk:{side}:", "sidewalk:both:", "sidewalk:")
        width = next((metres for metres in (_metres(road.get(key + "width")) for key in keys) if metres is not None), TAGGED_SIDEWALK_M)
        surface = next((HARD_SURFACES[road[key + "surface"]] for key in keys if road.get(key + "surface") in HARD_SURFACES), SLAB)
        found[side] = (min(width, TAGGED_SIDEWALK_MOST_M), surface)
    return found


def _metres(value) -> float | None:
    try:
        metres = float(str(value).removesuffix("m").strip())
    except ValueError:
        return None
    return metres if metres > 0 else None


def along_sidewalks(chains: list[Chain], crosses: dict[int, Cross]) -> set[int]:
    """A street's paving stops where a path running alongside it begins: a mapped sidewalk says where the street's edge is.

    By its class alone a street is a guessed width centred on OSM's line, which can reach over its sidewalk, and the
    greater way takes what the two share: the sidewalk was left a sliver, bitten at every crossing. Its edge line and kerb
    now stand where the sidewalk starts, and what's left of its shoulder past a kerb's strip is the sidewalk's: drawn as a
    shoulder, it faded to the photo's colour, a pale band between the street and its sidewalk. Into a tile's edge, which
    both tiles must cut alike, the street keeps its class's.

    A sidewalk the street's own tags map, on a side with no path beside it, widens the street's paving past the kerb's strip
    by the sidewalk's width, and that band is the sidewalk.

    Returns the sidewalks: the paths that run beside a street, and those OSM tags as one.
    """
    paths = [chain for chain in chains if not chain.motor and len(chain.xy) >= 2]
    sidewalks = {chain.index for chain in paths if chain.tag("footway") == "sidewalk"}
    # With no path on the tile, one far off stands in, so a street's tagged sidewalks are still laid.
    owners = np.concatenate([np.full(len(chain.xy), chain.index) for chain in paths]) if paths else np.full(1, JUNCTION)
    xy = np.concatenate([chain.xy for chain in paths]) if paths else np.full((1, 2), 1e12)
    tangent = np.concatenate([chain.tangent for chain in paths]) if paths else np.array([[1.0, 0.0]])
    half = np.concatenate([chain.half for chain in paths]) if paths else np.zeros(1)
    tree = cKDTree(xy)
    for chain in chains:
        if not chain.motor or chain.index not in crosses:
            continue
        cross = crosses[chain.index]
        tagged, _ = tagged_sidewalks(chain)
        radius = float(max(cross.reach_left.max(), cross.reach_right.max()) + half.max() + STATION_M)
        _, near = tree.query(chain.xy, k=SIDEWALK_NEIGHBOURS, distance_upper_bound=radius)
        found = near < len(xy)
        near = np.where(found, near, 0)
        offset = xy[near] - chain.xy[:, None]
        across = (offset * chain.normal[:, None]).sum(-1)
        along = (offset * chain.tangent[:, None]).sum(-1)
        sine = np.abs(chain.tangent[:, None, 0] * tangent[near][..., 1] - chain.tangent[:, None, 1] * tangent[near][..., 0])
        beside = found & (np.abs(along) <= STATION_M) & (sine < SIDEWALK_SINE)
        inner = np.abs(across) - half[near]
        from_seam = np.full(len(chain.xy), np.inf)
        distance = np.concatenate(([0], np.cumsum(np.hypot(*np.diff(chain.xy, axis=0).T))))
        for station in chain.seam_stations:
            from_seam = np.minimum(from_seam, np.abs(distance - distance[station]))
        # Applied once the edges are smoothed, which would otherwise carry a sidewalk's width on to the seam's own stations:
        # the paving there, and as far past the edge as its outline runs on, is the class's, which both tiles cut alike.
        own = np.clip((from_seam - SEAM_REACH_M) / SIDEWALK_SEAM_RUN_M, 0, 1)
        sides = []
        for column, (sign, carriageway, paving) in enumerate(((1, cross.half_left, cross.reach_left), (-1, cross.half_right, cross.reach_right))):
            beside_here = np.where(beside & (sign * across > 0), inner, np.inf)
            edge = beside_here.min(axis=1)
            # A path in the carriageway's middle is a line drawn on the road, not a sidewalk beside it.
            edge = np.where(edge < SIDEWALK_LEAST_SHARE * chain.half, np.inf, edge)
            sidewalks |= set(owners[near[np.isfinite(edge), beside_here[np.isfinite(edge)].argmin(axis=1)]].tolist())
            # A sidewalk near enough that the strip to it is paved, or one the street's tags map where none is drawn.
            mapped = np.where(edge <= paving + GAP_PAVED_M, np.maximum(np.minimum(paving, edge) - carriageway - KERB_STRIP_M, 0), 0)
            tag = np.where(np.isinf(edge), tagged[:, column], 0)
            walk = np.where(tag > 0, tag, mapped)
            target = np.where(tag > 0, carriageway + KERB_STRIP_M + tag, np.minimum(paving, edge))
            held = ndimage.gaussian_filter1d(target, SIDEWALK_SMOOTH_STATIONS, mode="nearest")
            widened = ndimage.gaussian_filter1d(tag, SIDEWALK_SMOOTH_STATIONS, mode="nearest") > LEAST_WALK_M
            walk = ndimage.gaussian_filter1d(walk, SIDEWALK_SMOOTH_STATIONS, mode="nearest")
            reach = np.where(widened, held, np.minimum(paving, held))
            narrowed = np.minimum(carriageway, held)
            reach, narrowed, walk = paving + own * (reach - paving), carriageway + own * (narrowed - carriageway), own * walk
            walk = np.where(walk > LEAST_WALK_M, walk, 0)
            sides.append((narrowed, reach, np.clip(walk, 0, np.maximum(reach - narrowed, 0))))
        crosses[chain.index] = Cross(sides[0][0], sides[1][0], sides[0][1], sides[1][1], sides[0][2], sides[1][2])
    return sidewalks




def under_others(chains: list[Chain], levels: dict[int, np.ndarray], crosses: dict[int, Cross], tile: shapely.Polygon) -> None:
    """A stretch tagged as a tunnel is below only where another way's paving stands over it, and a station either side.

    OSM tags the whole of an underpass's way, often well past the road over it; left below there, a path runs in a trench
    of its own beside the one it shares the underpass with. Off the crossing it's on the ground, like any way.
    """
    over = [footprints(chain, levels[chain.index], tile, crosses[chain.index].paving).get(GROUND) for chain in chains]
    chains_by_index = {chain.index: chain for chain in chains}
    owners = [chain.index for chain, shape in zip(chains, over) if shape is not None]
    if not owners:
        return
    tree = shapely.STRtree([shape for shape in over if shape is not None])
    for chain in chains:
        tagged = levels[chain.index] == BELOW
        if not tagged.any():
            continue
        at, held = tree.query(shapely.points(chain.xy), predicate="within")
        under = np.zeros(len(chain.xy), dtype=bool)
        for station, index in zip(at, held):
            other = chains_by_index[owners[index]]
            if other.index == chain.index:
                continue
            # Over it, not beside it: a way crossing it is a deck; one running alongside is its neighbour in the underpass.
            theirs = other.tangent[other.tree.query(chain.xy[station])[1]]
            if abs(float(chain.tangent[station][0] * theirs[1] - chain.tangent[station][1] * theirs[0])) > CROSSING_SINE:
                under[station] = True
        under = ndimage.binary_dilation(under, iterations=1)
        levels[chain.index] = np.where(tagged & ~under, GROUND, levels[chain.index])


def bare_decks(chains: list[Chain], levels: dict[int, np.ndarray], crosses: dict[int, Cross], prints: dict[int, dict[int, shapely.Geometry]], tile: shapely.Polygon) -> None:
    """Where a road passes over an underpass, its paving stops at its carriageway's edge: a deck has no verge, and a
    shoulder's width over the opening only makes the underpass a long dark box."""
    under = shapely.union_all([by_level[BELOW] for by_level in prints.values() if BELOW in by_level])
    if under.is_empty:
        return
    shapely.prepare(under)
    for chain in chains:
        if chain.index not in prints or not chain.motor or (levels[chain.index] == BELOW).any():
            continue
        cross = crosses[chain.index]
        across = shapely.linestrings(np.stack((chain.xy + cross.reach_left[:, None] * chain.normal, chain.xy - cross.reach_right[:, None] * chain.normal), axis=1))
        over = ndimage.binary_dilation(shapely.intersects(under, across), iterations=1)
        if over.any():
            crosses[chain.index] = Cross(cross.half_left, cross.half_right, np.where(over, cross.half_left, cross.reach_left), np.where(over, cross.half_right, cross.reach_right), np.where(over, 0, cross.walk_left), np.where(over, 0, cross.walk_right))
            prints[chain.index] = footprints(chain, levels[chain.index], tile, crosses[chain.index].paving)


@dataclass
class SeamSection:
    """A way's paving where it crosses a tile's edge, from what both tiles see the same: its station on the edge and its
    class's own cross-section there, run on SEAM_REACH_M either way along it."""

    chain: Chain
    station: int
    level: int
    rank: int
    half_left: float
    half_right: float
    shape: shapely.Polygon
    carriageway: shapely.Polygon
    line: shapely.LineString

    def holds(self, xy: np.ndarray) -> tuple[bool, float]:
        """Whether a point is in this section's carriageway, and how far across the way it lies."""
        across = float((xy - self.chain.xy[self.station]) @ self.chain.normal[self.station])
        return -self.half_right <= across <= self.half_left, across

    def height(self, xy: np.ndarray) -> float:
        """The seam section's surface: its centre's height with its crown, level past the carriageway, and no banking. Not
        what easing on to a junction added, since a junction near the edge may be on one tile only."""
        chain, station = self.chain, self.station
        across = float(np.clip((xy - chain.xy[station]) @ chain.normal[station], -chain.half[station], chain.half[station]))
        return float(chain.height[station] - chain.crown[station] * abs(across))


def seam_sections(chains: list[Chain], levels: dict[int, np.ndarray]) -> list[SeamSection]:
    """Every way's section where it crosses a tile's edge, by the class of the OSM way it crosses on."""
    found = []
    for chain in chains:
        if not chain.seam_stations:
            continue
        cross = cross_of(chain)
        for station in chain.seam_stations:
            along, normal, middle = chain.tangent[station] * SEAM_REACH_M, chain.normal[station], chain.xy[station]

            def strip(left: float, right: float) -> shapely.Polygon:
                return shapely.Polygon([middle + normal * left - along, middle + normal * left + along, middle - normal * right + along, middle - normal * right - along])

            shape = strip(cross.reach_left[station], cross.reach_right[station])
            carriageway = strip(cross.half_left[station], cross.half_right[station])
            line = shapely.LineString([middle - along, middle + along])
            rank = chain.edges[chain.edge_at[station]].kind.rank
            found.append(SeamSection(chain, station, int(levels[chain.index][station]), rank, float(cross.half_left[station]), float(cross.half_right[station]), shape, carriageway, line))
    return found


def held_to_seams(prints: dict[int, dict[int, shapely.Geometry]], sections: list[SeamSection], tile: shapely.Polygon) -> None:
    """Every way's paving on the band along the tile's edge is its seam sections alone.

    What a way's paving is near the edge otherwise comes from what this tile sees: a sidewalk beside it, a deck over an
    underpass, a way running along the edge without crossing it, none of which the neighbour may see. On the edge itself
    both tiles must lay the same, so there the paving is each crossing's own section, by its class.
    """
    for index, by_level in prints.items():
        for level in list(by_level):
            shape = on_seams(by_level[level], [section.shape for section in sections if section.chain.index == index and section.level == level], tile)
            if shape.is_empty:
                del by_level[level]
            else:
                by_level[level] = shape
    for section in sections:
        if section.level not in prints.setdefault(section.chain.index, {}):
            prints[section.chain.index][section.level] = on_seams(shapely.Polygon(), [section.shape], tile)


def on_seams(shape: shapely.Geometry, seams: list[shapely.Geometry], tile: shapely.Polygon) -> shapely.Geometry:
    """A shape as this tile has it away from the edge, and on the band along it the seam sections' alone."""
    inner = tile.buffer(-SEAM_BAND_M, join_style="mitre")
    band = shapely.difference(tile, inner)
    found = shapely.union(shapely.intersection(shape, inner), shapely.intersection(shapely.union_all(seams), band)) if seams else shapely.intersection(shape, inner)
    return found if shapely.get_dimensions(shape) == 1 else _polygonal(found)


def seam_targets(sections: list[SeamSection], xy: np.ndarray) -> np.ndarray:
    """The height at each point on a tile's edge from the seam sections that hold it, NaN where none does: of those, the
    greatest way whose carriageway holds it, or failing that the greatest whose shoulder does, then the nearest its own
    line, so a junction on the edge is decided alike from either side."""
    found = np.full(len(xy), np.nan)
    if not sections or not len(xy):
        return found
    tree = shapely.STRtree([section.shape for section in sections])
    # The paving's outline is cut on a grid of GRID_M, so a point at a section's side may lie just past it.
    at, which = tree.query(shapely.points(xy), predicate="dwithin", distance=GRID_M)
    best: dict[int, tuple] = {}
    for point, index in zip(at.tolist(), which.tolist()):
        section = sections[index]
        inside, across = section.holds(xy[point])
        middle = section.chain.xy[section.station]
        key = (not inside, section.rank, round(abs(across), 3), round(float(middle[0]), 2), round(float(middle[1]), 2))
        if point not in best or key < best[point][0]:
            best[point] = (key, section)
    for point, (_, section) in best.items():
        found[point] = section.height(xy[point])
    return found


def footprints(chain: Chain, levels: np.ndarray, tile: shapely.Polygon, sides: tuple[np.ndarray, np.ndarray]) -> dict[int, shapely.Geometry]:
    """A way's outline on each level it's on, reaching `sides` to its left and right: every station, its cut ends included,
    since the merge is the join."""
    left, right, level = chain.xy + sides[0][:, None] * chain.normal, chain.xy - sides[1][:, None] * chain.normal, levels
    last = len(chain.xy) - 1
    if 0 in chain.seam_stations:
        out = -chain.tangent[0] * SEAM_REACH_M
        left, right, level = np.vstack((left[:1] + out, left)), np.vstack((right[:1] + out, right)), np.concatenate((level[:1], level))
    if last in chain.seam_stations:
        out = chain.tangent[-1] * SEAM_REACH_M
        left, right, level = np.vstack((left, left[-1:] + out)), np.vstack((right, right[-1:] + out)), np.concatenate((level, level[-1:]))
    quad_level = np.where(level[:-1] == level[1:], level[:-1], np.where(level[:-1] != GROUND, level[:-1], level[1:]))
    quads = _quads(left, right)
    found = {}
    for which in np.unique(quad_level):
        shape = shapely.intersection(shapely.union_all(quads[quad_level == which]), tile)
        shape = _polygonal(shapely.simplify(shape, OUTLINE_WITHIN_M))
        if not shape.is_empty:
            found[int(which)] = shape
    return found


def _polygonal(shape: shapely.Geometry) -> shapely.MultiPolygon:
    """A shape's areas alone: clipping can leave lines and points beside them, which have no outline to cut along."""
    return shapely.MultiPolygon([part for part in shapely.get_parts(shape) if isinstance(part, shapely.Polygon) and not part.is_empty])


def _rounded(shape: shapely.Geometry, radius: float) -> shapely.Geometry:
    """What closing a shape by a radius adds to it, less the closing's own slivers along curves."""
    closed = shape.buffer(radius, quad_segs=4).buffer(-radius, quad_segs=4)
    added = closed.difference(shape.buffer(SLIVER_M))
    return shapely.intersection(added.buffer(SLIVER_M * 2), closed).difference(shape) if not added.is_empty else added


def _apart(ways: list[Chain], shape: shapely.Geometry) -> np.ndarray:
    """How far apart ways' surfaces stand across a shape, read round its edge and at its middle."""
    edge = shapely.get_coordinates(shapely.segmentize(shape.boundary, AGREE_SAMPLE_M))
    points = np.vstack((edge[:: max(len(edge) // AGREE_SAMPLES, 1)], shapely.get_coordinates(shape.representative_point())))
    heights = np.array([way.plane(points) for way in ways])
    return heights.max(axis=0) - heights.min(axis=0)


def _agree(ways: list[Chain], shape: shapely.Geometry) -> bool:
    """Whether ways' surfaces agree all across a shape closely enough to pave it between them: farther apart anywhere, one is
    on a bank above the other, and paving between them would be a cliff."""
    return len(ways) < 2 or float(_apart(ways, shape).max()) <= GAP_MOST_STEP_M


def _pieces(gap: shapely.Polygon) -> list[shapely.Polygon]:
    """A gap cut on a lattice of the world, so a long strip is judged stretch by stretch where it lies."""
    west, south, east, north = (np.array(gap.bounds) / GAP_PIECE_M).tolist()
    columns, rows = (cells.ravel() * GAP_PIECE_M for cells in np.meshgrid(np.arange(np.floor(west), np.ceil(east)), np.arange(np.floor(south), np.ceil(north))))
    cut = shapely.intersection(gap, shapely.box(columns, rows, columns + GAP_PIECE_M, rows + GAP_PIECE_M))
    return [piece for piece in shapely.get_parts(cut) if isinstance(piece, shapely.Polygon) and not piece.is_empty]


def _between_ways(gaps: shapely.Geometry, chains: list[Chain], prints: list[shapely.Geometry]) -> list[shapely.Polygon]:
    """The gaps closed between ways at heights near enough to pave: farther apart, one is on a bank or over the other.

    Each piece is judged by the ways its gap lies between that reach it: a lattice line along a strip leaves pieces
    touching one side only, and a way the gap touches only at its far end says nothing of the ground here."""
    tree = shapely.STRtree(prints)
    kept = []
    for part in _flat(gaps):
        between = set(tree.query(part, predicate="dwithin", distance=SLIVER_M * 4).tolist())
        for piece in _pieces(part):
            beside = [chains[index] for index in tree.query(piece, predicate="dwithin", distance=GAP_PAVED_M).tolist() if index in between]
            if beside and _agree(beside, piece):
                kept.append(piece)
    return kept


def kept_apart(chains: list[Chain], prints: dict[int, dict[int, shapely.Geometry]], tile: shapely.Polygon) -> None:
    """Two ways whose outlines touch but whose surfaces don't agree there stay apart: the lesser stands back from the greater,
    and the land between them is a bank. A way and the one it ends on are joined by its own profile, which meets the other's.

    Not near a tile's edge, as no gap is closed there: whether two ways stand apart is judged from where they touch, and
    each tile sees only its own side of that, so the neighbour may not cut the lesser way back as this tile does."""
    inner = tile.buffer(-EDGE_BAND_M, join_style="mitre")
    indices = [index for index, by_level in prints.items() if GROUND in by_level]
    if len(indices) < 2:
        return
    tree = shapely.STRtree([prints[index][GROUND] for index in indices])
    first, second = tree.query([prints[index][GROUND] for index in indices], predicate="intersects")
    for a, b in zip(first, second):
        if a >= b:
            continue
        one, other = chains[indices[a]], chains[indices[b]]
        landed = {parent.index for parent, _, _ in one.landings} | {parent.index for parent, _, _ in other.landings}
        if other.index in landed or one.index in landed:
            continue
        greater, lesser = sorted((one, other), key=lambda chain: (chain.kind.rank, chain.index))
        meet = shapely.intersection(prints[greater.index][GROUND], prints[lesser.index][GROUND]).buffer(AGREE_SAMPLE_M / 4)
        # A sidewalk along its street differs from it here and there by a kerb's height or the survey's bumps, and the solve
        # bends it to meet the street: a bank is a step of metres, along most of where the two touch.
        if meet.is_empty or float(np.median(_apart([greater, lesser], meet))) <= BANK_STEP_M:
            continue
        apart = shapely.intersection(prints[greater.index][GROUND].buffer(KEEP_APART_M), inner)
        prints[lesser.index][GROUND] = _polygonal(shapely.simplify(shapely.difference(prints[lesser.index][GROUND], apart), OUTLINE_WITHIN_M))
        if prints[lesser.index][GROUND].is_empty:
            del prints[lesser.index][GROUND]


def _corners(chains: list[Chain], ground_prints: dict[int, shapely.Geometry]) -> list[shapely.Geometry]:
    """Where a way ends on another, its corners rounded, by the sine of their angle squared so a shallow merge keeps its sharp nose."""
    found = []
    for chain in chains:
        for parent, _, at_start in chain.landings:
            if chain.index not in ground_prints or parent.index not in ground_prints:
                continue
            end = 0 if at_start else -1
            here = chain.xy[end]
            own, other = chain.tangent[end], parent.tangent[parent.tree.query(here)[1]]
            crossing = abs(float(own[0] * other[1] - own[1] * other[0]))
            radius = max(APRON_CORNER_M[TIERS[chain.tier[end]]] * crossing**2, APRON_LEAST_CORNER_M)
            zone = shapely.Point(here).buffer(float(chain.half[end] + parent.half.max()) + 3 * radius)
            local = shapely.intersection(shapely.union(ground_prints[chain.index], ground_prints[parent.index]), zone.buffer(radius))
            corner = shapely.intersection(_rounded(local, radius), zone)
            if not corner.is_empty and _agree([chain, parent], corner):
                found.append(corner)
    return found


def ground_shape(chains: list[Chain], prints: dict[int, dict[int, shapely.Geometry]], areas: shapely.Geometry, tile: shapely.Polygon) -> shapely.Geometry:
    """Everything paved on the ground's level, with its junctions' corners and the narrow gaps between ways paved too."""
    ground_prints = {index: by_level[GROUND] for index, by_level in prints.items() if GROUND in by_level}
    laid = shapely.union_all([*ground_prints.values(), areas])
    inner = tile.buffer(-EDGE_BAND_M, join_style="mitre")
    gaps = shapely.intersection(_rounded(laid, GAP_PAVED_M / 2), inner)
    indices = list(ground_prints)
    joined = _between_ways(gaps, [chains[index] for index in indices], [ground_prints[index] for index in indices]) if indices else []
    corners = [shapely.intersection(corner, inner) for corner in _corners(chains, ground_prints)]
    return shapely.union_all([laid, *joined, *corners])


def _greatest(chains: list[Chain], shapes: dict[int, shapely.Geometry], middles: np.ndarray) -> np.ndarray:
    """For each point, the greatest way whose shape holds it, or JUNCTION."""
    indices = np.array(list(shapes))
    owner = np.full(len(middles), JUNCTION)
    if not len(indices):
        return owner
    at, held = shapely.STRtree([shapes[index] for index in indices]).query(middles, predicate="within")
    rank = np.array([chains[index].kind.rank * OWNER_CODES + index for index in indices])
    best = np.full(len(middles), np.iinfo(np.int64).max)
    np.minimum.at(best, at, rank[held])
    owned = best < np.iinfo(np.int64).max
    owner[owned] = best[owned] % OWNER_CODES
    return owner


def pieces_of(chains: list[Chain], prints: dict[int, dict[int, shapely.Geometry]], carriageways: dict[int, shapely.Geometry], levels: dict[int, np.ndarray], paved: shapely.Geometry, areas: shapely.Geometry, kerbs: dict[int, shapely.Geometry], crosses: dict[int, Cross], sidewalks: set[int], sections: list[SeamSection], tile: shapely.Polygon) -> list[Piece]:
    """The paved shape cut along every way's outline, carriageway, kerb and centre line, each piece owned by the greatest way
    whose carriageway holds it, or failing that the greatest whose shoulder does: a road's shoulder never runs across the
    mouth of another road that joins it. A street's piece past its kerb, where it has one, is its sidewalk's.

    A piece no way's outline holds, beside a path (a strip between a street and its sidewalk, a corner the path turns),
    wears that path's surface, and so does a street's sidewalk: drawn as shoulders, they faded to the photo's colour, a
    pale band along the street."""
    ground_prints = {index: by_level[GROUND] for index, by_level in prints.items() if GROUND in by_level}
    lines = [paved.boundary, areas.boundary]
    lines += [shapely.intersection(shape.boundary, paved) for shape in [*ground_prints.values(), *carriageways.values(), *kerbs.values()]]
    for index in ground_prints:
        chain = chains[index]
        for first, last in _runs(levels[index] == GROUND):
            if last > first:
                line = shapely.simplify(shapely.LineString(chain.xy[first : last + 1]), OUTLINE_WITHIN_M)
                lines.append(shapely.intersection(on_seams(line, [], tile), paved))
    lines += [shapely.intersection(on_seams(shapely.LineString(), [section.line], tile), paved) for section in sections if section.level == GROUND]
    # On a grid as fine as the outlines are kept to, before it's cut: lines that nearly meet become one, and no two pieces overlap.
    # Long straight edges are cut so a profile's bend still shows along them: once, on the shared lines, so two pieces cut theirs alike.
    linework = shapely.segmentize(shapely.union_all([line for line in lines if not line.is_empty], grid_size=GRID_M), LONGEST_SECTION_M)
    faces = shapely.get_parts(shapely.polygonize(shapely.get_parts(linework)))
    middles = shapely.point_on_surface(faces)
    on_paving = paved.buffer(SLIVER_M)
    inside = shapely.contains(on_paving, middles)
    faces, middles = faces[inside], middles[inside]
    owner = _greatest(chains, carriageways, middles)
    by_shoulder = _greatest(chains, ground_prints, middles)
    owner = np.where(owner == JUNCTION, by_shoulder, owner)
    owner = _sidewalks_across_driveways(chains, {index: shape for index, shape in carriageways.items() if index in sidewalks}, middles, owner)
    owner[(owner == JUNCTION) & shapely.contains(areas.buffer(SLIVER_M), middles)] = AREA
    walk = np.zeros(len(faces), dtype=bool)
    for index, kerb in kerbs.items():
        mine = np.flatnonzero(owner == index)
        walk[mine] = ~shapely.contains(kerb.buffer(SLIVER_M), middles[mine])
    look = np.full(len(faces), JUNCTION)
    borrows = (owner == JUNCTION) | walk
    if borrows.any():
        xy = shapely.get_coordinates(middles[borrows])
        look[borrows] = _paths_worn(chains, crosses, xy, _streets_run(chains, crosses, owner[borrows], xy), on_paving)
    found = [Piece(face, int(who), GROUND, bool(on_walk), int(worn)) for face, who, on_walk, worn in zip(faces, owner, walk, look)]
    found += _below_pieces(chains, prints, paved)
    for index, by_level in prints.items():
        if ABOVE in by_level:
            found += [Piece(part, index, ABOVE) for part in _flat(shapely.segmentize(by_level[ABOVE], LONGEST_SECTION_M))]
    return found


def _streets_run(chains: list[Chain], crosses: dict[int, Cross], owner: np.ndarray, xy: np.ndarray) -> np.ndarray:
    """The way the street a piece lies beside runs: its owner's, or the nearest motor way's whose paving is within a closed
    gap of it; none, (0, 0), where no street is."""
    streets = [chains[index] for index in crosses if chains[index].motor]
    runs = np.zeros((len(xy), 2))
    if not streets:
        return runs
    tangents = np.concatenate([chain.tangent for chain in streets])
    reach = np.concatenate([np.maximum(*crosses[chain.index].paving) for chain in streets])
    distance, nearest = cKDTree(np.concatenate([chain.xy for chain in streets])).query(xy)
    beside = distance <= reach[nearest] + GAP_PAVED_M + STATION_M
    runs[beside] = tangents[nearest[beside]]
    for who in np.unique(owner[owner >= 0]):
        mine = owner == who
        runs[mine] = chains[who].tangent[chains[who].tree.query(xy[mine])[1]]
    return runs


def _paths_worn(chains: list[Chain], crosses: dict[int, Cross], xy: np.ndarray, runs: np.ndarray, on_paving: shapely.Geometry) -> np.ndarray:
    """For each point, the path whose surface a piece there wears: of the paths whose paving lies within a closed gap of
    it, the nearest running alongside the street beside it, or with no street beside it the nearest, with only paving
    between the two; or JUNCTION. A whole piece wears one, or its triangles would blend two.

    Beside a street, only a path alongside it lends its surface, and only across paving: a corner where a drive or a
    crossing meets a sidewalk, or a corner of two streets with a cycleway a few metres off across the grass, wore the
    path's dark asphalt and stood out as a sharp flap beyond the pale paving round it."""
    paths = [chains[index] for index in crosses if not chains[index].motor]
    found = np.full(len(xy), JUNCTION)
    if not paths or not len(xy):
        return found
    owners = np.concatenate([np.full(len(chain.xy), chain.index) for chain in paths])
    reach = np.concatenate([np.maximum(*crosses[chain.index].paving) for chain in paths])
    tangent = np.concatenate([chain.tangent for chain in paths])
    points = np.concatenate([chain.xy for chain in paths])
    count = min(WORN_NEIGHBOURS, len(owners))
    distance, near = cKDTree(points).query(xy, k=count)
    distance, near = distance.reshape(len(xy), count), near.reshape(len(xy), count)
    within = distance <= reach[near] + GAP_PAVED_M + STATION_M
    sine = np.abs(runs[:, None, 0] * tangent[near][..., 1] - runs[:, None, 1] * tangent[near][..., 0])
    street = np.any(runs, axis=1)
    alongside = within & ((sine < SIDEWALK_SINE) | ~street[:, None])
    # Neighbours come nearest first.
    pick = alongside.argmax(axis=1)
    chosen = np.flatnonzero(alongside.any(axis=1))
    station = near[chosen, pick[chosen]]
    shapely.prepare(on_paving)
    across = shapely.covered_by(shapely.linestrings(np.stack((xy[chosen], points[station]), axis=1)), on_paving)
    found[chosen[across]] = owners[station[across]]
    return found


def _sidewalks_across_driveways(chains: list[Chain], sidewalks: dict[int, shapely.Geometry], middles: np.ndarray, owner: np.ndarray) -> np.ndarray:
    """Where a driveway (a service way) crosses a sidewalk, the sidewalk's carriageway is the sidewalk's: its slabs carry on
    across the drive's mouth, as real ones do, rather than the drive's asphalt cutting it. A service way running along a
    sidewalk keeps what it holds, a street crossing one keeps its crossing, and a path out in the country, beside no
    street, is crossed by the drive."""
    paths = sidewalks
    driveway = np.array([who >= 0 and chains[who].motor and chains[who].kind_name == "service" for who in owner], dtype=bool)
    if not paths or not driveway.any():
        return owner
    path = _greatest(chains, paths, middles)
    owner = owner.copy()
    xy = shapely.get_coordinates(middles)
    for piece in np.flatnonzero(driveway & (path != JUNCTION)):
        drive, walk = chains[owner[piece]], chains[path[piece]]
        theirs, mine = drive.tangent[drive.tree.query(xy[piece])[1]], walk.tangent[walk.tree.query(xy[piece])[1]]
        if abs(float(theirs[0] * mine[1] - theirs[1] * mine[0])) > CROSSING_SINE:
            owner[piece] = path[piece]
    return owner


def _below_pieces(chains: list[Chain], prints: dict[int, dict[int, shapely.Geometry]], paved: shapely.Geometry) -> list[Piece]:
    """The underpasses' paving, merged as the ground's is: two paths sharing an underpass are one floor. It's cut where the
    ground's paving passes over it, so its points stand under the deck's edges and its walls rise from them."""
    below = {index: by_level[BELOW] for index, by_level in prints.items() if BELOW in by_level}
    if not below:
        return []
    indices = list(below)
    laid = shapely.union_all(list(below.values()))
    joined = _between_ways(_rounded(laid, GAP_PAVED_M / 2), [chains[index] for index in indices], [below[index] for index in indices])
    shape = shapely.union_all([laid, *joined])
    lines = [shape.boundary, shapely.intersection(paved.boundary, shape)] + [shapely.intersection(part.boundary, shape) for part in below.values()]
    linework = shapely.segmentize(shapely.union_all([line for line in lines if not line.is_empty], grid_size=GRID_M), LONGEST_SECTION_M)
    faces = shapely.get_parts(shapely.polygonize(shapely.get_parts(linework)))
    middles = shapely.point_on_surface(faces)
    inside = shapely.contains(shape.buffer(SLIVER_M), middles)
    owner = _greatest(chains, below, middles[inside])
    return [Piece(face, int(who), BELOW) for face, who in zip(faces[inside], owner)]


@dataclass
class Mesh:
    xy: np.ndarray
    level: np.ndarray
    triangles: np.ndarray  # Into `xy`, one geometric point however many pieces share it.
    owner: np.ndarray  # Each triangle's piece's owner.
    walk: np.ndarray  # Whether each triangle's piece is its street's sidewalk.
    look: np.ndarray  # The path whose surface each triangle's piece wears, or JUNCTION for its owner's own.


def triangulate(pieces: list[Piece]) -> Mesh:
    shapes = np.array([piece.shape for piece in pieces])
    triangles, which = shapely.get_parts(shapely.constrained_delaunay_triangles(shapes), return_index=True)
    corners = np.round(shapely.get_coordinates(triangles).reshape(-1, 4, 2)[:, :3], 3)
    level = np.array([piece.level for piece in pieces])[which]
    keyed = np.column_stack((corners.reshape(-1, 2), np.repeat(level, 3)))
    points, index = np.unique(keyed, axis=0, return_inverse=True)
    indices = index.reshape(-1, 3)
    # Counter-clockwise seen from above. Rounded to the millimetre, a sliver can fold flat: it has no ground to cover.
    a, b, c = (points[indices[:, corner], :2] for corner in range(3))
    turn = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])
    solid = np.abs(turn) > FLAT_TRIANGLE_M2
    backwards = turn < 0
    indices[backwards] = indices[backwards][:, [0, 2, 1]]
    owner = np.array([piece.owner for piece in pieces])[which]
    walk = np.array([piece.walk for piece in pieces])[which]
    look = np.array([piece.look for piece in pieces])[which]
    used, indices = np.unique(indices[solid], return_inverse=True)
    return Mesh(points[used, :2], points[used, 2].astype(int), indices.reshape(-1, 3), owner[solid], walk[solid], look[solid])


def _land(ground: Ground, xy: np.ndarray) -> np.ndarray:
    steps = np.array([(east, north) for east in (-1, 0, 1) for north in (-1, 0, 1)]) * PAVED_GROUND_READ_M
    return ground.sample(xy[:, None, :] + steps[None]).mean(axis=1)


def _ranks(owner: np.ndarray, chains: list[Chain]) -> np.ndarray:
    ranks = np.array([chain.kind.rank for chain in chains] + [AREA_RANK, JUNCTION_RANK])
    return ranks[np.where(owner >= 0, owner, np.where(owner == AREA, len(chains), len(chains) + 1))]


class Surfaces:
    """Each way's own cross-section, read at any point: the target every piece leans towards."""

    def __init__(self, chains: list[Chain], ground: Ground):
        self.chains = chains
        self.ground = ground
        laid = [chain for chain in chains if chain.xy is not None and len(chain.xy) >= 2]
        self.tree = cKDTree(np.concatenate([chain.xy for chain in laid]))
        self.station_owner = np.concatenate([np.full(len(chain.xy), chain.index) for chain in laid])

    def nearest(self, xy: np.ndarray) -> np.ndarray:
        return self.station_owner[self.tree.query(xy)[1]]

    def of(self, owner: np.ndarray, xy: np.ndarray) -> np.ndarray:
        """Each point read on its owner's surface: a way's plane, or a car park's land."""
        heights = np.zeros(len(xy))
        for who in np.unique(owner):
            at = owner == who
            heights[at] = _land(self.ground, xy[at]) if who == AREA else self.chains[who].plane(xy[at])
        return heights


def solve_heights(mesh: Mesh, surfaces: Surfaces, ground: Ground, sections: list[SeamSection]) -> np.ndarray:
    """One height per point of paving, from one least-squares solve: levels share no points, so each solves on its own.

    Each point leans towards its owner's surface, as stiffly as its owner's rank allows; each edge keeps the difference the
    greater of its ends' owners has between them. A point no way owns only follows its neighbours.
    """
    chains = surfaces.chains
    count = len(mesh.xy)
    # A point's owner is the greatest of the pieces round it: a way before a car park before a junction's corner.
    code = np.where(mesh.owner >= 0, mesh.owner, OWNER_CODES - mesh.owner)
    point_code = np.full(count, np.iinfo(np.int64).max)
    np.minimum.at(point_code, mesh.triangles.ravel(), np.repeat(_ranks(mesh.owner, chains) * OWNER_CODES * 2 + code, 3))
    point_rank = point_code // (OWNER_CODES * 2)
    point_owner = point_code % (OWNER_CODES * 2)
    point_owner = np.where(point_owner >= OWNER_CODES, OWNER_CODES - point_owner, point_owner)
    unowned = point_owner == JUNCTION
    reading = np.where(unowned, surfaces.nearest(mesh.xy), point_owner)
    target = surfaces.of(reading, mesh.xy)
    weight = np.where(unowned, FLOATING_WEIGHT, STIFFNESS * 2.0 ** -np.minimum(point_rank, AREA_RANK))

    # A point on the tile's edge is its seam section's, which the neighbour reads alike, or a car park's land, which both see.
    size = ground.size_m
    east, north = mesh.xy[:, 0] - ground.west, ground.north - mesh.xy[:, 1]
    on_edge = np.minimum.reduce([east, north, size - east, size - north]) < 1e-3
    weight[on_edge] = PIN_WEIGHT
    edge_points = np.flatnonzero(on_edge)
    seam = seam_targets(sections, mesh.xy[edge_points])
    held = ~np.isnan(seam)
    target[edge_points[held]] = seam[held]
    loose = edge_points[~held & (reading[edge_points] != AREA)]
    if len(loose):
        raise ValueError(f"paving at ({mesh.xy[loose[0], 0]:.2f}, {mesh.xy[loose[0], 1]:.2f}) on the tile's edge is in no way's seam section")
    target[on_edge] = np.round(target[on_edge], 3)

    pairs = np.sort(np.concatenate([mesh.triangles[:, [0, 1]], mesh.triangles[:, [1, 2]], mesh.triangles[:, [2, 0]]]), axis=1)
    pairs = np.unique(pairs, axis=0)
    first, second = pairs[:, 0], pairs[:, 1]
    greater = np.where(point_rank[first] <= point_rank[second], first, second)
    by = np.where(unowned[greater], JUNCTION, point_owner[greater])
    difference = np.zeros(len(pairs))
    read = by != JUNCTION
    difference[read] = surfaces.of(by[read], mesh.xy[first[read]]) - surfaces.of(by[read], mesh.xy[second[read]])
    rows = np.arange(len(pairs))
    steps = sparse.csr_matrix((np.concatenate((np.ones(len(pairs)), -np.ones(len(pairs)))), (np.concatenate((rows, rows)), np.concatenate((first, second)))), shape=(len(pairs), count))
    system = sparse.diags(weight) + SMOOTHNESS * (steps.T @ steps)
    right = weight * target + SMOOTHNESS * (steps.T @ difference)
    heights = spsolve(system.tocsc(), right)
    heights[on_edge] = target[on_edge]
    return heights


class Cover:
    """The height of a set of 3D triangles at points, NaN where none lies."""

    def __init__(self, triangles: np.ndarray):
        self.triangles = triangles
        self.tree = shapely.STRtree(shapely.polygons(np.concatenate((triangles[:, :, :2], triangles[:, :1, :2]), axis=1))) if len(triangles) else None

    def at(self, xy: np.ndarray) -> np.ndarray:
        height = np.full(len(xy), np.nan)
        if self.tree is None or not len(xy):
            return height
        points = shapely.points(xy)
        at, which = self.tree.query(points, predicate="intersects")
        # A point rounded to the millimetre can land just off the edge it lies on: it takes the nearest triangle's plane.
        off = np.setdiff1d(np.arange(len(xy)), at)
        if len(off):
            near_at, near = self.tree.query_nearest(points[off], max_distance=ON_EDGE_M)
            at, which = np.concatenate((at, off[near_at])), np.concatenate((which, near))
        a, b, c = np.moveaxis(self.triangles[which], 1, 0)
        area = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
        solid = np.abs(area) > 1e-9
        offset = xy[at[solid]] - c[solid, :2]
        first = ((b[solid, 1] - c[solid, 1]) * offset[:, 0] + (c[solid, 0] - b[solid, 0]) * offset[:, 1]) / area[solid]
        second = ((c[solid, 1] - a[solid, 1]) * offset[:, 0] + (a[solid, 0] - c[solid, 0]) * offset[:, 1]) / area[solid]
        height[at[solid]] = first * a[solid, 2] + second * b[solid, 2] + (1 - first - second) * c[solid, 2]
        return height


    def beside(self, xy: np.ndarray, toward: np.ndarray) -> np.ndarray:
        """The height at points on the paving's edge as the paving on one side has it: the triangle nearest a step towards `toward`.

        Where an underpass's edge meets a deck's, one place has two heights, the floor's and the deck's: which one a corner of
        cut ground takes is the paving it borders.
        """
        height = np.full(len(xy), np.nan)
        if self.tree is None or not len(xy):
            return height
        step = toward - xy
        step /= np.maximum(np.hypot(step[:, 0], step[:, 1]), 1e-9)[:, None]
        # Of the triangles the point lies on, the one nearest a step into the cut ground's own triangle.
        touching, which = self.tree.query(shapely.points(xy), predicate="dwithin", distance=ON_EDGE_M)
        apart = shapely.distance(shapely.points(xy[touching] + step[touching] * BESIDE_STEP_M), self.tree.geometries[which])
        order = np.lexsort((apart, touching))
        first = order[np.concatenate(([True], touching[order][1:] != touching[order][:-1]))]
        at, which = touching[first], which[first]
        a, b, c = np.moveaxis(self.triangles[which], 1, 0)
        area = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
        offset = xy[at] - c[:, :2]
        first = ((b[:, 1] - c[:, 1]) * offset[:, 0] + (c[:, 0] - b[:, 0]) * offset[:, 1]) / area
        second = ((c[:, 1] - a[:, 1]) * offset[:, 0] + (a[:, 0] - c[:, 0]) * offset[:, 1]) / area
        height[at] = first * a[:, 2] + second * b[:, 2] + (1 - first - second) * c[:, 2]
        return height


def outline_of(triangles: np.ndarray) -> shapely.Geometry:
    """Where a set of triangles lies, which meet edge to edge: the rings of the edges only one triangle has."""
    if not len(triangles):
        return shapely.Polygon()
    corners = np.round(triangles[:, :, :2], 3)
    edges = np.stack((corners, np.roll(corners, -1, axis=1)), axis=2).reshape(-1, 2, 2)
    flat = edges.reshape(-1, 4)
    # Each edge written from its lesser end, so the two triangles either side of it write it alike.
    lesser_first = (flat[:, 0] < flat[:, 2]) | ((flat[:, 0] == flat[:, 2]) & (flat[:, 1] < flat[:, 3]))
    ordered = np.where(lesser_first[:, None], flat, flat[:, [2, 3, 0, 1]])
    unique, count = np.unique(ordered, axis=0, return_counts=True)
    outer = unique[count == 1].reshape(-1, 2, 2)
    faces = shapely.get_parts(shapely.polygonize(shapely.linestrings(outer)))
    # A hole's ring bounds a face of its own, with no triangle in it.
    covered = shapely.STRtree(shapely.polygons(np.concatenate((corners, corners[:, :1]), axis=1))).query(shapely.point_on_surface(faces), predicate="intersects")[0]
    return shapely.union_all(faces[np.unique(covered)])


def _level_triangles(mesh: Mesh, heights: np.ndarray, level: int) -> np.ndarray:
    on = mesh.level[mesh.triangles[:, 0]] == level
    return np.column_stack((mesh.xy, heights))[mesh.triangles[on]]


def dipped_under_decks(chains: list[Chain], levels: dict[int, np.ndarray], prints: dict[int, dict[int, shapely.Geometry]]) -> None:
    """Each underpass's own profile dipped to keep its room under the ways over it, smoothly, as its class's profile bends."""
    over_ground = [(index, by_level[GROUND]) for index, by_level in prints.items() if GROUND in by_level]
    if not over_ground:
        return
    # A station past the deck's edge still dips, so the room holds right to the edge between it and the next.
    tree = shapely.STRtree([shapely.buffer(shape, STATION_M) for _, shape in over_ground])
    for chain in chains:
        if chain.index not in levels:
            continue
        stations = np.flatnonzero(levels[chain.index] == BELOW)
        if not len(stations):
            continue
        at, which = tree.query(shapely.points(chain.xy[stations]), predicate="within")
        deck = np.full(len(stations), -np.inf)
        for station, held in zip(at, which):
            other = chains[over_ground[held][0]]
            if other.index != chain.index:
                deck[station] = max(deck[station], float(other.plane(chain.xy[stations[station]][None])[0]))
        room = deck - UNDERPASS_CLEAR_M - chain.eased[stations]
        tight = np.isfinite(room) & (chain.height[stations] > room)
        if tight.any():
            pins = [(int(station), float(height)) for station, height in zip(stations[tight], room[tight])]
            chain.height = _smoothed_profile(chain.height, np.ones(len(chain.height)), chain.kind.wavelength_m, pins, [])


def _envelope(paving: np.ndarray, spacing: float, upwards: bool) -> tuple[np.ndarray, np.ndarray]:
    """How high (or low) the land may stand at every corner by the paving's edges, and the edge height each limit comes from.

    The limit grows by the bank's slope with distance, out from every corner under the paving.
    """
    sign = 1.0 if upwards else -1.0
    under = ~np.isnan(paving)
    limit = np.where(under, paving, sign * np.inf).astype(np.float64)
    source = np.where(under, paving, np.nan)
    size = paving.shape[0]
    shifts = [(row, column, np.hypot(row, column) * spacing * EMBANKMENT_SLOPE) for row in (-1, 0, 1) for column in (-1, 0, 1) if row or column]
    for _ in range(EMBANKMENT_PASSES):
        for row, column, rise in shifts:
            here = (slice(max(row, 0), size + min(row, 0)), slice(max(column, 0), size + min(column, 0)))
            there = (slice(max(-row, 0), size + min(-row, 0)), slice(max(-column, 0), size + min(-column, 0)))
            reached = limit[there] + sign * rise
            better = sign * reached < sign * limit[here]
            limit[here] = np.where(better, reached, limit[here])
            source[here] = np.where(better, source[there], source[here])
    return limit, source


def embanked(raw: np.ndarray, paving: np.ndarray, spacing: float) -> np.ndarray:
    """The land beside the paving rising or falling away from its edge no faster than a bank or a cutting.

    `paving` is the paving's height at every corner under it, NaN elsewhere. Under the paving the land lies just beneath it.
    Where a higher way's bank and a lower way's cutting overlap, there's no room for both: the land slopes from one edge to
    the other, rather than either digging the other's land away.
    """
    under = ~np.isnan(paving)
    upper, upper_from = _envelope(paving, spacing, upwards=True)
    lower, lower_from = _envelope(paving, spacing, upwards=False)
    with np.errstate(invalid="ignore", divide="ignore"):
        to_upper = (upper - upper_from) / EMBANKMENT_SLOPE
        to_lower = (lower_from - lower) / EMBANKMENT_SLOPE
        between = (upper * to_lower + lower * to_upper) / (to_upper + to_lower)
    shaped = np.where(lower > upper, between, np.clip(raw, lower, upper))
    shaped = np.where(under, paving - CLEARANCE_M, shaped)
    size = raw.shape[0]
    index = np.arange(size) * spacing
    from_edge = np.minimum(index, index[::-1])
    fade = np.clip(np.minimum(from_edge[:, None], from_edge[None, :]) / EDGE_FADE_M, 0, 1)
    return raw + fade * (shaped - raw)


def paving_at_corners(shape: shapely.Geometry, triangles: np.ndarray, ground: Ground) -> np.ndarray:
    size = ground.tile_corners().shape[0]
    found = np.full((size, size), np.nan)
    if shape.is_empty:
        return found
    west, south, east, north = shape.bounds
    columns = np.arange(max(int((west - ground.west) // ground.spacing), 0), min(int((east - ground.west) // ground.spacing) + 2, size))
    rows = np.arange(max(int((ground.north - north) // ground.spacing), 0), min(int((ground.north - south) // ground.spacing) + 2, size))
    grid_columns, grid_rows = np.meshgrid(columns, rows)
    x = ground.west + grid_columns.ravel() * ground.spacing
    y = ground.north - grid_rows.ravel() * ground.spacing
    shapely.prepare(shape)
    inside = shapely.contains_xy(shape, x, y)
    found[grid_rows.ravel()[inside], grid_columns.ravel()[inside]] = Cover(triangles).at(np.column_stack((x[inside], y[inside])))
    return found


def cut_ground(cut_from: shapely.Geometry, triangles: np.ndarray, nodes: np.ndarray, step: float, ground: Ground) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Every grid cell the paving touches, and a margin round it, as ground triangulated between its corners and the paving's edge.

    Returns the cells, row * cells + column, and the cut ground's points and triangles.
    """
    cells = nodes.shape[0] - 1
    if cut_from.is_empty:
        return np.zeros(0, dtype=np.int64), np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64)
    # The paving in blocks of cells first, so each cell is cut against only what's near it.
    blocks = -(-cells // CUT_BLOCK_CELLS)
    block_rows, block_columns = np.mgrid[0:blocks, 0:blocks]
    block_m = CUT_BLOCK_CELLS * step
    block_boxes = shapely.box(ground.west + block_columns * block_m, ground.north - (block_rows + 1) * block_m, ground.west + (block_columns + 1) * block_m, ground.north - block_rows * block_m).ravel()
    near = shapely.intersection(shapely.buffer(block_boxes, step * (CUT_MARGIN_CELLS + 1), join_style="mitre"), cut_from)

    def block_of(rows: np.ndarray, columns: np.ndarray) -> np.ndarray:
        return near[(rows // CUT_BLOCK_CELLS) * blocks + columns // CUT_BLOCK_CELLS]

    def boxes(rows: np.ndarray, columns: np.ndarray) -> np.ndarray:
        return shapely.box(ground.west + columns * step, ground.north - (rows + 1) * step, ground.west + (columns + 1) * step, ground.north - rows * step)

    occupied = np.flatnonzero(~shapely.is_empty(near))
    grid_rows, grid_columns = np.mgrid[0:CUT_BLOCK_CELLS, 0:CUT_BLOCK_CELLS]
    rows = np.concatenate([grid_rows.ravel() + (block // blocks) * CUT_BLOCK_CELLS for block in occupied])
    columns = np.concatenate([grid_columns.ravel() + (block % blocks) * CUT_BLOCK_CELLS for block in occupied])
    real = (rows < cells) & (columns < cells)
    rows, columns = rows[real], columns[real]
    touched = np.zeros((cells, cells), dtype=bool)
    touched[rows, columns] = shapely.intersects(block_of(rows, columns), boxes(rows, columns))
    cut = ndimage.binary_dilation(touched, iterations=CUT_MARGIN_CELLS)
    rows, columns = np.nonzero(cut)
    open_ground = shapely.difference(boxes(rows, columns), block_of(rows, columns))
    pieces, which = shapely.get_parts(shapely.constrained_delaunay_triangles(open_ground), return_index=True)
    corners = np.round(shapely.get_coordinates(pieces).reshape(-1, 4, 2)[:, :3], 3)
    flat = corners.reshape(-1, 2)
    column_at = (flat[:, 0] - ground.west) / step
    row_at = (ground.north - flat[:, 1]) / step
    on_node = (np.abs(column_at - np.round(column_at)) < 1e-3 / step) & (np.abs(row_at - np.round(row_at)) < 1e-3 / step)
    height = np.where(on_node, nodes[np.clip(np.round(row_at).astype(int), 0, cells), np.clip(np.round(column_at).astype(int), 0, cells)], np.nan)
    # Each corner on the paving takes the height of the paving its own triangle borders.
    middles = np.repeat(corners.mean(axis=1), 3, axis=0)
    cover = Cover(triangles)
    height[~on_node] = cover.beside(flat[~on_node], middles[~on_node])
    if np.isnan(height).any():
        where = flat[np.flatnonzero(np.isnan(height))[0]]
        raise ValueError(f"a point of cut ground at ({where[0]:.2f}, {where[1]:.2f}) is neither a grid node nor on the paving")
    points, index = np.unique(np.column_stack((flat, np.round(height, 3))), axis=0, return_inverse=True)
    indices = index.reshape(-1, 3)
    a, b, c = (points[indices[:, corner]] for corner in range(3))
    backwards = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0]) < 0
    indices[backwards] = indices[backwards][:, [0, 2, 1]]
    crack_points, crack_triangles = closed_cracks(points, indices)
    edge_points, edge_triangles = closed_against_paving(points, indices, cover, on_node_point=lambda xy: _on_node(xy, ground, step))
    points_all = np.concatenate((points, crack_points, edge_points))
    triangles_all = np.concatenate((indices, crack_triangles + len(points), edge_triangles + len(points) + len(crack_points)))
    return rows * cells + columns, points_all, triangles_all


def _on_node(xy: np.ndarray, ground: Ground, step: float) -> np.ndarray:
    column_at = (xy[:, 0] - ground.west) / step
    row_at = (ground.north - xy[:, 1]) / step
    return (np.abs(column_at - np.round(column_at)) < 1e-3 / step) & (np.abs(row_at - np.round(row_at)) < 1e-3 / step)


def closed_against_paving(points: np.ndarray, triangles: np.ndarray, cover: "Cover", on_node_point) -> tuple[np.ndarray, np.ndarray]:
    """Upright faces where an edge of cut ground lies along the paving's edge but its corner took another piece's height.

    Where two ways at different heights meet, one corner of cut ground can border both, and it has one height: along the
    edge it shares with the other way, the gap is closed.
    """
    ends = np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]])
    a, b = points[ends[:, 0]], points[ends[:, 1]]
    candidate = ~(on_node_point(a[:, :2]) & on_node_point(b[:, :2]))
    a, b = a[candidate], b[candidate]
    middle = (a[:, :2] + b[:, :2]) / 2
    along_paving = np.isin(np.arange(len(middle)), cover.tree.query(shapely.points(middle), predicate="dwithin", distance=ON_EDGE_M)[0]) if len(middle) else np.zeros(0, dtype=bool)
    a, b, middle = a[along_paving], b[along_paving], middle[along_paving]
    paving_a = cover.beside(a[:, :2], middle)
    paving_b = cover.beside(b[:, :2], middle)
    torn = (np.abs(paving_a - a[:, 2]) > CRACK_M) | (np.abs(paving_b - b[:, 2]) > CRACK_M)
    torn &= ~(np.isnan(paving_a) | np.isnan(paving_b))
    if not torn.any():
        return np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64)
    a, b, paving_a, paving_b = a[torn], b[torn], paving_a[torn], paving_b[torn]
    quads = np.stack((a, b, np.column_stack((b[:, :2], paving_b)), np.column_stack((a[:, :2], paving_a))), axis=1)
    first = np.arange(len(quads))[:, None] * 4
    return quads.reshape(-1, 3), np.concatenate([first + [0, 1, 2], first + [0, 2, 3], first + [0, 2, 1], first + [0, 3, 2]])


def closed_cracks(points: np.ndarray, triangles: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Upright faces where two triangles of cut ground share an edge in plan but not its heights: the faces of a portal."""
    ends = np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]])
    xy, z = points[ends][:, :, :2], points[ends][:, :, 2]
    # Each edge from its lesser end in plan, so the two triangles either side of it name it alike.
    swap = (xy[:, 0, 0] > xy[:, 1, 0]) | ((xy[:, 0, 0] == xy[:, 1, 0]) & (xy[:, 0, 1] > xy[:, 1, 1]))
    xy[swap], z[swap] = xy[swap][:, ::-1], z[swap][:, ::-1]
    keys = xy.reshape(-1, 4)
    order = np.lexsort(keys.T[::-1])
    keys, z = keys[order], z[order]
    pair = np.flatnonzero((keys[1:] == keys[:-1]).all(axis=1))
    torn = pair[(np.abs(z[pair] - z[pair + 1]) > CRACK_M).any(axis=1)]
    if not len(torn):
        return np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64)
    a, b = keys[torn, :2], keys[torn, 2:]
    quads = np.stack((np.column_stack((a, z[torn, 0])), np.column_stack((b, z[torn, 1])), np.column_stack((b, z[torn + 1, 1])), np.column_stack((a, z[torn + 1, 0]))), axis=1)
    first = np.arange(len(quads))[:, None] * 4
    # Both faces: which side a portal is seen from depends on where the camera is.
    return quads.reshape(-1, 3), np.concatenate([first + [0, 1, 2], first + [0, 2, 3], first + [0, 2, 1], first + [0, 3, 2]])


def underpass_walls(mesh: Mesh, heights: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Where an underpass runs beneath the ground's paving, walls up its sides to under the deck, and the deck's edge over it."""
    below = _level_triangles(mesh, heights, BELOW)
    deck = _level_triangles(mesh, heights, GROUND)
    if not len(below) or not len(deck):
        return np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64)
    under, over = outline_of(below), outline_of(deck)
    below_cover, deck_cover = Cover(below), Cover(deck)
    quads = []

    def segments(line: shapely.Geometry) -> np.ndarray:
        return np.array([pair for part in shapely.get_parts(line) for pair in zip(part.coords[:-1], part.coords[1:])]).reshape(-1, 2, 2)

    # Only under a deck: where an underpass's floor rises to meet its own way out in the open, the two meet, with nothing over them.
    for pair in segments(shapely.intersection(under.boundary, over)):
        low = below_cover.at(pair)
        high = deck_cover.at(pair) - DECK_DEPTH_M
        if not (np.isnan(low).any() or np.isnan(high).any()) and (high - low).min() > UNDERPASS_CLEAR_M / 2:
            quads.append(np.array([[*pair[0], low[0]], [*pair[1], low[1]], [*pair[1], high[1]], [*pair[0], high[0]]]))
    for pair in segments(shapely.intersection(over.boundary, under)):
        top = deck_cover.at(pair)
        floor = below_cover.at(pair)
        if not (np.isnan(top).any() or np.isnan(floor).any()) and (top - floor).min() > UNDERPASS_CLEAR_M / 2:
            quads.append(np.array([[*pair[0], top[0]], [*pair[1], top[1]], [*pair[1], top[1] - DECK_DEPTH_M], [*pair[0], top[0] - DECK_DEPTH_M]]))
    if not quads:
        return np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64)
    points = np.concatenate(quads)
    first = np.arange(len(quads))[:, None] * 4
    # Both faces, since an underpass's wall is seen from either side.
    triangles = np.concatenate([first + [0, 1, 2], first + [0, 2, 3], first + [0, 2, 1], first + [0, 3, 2]])
    return points, triangles


def point_attributes(mesh: Mesh, heights: np.ndarray, chains: list[Chain], surfaces: Surfaces, ground: Ground, crosses: dict[int, Cross]) -> tuple[np.ndarray, np.ndarray, int]:
    """Each piece's corners with what the road's look reads: across its way, the way's tier, how far along it, which way,
    what that way is paved with, and which way it runs, as the cosine and sine of twice its angle: paving looks the same
    turned half round, and a doubled angle has no jump for a triangle to blend across.

    A corner shared by pieces of different ways is one point for each, at one place and height, so each piece keeps its own
    way's look up to its edge. A car park's points come last.
    """
    # A point is one for each way whose pieces meet there, and for each look they wear: each piece keeps its own up to its edge.
    keys = np.column_stack((mesh.triangles.ravel(), np.repeat(mesh.owner, 3), np.repeat(mesh.walk, 3), np.repeat(mesh.look, 3)))
    unique, index = np.unique(keys, axis=0, return_inverse=True)
    point, owner, walk, path = unique[:, 0], unique[:, 1], unique[:, 2].astype(bool), unique[:, 3]
    xy = mesh.xy[point]
    across = np.full(len(unique), APRON_ACROSS)
    tier = np.full(len(unique), TIERS.index("minor"), dtype=float)
    along = np.zeros(len(unique))
    way = owner.astype(float)
    surface = np.full(len(unique), NONE, dtype=float)
    run = np.zeros((len(unique), 2))
    nearest = surfaces.nearest(xy)
    on_path = path != JUNCTION
    worn = on_path & walk
    for who in np.unique(owner):
        at = np.flatnonzero(owner == who)
        reading = np.where(on_path[at], path[at], nearest[at]) if who == JUNCTION else nearest[at] if who < 0 else np.where(worn[at], path[at], who)
        for chain_index in np.unique(reading):
            chain = chains[chain_index]
            mine = at[reading == chain_index]
            station = chain.tree.query(xy[mine])[1]
            tier[mine] = chain.tier[station]
            if who != AREA:
                classes = np.array([way_class(edge.road, edge.road["motor"]) for edge in chain.edges], dtype=float)
                surface[mine] = classes[chain.edge_at[station]]
                run[mine] = _way_runs(chain)[chain.edge_at[station]]
            if who == JUNCTION or (who >= 0 and chain_index != who):
                along[mine] = _along(chain, ground, xy[mine], station)
            if who >= 0 and chain_index == who:
                offset = ((xy[mine] - chain.xy[station]) * chain.normal[station]).sum(-1)
                # As a ribbon's: 1 at the carriageway's edge, 2 at the shoulder's.
                cross = crosses[chain_index]
                left = offset >= 0
                half = np.maximum(np.where(left, cross.half_left[station], cross.half_right[station]), 1e-6)
                # Short of a sidewalk, a shoulder is a kerb's strip, counted in the class's own shoulder's metres as the game
                # reads them, so the kerb is drawn where it stands.
                kerbed = np.where(left, cross.walk_left[station], cross.walk_right[station]) > 0
                shoulder = np.where(kerbed, chain.shoulder[station], np.where(left, cross.reach_left[station], cross.reach_right[station]) - half)
                # With no shoulder (a path, a deck), a point a hair past the edge, where the outline is simplified, is on the edge.
                past = np.where(shoulder > OUTLINE_WITHIN_M, np.maximum(np.abs(offset) - half, 0) / np.maximum(shoulder, OUTLINE_WITHIN_M), 0)
                across[mine] = np.sign(offset) * np.clip(np.minimum(np.abs(offset), half) / half + past, 0, 2)
                # A sidewalk with no path beside it to wear is the one the street's tags map.
                if walk[mine].any():
                    _, kinds = tagged_sidewalks(chain)
                    kind = np.where(left, kinds[station, 0], kinds[station, 1])
                    tagged = walk[mine] & (kind != NONE)
                    surface[mine[tagged]] = kind[tagged]
                    across[mine[tagged]] = np.where(left[tagged], 1, -1) * OWN_SURFACE_ACROSS
                along[mine] = _along(chain, ground, xy[mine], station)
        if who >= 0:
            mine = at[worn[at]]
            way[mine] = path[mine]
            across[mine] = OWN_SURFACE_ACROSS
        if who == JUNCTION:
            way[at] = reading
            # Outside every carriageway: a junction's corner or a gap closed between ways, drawn as the shoulders round it,
            # or as the path beside it.
            across[at] = np.where(on_path[at], OWN_SURFACE_ACROSS, JUNCTION_ACROSS)
    order = np.argsort(owner == AREA, kind="stable")
    rank = np.empty_like(order)
    rank[order] = np.arange(len(order))
    points = np.column_stack((xy, heights[point], across, tier, along, way, surface, run))[order]
    return points, rank[index].reshape(-1, 3), int((owner == AREA).sum())


def _way_runs(chain: Chain) -> np.ndarray:
    """Each of a way's OSM ways' one direction, as the cosine and sine of twice its angle, snapped to `RUN_STEP`.

    One exact value for all of an OSM way: the game lays slabs and setts on axes turned by it, in world metres, so an angle
    that changed by a hair across a triangle would turn a lattice thousands of metres from its origin into arcs."""
    doubled = 2 * np.arctan2(chain.tangent[:, 1], chain.tangent[:, 0])
    runs = np.zeros((len(chain.edges), 2))
    for edge in np.unique(chain.edge_at):
        mine = chain.edge_at == edge
        mean = np.arctan2(np.sin(doubled[mine]).sum(), np.cos(doubled[mine]).sum())
        snapped = np.round(mean / (2 * RUN_STEP)) * 2 * RUN_STEP
        runs[edge] = np.cos(snapped), np.sin(snapped)
    return runs


def _along(chain: Chain, ground: Ground, xy: np.ndarray, station: np.ndarray) -> np.ndarray:
    """How far along a way points lie, as its paint counts: from their nearest stations, by how far past each they lie.
    A station's own distance alone moves in 2 m steps, and treads laid across it ran askew between a way's middle and edges."""
    distance = np.concatenate(([0], np.cumsum(np.hypot(*np.diff(chain.xy, axis=0).T))))
    lies = distance[station] + ((xy - chain.xy[station]) * chain.tangent[station]).sum(-1)
    return np.interp(lies, distance, _paint_along(chain, ground))


def _paint_along(chain: Chain, ground: Ground) -> np.ndarray:
    """Metres of paint along a way, counted from a seam where it has one, as the game counts a ribbon's."""
    distance = np.concatenate(([0], np.cumsum(np.hypot(*np.diff(chain.xy, axis=0).T))))
    length = distance[-1]
    starts, ends = 0 in chain.seam_stations, len(chain.xy) - 1 in chain.seam_stations
    if starts and ends:
        dash = 12.0
        return distance * (1 if length < dash else round(length / dash) * dash / length)
    return distance - length if ends else distance


def lay(roads: list[dict], ground: Ground, paved: list[shapely.Polygon] = (), whole: dict[int, list] | None = None) -> Paved:
    """Every road on the tile as one paved surface on each level, and the ground built round it."""
    areas = shapely.union_all(list(paved))
    reached = areas.buffer(PAVED_REACH_M)
    chains = chains_from(split_at_junctions([part for road in roads for part in _off_paved(road, areas, reached, whole or {})]))
    for chain in chains:
        lay_chain(chain, chains, ground)
    tile = _tile_box(ground)
    laid = [chain for chain in chains if len(chain.xy) >= 2]
    levels = {chain.index: station_levels(chain) for chain in laid}
    crosses = {chain.index: cross_of(chain) for chain in laid}
    sidewalks = along_sidewalks(laid, crosses)
    under_others(laid, levels, crosses, tile)
    prints = {chain.index: footprints(chain, levels[chain.index], tile, crosses[chain.index].paving) for chain in laid}
    bare_decks(laid, levels, crosses, prints, tile)
    dipped_under_decks(chains, levels, prints)
    kept_apart(chains, prints, tile)
    sections = seam_sections(laid, levels)
    held_to_seams(prints, sections, tile)
    # Polygons only, and empty as a polygon is, whatever clipping left: a collection has no boundary to cut along.
    areas = shapely.MultiPolygon(_flat(shapely.simplify(shapely.intersection(areas, tile), OUTLINE_WITHIN_M)))
    shape = ground_shape(chains, prints, areas, tile)
    carriageways = {}
    for chain in laid:
        if GROUND in prints[chain.index]:
            carriageway = footprints(chain, levels[chain.index], tile, crosses[chain.index].carriageway).get(GROUND)
            if carriageway is not None:
                own = [section.carriageway for section in sections if section.chain.index == chain.index and section.level == GROUND]
                carriageways[chain.index] = on_seams(_polygonal(shapely.intersection(carriageway, prints[chain.index][GROUND])), own, tile)
    kerbs = {}
    for chain in laid:
        cross = crosses[chain.index]
        if GROUND in prints[chain.index] and (cross.walk_left.any() or cross.walk_right.any()):
            kerb = footprints(chain, levels[chain.index], tile, cross.kerb).get(GROUND)
            if kerb is not None:
                # A seam section has no sidewalk: its kerb is all its paving.
                own = [section.shape for section in sections if section.chain.index == chain.index and section.level == GROUND]
                kerbs[chain.index] = on_seams(_polygonal(shapely.intersection(kerb, prints[chain.index][GROUND])), own, tile)
    mesh = triangulate(pieces_of(chains, prints, carriageways, levels, shape, areas, kerbs, crosses, sidewalks, sections, tile))
    surfaces = Surfaces(chains, ground)
    heights = solve_heights(mesh, surfaces, ground, sections)
    points, triangles, area_points = point_attributes(mesh, heights, chains, surfaces, ground, crosses)

    raw = ground.tile_corners()
    on_ground = _level_triangles(mesh, heights, GROUND)
    outline = outline_of(on_ground)
    below = _level_triangles(mesh, heights, BELOW)
    # Where an underpass runs in the open, the land beside it falls to it as beside any way; under a deck, the deck's paving holds the land.
    edges = paving_at_corners(outline, on_ground, ground)
    under = paving_at_corners(outline_of(below), below, ground)
    conformed = embanked(raw, np.where(np.isnan(edges), under, edges), ground.spacing)
    cut_from = shapely.union(outline, outline_of(below))
    return Paved(chains, conformed, points, triangles, area_points, cut_from, np.concatenate((below, on_ground)), underpass_walls(mesh, heights), crosses, ground)


def rings_of(paved: Paved, nodes: np.ndarray, step: float) -> list[tuple[Chain, np.ndarray, np.ndarray, list[tuple[int, int]]]]:
    """Each way's line as the ribbons' rings, for what places things beside a road. The game draws the paving, not these."""
    ground = paved.ground
    cover = Cover(paved.points[paved.triangles][:, :, :3])
    made = []
    for chain in paved.chains:
        if chain.kept is None or len(chain.kept) < 2:
            continue
        keep = chain.kept
        edges = [chain.left, chain.centre, chain.right]
        on_paving = [cover.at(edge[:, :2]) for edge in edges]
        left, centre, right = (np.column_stack((edge[:, :2], np.where(np.isnan(height), edge[:, 2], height))) for edge, height in zip(edges, on_paving))
        shoulder = chain.shoulder[keep][:, None] * chain.normal[keep]
        outer_left, outer_right = left[:, :2] + shoulder, right[:, :2] - shoulder
        outer = [np.column_stack((xy, surface_height(nodes, step, ground.west, ground.north, xy))) for xy in (outer_left, outer_right)]
        rings = np.stack((outer[0], left, centre, right, outer[1]), axis=1)
        # A seam's section reaches over the edge, where the paving is the neighbour's: it is the seam's own, as on a ribbon tile.
        for end in (0, -1):
            if keep[end] in chain.seam_stations:
                rings[end, 1:4] = chain.left[end], chain.centre[end], chain.right[end]
                rings[end, [0, 4], 2] = ground.sample(rings[end, [0, 4], :2])
                rings[end] = np.round(rings[end], 3)
        distance = np.concatenate(([0], np.cumsum(np.hypot(*np.diff(chain.centre[:, :2], axis=0).T))))
        thin = _thin_sections(rings, distance)
        span = chain.span[keep]
        ends = np.flatnonzero(np.diff(span.astype(np.int8)))
        kept = np.union1d(thin, np.concatenate((ends, ends + 1)))
        made.append((chain, rings[kept].astype(np.float32), chain.tier[keep][kept], _runs(span[kept])))
    return made


def footprint_ribbons(paved: Paved) -> list[tuple[np.ndarray, np.ndarray, bool]]:
    """Each triangle of paving as a little ribbon, for what's drawn from ribbons' carriageways (the mask, the clearing of trees), and whether a car drives on it."""
    if not len(paved.triangles):
        return []
    corners = paved.points[paved.triangles]
    tier = corners[:, 0, 4].astype(np.uint8)
    way = corners[:, 0, 6].astype(int)
    motor = np.array([paved.chains[index].motor if index >= 0 else False for index in way])
    a, b, c = (corners[:, corner, :3] for corner in range(3))
    rings = np.zeros((len(a), 2, RINGS, 3), dtype=np.float32)
    rings[:, 0, :] = a[:, None]
    rings[:, 1, :] = c[:, None]
    rings[:, 0, 3] = b
    rings[:, 1, 3] = c
    return [(ring, np.full(2, tier[index], dtype=np.uint8), bool(motor[index])) for index, ring in enumerate(rings)]
