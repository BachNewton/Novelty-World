"""Generate src/projects/rpg/tiles.ts manifest from public/rpg/tiles PNGs.

Usage (from anywhere): python src/projects/rpg/scripts/gen-tile-manifest.py
                       python src/projects/rpg/scripts/gen-tile-manifest.py --verify

Default output is one entry per PNG on disk (variant sheets included while
their files exist). --verify first regenerates every variant sheet from its
canonical + the LUT in src/projects/rpg/variants.json and fails on any
pixel mismatch outside the pinned stray sets in variant_strays.py, then
writes the manifest as usual. Variants whose PNG has been deleted (the
steady state — runtime synthesizes them) get LUT-against-canonical checks
instead. A variant PNG found on disk earns a warning: it should be deleted
so the runtime synthesis is the single source of truth.
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from variant_strays import KNOWN_STRAYS

ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
TILE_DIR = ROOT / "public" / "rpg" / "tiles"
VARIANTS_JSON = ROOT / "src" / "projects" / "rpg" / "variants.json"

# Tunable playback rates (frames per second) for animated tile sheets.
# These are the single place to tune animation speed: the manifest embeds
# them per sheet and the runtime reads them from the manifest.
WATER_FPS = 8
CAVE_FPS = 8
MIDDLE_FPS = 6
FISH_FPS = 8
FOAM_FPS = 6
WATERFALL_FPS = 10

# Explicit animation table: file stem -> (frames, frameW cells per frame,
# playback mode, fps). Frame dims cannot be inferred from sheet dims alone
# (e.g. an 18-wide sheet may hold 6 frames of 3 cells, not 9 of 2), so every
# animated sheet is pinned here and generate() asserts stem coverage.
# Only sheets with a PNG on disk are listed: tint-duplicate strips
# (Water_Tile_{2,3,4}_Anim, Water_Stone_Tile_{2,3,4}_Anim) are synthesized
# at runtime from their canonical + the LUT in variants.json, so they own
# no manifest entry and resolve to the canonical's spec (see below).
ANIM_SPECS: dict[str, tuple[int, int, str, int]] = {}
for _stem in [
    "Water_Tile_1_Anim",
    "Water_Stone_Tile_1_Anim",
]:
    ANIM_SPECS[_stem] = (8, 3, "pingpong", WATER_FPS)
ANIM_SPECS["Cave_Water_Animation"] = (8, 7, "pingpong", CAVE_FPS)
ANIM_SPECS["Water_Middle_Anim_1"] = (8, 1, "loop", MIDDLE_FPS)
ANIM_SPECS["Water_Middle_Anim_2"] = (14, 1, "loop", MIDDLE_FPS)
ANIM_SPECS["Fish_Animated_Tile"] = (16, 1, "loop", FISH_FPS)
ANIM_SPECS["Water_Foam_Animation"] = (4, 5, "loop", FOAM_FPS)
ANIM_SPECS["Waterfall_1"] = (6, 3, "loop", WATERFALL_FPS)
ANIM_SPECS["Waterfall_5"] = (6, 3, "loop", WATERFALL_FPS)
del _stem

# Tint-duplicate anim strips synthesized at runtime: variant stem ->
# canonical stem whose ANIM_SPECS entry (and LUT family in variants.json)
# covers it. These stems must NOT be on disk and MUST be registered as
# variants of their canonical; generate() asserts both.
VARIANT_ANIM_PARENTS: dict[str, str] = {}
for _v, _c in [
    ("Water_Tile_2_Anim", "Water_Tile_1_Anim"),
    ("Water_Tile_3_Anim", "Water_Tile_1_Anim"),
    ("Water_Tile_4_Anim", "Water_Tile_1_Anim"),
    ("Water_Stone_Tile_2_Anim", "Water_Stone_Tile_1_Anim"),
    ("Water_Stone_Tile_3_Anim", "Water_Stone_Tile_1_Anim"),
    ("Water_Stone_Tile_4_Anim", "Water_Stone_Tile_1_Anim"),
]:
    VARIANT_ANIM_PARENTS[_v] = _c
del _v, _c

# Variant families whose sheets animate (canonical is an on-disk anim
# strip; its variants are synthesized, never on disk). verify() allows
# "Anim" names exactly for these families.
ANIM_FAMILIES = {"water-tile-anim", "water-stone-tile-anim"}


def rgba_hex(px: tuple[int, int, int, int]) -> str:
    return f"#{px[0]:02x}{px[1]:02x}{px[2]:02x}{px[3]:02x}"


def verify() -> None:
    table = json.loads(VARIANTS_JSON.read_text())
    assert isinstance(table, dict) and table, "variants.json is empty"
    checked = 0
    for family, entry in sorted(table.items()):
        assert set(entry.keys()) == {"canonical", "variants"}, (family, entry.keys())
        canonical = entry["canonical"]
        canon_path = ROOT / "public" / canonical.lstrip("/")
        assert canon_path.is_file(), f"{family}: canonical missing: {canonical}"
        allow_anim = family in ANIM_FAMILIES
        assert ("Anim" not in canonical) or allow_anim, (
            f"{family}: animated sheet in table"
        )
        with Image.open(canon_path) as im:
            canon_px = [rgba_hex(px) for px in im.convert("RGBA").getdata()]
        canon_set = set(canon_px)
        width, height = Image.open(canon_path).size
        if allow_anim:
            canon_stem = Path(canonical).stem
            assert canon_stem in ANIM_SPECS, (
                f"{family}: canonical {canon_stem} needs an ANIM_SPECS entry"
            )
        for variant_src, lut in sorted(entry["variants"].items()):
            assert isinstance(lut, dict) and lut, f"{variant_src}: empty LUT"
            assert ("Anim" not in variant_src) or allow_anim, (
                f"animated sheet in table: {variant_src}"
            )
            for old, new in lut.items():
                assert (
                    len(old) == 9 and old.startswith("#") and len(new) == 9 and new.startswith("#")
                ), (variant_src, old, new)
                int(old[1:], 16)
                int(new[1:], 16)
                assert old in canon_set, f"{variant_src}: {old} absent from canonical"
            variant_path = ROOT / "public" / variant_src.lstrip("/")
            if not variant_path.is_file():
                checked += 1
                continue
            print(
                f"warning: {variant_src} exists on disk; it should be deleted "
                f"(runtime synthesizes it from {canonical})"
            )
            with Image.open(variant_path) as im:
                assert im.size == (width, height), (variant_src, im.size)
                variant_px = [rgba_hex(px) for px in im.convert("RGBA").getdata()]
            pinned = sorted(KNOWN_STRAYS.get(variant_src, []))
            bad = [
                [i % width, i // width]
                for i, (c, v) in enumerate(zip(canon_px, variant_px))
                if lut.get(c, c) != v
            ]
            assert sorted(bad) == pinned, (
                f"{variant_src}: regen mismatch.\n  observed: {sorted(bad)}\n  pinned:   {pinned}"
            )
            checked += 1
    print(f"verify: {checked} variants OK")


def generate() -> None:
    lines = []
    seen_anim_stems = set()
    for p in sorted(TILE_DIR.rglob("*.png")):
        if "TEST" in p.stem:
            continue
        rel = p.relative_to(ROOT / "public")
        url = "/" + rel.as_posix()
        parts = rel.parts
        category = parts[2] if len(parts) == 4 else "Misc"
        with Image.open(p) as im:
            w, h = im.size
        assert w % 16 == 0 and h % 16 == 0, (url, w, h)
        name = Path(parts[-1]).stem
        cols, rows = w // 16, h // 16
        anim_field = ""
        spec = ANIM_SPECS.get(name)
        if spec is not None:
            frames, frame_w, mode, fps = spec
            assert mode in ("loop", "pingpong"), (name, mode)
            assert cols % frame_w == 0 and cols // frame_w == frames, (
                name,
                (cols, rows),
                spec,
            )
            anim_field = (
                f', anim: {{ frames: {frames}, frameW: {frame_w}, '
                f'mode: "{mode}", fps: {fps} }}'
            )
            seen_anim_stems.add(name)
        lines.append(
            f'  {{ src: "{url}", name: "{name}", '
            f'category: "{category}", cols: {cols}, rows: {rows}{anim_field} }},'
        )
    assert seen_anim_stems == set(ANIM_SPECS), (
        f"ANIM_SPECS stems missing from disk: {sorted(set(ANIM_SPECS) - seen_anim_stems)}"
    )
    table = json.loads(VARIANTS_JSON.read_text())
    registered = {
        variant_src
        for entry in table.values()
        for variant_src in entry["variants"]
    }
    for variant_stem, parent_stem in sorted(VARIANT_ANIM_PARENTS.items()):
        assert parent_stem in ANIM_SPECS, (variant_stem, parent_stem)
        variant_src = f"/rpg/tiles/Water/{variant_stem}.png"
        assert variant_src in registered, (
            f"{variant_stem}: not registered in variants.json"
        )
        assert not (TILE_DIR / "Water" / f"{variant_stem}.png").is_file(), (
            f"{variant_stem}: PNG on disk; delete it so runtime synthesis "
            f"from {parent_stem} is the single source of truth"
        )
    out = (
        "export interface TileAnim {\n"
        "  frames: number;\n"
        "  frameW: number;\n"
        '  mode: "loop" | "pingpong";\n'
        "  fps: number;\n"
        "}\n"
        "\nexport interface TileSheet {\n"
        "  src: string;\n"
        "  name: string;\n"
        "  category: string;\n"
        "  cols: number;\n"
        "  rows: number;\n"
        "  anim?: TileAnim;\n"
        "}\n"
        "\nexport const CELL_PX = 16;\n"
        "\n/** Rewrite pre-move `/tiles/...` stored paths to their `/rpg/tiles/...` home. */\n"
        "export function migrateTileSrc(src: string): string {\n"
        "  return src.startsWith('/tiles/') ? `/rpg${src}` : src;\n"
        "}\n"
        "\nexport const TILE_SHEETS: TileSheet[] = [\n"
        + "\n".join(lines)
        + "\n];\n"
    )
    dest = ROOT / "src" / "projects" / "rpg" / "tiles.ts"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(out)
    print(f"wrote {len(lines)} sheets")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.verify:
        verify()
    generate()


if __name__ == "__main__":
    sys.exit(main())
