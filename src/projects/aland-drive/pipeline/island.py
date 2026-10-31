"""Which tiles are the main island, worked out from the roads themselves.

    pipeline/.venv/Scripts/python pipeline/island.py

Starts on the road at Eckerö and walks OSM's motor roads outwards, fetching each
tile they reach, until no road leads to a tile not yet seen. Ferries aren't roads,
so that's Fasta Åland and whatever bridges and causeways join to it. Around those
go the neighbouring tiles the elevation mirror has, so a shore has land and sea
beyond it rather than the world's end. Writes island.json, which `run.py --island`
builds.
"""

import json
import time
from collections import Counter
from pathlib import Path

import numpy as np

from grid import TILE_SIZE_M, Tile, lonlat_to_grid, neighbour, tile_at
from sources import dem_path, osm_path
from vectors import FOOT_OR_BIKE, NOT_A_ROAD

ISLAND_FILE = Path(__file__).resolve().parent / "island.json"
# Where the walk starts and where it has to reach: the roads at Eckerö's and Långnäs's harbours (longitude, latitude).
ECKERO = (19.583, 60.223)
LUMPARLAND = (20.257, 60.117)
DENSIFY_M = 100.0
OSM_PAUSE_S = 1.0


def node_key(point: dict) -> tuple[float, float]:
    return (round(point["lon"], 7), round(point["lat"], 7))


class Roads:
    """Every motor way seen so far, by the OSM nodes they share."""

    def __init__(self):
        self.ways: dict[int, list[dict]] = {}
        self.ways_at: dict[tuple, set[int]] = {}

    def add_tile(self, tile: Tile) -> None:
        osm = json.loads(osm_path(tile).read_text(encoding="utf-8"))
        for element in osm["elements"]:
            kind = element.get("tags", {}).get("highway")
            if element["type"] != "way" or kind is None or kind in NOT_A_ROAD or kind in FOOT_OR_BIKE or element["id"] in self.ways:
                continue
            self.ways[element["id"]] = element["geometry"]
            for point in element["geometry"]:
                self.ways_at.setdefault(node_key(point), set()).add(element["id"])

    def reachable_from(self, way: int) -> set[int]:
        seen = {way}
        waiting = [way]
        while waiting:
            for point in self.ways[waiting.pop()]:
                for other in self.ways_at[node_key(point)]:
                    if other not in seen:
                        seen.add(other)
                        waiting.append(other)
        return seen

    def nearest_way(self, lonlat: tuple[float, float]) -> int:
        target = np.array(lonlat_to_grid(*lonlat))
        best, way = np.inf, None
        for id, geometry in self.ways.items():
            for point in geometry:
                distance = np.hypot(*(np.array(lonlat_to_grid(point["lon"], point["lat"])) - target))
                if distance < best:
                    best, way = distance, id
        if way is None:
            raise ValueError(f"no motor road anywhere near {lonlat}")
        return way

    def tiles_of(self, ways: set[int]) -> dict[str, Tile]:
        """Every tile any of these ways passes through, whether or not one of its nodes lands there."""
        touched: dict[str, Tile] = {}
        for way in ways:
            east, north = lonlat_to_grid([p["lon"] for p in self.ways[way]], [p["lat"] for p in self.ways[way]])
            line = np.column_stack((east, north))
            lengths = np.concatenate(([0], np.cumsum(np.hypot(*np.diff(line, axis=0).T))))
            along = np.arange(0, lengths[-1] + DENSIFY_M, DENSIFY_M)
            for x, y in zip(np.interp(along, lengths, line[:, 0]), np.interp(along, lengths, line[:, 1])):
                tile = tile_at(float(x), float(y))
                touched[tile.name] = tile
        return touched


def main() -> None:
    roads = Roads()
    start = tile_at(*lonlat_to_grid(*ECKERO))
    fetched = {start.name: start}
    roads.add_tile(start)
    seed = roads.nearest_way(ECKERO)
    while True:
        reached = roads.reachable_from(seed)
        waiting = [tile for name, tile in sorted(roads.tiles_of(reached).items()) if name not in fetched]
        print(f"{len(fetched)} tiles fetched, {len(reached)} ways reached, {len(waiting)} tiles to fetch", flush=True)
        if not waiting:
            break
        for tile in waiting:
            if dem_path(tile) is None:
                print(f"  {tile.name}: a road crosses it, but the mirror has no such tile")
            roads.add_tile(tile)
            fetched[tile.name] = tile
            time.sleep(OSM_PAUSE_S)

    road_tiles = roads.tiles_of(reached)
    lumparland = tile_at(*lonlat_to_grid(*LUMPARLAND))
    if lumparland.name not in road_tiles:
        raise SystemExit(f"the roads from Eckerö never reach {lumparland.name}, Lumparland's tile")
    ring: dict[str, Tile] = {}
    for tile in road_tiles.values():
        for steps_east in (-1, 0, 1):
            for steps_north in (-1, 0, 1):
                near = neighbour(tile, steps_east, steps_north)
                if near.name not in road_tiles and near.name not in ring and dem_path(near) is not None:
                    ring[near.name] = near
    kinds = Counter(name[:4] for name in road_tiles)
    print(f"{len(road_tiles)} road tiles, {len(ring)} around them, in sheets {dict(kinds)}")
    ISLAND_FILE.write_text(json.dumps({"tileM": TILE_SIZE_M, "roadTiles": sorted(road_tiles), "around": sorted(ring)}, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
