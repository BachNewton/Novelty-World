"""Do two builds hold the same tiles? Compares two folders of built tiles file by file, by what each file decodes to.

    python pipeline/compare_builds.py <folder> <other folder>

Two machines can write the same data as different bytes (another zlib or libwebp), so a file whose bytes differ is
decoded and compared again: gzip to its bytes, an image to its pixels, JSON to its values. What still differs is
measured: how many bytes or pixels, by how much, or the first value that differs. `world.json`'s version hashes every
file's bytes, so it differs whenever any byte does.
"""

import argparse
import gzip
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image


def first_difference(a, b, path: str = "") -> str | None:
    if type(a) is not type(b):
        return f"{path or '/'}: {a!r:.80} against {b!r:.80}"
    if isinstance(a, dict):
        for key in sorted(set(a) | set(b)):
            if key not in a or key not in b:
                return f"{path}/{key}: only in {'the first' if key in a else 'the second'}"
            if (found := first_difference(a[key], b[key], f"{path}/{key}")) is not None:
                return found
        return None
    if isinstance(a, list):
        if len(a) != len(b):
            return f"{path}: {len(a)} items against {len(b)}"
        return next((found for index, (x, y) in enumerate(zip(a, b)) if (found := first_difference(x, y, f"{path}[{index}]")) is not None), None)
    return None if a == b else f"{path or '/'}: {a!r:.80} against {b!r:.80}"


def compare(a: Path, b: Path) -> str:
    """'same bytes', 'same content', or what differs."""
    first, second = a.read_bytes(), b.read_bytes()
    if first == second:
        return "same bytes"
    if a.suffix == ".gz":
        first, second = gzip.decompress(first), gzip.decompress(second)
        if first == second:
            return "same content"
        if a.name.endswith(".json.gz"):
            return f"values differ: {first_difference(json.loads(first), json.loads(second))}"
        if len(first) != len(second):
            return f"content differs: {len(first)} bytes against {len(second)}"
        differing = np.frombuffer(first, np.uint8) != np.frombuffer(second, np.uint8)
        return f"content differs: {int(differing.sum())} of {len(first)} bytes, the first at byte {int(np.argmax(differing))}"
    if a.suffix in (".png", ".webp"):
        x, y = (np.asarray(Image.open(io.BytesIO(data))) for data in (first, second))
        if x.shape != y.shape:
            return f"pixels differ: {x.shape} against {y.shape}"
        gap = np.abs(x.astype(np.int16) - y.astype(np.int16))
        if not gap.any():
            return "same content"
        pixels = gap.reshape(*gap.shape[:2], -1).any(axis=2)
        return f"pixels differ: {int(pixels.sum())} of {pixels.size}, by up to {int(gap.max())}"
    if a.suffix == ".json":
        found = first_difference(json.loads(first), json.loads(second))
        return "same content" if found is None else f"values differ: {found}"
    return "bytes differ"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("first", type=Path)
    parser.add_argument("second", type=Path)
    arguments = parser.parse_args()
    names = {path.relative_to(folder).as_posix() for folder in (arguments.first, arguments.second) for path in folder.rglob("*") if path.is_file()}
    verdicts: dict[str, int] = {}
    for name in sorted(names):
        a, b = arguments.first / name, arguments.second / name
        verdict = compare(a, b) if a.exists() and b.exists() else f"only in {'the first' if a.exists() else 'the second'}"
        kind = verdict if verdict in ("same bytes", "same content") else "differs"
        verdicts[kind] = verdicts.get(kind, 0) + 1
        if kind == "differs":
            print(f"{name}: {verdict}")
    print(", ".join(f"{count} {kind}" for kind, count in verdicts.items()))


if __name__ == "__main__":
    main()
