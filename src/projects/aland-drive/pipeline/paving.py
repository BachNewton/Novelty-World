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

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import shapely
from scipy import ndimage, sparse
from scipy.sparse.csgraph import connected_components
from scipy.sparse.linalg import spsolve
from scipy.spatial import cKDTree

from give_way import EAVES_ROOM_M
from path_surfaces import COBBLE, NONE, SLAB, STEPS, WAY_SURFACES, way_class
from roads import (
    APRON_ACROSS,
    APRON_CORNER_M,
    APRON_LEAST_CORNER_M,
    CLEARANCE_M,
    EDGE_FADE_M,
    GAP_MOST_STEP_M,
    GAP_PAVED_M,
    LONGEST_SECTION_M,
    LOOSE_SURFACES,
    NODE_STRIDE,
    PAVED_GROUND_READ_M,
    PAVED_REACH_M,
    PIN_WEIGHT,
    RINGS,
    SEALED_SURFACES,
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
# Past this across a way is its shoulder: the carriageway's edge is 1, where its own points are stored (`EDGE_WITHIN_M`),
# and across is written in 1024ths, so this leaves room to spare. The game reads the same edge (`sim/road-grip.ts`), from
# the one file both share.
CARRIAGEWAY_EDGE_ACROSS = json.loads((Path(__file__).resolve().parent.parent / "render" / "carriageway.json").read_text(encoding="utf-8"))["edgeAcross"]
# Where a piece wears a path's own surface, its points stand this far across: inside an edge, where nothing is painted.
OWN_SURFACE_ACROSS = 0.5
# A carriageway's corner at a junction is drawn as carriageway to its arc, where across is 1, and never as a road's
# middle, which is where the centre line is painted.
CORNER_LEAST_ACROSS = 0.3
# An arc's sides to a quarter turn, 15 degrees to a side: an edge line painted round it reads as a curve, and every
# side fewer is a point and two triangles fewer at each of a town's thousand corners.
CORNER_ARC_SEGMENTS = 6
# A mouth's fill thinner than this, where its arc runs out along a carriageway's edge, is left off: a needle of a triangle.
CORNER_TIP_M = 0.12
# The wedge between two carriageways that run together is asphalt where it is narrower than this: wide enough past it
# to stand a kerb or a post on.
GORE_M = 1.5
# A way shorter than this has no round end: it is hardly longer than its end would be.
END_SHORTEST_WAY_M = 12.0
# How far past a way's end, and past its sides, the block its round end is cut within reaches.
END_BLOCK_PAST_M = 1.0
# Across at a carriageway's edge where more carriageway lies beyond it: short of where an edge line is painted
# (`LINE_INSET` in `render/game.ts`), so none is, and the road's wear lies a hand's width nearer its middle there.
OPEN_EDGE_ACROSS = 0.87
# How far past its edge a carriageway is read for what lies beyond.
OPEN_EDGE_PROBE_M = 0.3
# What a piece is to a junction's mouth or a way's round end: nothing, its fill of carriageway, or the strip round its
# arc. A mouth lies between two roads and follows both; a round end is its own way's alone, and stands on its profile.
NO_MOUTH, MOUTH_FILL, MOUTH_RING, END_FILL, END_RING = 0, 1, 2, 3, 4
FILLS, ENDS, RING_MOUTHS = (MOUTH_FILL, END_FILL), (END_FILL, END_RING), (MOUTH_RING, END_RING)
# A stretch of one surface smaller than this, with other surfaces all round it, is a speck: it wears its neighbour's.
SPECK_M2 = 3.0
# A piece no wider than this anywhere is a sliver, and wears the surface along its longer side, when that side is
# `SLIVER_SIDES` times the edge it shares with its own surface.
SLIVER_WIDE_M = 0.5
SLIVER_SIDES = 2.0
# A thin piece of shoulder is a sliver with one surface along this much of its outline.
SHOULDER_SLIVER_ROUND = 0.75
# How many times over the specks and slivers are looked for: absorbing one can leave its neighbour one.
SPECK_PASSES = 3
# What a piece shows that isn't a path's class: a road's carriageway, a shoulder, a car park, or a sidewalk its street's
# tags map, whose class is read side by side.
ROAD_WEAR, SHOULDER_WEAR, AREA_WEAR, TAGGED_WEAR = 100, 101, 102, 103
# Room for every way's index when an owner and its rank are packed into one number.
OWNER_CODES = 1_000_000
# The floats each point of paving carries: east, north, height, across, tier, along, its way (or JUNCTION, AREA), the
# class its way's own tags give it (`path_surfaces`), and the way its way runs, as the cosine and sine of twice its angle.
POINT_FLOATS = 10
EAST, NORTH, HEIGHT, ACROSS, TIER, ALONG, WAY, CLASS, RUN_COS, RUN_SIN = range(POINT_FLOATS)
# A way's run is snapped to steps of this, as the town's paving is (`town_ground.ALIGN_STEP`).
RUN_STEP = np.pi / 64

# Paving's outline is kept within this of each way's, which drops the 2 m stations along a straight run.
OUTLINE_WITHIN_M = 0.02
# A point this near a carriageway's edge is one of the edge's own, moved by the outline's simplifying and its grid.
EDGE_WITHIN_M = 0.03
# Joins found by closing the shape: a sliver thinner than this is the closing's own rounding, not a gap.
SLIVER_M = 0.02
GRID_M = 0.02
# A point this near a triangle lies on it: a few times the millimetre points are rounded to.
ON_EDGE_M = 0.005
# A point of a span this near the line it ends on, or the ground's paving there, lands on it: the outlines' own tolerance.
LANDING_WITHIN_M = 0.05
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
# A cut where a way's surface changes reaches this far past its paving, across what borrows its surface beside it.
LOOK_CUT_PAST_M = 6.0
# The surfaces laid in a pattern along their way, which shows where the way's direction changes.
LAID_ALONG = {SLAB, COBBLE, STEPS}
# A class is three bits. Past them a road's point says what its own OSM way calls its surface, where it calls it
# anything: sealed or loose. Where neither is set the road's class and place decide (`isPaved` in
# `art/surfaces/road-attributes.ts`, which reads these two).
CLASS_BITS = 0b111
SEALED_WAY, LOOSE_WAY = 0b01000, 0b10000
# Two ways that touch stand this far apart in height, along most of where they touch, when one is on a bank above the other.
BANK_STEP_M = 1.0
# A junction's corner part with more than this share under a third way is that way's, and one thinner than this is a sliver.
CORNER_MOST_UNDER = 0.5
CORNER_LEAST_M = 0.1
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
# A strip narrowed beside a wall opens out again by this many metres for every metre along the road.
WALL_TAPER = 0.12
# Narrower than this, a sidewalk is the smoothing's own tail, not a band of paving.
LEAST_WALK_M = 0.01
# A sidewalk OSM maps on its street's own way rather than as a way of its own: this wide where it gives no width, and at
# most this wide where it does.
TAGGED_SIDEWALK_M = 2.0
TAGGED_SIDEWALK_MOST_M = 5.0
# Service ways OSM says are drives, named or not.
DRIVE_SERVICES = {"driveway", "parking_aisle", "drive-through"}
# A way meeting another at more than this sine of their angle, about 30 degrees, crosses it rather than running beside it.
CROSSING_SINE = 0.5
# A way passing under another keeps this much room under the deck above it.
UNDERPASS_CLEAR_M = 2.5
# How deep a deck's edge is drawn over an underpass, and how far under the deck an underpass's walls stop.
DECK_DEPTH_M = 0.6

# Beside the paving the land may rise or fall away no faster than this: a bank or a cutting.
EMBANKMENT_SLOPE = 0.6
# And nearer the paving than this no faster than one in four, the verge a road's side is built with: a wheel off the
# carriageway's edge finds grass it can come back from, and the bank or cutting starts past it. As wide as a cell of the
# height grid, the least the drawn ground can show.
VERGE_SLOPE = 0.25
VERGE_M = 4.0
# How far out a bank can reach, in passes of a corner each.
EMBANKMENT_PASSES = 24
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
    part: int = -1  # Which OSM way of the way whose surface it wears: one surface a piece. None for a piece drawn as the shoulders round it.
    mouth: int = NO_MOUTH  # A junction's mouth's fill or ring (`Corner`), which wears the joining road's (`look`).
    open: bool = False  # A carriageway's piece whose side of the road has more carriageway beyond its edge: it has no edge line.
    beside: int = JUNCTION  # For a piece drawn as the shoulders round it: the way nearest its middle, whose surface class it carries.


@dataclass
class Corner:
    """Where a road ends on another, the corner between their carriageways filled in on an arc, as a junction's mouth is
    laid: the fill wears the joining road's surface, and a strip or kerb runs round its arc."""

    fill: shapely.Geometry
    ring: shapely.Geometry
    arc: shapely.Geometry  # The fill's outline where it isn't a carriageway's edge: the junction's own edge of asphalt.
    way: int  # The road that ends here.
    end: bool = False  # A way's round end, with no other road to it.


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
    points: np.ndarray  # (n, POINT_FLOATS): the ways' own, then those of pieces no way owns drawn as shoulders, then the car parks'.
    triangles: np.ndarray
    junction_points: int
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


def beside_walls(chains: list[Chain], crosses: dict[int, Cross], walls: list[shapely.Polygon]) -> None:
    """A road's strip, and a street's kerb and paving, stop short of a building beside them: a street's paving runs from
    its kerb to the facade, never through it. The carriageway is `give_way`'s to keep clear, by moving or narrowing it."""
    if not walls:
        return
    tree = shapely.STRtree(walls)
    for chain in chains:
        if not chain.motor or chain.index not in crosses:
            continue
        cross = crosses[chain.index]
        sides = []
        for sign, half, reach, walk in ((1, cross.half_left, cross.reach_left, cross.walk_left), (-1, cross.half_right, cross.reach_right, cross.walk_right)):
            edge = chain.xy + sign * half[:, None] * chain.normal
            # Only a wall nearer than the paving reaches can stop it.
            (at, _), near = tree.query_nearest(shapely.points(edge), max_distance=float((reach - half).max()) + EAVES_ROOM_M, return_distance=True, all_matches=False)
            room = np.full(len(edge), np.inf)
            room[at] = np.maximum(near - EAVES_ROOM_M, 0)
            # Never past what the wall leaves, and widening again along the road at a taper, a straight edge either side.
            room = _opening_out(room, WALL_TAPER * STATION_M)
            reach = np.minimum(reach, half + room)
            sides.append((reach, np.minimum(walk, np.maximum(reach - half, 0))))
        crosses[chain.index] = Cross(cross.half_left, cross.half_right, sides[0][0], sides[1][0], sides[0][1], sides[1][1])


def _opening_out(least: np.ndarray, step: float) -> np.ndarray:
    """Each station's width held to its neighbours' and `step` more a station, so a width that must be narrow somewhere
    opens out along the way on a straight taper."""
    width = least.copy()
    for index in range(1, len(width)):
        width[index] = min(width[index], width[index - 1] + step)
    for index in range(len(width) - 2, -1, -1):
        width[index] = min(width[index], width[index + 1] + step)
    return width


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
        surface = next((WAY_SURFACES[road[key + "surface"]] for key in keys if road.get(key + "surface") in WAY_SURFACES), SLAB)
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
        if which == GROUND and chain.round_ends:
            # A free end stops square where its round end begins, whatever its width here: the round end is laid on it.
            shape = shape.difference(shapely.union_all([_end_block(chain, station, back) for station, back in chain.round_ends.items()]))
        shape = _polygonal(shapely.simplify(shape, OUTLINE_WITHIN_M))
        if not shape.is_empty:
            found[int(which)] = shape
    return found


def _polygonal(shape: shapely.Geometry) -> shapely.MultiPolygon:
    """A shape's areas alone: clipping can leave lines and points beside them, which have no outline to cut along."""
    return shapely.MultiPolygon([part for part in shapely.get_parts(shape) if isinstance(part, shapely.Polygon) and not part.is_empty])


def _less(shape: shapely.Geometry, other: shapely.Geometry) -> shapely.MultiPolygon:
    """One shape less another, cut on the paving's grid so the two share the edge between them, without the hairs left
    where their edges ran together. Kept a hair apart instead, the two had a gap between them all along that edge, and
    the gap's own outline: ninety points to the strip round one junction's mouth, where a dozen draw it."""
    return shapely.MultiPolygon([part for part in _flat(shapely.difference(shape, other, grid_size=GRID_M / 20)) if not part.buffer(-CORNER_LEAST_M / 2).is_empty])


def _closed_in(shape: shapely.Geometry, radius: float, segments: int = 4) -> shapely.Geometry:
    """What closing a shape by a radius fills in, less the closing's own slivers along curves."""
    closed = shape.buffer(radius, quad_segs=segments).buffer(-radius, quad_segs=segments)
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


def _corners(chains: list[Chain], ground_prints: dict[int, shapely.Geometry]) -> list[tuple[shapely.Geometry, bool]]:
    """Where a way ends on another, its corners rounded, by the sine of their angle squared so a shallow merge keeps its sharp
    nose; and whether a street is one of the two."""
    found = []
    indices = list(ground_prints)
    tree = shapely.STRtree([ground_prints[index] for index in indices]) if indices else None
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
            corner = shapely.intersection(_closed_in(local, radius), zone)
            # Only what lies between the two: closing them together also rounds the inside of the other's own bends.
            corner = [part for part in _flat(corner) if all(part.distance(ground_prints[way.index]) < SLIVER_M * 4 for way in (chain, parent))]
            # Nor across a third way between the two: a drive's corner with a street, rounded over the cycleway between them,
            # left a pale sliver along the cycleway's far side. A part mostly under a third way is that way's; what's left of
            # one less so, thinner than a kerb's edge, is the third way's outline missing it by a hair.
            third = [indices[index] for index in tree.query(zone)] if corner else []
            others = shapely.union_all([ground_prints[index] for index in third if index not in (chain.index, parent.index)])
            if not others.is_empty:
                corner = [part.difference(others) for part in corner if part.intersection(others).area <= part.area * CORNER_MOST_UNDER]
            corner = shapely.union_all([part for part in _flat(shapely.union_all(corner)) if not part.buffer(-CORNER_LEAST_M / 2).is_empty] if corner else [])
            if not corner.is_empty and _agree([chain, parent], corner):
                found.append((corner, chain.motor or parent.motor))
    return found


def _end_block(chain: Chain, station: int, back: float) -> shapely.Polygon:
    """The ground from where a way's round end begins, `back` short of its end, out past the end: wider than any way."""
    out = chain.tangent[station] * (1 if station else -1)
    across = chain.normal[station] * (back + END_BLOCK_PAST_M)
    base = chain.xy[station] - out * back
    return shapely.Polygon([base + across, base - across, base - across + out * (back + END_BLOCK_PAST_M), base + across + out * (back + END_BLOCK_PAST_M)])


def _width_back(chain: Chain, station: int, widths: np.ndarray, back: float) -> float:
    """One of a way's widths `back` along it from an end, where its round end begins: read between its stations, so the
    round end is exactly as wide as the paving it is laid on."""
    xy = chain.xy if station == 0 else chain.xy[::-1]
    along = np.concatenate(([0.0], np.cumsum(np.hypot(*np.diff(xy, axis=0).T))))
    return float(np.interp(back, along, widths if station == 0 else widths[::-1]))


def round_ends(chains: list[Chain], levels: dict[int, np.ndarray], crosses: dict[int, Cross], areas: shapely.Geometry, tile: shapely.Polygon) -> None:
    """Marks where each road ends free, on the ground with nothing joining it: there its paving ends round (`end_caps`).
    A path ends square: from a car its end is a metre or two of paving either way, and a town has hundreds.

    Not at a tile's edge, where the way carries on, nor near one, where each tile sees only its own side; nor on a car
    park, which is paved past it."""
    inner = tile.buffer(-EDGE_BAND_M, join_style="mitre")
    met = {}
    for chain in chains:
        for edge in chain.edges:
            for node in (edge.start, edge.end):
                met[node] = met.get(node, 0) + 1
    on_areas = areas.buffer(STATION_M)
    for chain in chains:
        chain.round_ends = {}
        if chain.index not in crosses or not chain.motor or len(chain.xy) * STATION_M < END_SHORTEST_WAY_M:
            continue
        cross = crosses[chain.index]
        for station, node in ((0, chain.edges[0].start), (len(chain.xy) - 1, chain.edges[-1].end)):
            # As far back as the paving is wide there, which it may not be at the end itself: beside a wall it tapers.
            back = float(max(cross.reach_left[station], cross.reach_right[station]))
            for _ in range(2):
                back = max(_width_back(chain, station, cross.reach_left, back), _width_back(chain, station, cross.reach_right, back))
            end = shapely.Point(chain.xy[station])
            if met[node] == 1 and station not in chain.seam_stations and levels[chain.index][station] == GROUND and inner.contains(end) and not on_areas.contains(end):
                chain.round_ends[station] = back


def end_caps(chains: list[Chain], crosses: dict[int, Cross], prints: dict[int, dict[int, shapely.Geometry]]) -> list[Corner]:
    """Each road's free end as a round one: a half circle of its carriageway, centred where the end's square corners would
    begin, and its strip carried round it, so the paving ends where the road did. A road laid by its class ended on a line
    ruled square across it, strip, kerb and painted lines all cut off together, which nothing built ends like.

    It keeps clear of the paving of any way its own doesn't touch, as two ways at different heights keep apart: a round
    end reaching another way's would be joined to it whatever stood between them."""
    found = []
    ground_prints = {index: by_level[GROUND] for index, by_level in prints.items() if GROUND in by_level}
    indices = list(ground_prints)
    tree = shapely.STRtree([ground_prints[index] for index in indices]) if indices else None
    for chain in chains:
        for station, back in chain.round_ends.items():
            cross = crosses[chain.index]
            out = chain.tangent[station] * (1 if station else -1)
            centre = chain.xy[station] - out * back
            block = _end_block(chain, station, back)
            left = shapely.Polygon([centre, centre + chain.normal[station] * (back + END_BLOCK_PAST_M), centre + chain.normal[station] * (back + END_BLOCK_PAST_M) + out * (back + END_BLOCK_PAST_M), centre + out * (back + END_BLOCK_PAST_M)])
            wide = lambda widths: _width_back(chain, station, widths, back)
            sides = [(left, wide(cross.half_left), wide(cross.reach_left)), (block.difference(left), wide(cross.half_right), wide(cross.reach_right))]
            disc = lambda radius: shapely.Point(centre).buffer(float(radius), quad_segs=CORNER_ARC_SEGMENTS)
            fill = shapely.union_all([shapely.intersection(disc(half), side) for side, half, _ in sides], grid_size=GRID_M / 20)
            paved = shapely.union_all([shapely.intersection(disc(reach), side) for side, _, reach in sides], grid_size=GRID_M / 20)
            base = shapely.LineString([centre + chain.normal[station] * (back + END_BLOCK_PAST_M), centre - chain.normal[station] * (back + END_BLOCK_PAST_M)])
            # A way this one's paving touches is at its height, and its round end may meet it; any other is kept a bank's width off.
            own = ground_prints.get(chain.index, shapely.Polygon())
            near = [ground_prints[index] for index in (indices[at] for at in tree.query(block)) if index != chain.index]
            others = shapely.union_all([other.buffer(SLIVER_M if own.distance(other) < SLIVER_M * 4 else KEEP_APART_M, quad_segs=1) for other in near])
            fill, paved = fill.difference(others), paved.difference(others)
            arc = fill.boundary.difference(shapely.union_all([base] if others.is_empty else [base, others.boundary]).buffer(SLIVER_M))
            if not fill.is_empty and not arc.is_empty:
                found.append(Corner(_polygonal(fill), _less(paved, fill), arc, chain.index, True))
    return found


def carriageway_corners(chains: list[Chain], carriageways: dict[int, shapely.Geometry], prints: dict[int, dict[int, shapely.Geometry]], crosses: dict[int, Cross], tile: shapely.Polygon) -> list[Corner]:
    """Where a road ends on another, the corners between their carriageways, each filled out to an arc.

    Two carriageways laid by their classes meet at a corner as sharp as the angle between them, with the rounding all in
    the shoulders outside it: a square mouth of asphalt in a wide pale triangle either side, where a real junction's
    surface sweeps round from one road into the other. The arc's radius is the corner's own (`_corners`) and the strip
    past it, so that strip, or a street's kerb, runs round the arc at its own width.

    Not near a tile's edge, where each tile sees only its own side, and never over a path, which keeps its own paving."""
    found = []
    inner = tile.buffer(-EDGE_BAND_M, join_style="mitre")
    ground_prints = {index: by_level[GROUND] for index, by_level in prints.items() if GROUND in by_level}
    indices = list(ground_prints)
    tree = shapely.STRtree([ground_prints[index] for index in indices]) if indices else None
    for chain in chains:
        if not chain.motor or chain.index not in carriageways:
            continue
        for parent, _, at_start in chain.landings:
            if not parent.motor or parent.index not in carriageways:
                continue
            end = 0 if at_start else -1
            here = chain.xy[end]
            own, other = chain.tangent[end], parent.tangent[parent.tree.query(here)[1]]
            crossing = abs(float(own[0] * other[1] - own[1] * other[0]))
            cross = crosses[chain.index]
            kerbed = cross.walk_left[end] > 0 or cross.walk_right[end] > 0
            strip = KERB_STRIP_M if kerbed else float(min(cross.reach_left[end] - cross.half_left[end], cross.reach_right[end] - cross.half_right[end]))
            radius = max(APRON_CORNER_M[TIERS[chain.tier[end]]] * crossing**2, APRON_LEAST_CORNER_M) + strip
            zone = shapely.Point(here).buffer(float(chain.half[end] + parent.half.max()) + 3 * radius)
            both = shapely.union(carriageways[chain.index], carriageways[parent.index])
            local = shapely.intersection(both, zone.buffer(radius))
            fill = [part for part in _flat(shapely.intersection(_closed_in(local, radius, CORNER_ARC_SEGMENTS), zone)) if all(part.distance(carriageways[way.index]) < SLIVER_M * 4 for way in (chain, parent))]
            if not fill:
                continue
            # Joined on the paving's grid, as everything grown by a hair here is: shapes that share an edge to within a float's
            # rounding leave hair gaps between them, and growing across those gave an outline that crossed itself.
            others = shapely.union_all([carriageways[index] if chains[index].motor else ground_prints[index] for index in (indices[at] for at in tree.query(zone)) if index not in (chain.index, parent.index) and index in carriageways], grid_size=GRID_M / 20)
            fill = shapely.intersection(shapely.union_all(fill).difference(others.buffer(SLIVER_M, quad_segs=1)), inner)
            fill = fill.buffer(-CORNER_TIP_M / 2, join_style="mitre").buffer(CORNER_TIP_M / 2, join_style="mitre")
            fill = shapely.union_all([part for part in _flat(fill) if not part.buffer(-CORNER_LEAST_M / 2).is_empty])
            if fill.is_empty or not _agree([chain, parent], fill):
                continue
            ring = _less(shapely.intersection(fill.buffer(max(strip, OUTLINE_WITHIN_M), quad_segs=CORNER_ARC_SEGMENTS), inner), shapely.union_all([fill, local, others], grid_size=GRID_M / 20))
            found.append(Corner(fill, ring, fill.boundary.difference(local.buffer(SLIVER_M * 2)), chain.index))
    return found


def gores(chains: list[Chain], carriageways: dict[int, shapely.Geometry], prints: dict[int, dict[int, shapely.Geometry]], mouths: list[Corner], tile: shapely.Polygon) -> list[Corner]:
    """The wedge between two roads' carriageways where they run together, as asphalt back to where it is `GORE_M` wide,
    ended there on a round nose.

    Two roads that merge at a slant share their paving long before their carriageways meet, and the shoulder between them
    ran on to the meeting as a needle metres long, a pale spike down the middle of the asphalt. A built merge is asphalt
    right across the wedge, back to a nose wide enough to stand a kerb or a post on. The wedge is the lesser road's
    surface, and its nose is the edge of the asphalt, as a mouth's arc is.

    Only between two roads: a carriageway's own bend closes nothing. Only where the wedge is those roads' paving already,
    so it changes what the paving wears and paves nothing new: two roads a bank apart stay apart. Never over a path, which
    keeps its own paving; and not near a tile's edge, where each tile sees only its own side."""
    roads = [index for index in carriageways if chains[index].motor]
    if len(roads) < 2:
        return []
    asphalt = shapely.union_all([*(carriageways[index] for index in roads), *(found.fill for found in mouths)], grid_size=GRID_M / 20)
    paths = shapely.union_all([by_level[GROUND] for index, by_level in prints.items() if GROUND in by_level and not chains[index].motor], grid_size=GRID_M / 20)
    wedges = shapely.intersection(_closed_in(asphalt, GORE_M / 2, CORNER_ARC_SEGMENTS), tile.buffer(-EDGE_BAND_M, join_style="mitre")).difference(paths.buffer(SLIVER_M, quad_segs=1))
    wedges = wedges.buffer(-CORNER_TIP_M / 2, join_style="mitre").buffer(CORNER_TIP_M / 2, join_style="mitre")
    tree = shapely.STRtree([carriageways[index] for index in roads])
    found = []
    for wedge in _flat(wedges):
        between = [chains[roads[at]] for at in tree.query(wedge, predicate="dwithin", distance=SLIVER_M * 4)]
        if len(between) < 2:
            continue
        lesser = max(between, key=lambda chain: (chain.kind.rank, chain.index))
        laid = shapely.union_all([prints[chain.index][GROUND] for chain in between], grid_size=GRID_M / 20)
        for part in _flat(shapely.intersection(wedge, laid, grid_size=GRID_M / 20)):
            arc = part.boundary.difference(asphalt.buffer(SLIVER_M * 2))
            if not arc.is_empty and not part.buffer(-CORNER_LEAST_M / 2).is_empty:
                found.append(Corner(part, shapely.MultiPolygon(), arc, lesser.index))
    return found


def ground_shape(chains: list[Chain], prints: dict[int, dict[int, shapely.Geometry]], areas: shapely.Geometry, tile: shapely.Polygon, mouths: list[Corner] = ()) -> tuple[shapely.Geometry, shapely.Geometry]:
    """Everything paved on the ground's level, with its junctions' corners and the narrow gaps between ways paved too; and
    the corners of junctions with a street."""
    ground_prints = {index: by_level[GROUND] for index, by_level in prints.items() if GROUND in by_level}
    laid = shapely.union_all([*ground_prints.values(), areas])
    inner = tile.buffer(-EDGE_BAND_M, join_style="mitre")
    gaps = shapely.intersection(_closed_in(laid, GAP_PAVED_M / 2), inner)
    indices = list(ground_prints)
    joined = _between_ways(gaps, [chains[index] for index in indices], [ground_prints[index] for index in indices]) if indices else []
    corners = [(shapely.intersection(corner, inner), street) for corner, street in _corners(chains, ground_prints)]
    return shapely.union_all([laid, *joined, *(corner for corner, _ in corners), *(part for mouth in mouths for part in (mouth.fill, mouth.ring))]), shapely.union_all([corner for corner, street in corners if street])


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


def look_changes(chain: Chain, cross: Cross, looks: dict[int, tuple[np.ndarray, np.ndarray]], on_level: np.ndarray) -> list[shapely.LineString]:
    """Lines across a way wherever the surface it wears changes from one of its OSM ways to the next, half way between
    the stations either side, for the paving to be cut along: each piece then wears one surface, and two surfaces meet on
    a straight line across the way. Read point by point from the nearest station, they met in a smear over whichever
    triangles spanned the change: a wedge down a sidewalk where its slabs give way to tarmac."""
    classes, runs = looks[chain.index]
    here = np.zeros(len(chain.xy), dtype=bool)
    here[on_level] = True
    lines = []
    for station in np.flatnonzero(np.diff(chain.edge_at) != 0) + 1:
        before, after = chain.edge_at[station - 1], chain.edge_at[station]
        # Only a surface laid in a pattern shows which way it runs.
        same = classes[before] == classes[after] and (int(classes[before]) & CLASS_BITS not in LAID_ALONG or np.allclose(runs[before], runs[after]))
        if same or not (here[station - 1] and here[station]):
            continue
        middle = (chain.xy[station - 1] + chain.xy[station]) / 2
        across = chain.normal[station - 1] + chain.normal[station]
        across = across / max(float(np.hypot(*across)), 1e-9)
        left = max(cross.reach_left[station - 1], cross.reach_left[station]) + LOOK_CUT_PAST_M
        right = max(cross.reach_right[station - 1], cross.reach_right[station]) + LOOK_CUT_PAST_M
        lines.append(shapely.LineString([middle + left * across, middle - right * across]))
    return lines


def open_edges(chains: list[Chain], carriageways: dict[int, shapely.Geometry], mouths: list[Corner]) -> dict[int, np.ndarray]:
    """For each road, at each station, whether more carriageway lies beyond its edge on its left and on its right: another
    road's, where one joins or runs into it, or a mouth's fill.

    An edge line marks the edge of the carriageway. Drawn at every road's own edge, it ran on across the mouth of every
    road that joined, down the middle of the asphalt where two roads merge, and straight on beside a mouth's arc."""
    roads = [index for index in carriageways if chains[index].motor]
    if not roads:
        return {}
    shapes = [carriageways[index] for index in roads] + [found.fill for found in mouths]
    owners = np.array(roads + [JUNCTION] * len(mouths))
    tree = shapely.STRtree(shapes)
    found = {}
    for index in roads:
        chain = chains[index]
        sides = []
        for sign in (1, -1):
            beyond = chain.xy + sign * (chain.half + OPEN_EDGE_PROBE_M)[:, None] * chain.normal
            at, which = tree.query(shapely.points(beyond), predicate="within")
            opened = np.zeros(len(chain.xy), dtype=bool)
            opened[at[owners[which] != index]] = True
            sides.append(opened)
        if sides[0].any() or sides[1].any():
            found[index] = np.stack(sides)
    return found


def open_edge_changes(chain: Chain, cross: Cross, opened: np.ndarray) -> list[shapely.LineString]:
    """Lines from a road's middle out past its paving wherever its edge starts or stops having carriageway beyond it, for
    its carriageway to be cut along, so an edge line ends square. Each runs right across that side of the way: one that
    stopped at the carriageway's edge ended a hair to one side of it, and cut a needle off whatever lay there."""
    lines = []
    for side, sign, reach in zip(opened, (1, -1), cross.paving):
        for station in np.flatnonzero(np.diff(side.astype(int)) != 0) + 1:
            middle = (chain.xy[station - 1] + chain.xy[station]) / 2
            across = chain.normal[station - 1] + chain.normal[station]
            across = across / max(float(np.hypot(*across)), 1e-9)
            lines.append(shapely.LineString([middle, middle + sign * (max(reach[station - 1], reach[station]) + KEEP_APART_M) * across]))
    return lines


def _parts_worn(chains: list[Chain], reading: np.ndarray, middles: np.ndarray) -> np.ndarray:
    """Which OSM way of the way it reads each piece wears, by its middle; -1 for a piece that reads no one way."""
    part = np.full(len(reading), -1)
    xy = shapely.get_coordinates(middles)
    for index in np.unique(reading[reading >= 0]):
        mine = reading == index
        part[mine] = chains[index].edge_at[chains[index].tree.query(xy[mine])[1]]
    return part


def _borders(faces: np.ndarray) -> sparse.csr_matrix:
    """How much edge each pair of faces shares, in metres: faces cut from one linework share their edges point for point."""
    rings, of = shapely.get_rings(faces, return_index=True)
    coords, ring = shapely.get_coordinates(rings, return_index=True)
    joined = ring[1:] == ring[:-1]
    start, end, face = coords[:-1][joined], coords[1:][joined], of[ring[:-1][joined]]
    flip = (start[:, 0] > end[:, 0]) | ((start[:, 0] == end[:, 0]) & (start[:, 1] > end[:, 1]))
    low, high = np.where(flip[:, None], end, start), np.where(flip[:, None], start, end)
    _, inverse, counts = np.unique(np.column_stack((low, high)), axis=0, return_inverse=True, return_counts=True)
    inverse = inverse.ravel()
    order = np.argsort(inverse, kind="stable")
    shared = counts[inverse[order]] == 2
    pairs = face[order][shared].reshape(-1, 2)
    length = np.hypot(*(high - low).T)[order][shared].reshape(-1, 2)[:, 0]
    both = (np.concatenate((pairs[:, 0], pairs[:, 1])), np.concatenate((pairs[:, 1], pairs[:, 0])))
    return sparse.coo_matrix((np.concatenate((length, length)), both), shape=(len(faces), len(faces))).tocsr()


def _wear(looks: dict[int, tuple[np.ndarray, np.ndarray]], owner: np.ndarray, driven: np.ndarray, walk: np.ndarray, look: np.ndarray, mouth: np.ndarray, beside: np.ndarray, part: np.ndarray) -> np.ndarray:
    """What each piece shows, as `point_attributes` will have it drawn: a path's class, or a road's carriageway, a shoulder,
    a car park, or a sidewalk its street's tags map."""
    worn = (look != JUNCTION) & (walk | (owner == JUNCTION))
    reading = np.where(worn, look, np.where(owner == JUNCTION, beside, owner))
    said = np.full(len(owner), NONE)
    known = np.flatnonzero((reading >= 0) & (part >= 0))
    said[known] = [int(looks[way][0][edge]) & CLASS_BITS for way, edge in zip(reading[known], part[known])]
    plain = np.where(worn, np.where(np.isin(mouth, RING_MOUTHS), SHOULDER_WEAR, ROAD_WEAR), np.where(driven & (owner >= 0), ROAD_WEAR, SHOULDER_WEAR))
    wear = np.where(said != NONE, said, plain)
    wear[(owner >= 0) & walk & (look == JUNCTION)] = TAGGED_WEAR
    wear[owner == AREA] = AREA_WEAR
    return wear


def _worn_as(target: int, owner: np.ndarray, driven: np.ndarray, walk: np.ndarray, look: np.ndarray, mouth: np.ndarray, beside: np.ndarray) -> tuple[int, bool, int, int]:
    """The owner, sidewalk band, look and way beside it that make a piece show what piece `target` shows.

    A way's own carriageway is measured across that way, which a piece outside it can't be: it borrows the way's surface
    instead, as a corner beside a path does."""
    if owner[target] == AREA or (owner[target] >= 0 and walk[target] and look[target] == JUNCTION):
        return int(owner[target]), bool(walk[target]), JUNCTION, JUNCTION
    if look[target] != JUNCTION and (walk[target] or owner[target] == JUNCTION):
        if mouth[target] in RING_MOUTHS:
            return JUNCTION, False, JUNCTION, int(look[target])
        return JUNCTION, False, int(look[target]), JUNCTION
    if owner[target] == JUNCTION:
        return JUNCTION, False, JUNCTION, int(beside[target])
    if driven[target]:
        return JUNCTION, False, int(owner[target]), JUNCTION
    return JUNCTION, False, JUNCTION, int(owner[target])


def without_specks(looks: dict[int, tuple[np.ndarray, np.ndarray]], faces: np.ndarray, kept: np.ndarray, owner: np.ndarray, driven: np.ndarray, walk: np.ndarray, look: np.ndarray, mouth: np.ndarray, beside: np.ndarray, part: np.ndarray) -> None:
    """Gives every piece too small or too thin to read as a surface of its own the surface of its neighbour, in place.

    Cut along every way's outline, the paving is left with scraps where outlines cross at a slant: a square metre of a
    cycleway's tarmac across a street from the rest of it, a needle of slabs between a carriageway and its shoulder, a
    triangle of shoulder in the asphalt of a junction. Each is right by the rule that made it and reads as a mistake. A
    stretch of one surface under `SPECK_M2`, all its pieces together, wears what lies along most of its edge; so does a
    piece under `SLIVER_WIDE_M` wide whose longer side is another surface's. Each wears the very stretch of the way its
    neighbour wears, its `part`: two paths mapped along one line are one way of two surfaces, and a scrap read at its own
    middle was the wrong one again. A shoulder is narrow by nature, with its road along one side of it: it is a sliver
    only with one surface nearly all round it, a hairline between two carriageways. Steps, car parks and the sidewalks a
    street's tags map are left as they are, and so is every piece not in `kept`: near a tile's edge each tile sees only
    its own side."""
    borders = _borders(faces)
    area = shapely.area(faces)
    thin = shapely.is_empty(shapely.buffer(faces, -SLIVER_WIDE_M / 2, join_style="mitre"))
    round_it = shapely.length(faces)
    first, second = borders.nonzero()
    shared = np.asarray(borders[first, second]).ravel()
    count = len(faces)
    for _ in range(SPECK_PASSES):
        wear = _wear(looks, owner, driven, walk, look, mouth, beside, part)
        alike = wear[first] == wear[second]
        _, island = connected_components(sparse.coo_matrix((np.ones(alike.sum()), (first[alike], second[alike])), shape=(count, count)), directed=False)
        fixed = np.isin(wear, (STEPS, AREA_WEAR, TAGGED_WEAR)) | ~kept
        speck = ((np.bincount(island, weights=area) < SPECK_M2) & (np.bincount(island, weights=fixed) == 0))[island]
        same = np.bincount(first[alike], weights=shared[alike], minlength=count)
        sliver = thin & ~fixed & ~speck
        changes = {}
        # A speck is a whole stretch of surface, taken together; a sliver is one piece. Each wears the stretch of surface it
        # shares most edge with, as the piece of that stretch it touches most shows it.
        for group, taken in ((island, speck), (np.arange(count), sliver)):
            of = np.flatnonzero(taken[first] & ~alike & ~speck[second])
            if not len(of):
                continue
            pairs, which = np.unique(np.column_stack((group[first[of]], island[second[of]])), axis=0, return_inverse=True)
            which = which.ravel()
            most = np.bincount(which, weights=shared[of])
            for mine in np.unique(pairs[:, 0]):
                rows = np.flatnonzero(pairs[:, 0] == mine)
                best = rows[most[rows].argmax()]
                if group is not island and most[best] < (SHOULDER_SLIVER_ROUND * round_it[mine] if wear[mine] == SHOULDER_WEAR else SLIVER_SIDES * same[mine]):
                    continue
                touching = of[which == best]
                target = second[touching[shared[touching].argmax()]]
                for piece in np.flatnonzero(group == mine) if group is island else (mine,):
                    changes[int(piece)] = (*_worn_as(int(target), owner, driven, walk, look, mouth, beside), int(part[target]))
        if not changes:
            break
        for piece, (whose, on_walk, worn, near, of) in changes.items():
            owner[piece], walk[piece], look[piece], beside[piece], part[piece], mouth[piece], driven[piece] = whose, on_walk, worn, near, of, NO_MOUTH, False


def joined_up(faces: np.ndarray, alike: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """The faces with each set that meet edge to edge and share a row of `alike` made one face, and for each face one of
    the faces it was made of.

    The paving is cut along every way's outline, and most of those lines mean nothing inside a piece no way owns: a
    junction's mouth lay in a dozen pieces, cut by the ends of the outlines of the roads that met there, each triangulated
    on its own. A way's own pieces stay as cut: the line down its middle is where its crown is."""
    first, second = _borders(faces).nonzero()
    same = (alike[first] == alike[second]).all(axis=1)
    count, group = connected_components(sparse.coo_matrix((np.ones(same.sum()), (first[same], second[same])), shape=(len(faces), len(faces))), directed=False)
    order = np.argsort(group, kind="stable")
    starts = np.flatnonzero(np.diff(group[order], prepend=-1))
    ends = np.append(starts[1:], len(order))
    of = order[starts]
    joined = faces[of].copy()
    for which in np.flatnonzero(ends - starts > 1):
        joined[which] = shapely.union_all(faces[order[starts[which] : ends[which]]])
    return joined, of


def pieces_of(chains: list[Chain], prints: dict[int, dict[int, shapely.Geometry]], carriageways: dict[int, shapely.Geometry], levels: dict[int, np.ndarray], paved: shapely.Geometry, areas: shapely.Geometry, kerbs: dict[int, shapely.Geometry], crosses: dict[int, Cross], sidewalks: set[int], sections: list[SeamSection], street_corners: shapely.Geometry, tile: shapely.Polygon, looks: dict[int, tuple[np.ndarray, np.ndarray]], mouths: list[Corner] = ()) -> list[Piece]:
    """The paved shape cut along every way's outline, carriageway, kerb and centre line, each piece owned by the greatest way
    whose carriageway holds it, or failing that the greatest whose shoulder does: a road's shoulder never runs across the
    mouth of another road that joins it. A street's piece past its kerb, where it has one, is its sidewalk's.

    A piece no way's outline holds, beside a path (a strip between a street and its sidewalk, a corner the path turns),
    wears that path's surface, and so does a street's sidewalk: drawn as shoulders, they faded to the photo's colour, a
    pale band along the street.

    Each piece wears one surface: where the surface a way wears changes along it, the paving is cut across the way
    (`look_changes`).

    A junction's mouth (`carriageway_corners`) is its joining road's surface out to its arc, whatever shoulder lay there,
    and the strip round the arc is drawn as the shoulders round it."""
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
    lines += [shapely.intersection(line, paved) for index in ground_prints for line in look_changes(chains[index], crosses[index], looks, np.flatnonzero(levels[index] == GROUND))]
    lines += [shapely.intersection(part.boundary, paved) for mouth in mouths for part in (mouth.fill, mouth.ring)]
    opened = open_edges(chains, carriageways, mouths)
    lines += [shapely.intersection(line, paved) for index, sides in opened.items() for line in open_edge_changes(chains[index], crosses[index], sides)]
    # On a grid as fine as the outlines are kept to, before it's cut: lines that nearly meet become one, and no two pieces overlap.
    # Long straight edges are cut so a profile's bend still shows along them: once, on the shared lines, so two pieces cut theirs alike.
    linework = shapely.segmentize(shapely.union_all([line for line in lines if not line.is_empty], grid_size=GRID_M), LONGEST_SECTION_M)
    faces = shapely.get_parts(shapely.polygonize(shapely.get_parts(linework)))
    middles = shapely.point_on_surface(faces)
    on_paving = paved.buffer(SLIVER_M)
    inside = shapely.contains(on_paving, middles)
    faces, middles = faces[inside], middles[inside]
    owner = _greatest(chains, carriageways, middles)
    driven = owner != JUNCTION
    by_shoulder = _greatest(chains, ground_prints, middles)
    owner = np.where(owner == JUNCTION, by_shoulder, owner)
    walk_bands = {index: _polygonal(shapely.difference(ground_prints[index], kerb.buffer(SLIVER_M))) for index, kerb in kerbs.items() if index in ground_prints}
    owner = _sidewalks_across_driveways(chains, {index: shape for index, shape in carriageways.items() if index in sidewalks}, walk_bands, middles, owner)
    owner[(owner == JUNCTION) & shapely.contains(areas.buffer(SLIVER_M), middles)] = AREA
    walk = np.zeros(len(faces), dtype=bool)
    for index, kerb in kerbs.items():
        mine = np.flatnonzero(owner == index)
        walk[mine] = ~shapely.contains(kerb.buffer(SLIVER_M), middles[mine])
    look = np.full(len(faces), JUNCTION)
    # A junction's corner with a street is drawn as the shoulders round it: wearing a path's surface, a sidewalk's flare
    # round a side street's corner stood out as a dark flap beyond the street's pale paving.
    borrows = ((owner == JUNCTION) & ~shapely.contains(street_corners.buffer(SLIVER_M), middles)) | walk
    if borrows.any():
        xy = shapely.get_coordinates(middles[borrows])
        look[borrows] = _paths_worn(chains, crosses, xy, _streets_run(chains, ground_prints, owner[borrows], xy), on_paving)
    mouth = np.full(len(faces), NO_MOUTH)
    if mouths:
        # Whatever shoulder or sidewalk band lay in a mouth's corner is the mouth's, but never a carriageway or a car park.
        free = ~driven & (owner != AREA)
        for ring, shapes in ((True, [found.ring for found in mouths]), (False, [found.fill for found in mouths])):
            held, at = shapely.STRtree([shape.buffer(SLIVER_M) for shape in shapes]).query(middles, predicate="within")
            held, at = held[free[held]], at[free[held]]
            owner[held], walk[held] = JUNCTION, False
            look[held] = [mouths[index].way for index in at]
            mouth[held] = [(END_RING if ring else END_FILL) if mouths[index].end else (MOUTH_RING if ring else MOUTH_FILL) for index in at]
    # A piece drawn as the shoulders round it carries one way's class whole, the nearest to its middle: read point by
    # point, a corner between a street and a sidewalk carried slabs at some points and none at others, a smear across it.
    beside = np.full(len(faces), JUNCTION)
    bare = np.flatnonzero((owner == JUNCTION) & (look == JUNCTION))
    if len(bare):
        stations = np.concatenate([chains[index].xy for index in ground_prints])
        of = np.concatenate([np.full(len(chains[index].xy), index) for index in ground_prints])
        beside[bare] = of[cKDTree(stations).query(shapely.get_coordinates(middles[bare]))[1]]
    part = _parts_worn(chains, np.where((look != JUNCTION) & (walk | (owner == JUNCTION)), look, np.where(owner == JUNCTION, beside, owner)), middles)
    without_specks(looks, faces, shapely.contains(tile.buffer(-EDGE_BAND_M, join_style="mitre"), faces), owner, driven, walk, look, mouth, beside, part)
    # A way's own piece is alike to none: each has a row of its own.
    faces, of = joined_up(faces, np.column_stack((np.where(owner == JUNCTION, -1, np.arange(len(faces))), look, mouth, beside, part)))
    middles = shapely.point_on_surface(faces)
    owner, driven, walk, look, mouth, beside, part = (values[of] for values in (owner, driven, walk, look, mouth, beside, part))
    unlined = np.zeros(len(faces), dtype=bool)
    places = shapely.get_coordinates(middles)
    for index, sides in opened.items():
        mine = np.flatnonzero(driven & (owner == index))
        chain = chains[index]
        station = chain.tree.query(places[mine])[1]
        left = ((places[mine] - chain.xy[station]) * chain.normal[station]).sum(-1) >= 0
        unlined[mine] = np.where(left, sides[0][station], sides[1][station])
    found = [Piece(face, int(who), GROUND, bool(on_walk), int(worn), int(of), int(at_mouth), bool(no_line), int(near)) for face, who, on_walk, worn, of, at_mouth, no_line, near in zip(faces, owner, walk, look, part, mouth, unlined, beside)]
    found += _off_ground_pieces(chains, prints, levels, crosses, paved, tile, BELOW, looks)
    found += _off_ground_pieces(chains, prints, levels, crosses, paved, tile, ABOVE, looks)
    return found


def _streets_run(chains: list[Chain], prints: dict[int, shapely.Geometry], owner: np.ndarray, xy: np.ndarray) -> np.ndarray:
    """The way the street a piece lies beside runs: its owner's, or that of the motor way whose paving is nearest, within a
    closed gap of it; none, (0, 0), where no street is.

    By its paving, not its stations: a side street's last station stands on the line of the street it joins, so a piece
    across that street from the side street's mouth was as near one's station as the other's, and beside either."""
    streets = [chains[index] for index in prints if chains[index].motor]
    runs = np.zeros((len(xy), 2))
    if not streets or not len(xy):
        return runs
    at, nearest = shapely.STRtree([prints[chain.index] for chain in streets]).query_nearest(shapely.points(xy), max_distance=GAP_PAVED_M + STATION_M, all_matches=False)
    for street in np.unique(nearest):
        mine = at[nearest == street]
        runs[mine] = streets[street].tangent[streets[street].tree.query(xy[mine])[1]]
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


def is_driveway(road: dict) -> bool:
    """Whether a service way is a drive into a yard or a car park, which a sidewalk carries on across, rather than a street
    OSM files as a service way. A named one is a street, as Stava Mostersvägen is, unless OSM says it is a drive, a car
    park's aisle or a drive-through; an unnamed one is a drive, however long or wherever it leads, since in a Nordic town a
    yard's or a car park's lane meets the street as a drive does, its mouth kerbed across the sidewalk."""
    return road["kind"] == "service" and (not road.get("name") or road.get("service") in DRIVE_SERVICES)


def _sidewalks_across_driveways(chains: list[Chain], sidewalks: dict[int, shapely.Geometry], walk_bands: dict[int, shapely.Geometry], middles: np.ndarray, owner: np.ndarray) -> np.ndarray:
    """Where a driveway (`is_driveway`) crosses a sidewalk, the sidewalk is the sidewalk's: its slabs carry on across the
    drive's mouth, as real ones do, rather than the drive's asphalt cutting it. That is the sidewalk's own carriageway, and
    the street's band past its kerb that wears the sidewalk's surface, so the drive meets the street at the kerb. A
    service way running along a sidewalk keeps what it holds, a street crossing one keeps its crossing, and a path out in
    the country, beside no street, is crossed by the drive."""
    owner = owner.copy()
    xy = shapely.get_coordinates(middles)
    for walks in (sidewalks, walk_bands):
        service = np.array([who >= 0 and chains[who].motor and chains[who].kind_name == "service" for who in owner], dtype=bool)
        if not walks or not service.any():
            continue
        holder = _greatest(chains, walks, middles)
        for piece in np.flatnonzero(service & (holder != JUNCTION)):
            drive, walk = chains[owner[piece]], chains[holder[piece]]
            at = drive.tree.query(xy[piece])[1]
            if not is_driveway(drive.edges[drive.edge_at[at]].road):
                continue
            theirs, mine = drive.tangent[at], walk.tangent[walk.tree.query(xy[piece])[1]]
            if abs(float(theirs[0] * mine[1] - theirs[1] * mine[0])) > CROSSING_SINE:
                owner[piece] = holder[piece]
    return owner


def _off_ground_pieces(chains: list[Chain], prints: dict[int, dict[int, shapely.Geometry]], levels: dict[int, np.ndarray], crosses: dict[int, Cross], paved: shapely.Geometry, tile: shapely.Polygon, level: int, looks: dict[int, tuple[np.ndarray, np.ndarray]]) -> list[Piece]:
    """The paving on a level off the ground, merged as the ground's is: two paths sharing an underpass are one floor, and
    two ways meeting on a bridge one deck. It's cut along every way's carriageway and centre line, as the ground's is, so
    the edge of a road's carriageway is where its points are, and where the ground's paving passes over or under it, so an
    underpass's points stand under the deck's edges and its walls rise from them."""
    on_level = {index: by_level[level] for index, by_level in prints.items() if level in by_level}
    if not on_level:
        return []
    indices = list(on_level)
    laid = shapely.union_all(list(on_level.values()))
    joined = _between_ways(_closed_in(laid, GAP_PAVED_M / 2), [chains[index] for index in indices], [on_level[index] for index in indices])
    shape = shapely.union_all([laid, *joined])
    carriageways = {index: footprints(chains[index], levels[index], tile, crosses[index].carriageway).get(level) for index in indices}
    carriageways = {index: shapely.intersection(found, shape) for index, found in carriageways.items() if found is not None}
    lines = [shape.boundary, shapely.intersection(paved.boundary, shape)]
    lines += [shapely.intersection(part.boundary, shape) for part in [*on_level.values(), *carriageways.values()]]
    for index in indices:
        chain = chains[index]
        # A way's outline on a level reaches a station either side of its run there, and so does its centre line.
        for first, last in _runs(levels[index] == level):
            line = shapely.LineString(chain.xy[max(first - 1, 0) : last + 2])
            lines.append(shapely.intersection(shapely.simplify(line, OUTLINE_WITHIN_M), shape))
    lines += [shapely.intersection(line, shape) for index in indices for line in look_changes(chains[index], crosses[index], looks, np.flatnonzero(levels[index] == level))]
    linework = shapely.segmentize(shapely.union_all([line for line in lines if not line.is_empty], grid_size=GRID_M), LONGEST_SECTION_M)
    faces = shapely.get_parts(shapely.polygonize(shapely.get_parts(linework)))
    middles = shapely.point_on_surface(faces)
    inside = shapely.contains(shape.buffer(SLIVER_M), middles)
    faces, middles = faces[inside], middles[inside]
    owner = _greatest(chains, carriageways, middles)
    owner = np.where(owner == JUNCTION, _greatest(chains, on_level, middles), owner)
    part = _parts_worn(chains, owner, middles)
    return [Piece(face, int(who), level, part=int(of)) for face, who, of in zip(faces, owner, part)]


@dataclass
class Mesh:
    xy: np.ndarray
    level: np.ndarray
    triangles: np.ndarray  # Into `xy`, one geometric point however many pieces share it.
    owner: np.ndarray  # Each triangle's piece's owner.
    walk: np.ndarray  # Whether each triangle's piece is its street's sidewalk.
    look: np.ndarray  # The path whose surface each triangle's piece wears, or JUNCTION for its owner's own.
    part: np.ndarray  # Which OSM way of that way each triangle's piece wears, or -1.
    mouth: np.ndarray  # Whether each triangle's piece is a junction's mouth's fill or ring.
    open: np.ndarray  # Whether each triangle's piece is carriageway with more carriageway beyond its edge.
    beside: np.ndarray  # The way whose class each triangle's piece carries, if it is drawn as the shoulders round it.


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
    part = np.array([piece.part for piece in pieces])[which]
    mouth = np.array([piece.mouth for piece in pieces])[which]
    opened = np.array([piece.open for piece in pieces])[which]
    beside = np.array([piece.beside for piece in pieces])[which]
    used, indices = np.unique(indices[solid], return_inverse=True)
    return Mesh(points[used, :2], points[used, 2].astype(int), indices.reshape(-1, 3), owner[solid], walk[solid], look[solid], part[solid], mouth[solid], opened[solid], beside[solid])


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


def span_ends(mesh: Mesh, chains: list[Chain], levels: dict[int, np.ndarray], crosses: dict[int, Cross]) -> np.ndarray:
    """The points of a deck, or of an underpass's floor, on the lines where its span ends: where it lands on the ground's
    paving, its own way's carrying on or the road it joins."""
    lines = []
    for chain in chains:
        if chain.index not in levels or chain.index not in crosses:
            continue
        cross, last = crosses[chain.index], len(chain.xy) - 1
        for level in (ABOVE, BELOW):
            for first, final in _runs(levels[chain.index] == level):
                # A way's outline on a level reaches a station either side of its run there.
                for station in (max(first - 1, 0), min(final + 1, last)):
                    middle, normal = chain.xy[station], chain.normal[station]
                    lines.append(shapely.LineString([middle + cross.reach_left[station] * normal, middle - cross.reach_right[station] * normal]))
    off = np.flatnonzero(mesh.level != GROUND)
    if not lines or not len(off):
        return np.zeros(0, dtype=int)
    at, _ = shapely.STRtree(lines).query(shapely.points(mesh.xy[off]), predicate="dwithin", distance=LANDING_WITHIN_M)
    return off[np.unique(at)]


def solve_heights(mesh: Mesh, surfaces: Surfaces, ground: Ground, sections: list[SeamSection], landings: np.ndarray = np.zeros(0, dtype=int)) -> np.ndarray:
    """One height per point of paving, from one least-squares solve: levels share no points, so each solves on its own.

    Each point leans towards its owner's surface, as stiffly as its owner's rank allows; each edge keeps the difference the
    greater of its ends' owners has between them. A point no way owns only follows its neighbours.

    A span off the ground is then solved again with its `landings`, the points on the lines where it ends, held to the
    ground's paving there: by its own surface alone a deck's end stood off the road it lands on, by a hand's width where
    that road slopes across it and by more than a metre where a greater road had bent its approach.
    """
    chains = surfaces.chains
    count = len(mesh.xy)
    # A point's owner is the greatest of the pieces round it: a way before a car park before a junction's corner. A way's
    # round end is the way's own here: with no other road to follow, it stands on its way's profile.
    owner = np.where(np.isin(mesh.mouth, ENDS), mesh.look, mesh.owner)
    code = np.where(owner >= 0, owner, OWNER_CODES - owner)
    point_code = np.full(count, np.iinfo(np.int64).max)
    np.minimum.at(point_code, mesh.triangles.ravel(), np.repeat(_ranks(owner, chains) * OWNER_CODES * 2 + code, 3))
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
    smooth = SMOOTHNESS * (steps.T @ steps)
    kept = SMOOTHNESS * (steps.T @ difference)
    heights = spsolve((sparse.diags(weight) + smooth).tocsc(), weight * target + kept)
    heights[on_edge] = target[on_edge]
    if len(landings):
        met = Cover(_level_triangles(mesh, heights, GROUND)).at(mesh.xy[landings], LANDING_WITHIN_M)
        landed = landings[~np.isnan(met)]
        if len(landed):
            weight, target = weight.copy(), target.copy()
            weight[landed], target[landed] = PIN_WEIGHT, met[~np.isnan(met)]
            off = np.flatnonzero(mesh.level != GROUND)
            system = (sparse.diags(weight) + smooth).tocsr()[off][:, off]
            heights[off] = spsolve(system.tocsc(), (weight * target + kept)[off])
    return heights


class Cover:
    """The height of a set of 3D triangles at points, NaN where none lies."""

    def __init__(self, triangles: np.ndarray):
        self.triangles = triangles
        self.tree = shapely.STRtree(shapely.polygons(np.concatenate((triangles[:, :, :2], triangles[:, :1, :2]), axis=1))) if len(triangles) else None

    def at(self, xy: np.ndarray, within: float = ON_EDGE_M) -> np.ndarray:
        height = np.full(len(xy), np.nan)
        if self.tree is None or not len(xy):
            return height
        points = shapely.points(xy)
        at, which = self.tree.query(points, predicate="intersects")
        # A point rounded to the millimetre can land just off the edge it lies on: it takes the nearest triangle's plane.
        off = np.setdiff1d(np.arange(len(xy)), at)
        if len(off):
            near_at, near = self.tree.query_nearest(points[off], max_distance=within)
            at, which = np.concatenate((at, off[near_at])), np.concatenate((which, near))
        planes = _on_planes(self.triangles[which], xy[at])
        found = ~np.isnan(planes)
        height[at[found]] = planes[found]
        return height

    def nearest(self, xy: np.ndarray, heights: np.ndarray) -> np.ndarray:
        """The height at points where triangles lie over each other, on a bridge or an underpass, on the one nearest each
        point's own height; one within its outline's tolerance counts, as a deck's edge stands over the floor running on under it."""
        found = np.full(len(xy), np.nan)
        if self.tree is None or not len(xy):
            return found
        at, which = self.tree.query(shapely.points(xy), predicate="dwithin", distance=OUTLINE_WITHIN_M)
        planes = _on_planes(self.triangles[which], xy[at])
        solid = ~np.isnan(planes)
        at, planes = at[solid], planes[solid]
        order = np.lexsort((np.abs(planes - heights[at]), at))
        first = order[np.concatenate(([True], at[order][1:] != at[order][:-1]))] if len(order) else order
        found[at[first]] = planes[first]
        return found

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
        height[at] = _on_planes(self.triangles[which], xy[at])
        return height


def _on_planes(triangles: np.ndarray, xy: np.ndarray) -> np.ndarray:
    """Each point's height on its own triangle's plane, NaN for a triangle with no area in plan."""
    a, b, c = np.moveaxis(triangles, 1, 0)
    area = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
    solid = np.abs(area) > 1e-9
    height = np.full(len(xy), np.nan)
    a, b, c, area, offset = a[solid], b[solid], c[solid], area[solid], xy[solid] - c[solid, :2]
    first = ((b[:, 1] - c[:, 1]) * offset[:, 0] + (c[:, 0] - b[:, 0]) * offset[:, 1]) / area
    second = ((c[:, 1] - a[:, 1]) * offset[:, 0] + (a[:, 0] - c[:, 0]) * offset[:, 1]) / area
    height[solid] = first * a[:, 2] + second * b[:, 2] + (1 - first - second) * c[:, 2]
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


def _envelope(paving: np.ndarray, spacing: float, upwards: bool) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """How high (or low) the land may stand at every corner by the paving's edges, the edge height each limit comes from,
    and how far off that edge is.

    The limit grows with distance, out from every corner under the paving: by the verge's slope on the verge, and by the
    bank's past it.
    """
    sign = 1.0 if upwards else -1.0
    under = ~np.isnan(paving)
    limit = np.where(under, paving, sign * np.inf).astype(np.float64)
    source = np.where(under, paving, np.nan)
    far = np.where(under, 0.0, np.inf)
    slope = np.where(ndimage.distance_transform_edt(~under) * spacing <= VERGE_M, VERGE_SLOPE, EMBANKMENT_SLOPE)
    size = paving.shape[0]
    shifts = [(row, column, np.hypot(row, column) * spacing) for row in (-1, 0, 1) for column in (-1, 0, 1) if row or column]
    for _ in range(EMBANKMENT_PASSES):
        for row, column, length in shifts:
            here = (slice(max(row, 0), size + min(row, 0)), slice(max(column, 0), size + min(column, 0)))
            there = (slice(max(-row, 0), size + min(-row, 0)), slice(max(-column, 0), size + min(-column, 0)))
            reached = limit[there] + sign * length * slope[here]
            better = sign * reached < sign * limit[here]
            limit[here] = np.where(better, reached, limit[here])
            source[here] = np.where(better, source[there], source[here])
            far[here] = np.where(better, far[there] + length, far[here])
    return limit, source, far


def embanked(raw: np.ndarray, paving: np.ndarray, spacing: float) -> np.ndarray:
    """The land beside the paving rising or falling away from its edge no faster than a bank or a cutting.

    `paving` is the paving's height at every corner under it, NaN elsewhere. Under the paving the land lies just beneath it.
    Where a higher way's bank and a lower way's cutting overlap, there's no room for both: the land slopes from one edge to
    the other, rather than either digging the other's land away.
    """
    under = ~np.isnan(paving)
    upper, upper_from, to_upper = _envelope(paving, spacing, upwards=True)
    lower, lower_from, to_lower = _envelope(paving, spacing, upwards=False)
    with np.errstate(invalid="ignore", divide="ignore"):
        between = (upper_from * to_lower + lower_from * to_upper) / (to_upper + to_lower)
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
    """Every grid cell the paving touches, as ground triangulated between its corners and the paving's edge.

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
    near = shapely.intersection(shapely.buffer(block_boxes, step, join_style="mitre"), cut_from)

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
    # Only cells the paving touches: a cell it doesn't is the grid's own two triangles, which the game draws by itself.
    touched = np.zeros((cells, cells), dtype=bool)
    touched[rows, columns] = shapely.intersects(block_of(rows, columns), boxes(rows, columns))
    rows, columns = np.nonzero(touched)
    open_ground = shapely.difference(boxes(rows, columns), block_of(rows, columns))
    pieces, which = shapely.get_parts(shapely.constrained_delaunay_triangles(open_ground), return_index=True)
    corners = np.round(shapely.get_coordinates(pieces).reshape(-1, 4, 2)[:, :3], 3)
    flat = corners.reshape(-1, 2)
    node_row, node_column, on_node = _nodes_at(flat, ground, step)
    height = np.where(on_node, nodes[np.clip(node_row, 0, cells), np.clip(node_column, 0, cells)], np.nan)
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
    edge_points, edge_triangles = closed_against_paving(points, indices, cover, ground, step)
    points_all = np.concatenate((points, crack_points, edge_points))
    triangles_all = np.concatenate((indices, crack_triangles + len(points), edge_triangles + len(points) + len(crack_points)))
    return rows * cells + columns, points_all, triangles_all


def _nodes_at(xy: np.ndarray, ground: Ground, step: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """The grid node nearest each point, as its row and column, and whether the point is on it."""
    column_at = (xy[:, 0] - ground.west) / step
    row_at = (ground.north - xy[:, 1]) / step
    on = (np.abs(column_at - np.round(column_at)) < 1e-3 / step) & (np.abs(row_at - np.round(row_at)) < 1e-3 / step)
    return np.round(row_at).astype(int), np.round(column_at).astype(int), on


def closed_against_paving(points: np.ndarray, triangles: np.ndarray, cover: Cover, ground: Ground, step: float) -> tuple[np.ndarray, np.ndarray]:
    """Upright faces where an edge of cut ground lies along the paving's edge but its corner took another piece's height.

    Where two ways at different heights meet, one corner of cut ground can border both, and it has one height: along the
    edge it shares with the other way, the gap is closed.
    """
    ends = np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]])
    a, b = points[ends[:, 0]], points[ends[:, 1]]
    candidate = ~(_nodes_at(a[:, :2], ground, step)[2] & _nodes_at(b[:, :2], ground, step)[2])
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
    return _both_faces(np.stack((a, b, np.column_stack((b[:, :2], paving_b)), np.column_stack((a[:, :2], paving_a))), axis=1))


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
    return _both_faces(np.stack((np.column_stack((a, z[torn, 0])), np.column_stack((b, z[torn, 1])), np.column_stack((b, z[torn + 1, 1])), np.column_stack((a, z[torn + 1, 0]))), axis=1))


def _both_faces(quads: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Upright quads, (n, 4, 3), as points and the triangles of both their faces: which side a portal or a wall is seen
    from depends on where the camera is."""
    first = np.arange(len(quads))[:, None] * 4
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
    return _both_faces(np.array(quads))


def point_attributes(mesh: Mesh, heights: np.ndarray, chains: list[Chain], surfaces: Surfaces, crosses: dict[int, Cross], carriageways: dict[int, shapely.Geometry], outline: shapely.Geometry, looks: dict[int, tuple[np.ndarray, np.ndarray]], mouths: list[Corner] = ()) -> tuple[np.ndarray, np.ndarray, int, int]:
    """Each piece's corners with what the road's look reads: across its way, the way's tier, how far along it, which way,
    what that way is paved with, and which way it runs, as the cosine and sine of twice its angle: paving looks the same
    turned half round, and a doubled angle has no jump for a triangle to blend across.

    A corner shared by pieces of different ways is one point for each, at one place and height, so each piece keeps its own
    way's look up to its edge. The points of pieces no way owns that are drawn as the shoulders round them come after the
    ways' own, and a car park's last, with how many of each.
    """
    # A point is one for each way whose pieces meet there, and for each look they wear: each piece keeps its own up to its edge.
    keys = np.column_stack((mesh.triangles.ravel(), np.repeat(mesh.owner, 3), np.repeat(mesh.walk, 3), np.repeat(mesh.look, 3), np.repeat(mesh.part, 3), np.repeat(mesh.mouth, 3), np.repeat(mesh.open, 3), np.repeat(mesh.beside, 3)))
    unique, index = np.unique(keys, axis=0, return_inverse=True)
    point, owner, walk, path, part, mouth, opened, beside = unique[:, 0], unique[:, 1], unique[:, 2].astype(bool), unique[:, 3], unique[:, 4], unique[:, 5], unique[:, 6].astype(bool), unique[:, 7]
    xy = mesh.xy[point]
    # A piece wearing a path's surface (a street's sidewalk band, a corner or gap beside the path) reads that path's look;
    # one no way owns otherwise, and a car park, the nearest way's.
    worn = (path != JUNCTION) & (walk | (owner == JUNCTION))
    reading = np.where(worn, path, np.where(owner >= 0, owner, surfaces.nearest(xy)))
    # A car park is a carriageway of its own.
    across = np.full(len(unique), APRON_ACROSS)
    tier = np.zeros(len(unique))
    along = np.zeros(len(unique))
    surface = np.full(len(unique), NONE, dtype=float)
    run = np.zeros((len(unique), 2))
    for chain_index in np.unique(reading):
        chain = chains[chain_index]
        mine = np.flatnonzero(reading == chain_index)
        station = chain.tree.query(xy[mine])[1]
        tier[mine] = chain.tier[station]
        paved = owner[mine] != AREA
        classes, runs = looks[chain_index]
        # A piece wears one OSM way's surface whole; one drawn as the shoulders round it reads the nearest way at each point.
        edge = np.where((part[mine] >= 0) & ((owner[mine] >= 0) | worn[mine]), part[mine], chain.edge_at[station])
        surface[mine[paved]] = classes[edge[paved]]
        run[mine[paved]] = runs[edge[paved]]
        along[mine[paved]] = _along(chain, xy[mine[paved]], station[paved])
        own = owner[mine] == chain_index
        if not own.any():
            continue
        own, station = mine[own], station[own]
        across[own] = _own_across(chain, crosses[chain_index], xy[own], station) * np.where(opened[own], OPEN_EDGE_ACROSS, 1)
        if walk[own].any():
            # A sidewalk band with no path beside it to wear is the one the street's tags map.
            left = ((xy[own] - chain.xy[station]) * chain.normal[station]).sum(-1) >= 0
            _, kinds = tagged_sidewalks(chain)
            kind = np.where(left, kinds[station, 0], kinds[station, 1])
            tagged = walk[own] & (kind != NONE)
            surface[own[tagged]] = kind[tagged]
            across[own[tagged]] = np.where(left[tagged], 1, -1) * OWN_SURFACE_ACROSS
    across[worn] = OWN_SURFACE_ACROSS
    # A mouth is measured from its arc, the junction's own edge of asphalt, where across is 1: its fill falls from that by
    # the joining road's half-width, carriageway all through, and its ring rises from it by that road's shoulder, so an
    # edge line, a strip and a kerb follow the arc as they follow the road.
    at_mouth = np.flatnonzero(mouth != NO_MOUTH)
    if len(at_mouth):
        _, from_arc = shapely.STRtree([found.arc for found in mouths]).query_nearest(shapely.points(xy[at_mouth]), return_distance=True, all_matches=False)
        stations = [(chains[who], chains[who].tree.query(place)[1]) for who, place in zip(path[at_mouth], xy[at_mouth])]
        half = np.array([chain.half[station] for chain, station in stations])
        strip = np.array([chain.shoulder[station] for chain, station in stations])
        # A point a hair off the arc, where the outline is kept, is on it, as a carriageway's edge is stored.
        from_arc = np.where(from_arc <= EDGE_WITHIN_M, 0, from_arc)
        within = np.maximum(1 - from_arc / np.maximum(half, OUTLINE_WITHIN_M), CORNER_LEAST_ACROSS)
        across[at_mouth] = np.where(np.isin(mouth[at_mouth], FILLS), within, np.minimum(1 + from_arc / np.maximum(strip, OUTLINE_WITHIN_M), 2))
        carriageways = dict(carriageways)
        for found in mouths:
            carriageways[found.way] = shapely.union(carriageways[found.way], found.fill)
    # Outside every carriageway: a junction's corner or a gap closed between ways, drawn as the shoulders round it.
    shoulders = (owner == JUNCTION) & ~worn
    carried = np.flatnonzero(shoulders & (beside >= 0) & (part >= 0))
    surface[carried] = [looks[way][0][edge] for way, edge in zip(beside[carried], part[carried])]
    across[shoulders] = shoulder_across(xy[shoulders], mesh.level[point[shoulders]], chains, crosses, carriageways, outline)
    way = np.where(owner == AREA, AREA, reading).astype(float)
    group = np.where(owner == AREA, 2, shoulders.astype(int))
    # Two of a place's points that read alike are one: pieces are told apart by all they might wear, and most that meet
    # along a way wear the same.
    _, first, same = np.unique(np.round(np.column_stack((point, group, across, tier, along, way, surface, run)), 6), axis=0, return_index=True, return_inverse=True)
    order = first[np.argsort(group[first], kind="stable")]
    rank = np.empty(len(order), dtype=int)
    rank[same.ravel()[order]] = np.arange(len(order))
    points = np.column_stack((xy, heights[point], across, tier, along, way, surface, run))[order]
    return points, rank[same.ravel()[index.ravel()]].reshape(-1, 3), int((group[order] == 1).sum()), int((group[order] == 2).sum())


def _own_across(chain: Chain, cross: Cross, xy: np.ndarray, station: np.ndarray) -> np.ndarray:
    """Across for a way's own points, as a ribbon's: 1 at the carriageway's edge, 2 at the shoulder's."""
    offset = ((xy - chain.xy[station]) * chain.normal[station]).sum(-1)
    left = offset >= 0
    half = np.maximum(np.where(left, cross.half_left[station], cross.half_right[station]), 1e-6)
    # Short of a sidewalk, a shoulder is a kerb's strip, counted in the class's own shoulder's metres as the game reads
    # them, so the kerb is drawn where it stands.
    kerbed = np.where(left, cross.walk_left[station], cross.walk_right[station]) > 0
    shoulder = np.where(kerbed, chain.shoulder[station], np.where(left, cross.reach_left[station], cross.reach_right[station]) - half)
    # A point a hair past the edge, where the outline is simplified, is on the edge: over a country road's strip that hair
    # is a fifteenth of the way across it, which read as shoulder. With no shoulder (a path, a deck) every point is.
    beyond = np.abs(offset) - half
    past = np.where((shoulder > OUTLINE_WITHIN_M) & (beyond > EDGE_WITHIN_M), beyond / np.maximum(shoulder, OUTLINE_WITHIN_M), 0)
    return np.sign(offset) * np.clip(np.minimum(np.abs(offset), half) / half + past, 0, 2)


def shoulder_across(xy: np.ndarray, level: np.ndarray, chains: list[Chain], crosses: dict[int, Cross], carriageways: dict[int, shapely.Geometry], outline: shapely.Geometry) -> np.ndarray:
    """Across for points of paving no way owns, drawn as the shoulders round them, so they carry on their neighbours' kerb,
    paving and fade rather than standing out as one flat value: a shoulder is 1 at its carriageway's edge and 2 at its
    paving's, so such a point is 1 and its distance from the nearest motor road's carriageway in that road's shoulders, and
    at least 2 less its distance from the paving's outline in the same, as a shoulder fades to the land at its edge.

    A road's shoulder is measured as its own points are: the class's own beside a sidewalk, where it is a kerb's strip, and
    otherwise out to its paving's edge. A path has none, so nothing is a path's shoulder."""
    across = np.full(len(xy), 2.0)
    shoulder = np.full(len(xy), np.inf)
    places = shapely.points(xy)
    tree = shapely.STRtree(places)
    for index, carriageway in carriageways.items():
        chain, cross = chains[index], crosses[index]
        sides = np.stack([np.where(walk > 0, chain.shoulder, reach - half) for walk, reach, half in ((cross.walk_left, cross.reach_left, cross.half_left), (cross.walk_right, cross.reach_right, cross.half_right))])
        widest = float(sides.max())
        if widest <= OUTLINE_WITHIN_M:
            continue
        near = tree.query(carriageway, predicate="dwithin", distance=widest)
        near = near[level[near] == GROUND]
        if not len(near):
            continue
        station = chain.tree.query(xy[near])[1]
        left = ((xy[near] - chain.xy[station]) * chain.normal[station]).sum(-1) >= 0
        metres = np.where(left, sides[0, station], sides[1, station])
        reached = 1 + shapely.distance(places[near], carriageway) / np.maximum(metres, OUTLINE_WITHIN_M)
        nearer = (metres > OUTLINE_WITHIN_M) & (reached < across[near])
        across[near[nearer]], shoulder[near[nearer]] = reached[nearer], metres[nearer]
    return np.maximum(across, 2 - shapely.distance(places, outline) / shoulder)


def is_crossing(road: dict) -> bool:
    return road.get("footway") == "crossing" or road.get("cycleway") == "crossing"


def crossing_stations(chain: Chain) -> np.ndarray:
    return np.array([is_crossing(chain.edges[index].road) for index in chain.edge_at], dtype=bool)


def _said_surface(road: dict) -> int:
    """What a road's own OSM way says its surface is, as the bit its points carry, or nothing where it says nothing a
    car would feel. A chain runs on through ways of both kinds, and drawn as whichever most of its length was, a road
    that turns from asphalt to gravel half way along was one or the other all the way."""
    if not road["motor"]:
        return 0
    surface = road.get("surface")
    return SEALED_WAY if surface in SEALED_SURFACES else LOOSE_WAY if surface in LOOSE_SURFACES else 0


def edge_looks(chains: list[Chain]) -> dict[int, tuple[np.ndarray, np.ndarray]]:
    """Each way's OSM ways' surface classes and runs, as its paving wears them.

    A crossing's own surface is the road's it crosses, which that road draws: off it, mapped on a sidewalk's line across a
    side road's mouth or reaching from a street to its sidewalk, a crossing tagged asphalt painted metres of sidewalk dark.
    It wears the sidewalk's look instead: its own way's nearest OSM way that isn't a crossing, or, for a way that is all
    crossing, the path it leads to."""
    looks = {chain.index: (np.array([way_class(edge.road, edge.road["motor"]) | _said_surface(edge.road) for edge in chain.edges], dtype=float), _way_runs(chain)) for chain in chains if chain.xy is not None and len(chain.xy) >= 2}
    walks = [chain for chain in chains if chain.index in looks and not chain.motor]
    ends = [(chain, station) for chain in walks for station in np.flatnonzero(~crossing_stations(chain))]
    tree = cKDTree(np.array([chain.xy[station] for chain, station in ends])) if ends else None
    for chain in walks:
        classes, runs = looks[chain.index]
        crossings = np.array([is_crossing(edge.road) for edge in chain.edges])
        if not crossings.any():
            continue
        if not crossings.all():
            others = np.flatnonzero(~crossings)
            for edge in np.flatnonzero(crossings):
                nearest = others[np.abs(others - edge).argmin()]
                classes[edge], runs[edge] = classes[nearest], runs[nearest]
        elif tree is not None:
            distance, nearest = tree.query(chain.xy[[0, -1]])
            end = int(distance.argmin())
            if distance[end] <= chain.half[[0, -1]][end] + GAP_PAVED_M:
                other, station = ends[nearest[end]]
                edge = other.edge_at[station]
                classes[:], runs[:] = looks[other.index][0][edge], looks[other.index][1][edge]
    return looks


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


def _along(chain: Chain, xy: np.ndarray, station: np.ndarray) -> np.ndarray:
    """How far along a way points lie, as its paint counts: from their nearest stations, by how far past each they lie.
    A station's own distance alone moves in 2 m steps, and treads laid across it ran askew between a way's middle and edges."""
    distance = np.concatenate(([0], np.cumsum(np.hypot(*np.diff(chain.xy, axis=0).T))))
    lies = distance[station] + ((xy - chain.xy[station]) * chain.tangent[station]).sum(-1)
    return np.interp(lies, distance, _paint_along(chain))


def _paint_along(chain: Chain) -> np.ndarray:
    """Metres of paint along a way, counted from a seam where it has one, as the game counts a ribbon's."""
    distance = np.concatenate(([0], np.cumsum(np.hypot(*np.diff(chain.xy, axis=0).T))))
    length = distance[-1]
    starts, ends = 0 in chain.seam_stations, len(chain.xy) - 1 in chain.seam_stations
    if starts and ends:
        dash = 12.0
        return distance * (1 if length < dash else round(length / dash) * dash / length)
    return distance - length if ends else distance


def lay(roads: list[dict], ground: Ground, paved: list[shapely.Polygon] = (), whole: dict[int, list] | None = None, walls: list[shapely.Polygon] | None = None) -> Paved:
    """Every road on the tile as one paved surface on each level, and the ground built round it. `walls` are the buildings
    standing by: a road's strip stops short of them."""
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
    beside_walls(laid, crosses, walls or [])
    under_others(laid, levels, crosses, tile)
    round_ends(laid, levels, crosses, areas, tile)
    prints = {chain.index: footprints(chain, levels[chain.index], tile, crosses[chain.index].paving) for chain in laid}
    bare_decks(laid, levels, crosses, prints, tile)
    dipped_under_decks(chains, levels, prints)
    kept_apart(chains, prints, tile)
    sections = seam_sections(laid, levels)
    held_to_seams(prints, sections, tile)
    # Polygons only, and empty as a polygon is, whatever clipping left: a collection has no boundary to cut along.
    areas = shapely.MultiPolygon(_flat(shapely.simplify(shapely.intersection(areas, tile), OUTLINE_WITHIN_M)))
    carriageways = ground_carriageways(laid, levels, crosses, prints, sections, tile)
    mouths = carriageway_corners(chains, carriageways, prints, crosses, tile) + end_caps(laid, crosses, prints)
    mouths += gores(chains, carriageways, prints, mouths, tile)
    shape, street_corners = ground_shape(chains, prints, areas, tile, mouths)
    kerbs = ground_kerbs(laid, levels, crosses, prints, sections, tile)
    looks = edge_looks(chains)
    mesh = triangulate(pieces_of(chains, prints, carriageways, levels, shape, areas, kerbs, crosses, sidewalks, sections, street_corners, tile, looks, mouths))
    surfaces = Surfaces(chains, ground)
    # To the millimetre, as the tile holds it, so the ground cut against the paving takes the very heights drawn.
    heights = np.round(solve_heights(mesh, surfaces, ground, sections, span_ends(mesh, chains, levels, crosses)), 3)
    on_ground = _level_triangles(mesh, heights, GROUND)
    outline = outline_of(on_ground)
    points, triangles, junction_points, area_points = point_attributes(mesh, heights, chains, surfaces, crosses, carriageways, outline.boundary, looks, mouths)

    raw = ground.tile_corners()
    below = _level_triangles(mesh, heights, BELOW)
    # Where an underpass runs in the open, the land beside it falls to it as beside any way; under a deck, the deck's paving holds the land.
    edges = paving_at_corners(outline, on_ground, ground)
    under = paving_at_corners(outline_of(below), below, ground)
    conformed = embanked(raw, np.where(np.isnan(edges), under, edges), ground.spacing)
    cut_from = shapely.union(outline, outline_of(below))
    return Paved(chains, conformed, points, triangles, junction_points, area_points, cut_from, np.concatenate((below, on_ground)), underpass_walls(mesh, heights), crosses, ground)


def ground_carriageways(chains: list[Chain], levels: dict[int, np.ndarray], crosses: dict[int, Cross], prints: dict[int, dict[int, shapely.Geometry]], sections: list[SeamSection], tile: shapely.Polygon) -> dict[int, shapely.Geometry]:
    """Each way's carriageway on the ground's level, within its paving.

    A crossing's carriageway is the road's it crosses: off that road it ranks as a shoulder, below the street's kerb and walk
    band and the sidewalk it leads to. It is cut out of the whole carriageway, rather than laid without the crossing's
    stations, so the rest of its outline is simplified as before: laid anew, it moved by a centimetre or two all along and
    left slivers against its street."""
    found = {}
    for chain in chains:
        if GROUND not in prints[chain.index]:
            continue
        carriageway = footprints(chain, levels[chain.index], tile, crosses[chain.index].carriageway).get(GROUND)
        crossing = crossing_stations(chain)
        if carriageway is not None and crossing.any():
            crossed = footprints(chain, levels[chain.index], tile, tuple(np.where(crossing, side, 0) for side in crosses[chain.index].paving)).get(GROUND)
            carriageway = _polygonal(shapely.difference(carriageway, crossed)) if crossed is not None else carriageway
            carriageway = None if carriageway.is_empty else carriageway
        if carriageway is not None:
            own = [section.carriageway for section in sections if section.chain.index == chain.index and section.level == GROUND]
            found[chain.index] = on_seams(_polygonal(shapely.intersection(carriageway, prints[chain.index][GROUND])), own, tile)
    return found


def ground_kerbs(chains: list[Chain], levels: dict[int, np.ndarray], crosses: dict[int, Cross], prints: dict[int, dict[int, shapely.Geometry]], sections: list[SeamSection], tile: shapely.Polygon) -> dict[int, shapely.Geometry]:
    """Each street's paving short of its sidewalk on the ground's level, where it has one: past it is the sidewalk's."""
    found = {}
    for chain in chains:
        cross = crosses[chain.index]
        if GROUND not in prints[chain.index] or not (cross.walk_left.any() or cross.walk_right.any()):
            continue
        kerb = footprints(chain, levels[chain.index], tile, cross.kerb).get(GROUND)
        if kerb is not None:
            # A seam section has no sidewalk: its kerb is all its paving.
            own = [section.shape for section in sections if section.chain.index == chain.index and section.level == GROUND]
            found[chain.index] = on_seams(_polygonal(shapely.intersection(kerb, prints[chain.index][GROUND])), own, tile)
    return found


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
        # The paving on the way's own level: a bridge's rings read its deck, not the road under it.
        on_paving = [cover.nearest(edge[:, :2], chain.plane(edge[:, :2])) for edge in edges]
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
    tier = corners[:, 0, TIER].astype(np.uint8)
    way = corners[:, 0, WAY].astype(int)
    motor = np.array([paved.chains[index].motor if index >= 0 else False for index in way])
    a, b, c = (corners[:, corner, :3] for corner in range(3))
    rings = np.zeros((len(a), 2, RINGS, 3), dtype=np.float32)
    rings[:, 0, :] = a[:, None]
    rings[:, 1, :] = c[:, None]
    rings[:, 0, 3] = b
    rings[:, 1, 3] = c
    return [(ring, np.full(2, tier[index], dtype=np.uint8), bool(motor[index])) for index, ring in enumerate(rings)]
