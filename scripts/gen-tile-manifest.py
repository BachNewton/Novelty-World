"""Generate src/projects/rpg/tiles.ts manifest from public/rpg/tiles PNGs."""
from PIL import Image
from pathlib import Path

root = Path("public/rpg/tiles")
lines = []
for p in sorted(root.rglob("*.png")):
    rel = p.relative_to("public")
    url = "/" + rel.as_posix()
    parts = rel.parts
    category = parts[2] if len(parts) == 4 else "Misc"
    with Image.open(p) as im:
        w, h = im.size
    assert w % 16 == 0 and h % 16 == 0, (url, w, h)
    name = Path(parts[-1]).stem
    lines.append(
        f'  {{ src: "{url}", name: "{name}", '
        f'category: "{category}", cols: {w // 16}, rows: {h // 16} }},'
    )
out = (
    "export interface TileSheet {\n"
    "  src: string;\n"
    "  name: string;\n"
    "  category: string;\n"
    "  cols: number;\n"
    "  rows: number;\n"
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
dest = Path("src/projects/rpg/tiles.ts")
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(out)
print(f"wrote {len(lines)} sheets")
