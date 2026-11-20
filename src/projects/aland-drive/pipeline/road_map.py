"""The island's roads as a network for the maps and the GPS: one small file, whatever the tile count.

Every motor way as the tiles were built from it (each tile's `roads.json`), cut at
each point two ways share, with its line thinned to what a map needs. Those are
the ways once they've given way to buildings (`give_way.py`): moved clear of one,
kept between two, or stopped at a wall. Made from OSM's ways as they come, the map
drew a road through a farmyard the built road goes round, and routed along a road
a building cuts in two. The file is the game's only knowledge of roads it hasn't
loaded, so it's fetched once the drive has started, not before. A way's two halves
either side of a tile's edge end on one point there, so they join as any two ways do.
"""

import gzip
import json
from pathlib import Path

import numpy as np

MAP_FILE = "map.json.gz"
UNIT_M = 0.1
THIN_WITHIN_M = 1.0
ONE_WAY, CAN_ROUTE = 1, 2
ONE_WAY_TAGS = ("yes", "true", "1")


def _node(point: list[float]) -> tuple[float, float]:
    return (round(point[0], 2), round(point[1], 2))


def _thin(line: np.ndarray) -> np.ndarray:
    """Douglas–Peucker, keeping both ends."""
    keep = np.zeros(len(line), dtype=bool)
    keep[[0, -1]] = True
    stack = [(0, len(line) - 1)]
    while stack:
        first, last = stack.pop()
        if last - first < 2:
            continue
        run = line[last] - line[first]
        length = max(float(np.hypot(*run)), 1e-9)
        offset = line[first + 1 : last] - line[first]
        # A closed loop's ends are one point, with no line between them to measure from.
        distance = np.abs(run[0] * offset[:, 1] - run[1] * offset[:, 0]) / length if length > 1e-6 else np.hypot(*offset.T)
        worst = int(distance.argmax())
        if distance[worst] > THIN_WITHIN_M:
            keep[first + 1 + worst] = True
            stack += [(first, first + 1 + worst), (first + 1 + worst, last)]
    return line[keep]


def motor_ways(output: Path, tiles: list[str]) -> list[dict]:
    """Every part of a motor way the tiles were built from, in the scene's metres."""
    ways: list[dict] = []
    for name in tiles:
        path = output / name / "roads.json"
        # A tile of open sea has no roads.
        if path.exists():
            ways += [road for road in json.loads(path.read_text(encoding="utf-8"))["roads"] if road["motor"] and len(road["line"]) > 1]
    return ways


def _pieces(way: dict, uses: dict[tuple, int]) -> list[list[list[float]]]:
    """A way's points cut at every junction."""
    pieces: list[list[list[float]]] = []
    current: list[list[float]] = []
    for point in way["line"]:
        current.append(point)
        if len(current) > 1 and uses[_node(point)] > 1:
            pieces.append(current)
            current = [current[-1]]
    if len(current) > 1:
        pieces.append(current)
    return pieces


def build(output: Path, tiles: list[str]) -> dict:
    ways = motor_ways(output, tiles)
    uses: dict[tuple, int] = {}
    for way in ways:
        for point in way["line"]:
            uses[_node(point)] = uses.get(_node(point), 0) + 1

    names: dict[str, int] = {"": 0}
    kinds: dict[str, int] = {}
    nodes: dict[tuple, int] = {}
    node_xy: list[tuple[float, float]] = []
    edges: list[tuple] = []

    def node_id(point: list[float]) -> int:
        key = _node(point)
        if key not in nodes:
            nodes[key] = len(node_xy)
            node_xy.append(key)
        return nodes[key]

    for way in ways:
        name = names.setdefault(way.get("name") or way.get("ref") or "", len(names))
        kind = kinds.setdefault(way["kind"], len(kinds))
        one_way = 0
        if way.get("oneway") in ONE_WAY_TAGS or way.get("junction") == "roundabout":
            one_way = 1
        for piece in _pieces(way, uses):
            ordered = piece[::-1] if way.get("oneway") == "-1" else piece
            flags = ONE_WAY if one_way or way.get("oneway") == "-1" else 0
            edges.append((node_id(ordered[0]), node_id(ordered[-1]), kind, name, flags, _thin(np.array(ordered, dtype=float))))

    # What can be routed to is the largest joined network, the main island: the rest is past a ferry.
    joined: dict[int, list[int]] = {}
    for first, last, *_ in edges:
        joined.setdefault(first, []).append(last)
        joined.setdefault(last, []).append(first)
    reached: set[int] = set()
    seen: set[int] = set()
    for seed in joined:
        if seed in seen:
            continue
        network = {seed}
        waiting = [seed]
        while waiting:
            for next_node in joined[waiting.pop()]:
                if next_node not in network:
                    network.add(next_node)
                    waiting.append(next_node)
        seen |= network
        if len(network) > len(reached):
            reached = network

    scale = 1 / UNIT_M
    flat_nodes = np.round(np.array(node_xy) * scale).astype(np.int64)
    points: list[int] = []
    counts: list[int] = []
    for _, _, _, _, _, line in edges:
        units = np.round(line * scale).astype(np.int64)
        steps = np.diff(units[:-1], axis=0)
        counts.append(len(units) - 2)
        points += steps.ravel().tolist()
    document = {
        "license": "ODbL-1.0",
        "attribution": "© OpenStreetMap contributors",
        "unitM": UNIT_M,
        "names": list(names),
        "kinds": list(kinds),
        "nodes": flat_nodes.ravel().tolist(),
        "from": [edge[0] for edge in edges],
        "to": [edge[1] for edge in edges],
        "kind": [edge[2] for edge in edges],
        "name": [edge[3] for edge in edges],
        "flags": [edge[4] | (CAN_ROUTE if edge[0] in reached else 0) for edge in edges],
        "counts": counts,
        "points": points,
    }
    (output / MAP_FILE).write_bytes(gzip.compress(json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode(), 9, mtime=0))
    print(f"map: {len(node_xy)} junctions, {len(edges)} roads, {len(names)} names, {sum(float(np.hypot(*np.diff(edge[5], axis=0).T).sum()) for edge in edges) / 1000:.0f} km, {(output / MAP_FILE).stat().st_size / 1e6:.2f} MB, {sum(1 for edge in edges if edge[0] not in reached)} roads out of reach")
    return {"file": MAP_FILE}
