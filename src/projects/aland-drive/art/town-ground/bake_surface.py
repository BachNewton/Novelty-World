"""What the ground between a town's roads and buildings is made of, baked for one tile.

Written to join `pipeline/` as it stands: NumPy, SciPy, rasterio and shapely, with no game code, and nothing here reads a
file. `classify_osm` says what each OSM area and line is; `bake_surface` paints those over a reading of the aerial photo
at 0.5 m and turns the result into the image the shader reads.

The image is RGBA at 2 m. Red, green and blue are three signed distances, each to the edge of one bit of the surface's
class, so edges stay ruled and sharp up close at a quarter of a 1 m mask's memory, and a linear filter can't invent a class
between two classes. Alpha is the way the paving runs, read unfiltered.

A strip narrower than about 3 m can't live in a 2 m distance field, and needn't: footways, sidewalks and paths are ribbons in
the road surface already, so each ribbon section gets a class of its own (`ribbon_classes`), and only areas go in the image.
"""

from dataclasses import dataclass, field

import numpy as np
from rasterio import features
from rasterio.transform import from_origin
from scipy import ndimage
from shapely import STRtree
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import polygonize, unary_union

PIXEL_M = 2.0
FINE_M = 1.0
RIM_M = 32.0

# Three bits, each a channel. Blue is set only on tarmac and cobbles, so on a car park it is the distance to the lot's edge,
# which is what lays out its bays. Change these with `CLASS` in `town-ground/mask.ts`.
NONE, BED, LAWN, GRAVEL, SLAB, TARMAC, COBBLE = 0b000, 0b011, 0b010, 0b100, 0b110, 0b101, 0b111
# How far each channel measures, in metres, either side of its edge. Red and green draw thin edging; blue reaches a lot's middle.
RANGE_M = (4.0, 4.0, 16.0)

HARD_SURFACES = {
    "asphalt": TARMAC, "paved": SLAB, "concrete": SLAB, "concrete:plates": SLAB, "paving_stones": SLAB,
    "sett": COBBLE, "cobblestone": COBBLE, "unhewn_cobblestone": COBBLE, "pebblestone": COBBLE,
    "gravel": GRAVEL, "fine_gravel": GRAVEL, "compacted": GRAVEL, "unpaved": GRAVEL, "ground": GRAVEL, "dirt": GRAVEL, "sand": GRAVEL,
    "grass": LAWN, "grass_paver": LAWN,
}
GREEN_LANDUSE = {"grass", "village_green", "recreation_ground", "cemetery", "flowerbed", "greenfield"}
GREEN_LEISURE = {"park", "garden", "dog_park", "golf_course", "miniature_golf"}
BUILT_LANDUSE = {"residential": GRAVEL, "commercial": SLAB, "retail": TARMAC, "industrial": GRAVEL, "religious": LAWN, "farmyard": GRAVEL, "brownfield": GRAVEL, "construction": GRAVEL}
# Land a building's own surroundings don't spread on to.
OPEN_LANDUSE = {"forest", "farmland", "meadow", "allotments", "orchard"}
OPEN_NATURAL = {"wood", "scrub", "wetland", "heath", "grassland", "bare_rock", "beach", "shingle", "sand"}

# Laid lowest first.
LAYER_BUILT, LAYER_GREEN, LAYER_YARD, LAYER_PARKING, LAYER_PLAZA = range(5)

SIDEWALK_M = 2.2
ALIGN_IGNORES = {"service", "track"}
ALIGN_CHORD = 4
ALIGN_STEP = np.pi / 64
ALIGN_SNAP = np.radians(7)
ALIGN_PEAKS = 8
ALIGN_SHARE = 0.03
ALIGN_BINS = 90
QUARTER = np.pi / 2
SETTLE_DIRECTIONS = 12
SETTLE_M = 24.0
SETTLE_MAJORITY = 0.3
# Landuse polygons stop short of the road: this much past one still counts as town, so its kerbs carry on.
STREET_CORRIDOR_M = 9.0
# A patch smaller than this, in square metres, is the photo's noise.
SPECK_M2 = 12
FRONTAGE_M = 7.0
YARD_M = 10.0
SMALLEST_AREA_M2 = 12.0
# On the grading in `pipeline/ground.py`: above this lean the photo is grass; below this brightness it's shade, which says nothing.
GREEN_LEAN = 0.05
SHADE_BRIGHTNESS = 0.16
PHOTO_BLUR_M = 2.5
PATH_REACH_M = 4.0
RIBBON_KINDS = {"footway", "pedestrian", "path", "cycleway", "living_street", "residential", "service", "unclassified", "steps"}


@dataclass
class Area:
    polygon: Polygon
    surface: int
    layer: int


@dataclass
class OsmLayers:
    areas: list[Area] = field(default_factory=list)
    # Land where town rules apply, whatever fills it: (polygon, the yard's surface when the photo doesn't show grass).
    built: list[tuple[Polygon, int]] = field(default_factory=list)
    open_land: list[Polygon] = field(default_factory=list)
    hedges: list[LineString] = field(default_factory=list)
    fountains: list[Point] = field(default_factory=list)


@dataclass
class Ribbon:
    """One chain of the road surface. `rings` is sections × 5 × 2, in (east, north): outer, edge, centre, edge, outer."""

    rings: np.ndarray
    kind: str
    motor: bool


def classify_osm(elements: list[dict]) -> OsmLayers:
    """Sorts OSM elements, each {"tags", "geometry"} with a shapely geometry already in tile metres, into what the bake paints."""
    layers = OsmLayers()
    for element in elements:
        tags, shape = element["tags"], element["geometry"]
        if shape.geom_type == "Point":
            if tags.get("amenity") == "fountain":
                layers.fountains.append(shape)
            continue
        if shape.geom_type == "LineString":
            if "hedge" in tags.get("barrier", ""):
                layers.hedges.append(shape)
            continue
        if not shape.is_valid or shape.area < SMALLEST_AREA_M2:
            continue
        for area in _areas_of(tags, shape):
            layers.areas.append(area)
        landuse, natural = tags.get("landuse"), tags.get("natural")
        if landuse in BUILT_LANDUSE:
            layers.built.append((shape, BUILT_LANDUSE[landuse]))
        if landuse in OPEN_LANDUSE or natural in OPEN_NATURAL:
            layers.open_land.append(shape)
        if tags.get("amenity") == "fountain":
            layers.fountains.append(shape.representative_point())
    return layers


def _areas_of(tags: dict, shape: Polygon) -> list[Area]:
    surface = HARD_SURFACES.get(tags.get("surface", ""))
    if tags.get("amenity") == "parking" and tags.get("parking", "surface") == "surface":
        return [Area(shape, surface if surface in (GRAVEL, TARMAC, COBBLE) else TARMAC, LAYER_PARKING)]
    if tags.get("highway") == "pedestrian" or tags.get("place") == "square" or "area:highway" in tags and tags["area:highway"] in ("pedestrian", "footway"):
        return [Area(shape, surface if surface in (SLAB, COBBLE, GRAVEL) else COBBLE, LAYER_PLAZA)]
    if tags.get("leisure") == "playground":
        return [Area(shape, GRAVEL, LAYER_YARD)]
    if tags.get("leisure") == "pitch":
        return [Area(shape, surface if surface is not None else LAWN, LAYER_YARD)]
    if tags.get("landuse") == "flowerbed":
        return [Area(shape, BED, LAYER_GREEN)]
    if tags.get("landuse") in GREEN_LANDUSE or tags.get("leisure") in GREEN_LEISURE:
        return [Area(shape, LAWN, LAYER_GREEN)]
    return []


def photo_is_green(photo: np.ndarray) -> np.ndarray:
    """A smooth reading of the 2 m photo (RGB, 0 to 1), above zero where it's grass, with shade taking what's round it."""
    red, green, blue = photo[..., 0], photo[..., 1], photo[..., 2]
    brightest = np.maximum(np.maximum(red, green), np.maximum(blue, 1e-3))
    lean = (green - np.maximum(red, blue) * 0.92) / brightest - GREEN_LEAN
    weight = (brightest > SHADE_BRIGHTNESS).astype(np.float32)
    sigma = PHOTO_BLUR_M / PIXEL_M
    return ndimage.gaussian_filter(lean * weight, sigma) / np.maximum(ndimage.gaussian_filter(weight, sigma), 0.02)


def _burn(shapes, size: int, transform) -> np.ndarray:
    pairs = [(shape, 1) for shape in shapes]
    if not pairs:
        return np.zeros((size, size), bool)
    return features.rasterize(pairs, out_shape=(size, size), transform=transform, fill=0, dtype="uint8", all_touched=False).astype(bool)


def _paint(classes: np.ndarray, pairs: list[tuple[Polygon, int]], transform) -> None:
    if pairs:
        burned = features.rasterize(pairs, out_shape=classes.shape, transform=transform, fill=255, dtype="uint8")
        classes[burned != 255] = burned[burned != 255]


def _sections(ribbon: Ribbon, outer: tuple[int, int]) -> list[Polygon]:
    left, right = ribbon.rings[:, outer[0]], ribbon.rings[:, outer[1]]
    quads = []
    for section in range(len(left) - 1):
        quad = Polygon([left[section], left[section + 1], right[section + 1], right[section]])
        if quad.is_valid and quad.area > 0:
            quads.append(quad)
    return quads


def _long_side(polygon: Polygon) -> float:
    corners = np.array(polygon.minimum_rotated_rectangle.exterior.coords)
    sides = corners[1:3] - corners[:2]
    longest = sides[np.hypot(*sides.T).argmax()]
    return float(np.arctan2(longest[1], longest[0]) % np.pi)


def _centres(ribbons: list[Ribbon]) -> tuple[np.ndarray, np.ndarray]:
    """The middle of each section of the streets and the way it runs, modulo a half turn, read over a chord so a junction's flare doesn't turn it."""
    middles, angles = [], []
    for ribbon in ribbons:
        if not ribbon.motor or ribbon.kind in ALIGN_IGNORES or len(ribbon.rings) < 2:
            continue
        centre = ribbon.rings[:, 2]
        last = len(centre) - 1
        indices = np.arange(len(centre))
        step = centre[np.minimum(indices + ALIGN_CHORD, last)] - centre[np.maximum(indices - ALIGN_CHORD, 0)]
        middles.append(centre)
        angles.append(np.arctan2(step[:, 1], step[:, 0]) % np.pi)
    if not middles:
        return np.empty((0, 2)), np.empty(0)
    return np.concatenate(middles), np.concatenate(angles)


def _snapped(angles: np.ndarray) -> np.ndarray:
    """A street grid's directions, each exact and folded to a quarter turn: square flags then keep one lattice round every corner of the grid, where a new angle every few metres would read as crazy paving."""
    folded = angles % QUARTER
    known = angles != 0
    steps = np.round(folded / ALIGN_STEP) * ALIGN_STEP
    claimed = np.zeros(angles.shape, bool)
    for _ in range(ALIGN_PEAKS):
        counts, edges = np.histogram(folded[known & ~claimed], ALIGN_BINS, (0, QUARTER))
        if counts.sum() == 0 or counts.max() < known.sum() * ALIGN_SHARE:
            break
        top = counts.argmax()
        peak = (edges[top] + edges[top + 1]) / 2
        offset = (folded - peak + QUARTER / 2) % QUARTER - QUARTER / 2
        near = known & ~claimed & (np.abs(offset) < ALIGN_SNAP)
        steps[near] = (np.median(offset[near]) + peak) % QUARTER
        claimed |= near
    return steps


def _settled(angles: np.ndarray) -> np.ndarray:
    """Each common direction takes the ground round it, so two meet on a broad line rather than in steps a street's width apart."""
    values, counts = np.unique(angles, return_counts=True)
    common = values[np.argsort(counts)[-SETTLE_DIRECTIONS:]]
    votes = np.stack([ndimage.gaussian_filter((angles == value).astype(np.float32), SETTLE_M / PIXEL_M) for value in common])
    winner = votes.argmax(axis=0)
    return np.where(votes.max(axis=0) > SETTLE_MAJORITY, common[winner], angles)


def _without_specks(classes: np.ndarray, smallest: int) -> np.ndarray:
    """Patches too small to be anything take the surface round them."""
    speck = np.zeros(classes.shape, bool)
    for surface in np.unique(classes):
        labels, count = ndimage.label(classes == surface)
        if count:
            sizes = np.bincount(labels.ravel())
            small = sizes < smallest
            small[0] = False
            speck |= small[labels]
    if not speck.any() or speck.all():
        return classes
    nearest = ndimage.distance_transform_edt(speck, return_distances=False, return_indices=True)
    return classes[nearest[0], nearest[1]]


def _signed_distance(inside: np.ndarray, scale: int, reach_m: float) -> np.ndarray:
    """Metres to the edge of a fine mask, positive inside, averaged down to the coarse grid so its stairs go."""
    if not inside.any():
        return np.full((inside.shape[0] // scale, inside.shape[1] // scale), -reach_m, np.float32)
    if inside.all():
        return np.full((inside.shape[0] // scale, inside.shape[1] // scale), reach_m, np.float32)
    # Half a fine pixel each side, so the two distances meet on the pixels' shared edge rather than leaving a step of one.
    distance = np.minimum(ndimage.distance_transform_edt(inside), reach_m / FINE_M + 1) - np.minimum(ndimage.distance_transform_edt(~inside), reach_m / FINE_M + 1)
    fine = (distance - np.sign(distance) * 0.5).astype(np.float32) * FINE_M
    height, width = inside.shape[0] // scale, inside.shape[1] // scale
    return fine[: height * scale, : width * scale].reshape(height, scale, width, scale).mean(axis=(1, 3))


def _encode(distance: np.ndarray, reach_m: float) -> np.ndarray:
    return np.clip(np.round(127.5 + distance / reach_m * 127.5), 0, 255).astype(np.uint8)


@dataclass
class Bake:
    classes: np.ndarray
    image: np.ndarray
    ribbon_classes: list[np.ndarray]
    hedges: list[LineString]
    fountains: list[Point]


def bake_surface(west: float, north: float, size_m: float, layers: OsmLayers, ribbons: list[Ribbon], buildings: list[Polygon], photo: np.ndarray, water: np.ndarray | None = None) -> Bake:
    """A tile's surface image and each ribbon section's class. `photo` is the 2 m image, north up; `water` a bool at any size."""
    pixels = round((size_m + 2 * RIM_M) / FINE_M)
    transform = from_origin(west - RIM_M, north + RIM_M, FINE_M, FINE_M)

    road_area = [quad for ribbon in ribbons if ribbon.motor for quad in _sections(ribbon, (0, 4))]
    all_ribbons = [quad for ribbon in ribbons for quad in _sections(ribbon, (0, 4))]
    roads = _burn(road_area, pixels, transform)
    footprints = _burn(buildings, pixels, transform)
    open_land = _burn(layers.open_land, pixels, transform)

    classes = np.zeros((pixels, pixels), np.uint8)

    # Round a building: its yard, wherever it is, unless that's forest or field.
    near_building = ndimage.distance_transform_edt(~footprints) * FINE_M < YARD_M if footprints.any() else np.zeros_like(footprints)
    _paint(classes, [(polygon, surface) for polygon, surface in layers.built], transform)
    yard = (classes != NONE) | (near_building & ~open_land)
    # A yard with no landuse round it is a house in the country, on gravel.
    classes[yard & (classes == NONE)] = GRAVEL

    # Inside that, the photo decides what's grass, read up to the fine grid.
    zoom = PIXEL_M / FINE_M
    green = ndimage.zoom(photo_is_green(photo), zoom, order=1, grid_mode=True, mode="nearest")
    rim = round(RIM_M / FINE_M)
    greens = np.pad(green, rim, mode="edge")[:pixels, :pixels] > 0
    classes[yard & greens] = LAWN

    for layer in (LAYER_GREEN, LAYER_YARD, LAYER_PARKING, LAYER_PLAZA):
        _paint(classes, [(area.polygon, area.surface) for area in layers.areas if area.layer == layer], transform)

    # Pavement: a strip along every town road, and everything from the kerb to a facade where the two are close.
    built_zone = ndimage.distance_transform_edt(classes == NONE) * FINE_M < STREET_CORRIDOR_M
    if road_area:
        from_road = ndimage.distance_transform_edt(~roads) * FINE_M
        from_building = ndimage.distance_transform_edt(~footprints) * FINE_M if footprints.any() else np.full(roads.shape, 1e6)
        untouched = _burn([area.polygon for area in layers.areas if area.layer >= LAYER_PARKING], pixels, transform)
        kerbside = (from_road < SIDEWALK_M) & built_zone & ~open_land
        frontage = (from_road + from_building < FRONTAGE_M + 2) & (from_road < FRONTAGE_M) & built_zone
        classes[(kerbside | frontage) & ~untouched] = SLAB

    # Under a road or a building the surface is whatever's nearest, so what's seen comes right up to the wall or the shoulder.
    hidden = roads | footprints | _burn(all_ribbons, pixels, transform)
    if water is not None:
        scale = pixels / water.shape[0]
        classes[ndimage.zoom(water.astype(np.uint8), scale, order=0, grid_mode=True, mode="nearest")[:pixels, :pixels] > 0] = NONE
    if hidden.any() and (~hidden).any():
        nearest = ndimage.distance_transform_edt(hidden, return_distances=False, return_indices=True)
        classes = classes[nearest[0], nearest[1]]

    classes = _without_specks(classes, round(SPECK_M2 / FINE_M**2))
    bits = [(classes >> shift) & 1 for shift in (2, 1, 0)]
    scale = round(PIXEL_M / FINE_M)
    channels = [_encode(_signed_distance(bit.astype(bool), scale, reach), reach) for bit, reach in zip(bits, RANGE_M)]

    # The way the paving runs: a motor road's nearest section, its direction modulo a half turn, a byte for the half turn.
    coarse = pixels // scale
    middles, angles = _centres(ribbons)
    if len(middles):
        seeds = np.ones((coarse, coarse), bool)
        columns = np.clip(((middles[:, 0] - (west - RIM_M)) / PIXEL_M).astype(int), 0, coarse - 1)
        rows = np.clip((((north + RIM_M) - middles[:, 1]) / PIXEL_M).astype(int), 0, coarse - 1)
        seeds[rows, columns] = False
        field_of = np.zeros((coarse, coarse), np.float32)
        field_of[rows, columns] = angles
        nearest = ndimage.distance_transform_edt(seeds, return_distances=False, return_indices=True)
        angle = _settled(_snapped(field_of)[nearest[0], nearest[1]])
    else:
        angle = np.zeros((coarse, coarse), np.float32)
    # A car park runs along its own long side, whatever road is nearest.
    for area in layers.areas:
        if area.layer == LAYER_PARKING and area.surface == TARMAC:
            lot = _burn([area.polygon], coarse, from_origin(west - RIM_M, north + RIM_M, PIXEL_M, PIXEL_M))
            angle[lot] = _long_side(area.polygon)
    channels.append(np.round(angle / np.pi * 255).astype(np.uint8))

    keep = round(RIM_M / PIXEL_M)
    size = round(size_m / PIXEL_M)
    image = np.dstack(channels)[keep : keep + size, keep : keep + size]
    fine_rim = round(RIM_M / FINE_M)
    return Bake(classes[fine_rim:-fine_rim, fine_rim:-fine_rim], image, [np.zeros(len(ribbon.rings), np.uint8) for ribbon in ribbons], layers.hedges, layers.fountains)


def apply_way_surfaces(ribbons: list[Ribbon], bake: Bake, ways: list[dict]) -> None:
    """Gives each section the class of the nearest OSM way ({"line", "kind", "surface"?, "footway"?}): setts on a street, slabs on a sidewalk."""
    lines = [way["line"] for way in ways]
    tree = STRtree(lines)
    for chain, ribbon in enumerate(ribbons):
        if ribbon.kind not in RIBBON_KINDS:
            continue
        for section, middle in enumerate(ribbon.rings[:, 2]):
            found = tree.query_nearest(Point(middle), max_distance=PATH_REACH_M)
            if len(found) == 0:
                continue
            way = ways[found[0]]
            bake.ribbon_classes[chain][section] = _ribbon_class(way, ribbon.motor)


def _ribbon_class(way: dict, motor: bool) -> int:
    surface = HARD_SURFACES.get(way.get("surface", ""))
    if motor:
        return surface if surface == COBBLE else NONE
    if surface is not None:
        return surface
    if way.get("footway") == "sidewalk" or way["kind"] == "pedestrian":
        return SLAB
    return GRAVEL if way["kind"] == "path" else NONE


def polygons_from_outers(outers: list[list[tuple[float, float]]], inners: list[list[tuple[float, float]]]) -> list[Polygon]:
    """A multipolygon relation's member ways, joined end to end whatever order they came in."""
    outside = list(polygonize(LineString(line) for line in outers if len(line) > 1))
    holes = list(polygonize(LineString(line) for line in inners if len(line) > 1))
    if not holes:
        return outside
    cut = unary_union(holes)
    return [piece for shape in outside for piece in (shape.difference(cut).geoms if shape.difference(cut).geom_type == "MultiPolygon" else [shape.difference(cut)])]
