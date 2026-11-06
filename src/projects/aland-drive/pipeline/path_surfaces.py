"""What a way's surface is drawn as, from its own OSM tags: the classes the town's ground and the road's look share.

A class is three bits, each a channel of the town's image (`town_ground.py`). Change these with `CLASS` in
`art/town-ground/class.ts`; `sim/road-grip.ts` says what each is to a tyre. `STEPS` is a way's only: a flight of steps is
drawn as treads along its line.
"""

NONE, STEPS, BED, LAWN, GRAVEL, SLAB, TARMAC, COBBLE = 0b000, 0b001, 0b011, 0b010, 0b100, 0b110, 0b101, 0b111

HARD_SURFACES = {
    "asphalt": TARMAC, "paved": SLAB, "concrete": SLAB, "concrete:plates": SLAB, "paving_stones": SLAB,
    "sett": COBBLE, "cobblestone": COBBLE, "unhewn_cobblestone": COBBLE, "pebblestone": COBBLE,
    "gravel": GRAVEL, "fine_gravel": GRAVEL, "compacted": GRAVEL, "unpaved": GRAVEL, "ground": GRAVEL, "dirt": GRAVEL, "sand": GRAVEL,
    "grass": LAWN, "grass_paver": LAWN,
}
# A path OSM says nothing of: a park's walk or a trail is gravel, a footway or cycleway pale tarmac, never a road's.
UNTAGGED_PATHS = {"path": GRAVEL, "bridleway": GRAVEL, "pedestrian": SLAB, "corridor": SLAB}


def way_class(way: dict, motor: bool) -> int:
    """A way ({"kind", "surface"?, "footway"?}) as it's drawn: a motor road keeps its own look save setts, and a path wears its own."""
    surface = HARD_SURFACES.get(way.get("surface", ""))
    if motor:
        return surface if surface == COBBLE else NONE
    if way["kind"] == "steps":
        return STEPS
    if surface is not None:
        return surface
    if way.get("footway") == "sidewalk":
        return SLAB
    return UNTAGGED_PATHS.get(way["kind"], TARMAC)
