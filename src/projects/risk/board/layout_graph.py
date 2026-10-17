"""Lays out Risk's board as a graph: 42 territories as nodes, 83 borders as edges.

Usage (from any directory; needs Python 3.12+ with numpy):

    python layout_graph.py <out graph-layout.ts>

The layout is computed here, once, and committed; the game never lays the board out at runtime,
so players learn one board. It is tuned by editing SKETCH below and running this again.

1. SKETCH places each territory on a loose lattice, one unit apart, by hand. The arrangement
   serves the screen, not geography: the board is about as wide as a desktop screen is for its
   height, and it leaves its bottom-left corner empty, where the screen floats its status box over
   the map. The continents still read as clusters, a gap of about one and a half units between
   them, roughly where players expect them; within one, neighbours sit a unit apart, round
   triangles, so borders are short and none cross.
2. A relaxation evens it out: borders inside a continent pull towards one unit, territories
   closer than MIN_GAP push apart, a territory too near a border it isn't on is pushed off it,
   and everything is held near its sketched place so the lattice survives. A step that would add
   a crossing is refused. Nothing a territory draws may cover another's: its lit ring keeps clear
   of every other ring and every other name, and names keep clear of each other (RING and the
   name's box are graph.ts's sizes; the names' widths are measured, in label-widths.ts).
3. Each continent gets a region, drawn at runtime by graph.ts: its territories' convex hull,
   grown by REGION_PAD with rounded corners. Here it only checks the regions keep apart. Continents
   carry no labels: their bonuses are shown where they count.
4. The board wraps east to west, as a globe does: Alaska sits at the left edge and Kamchatka at
   the right, and their border runs across the edge. The board's width is the period a screen
   that pans across repeats it at.

It prints the checks the tests repeat (crossings, the closest two territories, the nearest a
territory comes to a border it isn't on) and writes the board as TypeScript.
"""

import math
import os
import re
import sys

import numpy as np

UNIT = 100  # board units per lattice unit
ROW = 1.3  # how far apart the sketch's rows are, in units: room for a name under each territory
RING = 0.53  # how far a territory's lit ring reaches from its middle, in units (graph.ts's)
NAME_TOP, NAME_BOTTOM = 0.32, 0.64  # where its name's box sits below its middle, in units (graph.ts's)
NAME_PAD = 0.025  # the halo round a name's letters, in units
SPARE = 0.02  # what the relaxation keeps clear beyond the rules, so rounding never breaks them
MIN_GAP = 2 * RING  # the least distance between two territories, in units: their rings clear
CLEARANCE = 0.42  # the least distance from a territory to a border it isn't on
REGION_PAD = 0.45  # how far a continent's region reaches past its outermost territories
MARGIN = 0.25  # clear board round the regions and labels
WRAP_ROOM = 0.3  # extra board left and right, so Alaska–Kamchatka is about a border long across the edge

SKETCH = {
    # North America, its south-west left open for the status box
    "alaska": (0.0, 0.0),
    "northwest-territory": (1.1, 0.0),
    "greenland": (2.3, 0.0),
    "alberta": (0.5, 1.0),
    "ontario": (1.6, 1.0),
    "quebec": (2.7, 1.0),
    "western-united-states": (0.9, 2.0),
    "eastern-united-states": (2.1, 2.0),
    "central-america": (1.6, 3.0),
    # South America, south-east of North America
    "venezuela": (2.5, 3.7),
    "peru": (2.1, 4.65),
    "brazil": (3.25, 4.45),
    "argentina": (2.75, 5.45),
    # Europe
    "iceland": (3.85, 0.0),
    "scandinavia": (4.95, 0.0),
    "great-britain": (3.95, 1.0),
    "northern-europe": (5.05, 1.0),
    "western-europe": (4.05, 2.0),
    "southern-europe": (5.15, 2.0),
    "ukraine": (6.25, 1.0),
    # Africa
    "north-africa": (4.35, 3.25),
    "egypt": (5.5, 3.2),
    "congo": (4.55, 4.3),
    "east-africa": (5.75, 4.25),
    "south-africa": (5.0, 5.25),
    "madagascar": (6.2, 5.2),
    # Asia
    "ural": (7.55, 0.2),
    "siberia": (8.65, 0.0),
    "yakutsk": (9.75, 0.0),
    "kamchatka": (10.85, 0.0),
    "irkutsk": (9.65, 1.0),
    "mongolia": (9.65, 2.1),
    "japan": (10.85, 1.9),
    "afghanistan": (7.45, 1.4),
    "china": (8.55, 1.9),
    "middle-east": (6.95, 2.6),
    "india": (7.95, 2.95),
    "siam": (9.05, 3.2),
    # Australia
    "indonesia": (8.95, 4.3),
    "new-guinea": (10.15, 4.1),
    "western-australia": (9.3, 5.3),
    "eastern-australia": (10.45, 5.15),
}

WRAP = ("alaska", "kamchatka")


# ---------------------------------------------------------------------------
# The graph, read from map.ts
# ---------------------------------------------------------------------------


def _map_ts():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "map.ts")


def read_label_widths():
    """Each territory's name's half width, in units, as the board draws it."""
    here = os.path.dirname(os.path.abspath(__file__))
    names = dict(re.findall(r'\{ id: "([a-z-]+)", name: "([^"]+)"', open(_map_ts(), encoding="utf-8").read()))
    short = open(os.path.join(here, "..", "ui", "short-names.ts"), encoding="utf-8").read()
    names.update(re.findall(r'"([a-z-]+)": "([^"]+)",', short[short.index("SHORT_NAMES") :]))
    widths = dict(re.findall(r'"([^"]+)": ([\d.]+),', open(os.path.join(here, "label-widths.ts"), encoding="utf-8").read()))
    return {t: float(widths[n]) / UNIT / 2 + NAME_PAD for t, n in names.items() if t in SKETCH}


def read_map():
    text = open(_map_ts(), encoding="utf-8").read()
    continents = re.findall(r'\{ id: "([a-z-]+)", name: "([^"]+)", bonus: (\d+) \}', text)
    territories = re.findall(r'\{ id: "([a-z-]+)", name: "[^"]+", continent: "([a-z-]+)"', text)
    adjacency_block = text[text.index("export const ADJACENCY") :]
    edges = set()
    for a, rest in re.findall(r'"([a-z-]+)": \[([^\]]*)\]', adjacency_block):
        for b in re.findall(r'"([a-z-]+)"', rest):
            edges.add(tuple(sorted((a, b))))
    return [(c, n, int(b)) for c, n, b in continents], dict(territories), sorted(edges)


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------


def _cross(o, a, b):
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def segments_cross(p1, p2, q1, q2):
    """Whether two segments cross properly (touching at an end doesn't count)."""
    d1, d2 = _cross(q1, q2, p1), _cross(q1, q2, p2)
    d3, d4 = _cross(p1, p2, q1), _cross(p1, p2, q2)
    return d1 * d2 < 0 and d3 * d4 < 0


def point_segment(p, a, b):
    ax, ay = a
    dx, dy = b[0] - ax, b[1] - ay
    t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(p[0] - cx, p[1] - cy), (cx, cy)


def hull(points):
    pts = sorted(set(points))
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and _cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and _cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


# ---------------------------------------------------------------------------
# Drawn segments: every border, Alaska–Kamchatka as its two stubs to the board's edges
# ---------------------------------------------------------------------------


def drawn_segments(pos, edges, left, right):
    segs = []
    for a, b in edges:
        if {a, b} == set(WRAP):
            continue
        segs.append(((a, b), pos[a], pos[b]))
    segs.append((("alaska", "<west edge>"), pos["alaska"], (left, pos["alaska"][1])))
    segs.append((("kamchatka", "<east edge>"), pos["kamchatka"], (right, pos["kamchatka"][1])))
    return segs


def crossings(pos, edges, left=-1.0, right=None):
    right = right if right is not None else max(p[0] for p in pos.values()) + 1.0
    segs = drawn_segments(pos, edges, left, right)
    found = []
    for i in range(len(segs)):
        for j in range(i + 1, len(segs)):
            (ea, p1, p2), (eb, q1, q2) = segs[i], segs[j]
            if set(ea) & set(eb):
                continue
            if segments_cross(p1, p2, q1, q2):
                found.append((ea, eb))
    return found


def clearances(pos, edges):
    """The nearest each territory comes to a border it isn't on."""
    worst = []
    for t, p in pos.items():
        for a, b in edges:
            if t in (a, b) or {a, b} == set(WRAP):
                continue
            d, _ = point_segment(p, pos[a], pos[b])
            worst.append((d, t, (a, b)))
    return sorted(worst)


def name_box(p, half):
    return (p[0] - half, p[1] + NAME_TOP - NAME_PAD, p[0] + half, p[1] + NAME_BOTTOM + NAME_PAD)


def to_box(p, box):
    """The nearest point of a box to p, and how far it is."""
    c = (min(max(p[0], box[0]), box[2]), min(max(p[1], box[1]), box[3]))
    return math.dist(p, c), c


def clashes(pos, half, margin=0.0):
    """Every ring over another territory's name, and every two names that meet, `margin` units
    to spare: (how deep, a, b, kind)."""
    out = []
    ids = list(pos)
    for a in ids:
        box = name_box(pos[a], half[a])
        for b in ids:
            if a == b:
                continue
            d, _ = to_box(pos[b], box)
            if d < RING + margin:
                out.append((RING + margin - d, a, b, "ring over name"))
            if a < b:
                other = name_box(pos[b], half[b])
                dx = min(box[2], other[2]) - max(box[0], other[0])
                dy = min(box[3], other[3]) - max(box[1], other[1])
                if dx > -margin and dy > -margin:
                    out.append((min(dx, dy) + margin, a, b, "names meet"))
    return sorted(out, reverse=True)


def closest_pairs(pos):
    ids = list(pos)
    out = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = ids[i], ids[j]
            out.append((math.dist(pos[a], pos[b]), a, b))
    return sorted(out)


# ---------------------------------------------------------------------------
# The relaxation
# ---------------------------------------------------------------------------


def relax(sketch, continent_of, edges, half, steps=400):
    ids = list(sketch)
    index = {t: i for i, t in enumerate(ids)}
    home = np.array([sketch[t] for t in ids], dtype=float) * [1, ROW]
    x = home.copy()
    inner = [(index[a], index[b]) for a, b in edges if continent_of[a] == continent_of[b]]

    def as_pos(arr):
        return {t: (float(arr[i, 0]), float(arr[i, 1])) for i, t in enumerate(ids)}

    base_crossings = len(crossings(as_pos(x), edges))
    # The second half lets go of the lattice, so whatever still covers a name is pushed clear.
    for step in range(steps):
        settling = step >= steps // 2
        if settling and not clashes(as_pos(x), half, SPARE):
            break
        force = np.zeros_like(x)
        # Hold the lattice: a gentle pull home.
        if not settling:
            force += 0.05 * (home - x)
        # Borders inside a continent towards one unit.
        for i, j in [] if settling else inner:
            d = x[j] - x[i]
            length = np.linalg.norm(d)
            pull = 0.08 * (length - 1.25) * d / length
            force[i] += pull
            force[j] -= pull
        # Territories apart.
        for i in range(len(ids)):
            d = x - x[i]
            dist = np.linalg.norm(d, axis=1)
            near = (dist < MIN_GAP + 0.1) & (dist > 0)
            for j in np.nonzero(near)[0]:
                push = 0.5 * (MIN_GAP + 0.1 - dist[j]) * d[j] / dist[j]
                force[i] -= push
        # Territories off borders they aren't on.
        pos = as_pos(x)
        for d, t, (a, b) in clearances(pos, edges):
            if d >= CLEARANCE + 0.05:
                break
            _, c = point_segment(pos[t], pos[a], pos[b])
            away = np.array(pos[t]) - np.array(c)
            norm = np.linalg.norm(away)
            if norm > 0:
                force[index[t]] += 0.3 * (CLEARANCE + 0.05 - d) * away / norm
        # Rings off other territories' names, and names off each other.
        for depth, a, b, kind in clashes(pos, half, SPARE):
            i, j = index[a], index[b]
            if kind == "ring over name":
                _, c = to_box(pos[b], name_box(pos[a], half[a]))
                away = np.array(pos[b]) - np.array(c)
                if np.linalg.norm(away) == 0:
                    away = np.array(pos[b]) - np.array(pos[a])
            else:
                away = np.array(pos[b]) - np.array(pos[a])
            away = away / np.linalg.norm(away)
            push = (0.6 if settling else 0.3) * (depth + 0.03) * away
            force[j] += push
            force[i] -= push
        trial = x + force
        # Alaska and Kamchatka stay level, so the line off one side lines up with the other's.
        a, k = index["alaska"], index["kamchatka"]
        trial[a, 1] = trial[k, 1] = (trial[a, 1] + trial[k, 1]) / 2
        if len(crossings(as_pos(trial), edges)) <= base_crossings:
            x = trial
    return as_pos(np.round(x, 3))


def main(out_path):
    continents, continent_of, edges = read_map()
    assert set(SKETCH) == set(continent_of), set(SKETCH) ^ set(continent_of)
    print(f"{len(continent_of)} territories, {len(edges)} borders")

    sketch_crossings = crossings(SKETCH, edges)
    half = read_label_widths()
    pos = relax(SKETCH, continent_of, edges, half)

    # Shift so the leftmost region edge sits at the margin.
    xs = [p[0] for p in pos.values()]
    ys = [p[1] for p in pos.values()]
    left = min(xs) - REGION_PAD - MARGIN - WRAP_ROOM
    top = min(ys) - REGION_PAD - MARGIN
    right = max(xs) + REGION_PAD + MARGIN + WRAP_ROOM
    bottom = max(ys) + REGION_PAD + MARGIN
    pos = {t: (round(p[0] - left, 2), round(p[1] - top, 2)) for t, p in pos.items()}
    width, height = right - left, bottom - top

    found = crossings(pos, edges, 0.0, width)
    pairs = closest_pairs(pos)
    clear = clearances(pos, edges)
    inner = [math.dist(pos[a], pos[b]) for a, b in edges if continent_of[a] == continent_of[b]]
    between = [(a, b) for a, b in edges if continent_of[a] != continent_of[b]]
    print(f"crossings: sketch {len(sketch_crossings)}, layout {len(found)} {found}")
    print(f"closest territories: {pairs[0][0]:.2f} units ({pairs[0][1]}, {pairs[0][2]})")
    print(f"names covered or meeting: {len(clashes(pos, half))} {clashes(pos, half)[:5]}")
    print(f"nearest to a border it isn't on: {clear[0][0]:.2f} units ({clear[0][1]} by {clear[0][2]})")
    print(f"borders inside continents: {min(inner):.2f}–{max(inner):.2f} units, mean {sum(inner) / len(inner):.2f}")
    print(f"borders between continents: {len(between)}")
    gaps = []
    for cid, _, _ in continents:
        h = hull([pos[t] for t, c in continent_of.items() if c == cid])
        segments = [(h[i - 1], h[i]) for i in range(len(h))] if len(h) > 1 else [(h[0], h[0])]
        for t, c in continent_of.items():
            if c != cid:
                gaps.append((min(point_segment(pos[t], a, b)[0] if a != b else math.dist(pos[t], a) for a, b in segments), t, cid))
    gap = min(gaps)
    print(f"regions: the nearest a territory comes to another continent's hull is {gap[0]:.2f} units ({gap[1]} to {gap[2]}), so regions sit {gap[0] - 2 * REGION_PAD:.2f} apart at the least")
    print(f"board: {width:.2f} × {height:.2f} units")

    lines = [
        "// Generated by layout_graph.py, the board as a graph. Don't edit by hand: change the",
        "// sketch there and run it again.",
        "",
        'import type { TerritoryId } from "../map";',
        "",
        f"export const GRAPH_WIDTH = {width * UNIT:.0f};",
        f"export const GRAPH_HEIGHT = {height * UNIT:.0f};",
        "",
        "/** The distance between neighbouring territories, in board units. */",
        f"export const GRAPH_UNIT = {UNIT};",
        "",
        "/** Where each territory sits. */",
        "export const NODES: Record<TerritoryId, readonly [number, number]> = {",
    ]
    for t in continent_of:
        x, y = pos[t]
        lines.append(f'  "{t}": [{x * UNIT:.0f}, {y * UNIT:.0f}],')
    lines += [
        "};",
        "",
        "/** How far a continent's region reaches past its outermost territories, in board units:",
        " *  graph.ts draws each round its territories as they sit on the screen. */",
        f"export const REGION_PAD = {REGION_PAD * UNIT:.0f};",
        "",
        "/** Every border, as map.ts has them: the layout was made for exactly these. */",
        "export const BORDERS: readonly (readonly [TerritoryId, TerritoryId])[] = [",
        *[f'  ["{a}", "{b}"],' for a, b in edges],
        "];",
        "",
    ]
    open(out_path, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main(sys.argv[1])
