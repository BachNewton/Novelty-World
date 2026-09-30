"""Make the paper background of a scanned symbol transparent.

A scan of a printed plate (a coat of arms on paper) keeps the paper around
the symbol. This turns only that paper transparent: the paper-coloured
region connected to the image's border, paper showing through gaps in the
design (between a crown's arches), and loose specks of dirt on the paper.
The symbol's own pixels are copied untouched, and the result is trimmed to
the symbol so the file's shape is the symbol's. The original scan stays in
the repo as the record; this makes the display file beside it.

    python transparent-background.py <scan> <out.png>
"""

import sys

import numpy as np
from PIL import Image

# How far (RGB distance) a pixel may sit from the paper's colour and still be
# paper. Paper is also warm: red above blue, which keeps pale blue pearls and
# silver out of it.
PAPER_DISTANCE = 42
# Pixels within this distance of the removed paper get a soft edge instead of
# a hard one, scaled by how paper-like they are.
EDGE_DISTANCE = 80
# An enclosed paper-coloured patch at least this big is paper seen through a
# gap in the design; smaller ones are the design's own highlights (a rose's
# white centre).
MIN_GAP_PIXELS = 400


def grow(seed: np.ndarray, allowed: np.ndarray) -> np.ndarray:
    """Every allowed pixel 4-connected to the seed."""
    region = seed & allowed
    while True:
        grown = region.copy()
        grown[1:, :] |= region[:-1, :]
        grown[:-1, :] |= region[1:, :]
        grown[:, 1:] |= region[:, :-1]
        grown[:, :-1] |= region[:, 1:]
        grown &= allowed
        if (grown == region).all():
            return region
        region = grown


def gaps(candidates: np.ndarray) -> np.ndarray:
    """The 4-connected patches of candidates of at least MIN_GAP_PIXELS."""
    height, width = candidates.shape
    seen = np.zeros_like(candidates)
    result = np.zeros_like(candidates)
    for start in zip(*np.nonzero(candidates)):
        if seen[start]:
            continue
        seen[start] = True
        patch, stack = [start], [start]
        while stack:
            y, x = stack.pop()
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < height and 0 <= nx < width and candidates[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    patch.append((ny, nx))
                    stack.append((ny, nx))
        if len(patch) >= MIN_GAP_PIXELS:
            ys, xs = zip(*patch)
            result[list(ys), list(xs)] = True
    return result


def main(source: str, target: str) -> None:
    rgb = np.asarray(Image.open(source).convert("RGB")).astype(np.int32)
    height, width, _ = rgb.shape

    border = np.zeros((height, width), dtype=bool)
    border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
    paper_color = np.median(rgb[border], axis=0)
    distance = np.sqrt(((rgb - paper_color) ** 2).sum(axis=2))
    warm = rgb[:, :, 0] >= rgb[:, :, 2]
    paper_like = (distance <= PAPER_DISTANCE) & warm

    paper = grow(border, paper_like)
    paper |= gaps(paper_like & ~paper)
    # The symbol is what is left that is connected to the image's centre;
    # anything else not paper is dirt on the paper.
    centre = np.zeros_like(border)
    centre[height // 2, width // 2] = True
    symbol = grow(centre, ~paper)

    alpha = np.where(symbol, 255, 0).astype(np.float64)
    near_paper = np.zeros_like(paper)
    near_paper[1:, :] |= paper[:-1, :]
    near_paper[:-1, :] |= paper[1:, :]
    near_paper[:, 1:] |= paper[:, :-1]
    near_paper[:, :-1] |= paper[:, 1:]
    edge = symbol & near_paper
    soft = np.clip((distance - PAPER_DISTANCE) / (EDGE_DISTANCE - PAPER_DISTANCE), 0, 1)
    alpha[edge] = 255 * soft[edge]

    rows = np.flatnonzero(symbol.any(axis=1))
    cols = np.flatnonzero(symbol.any(axis=0))
    box = (slice(rows[0], rows[-1] + 1), slice(cols[0], cols[-1] + 1))
    rgba = np.dstack([rgb, alpha.round()]).astype(np.uint8)[box]
    Image.fromarray(rgba, "RGBA").save(target, optimize=True)
    print(f"paper {paper_color.round().astype(int).tolist()}, kept {rgba.shape[1]}x{rgba.shape[0]}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
