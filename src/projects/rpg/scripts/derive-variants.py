"""Derive src/projects/rpg/variants.json empirically from PNG pairs.

Usage (from repo root): python src/projects/rpg/scripts/derive-variants.py

For each explicitly allowlisted (canonical, variant) pair, builds the
old->new color mapping from the two files and asserts every differing
pixel is FULLY explained by it: each distinct source color maps to exactly
one destination, and the per-mapping pixel counts sum exactly to the total
differing-pixel count. Fails loudly otherwise. Nothing is inferred from
filenames; every pair is listed below.

Position-dependent strays (a source color that mostly remaps but stays put
at a few positions, or vice versa) cannot be expressed by a global LUT.
The majority outcome wins the LUT entry; the minority positions must match
the pinned table in variant_strays.py exactly, or derivation fails. Those
strays are reproduced as documented deviations, never "cleaned".

Note: derivation reads every variant PNG, so it only runs while those
files exist on disk (before deletion). Afterwards variants.json is the
record and gen-tile-manifest.py --verify guards it.

Out of scope (never merged): anything with Anim/Animation in the name,
Cave_Floor_1-2, FarmLand_Tile vs _Wet_Tile, Bridge_Wood vs _1,
Cave_Support_1-2, Grass_Tiles_1_Blob_TEST*.

Waterfall ships TWO on-disk canonicals: Waterfall_1 (gray rock) covers
variants 2-4 (pure grass-bank remaps), Waterfall_5 (brown rock) covers
variants 6-8. A single global rock LUT would miscolor ~4k shared rock
pixels per sheet, so the rock split stays as real files.
"""
import json
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

from variant_strays import KNOWN_STRAYS

ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
TILE_ROOT = ROOT / "public" / "rpg" / "tiles"


def url(path: str) -> str:
    return "/rpg/tiles/" + path


def rgba_hex(px: tuple[int, int, int, int]) -> str:
    return f"#{px[0]:02x}{px[1]:02x}{px[2]:02x}{px[3]:02x}"


# Explicit allowlist: family -> (canonical file, [variant files]).
FAMILIES: dict[str, tuple[str, list[str]]] = {
    "grass-tiles": (
        "Grass/Grass_Tiles_1.png",
        [
            "Grass/Grass_Tiles_2.png",
            "Grass/Grass_Tiles_3.png",
            "Grass/Grass_Tiles_4.png",
        ],
    ),
    "stone-cliff-tile": (
        "Cliff/Stone_Cliff_1_Tile.png",
        [
            "Cliff/Stone_Cliff_2_Tile.png",
            "Cliff/Stone_Cliff_3_Tile.png",
            "Cliff/Stone_Cliff_4_Tile.png",
        ],
    ),
    "stone-cliff-cave-entrance": (
        "Cliff/Stone_Cliff_1_Cave_Entrance.png",
        [
            "Cliff/Stone_Cliff_2_Cave_Entrance.png",
            "Cliff/Stone_Cliff_3_Cave_Entrance.png",
            "Cliff/Stone_Cliff_4_Cave_Entrance.png",
        ],
    ),
    "water-tile": (
        "Water/Water_Tile_1.png",
        [
            "Water/Water_Tile_2.png",
            "Water/Water_Tile_3.png",
            "Water/Water_Tile_4.png",
        ],
    ),
    "water-stone-tile": (
        "Water/Water_Stone_Tile_1.png",
        [
            "Water/Water_Stone_Tile_2.png",
            "Water/Water_Stone_Tile_3.png",
            "Water/Water_Stone_Tile_4.png",
        ],
    ),
    "cobble-road": (
        "Cobble_Road/Cobble_Road_1.png",
        ["Cobble_Road/Cobble_Road_2.png"],
    ),
    "grass-middle": (
        "Grass/Grass_1_Middle.png",
        [
            "Grass/Grass_2_Middle.png",
            "Grass/Grass_3_Middle.png",
            "Grass/Grass_4_Middle.png",
        ],
    ),
    "waterfall": (
        "Waterfall/Waterfall_1.png",
        [
            "Waterfall/Waterfall_2.png",
            "Waterfall/Waterfall_3.png",
            "Waterfall/Waterfall_4.png",
        ],
    ),
    "waterfall-brown-rock": (
        "Waterfall/Waterfall_5.png",
        [
            "Waterfall/Waterfall_6.png",
            "Waterfall/Waterfall_7.png",
            "Waterfall/Waterfall_8.png",
        ],
    ),
}

FORBIDDEN_SUBSTRINGS = ("Anim", "TEST")


def derive(canonical: str, variant: str) -> dict[str, str]:
    for needle in FORBIDDEN_SUBSTRINGS:
        assert needle not in canonical and needle not in variant, (
            canonical,
            variant,
        )
    with Image.open(TILE_ROOT / canonical) as a, Image.open(
        TILE_ROOT / variant
    ) as b:
        ca = a.convert("RGBA")
        cb = b.convert("RGBA")
        assert ca.size == cb.size, (canonical, ca.size, variant, cb.size)
        width, _ = ca.size
        pa = list(ca.getdata())
        pb = list(cb.getdata())
    changed: Counter[tuple[str, str]] = Counter()
    unchanged: Counter[str] = Counter()
    changed_pos: dict[tuple[str, str], list[list[int]]] = {}
    for i, (src_px, dst_px) in enumerate(zip(pa, pb)):
        old, new = rgba_hex(src_px), rgba_hex(dst_px)
        if old == new:
            unchanged[old] += 1
        else:
            changed[(old, new)] += 1
            changed_pos.setdefault((old, new), []).append(
                [i % width, i // width]
            )
    total_diff = sum(changed.values())
    assert total_diff > 0, f"{variant}: identical to canonical, not a variant"
    # Every differing pixel belongs to exactly one (old, new) mapping, so the
    # per-mapping counts must sum exactly to the differing-pixel total, and
    # no source color may map to two different destinations (true conflict).
    dsts: dict[str, set[str]] = {}
    for (old, new) in changed:
        dsts.setdefault(old, set()).add(new)
    conflicts = {old: ds for old, ds in dsts.items() if len(ds) > 1}
    assert not conflicts, f"CONFLICT in {variant}: {conflicts}"
    assert sum(changed.values()) == total_diff
    lut: dict[str, str] = {}
    strays: list[list[int]] = []
    for old, ds in sorted(dsts.items()):
        (new,) = ds
        n_changed = changed[(old, new)]
        n_same = unchanged.get(old, 0)
        if n_same == 0:
            lut[old] = new
        elif n_changed > n_same:
            # Majority remaps: keep the entry; pinned minority stays put.
            lut[old] = new
            strays.extend(
                [i % width, i // width]
                for i, (src_px, dst_px) in enumerate(zip(pa, pb))
                if rgba_hex(src_px) == old and rgba_hex(dst_px) == old
            )
        else:
            # Majority stays: drop the entry; pinned minority differs.
            strays.extend(changed_pos[(old, new)])
    strays = sorted(strays)
    pinned = sorted(KNOWN_STRAYS.get(url(variant), []))
    assert strays == pinned, (
        f"{variant}: stray set moved.\n  observed: {strays}\n  pinned:   {pinned}"
    )
    if strays:
        print(f"  note: {variant} carries {len(strays)} pinned strays")
    return dict(sorted(lut.items()))


def main() -> None:
    out: dict[str, dict] = {}
    total = 0
    for family, (canonical, variants) in FAMILIES.items():
        entry: dict[str, dict[str, dict[str, str]]] = {
            "canonical": url(canonical),
            "variants": {},
        }
        for variant in variants:
            lut = derive(canonical, variant)
            assert lut, f"{variant}: empty LUT"
            entry["variants"][url(variant)] = lut
            total += 1
            print(f"{family}: {variant} ({len(lut)} colors)")
        out[family] = entry
    dest = ROOT / "src" / "projects" / "rpg" / "variants.json"
    dest.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {len(out)} families, {total} variants -> {dest}")


if __name__ == "__main__":
    sys.exit(main())
