"""Extract Cute_Fantasy/Tiles/ from the downloaded zip into public/tiles/.

Usage: python scripts/extract-map-tiles.py [zip-path]
Default zip path is the downloader's Downloads folder on this machine.
"""
import sys
import zipfile
from pathlib import Path

ZIP = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"C:\Users\Kyle\Downloads\Cute_Fantasy.zip")
DEST = Path(__file__).resolve().parent.parent / "public" / "tiles"
PREFIX = "Cute_Fantasy/Tiles/"

with zipfile.ZipFile(ZIP) as z:
    members = [n for n in z.namelist() if n.startswith(PREFIX) and not n.endswith("/")]
    for name in members:
        target = DEST / Path(name[len(PREFIX):]).as_posix().replace("/", "\\")
        target = DEST.joinpath(*Path(name[len(PREFIX):]).parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        with z.open(name) as src, open(target, "wb") as dst:
            dst.write(src.read())

print(f"extracted {len(members)} files to {DEST}")
