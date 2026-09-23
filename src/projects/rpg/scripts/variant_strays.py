"""Pinned position-dependent strays (the "blemishes").

Keys are variant src URLs (as in variants.json). Values are the exact,
empirically observed [x, y] positions where a global LUT remap of the
canonical CANNOT reproduce the variant:

- Grass_Tiles_2: two alpha-fringe pixels where #00000028 became fully
  transparent while 1981 sibling pixels stayed put (LUT keeps them as-is).
- Stone_Cliff_{2,3,4}_Tile: 26 moss-green speckles on the stone face that
  the artist left at the canonical greens in every variant.
- Stone_Cliff_2_Cave_Entrance: a single grass pixel at (42, 31) remapped
  while its 11 siblings stayed put, so the LUT leaves that green alone
  (variants 3 and 4 remap it fully and are pure).
- Water_Tile_{2,3,4}_Anim: ten foam-shadow pixels in frames 2-6 (cell-local
  (5,69) and (26,69) per frame) where three slate blues became #3f2832
  while hundreds of siblings stayed put (2156/84/120 vs 2/4/4). Identical
  positions and colors in all three tints; the shared foam sparkle
  #0b99c3 -> #1a89a7 (36 px, no stayers) is a regular LUT entry.

`derive-variants.py` rediscovers these on every run and fails if they move;
`gen-tile-manifest.py --verify` asserts regeneration mismatches equal
exactly these sets. Never edit counts by hand — re-derive from the PNGs.
"""

KNOWN_STRAYS: dict[str, list[list[int]]] = {
    "/rpg/tiles/Grass/Grass_Tiles_2.png": [[63, 79], [64, 79]],
    "/rpg/tiles/Cliff/Stone_Cliff_2_Tile.png": [
        [128, 62], [128, 63], [128, 64], [129, 60], [129, 61],
        [129, 62], [129, 63], [174, 62], [174, 63], [175, 61],
        [175, 62], [175, 63], [175, 64], [192, 62], [192, 63],
        [192, 64], [193, 60], [193, 61], [193, 62], [193, 63],
        [206, 62], [206, 63], [207, 61], [207, 62], [207, 63],
        [207, 64],
    ],
    "/rpg/tiles/Cliff/Stone_Cliff_3_Tile.png": [
        [128, 62], [128, 63], [128, 64], [129, 60], [129, 61],
        [129, 62], [129, 63], [174, 62], [174, 63], [175, 61],
        [175, 62], [175, 63], [175, 64], [192, 62], [192, 63],
        [192, 64], [193, 60], [193, 61], [193, 62], [193, 63],
        [206, 62], [206, 63], [207, 61], [207, 62], [207, 63],
        [207, 64],
    ],
    "/rpg/tiles/Cliff/Stone_Cliff_4_Tile.png": [
        [128, 62], [128, 63], [128, 64], [129, 60], [129, 61],
        [129, 62], [129, 63], [174, 62], [174, 63], [175, 61],
        [175, 62], [175, 63], [175, 64], [192, 62], [192, 63],
        [192, 64], [193, 60], [193, 61], [193, 62], [193, 63],
        [206, 62], [206, 63], [207, 61], [207, 62], [207, 63],
        [207, 64],
    ],
    "/rpg/tiles/Cliff/Stone_Cliff_2_Cave_Entrance.png": [[42, 31]],
}

_ANIM_WATER_STRAYS = [
    [101, 69], [122, 69], [149, 69], [170, 69], [197, 69],
    [218, 69], [245, 69], [266, 69], [293, 69], [314, 69],
]
KNOWN_STRAYS["/rpg/tiles/Water/Water_Tile_2_Anim.png"] = _ANIM_WATER_STRAYS
KNOWN_STRAYS["/rpg/tiles/Water/Water_Tile_3_Anim.png"] = _ANIM_WATER_STRAYS
KNOWN_STRAYS["/rpg/tiles/Water/Water_Tile_4_Anim.png"] = _ANIM_WATER_STRAYS
