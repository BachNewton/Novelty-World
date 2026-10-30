"""Where things are: NLS map sheet names, and the game's one metric space.

Everything the pipeline writes is in ETRS-TM35FIN (EPSG:3067) metres, moved so
that WORLD_ORIGIN is (0, 0): east stays east and north stays north. One origin
for the whole island puts every tile in the same space and keeps the numbers
small enough for a GPU's 32-bit floats.
"""

from dataclasses import dataclass

from pyproj import Transformer

TILE_SIZE_M = 6000
SAMPLE_M = 2
SAMPLES = TILE_SIZE_M // SAMPLE_M

# Near the middle of the main island, on the 6 km grid.
WORLD_ORIGIN = (110_000, 6_690_000)

# An NLS sheet name halves a 192×96 km block three times, each digit picking a
# quadrant, and its last letter picks one of eight 6×6 km tiles in the 24×12 km
# sheet that leaves.
_BLOCK_WIDTH = 192_000
_BLOCK_HEIGHT = 96_000
_BAND_SOUTH = {"K": 6_570_000, "L": 6_666_000, "M": 6_762_000}
_COLUMN_2_WEST = -76_000
_QUADRANT = {"1": (0, 0), "2": (0, 1), "3": (1, 0), "4": (1, 1)}
_TILE_LETTERS = "ABCDEFGH"

_to_grid = Transformer.from_crs("EPSG:4326", "EPSG:3067", always_xy=True)


@dataclass(frozen=True)
class Tile:
    name: str
    west: int
    south: int

    @property
    def east(self) -> int:
        return self.west + TILE_SIZE_M

    @property
    def north(self) -> int:
        return self.south + TILE_SIZE_M

    @property
    def mirror_path(self) -> str:
        return f"{self.name[:2]}/{self.name[:3]}/{self.name}.tif"


def tile_from_name(name: str) -> Tile:
    if len(name) != 6 or name[0] not in _BAND_SOUTH or name[5] not in _TILE_LETTERS:
        raise ValueError(f"not a 6 km sheet this pipeline knows: {name!r}")
    west = _COLUMN_2_WEST + (int(name[1]) - 2) * _BLOCK_WIDTH
    south = _BAND_SOUTH[name[0]]
    width, height = _BLOCK_WIDTH, _BLOCK_HEIGHT
    for digit in name[2:5]:
        width, height = width // 2, height // 2
        column, row = _QUADRANT[digit]
        west += column * width
        south += row * height
    column, row = divmod(_TILE_LETTERS.index(name[5]), 2)
    return Tile(name, west + column * TILE_SIZE_M, south + row * TILE_SIZE_M)


def tile_at(east: float, north: float) -> Tile:
    """The tile holding a point: tile_from_name walked the other way."""
    band = next(letter for letter, south in _BAND_SOUTH.items() if south <= north < south + _BLOCK_HEIGHT)
    block = int((east - _COLUMN_2_WEST) // _BLOCK_WIDTH)
    west = _COLUMN_2_WEST + block * _BLOCK_WIDTH
    south = _BAND_SOUTH[band]
    name = f"{band}{block + 2}"
    width, height = _BLOCK_WIDTH, _BLOCK_HEIGHT
    for _ in range(3):
        width, height = width // 2, height // 2
        quadrant = (int(east >= west + width), int(north >= south + height))
        name += next(digit for digit, place in _QUADRANT.items() if place == quadrant)
        west += quadrant[0] * width
        south += quadrant[1] * height
    letter = int((east - west) // TILE_SIZE_M) * 2 + int((north - south) // TILE_SIZE_M)
    return tile_from_name(name + _TILE_LETTERS[letter])


def neighbour(tile: Tile, steps_east: int, steps_north: int) -> Tile:
    return tile_at(tile.west + steps_east * TILE_SIZE_M, tile.south + steps_north * TILE_SIZE_M)


def to_local(east, north):
    return east - WORLD_ORIGIN[0], north - WORLD_ORIGIN[1]


def lonlat_to_grid(lon, lat):
    """WGS84 to ETRS-TM35FIN. Longitude first: always_xy pins the axis order."""
    return _to_grid.transform(lon, lat)
