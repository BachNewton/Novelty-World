"""Generate src/projects/map-editor/tiles.ts manifest from public/tiles PNGs."""
from PIL import Image
from pathlib import Path

root = Path("public/tiles")
lines = []
for p in sorted(root.rglob("*.png")):
    rel = p.relative_to("public")
    url = "/" + rel.as_posix()
    parts = rel.parts
    category = parts[1] if len(parts) == 3 else "Misc"
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
    "\nexport const TILE_SHEETS: TileSheet[] = [\n"
    + "\n".join(lines)
    + "\n];\n"
)
dest = Path("src/projects/map-editor/tiles.ts")
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(out)
print(f"wrote {len(lines)} sheets")
