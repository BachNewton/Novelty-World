"""People by the water, and at the landmarks, sparse as a quiet summer's day on Åland.

Read off what a built tile already has, so it needs no rebuild: the docks and boats
`pipeline/docks.py` placed (`docks.json`), the landmarks standing in it
(`art/landmarks/sites.json`), and its ground, shore, roads and buildings. Every rule is a
roll from the place, so a rebuild places the same people.

- **A private jetty's head:** someone fishing off the end, now and then with a child
  beside them; one or two sitting on the edge with their legs over the water; one or
  two on the bench; someone sunbathing on the boards. About a quarter of heads have
  anyone at all.
- **A rowing boat alongside a jetty:** now and then someone kneeling on the jetty to
  see to it.
- **A marina's piers and pontoons:** at a few berths someone by the boat's bow, kneeling
  to it from a pontoon's low deck or standing on a pier's, often in a sailing jacket;
  along the deck, now and then two chatting, someone standing, a parent and child, and
  where no boat lies, someone sitting on the edge or fishing.
- **A landmark:** two or three groups round it, a few metres out from its plan: a pair
  chatting, someone looking at it, a parent and child. On land, off the roads, clear of
  buildings.

Run alone, it adds `people-waterfront.json` to tiles already built (see `people.py`).
"""

import argparse
import gzip
import json
import math
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import Point, Polygon

from docks import DECK_M, HULLS
from grid import Tile, tile_from_name, to_local
from landmarks import Landmarks
import tile_steps
from people import Figure, listed, roll, seed_of, write, write_figures
from roadside import Heights, Paved, read_surface

SOURCE = "waterfront"
# Placed from OSM's piers and buildings, so the list is ODbL, as the docks are.
LICENCE = {"license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors; National Land Survey of Finland, CC BY 4.0"}

ROWING_BOATS = ("rowing-boat-white", "rowing-boat-blue", "rowing-boat-wood")
BERTHED = ("cruiser", "large", "folkboat", "launch", "rib")
RUNS = ("jetty", "pier", "pontoon")

# A jetty head (`buildJettyHead`): its length out from the jetty's end, and its bench's middle across it and along it.
HEAD_LONG_M = 3.2
HEAD_BENCH = (1.6, -1.1)
# Off a head's end, how far from its middle a figure sits or fishes: the ladder is in the middle.
HEAD_EDGE_OFF_M = (0.75, 1.3)
# What a head has on it, by the share of heads: fishing, sitting on the edge, on the bench, sunbathing.
HEAD_FISH = 0.09
HEAD_EDGE = 0.08
HEAD_BENCH_SHARE = 0.05
HEAD_SUN = 0.03
HEAD_CHILD = 0.25
HEAD_PAIR = 0.4

# A rowing boat lies alongside its jetty's head within this; someone sees to this share of them.
ROWING_REACH_M = 5.0
ROWING_TENDED = 0.14
# From a jetty's end to the middle of the boat alongside it (`docks._jetty_end`).
ROWING_BACK_M = 2.6

# A berthed boat's bow stands this far off its pier (`docks.BOW_GAP_M`); someone at this share of berths.
BOW_GAP_M = 0.8
BERTH_TENDED = 0.045
BERTH_SAILOR = 0.6
# A kneeling figure's middle is this far in from the edge, so its hands reach over it.
KNEEL_IN_M = 0.35
# A standing figure keeps this far in from a deck's edge, a fisher this far.
STAND_IN_M = 0.5
FISH_IN_M = 0.1

# Along a harbour pier or pontoon, a place every so often, and what each place has, by share.
STROLL_STEP_M = 14.0
STROLL_FIRST_M = 3.0
STROLL_CHAT = 0.035
STROLL_STAND = 0.02
STROLL_FAMILY = 0.015
EDGE_SIT = 0.03
EDGE_FISH = 0.012
# No one sits on an edge with a boat's hull this near beyond it.
EDGE_CLEAR_M = 2.0
# Two people chatting stand this far apart.
CHAT_APART_M = 0.95
# A parent and child stand this far apart.
FAMILY_APART_M = 0.6

# Round a landmark: rings this far out from its plan, a place every so often on each, and how many groups.
LANDMARK_RINGS_M = (4.0, 7.0, 11.0)
LANDMARK_STEP_M = 3.0
LANDMARK_GROUPS = (2, 3)
LANDMARK_GROUP_APART_M = 8.0
# A place round a landmark stands this far on to the land, off any carriageway or apron, and clear of buildings.
LAND_IN_M = 3.0
PAVED_CLEAR_M = 1.5
BUILDING_CLEAR_M = 1.0

# No two people, other than a pair placed together, stand nearer than this.
APART_M = 1.0


def facing(direction: np.ndarray) -> float:
    """The yaw that turns a figure's +z to a direction in the scene (x, z)."""
    return math.atan2(float(direction[0]), float(direction[1]))


class Grid:
    """One of the tile's own grids of 4 m nodes, coded as the heights are, read bilinearly in the scene's x and z."""

    def __init__(self, folder: Path, file: str, heights: dict, bounds: dict):
        nodes = heights["nodes"]
        deltas = np.frombuffer(gzip.decompress((folder / file).read_bytes()), dtype="<i2").reshape(nodes, nodes)
        self.values = np.cumsum(deltas.astype(np.int32), axis=1) * heights["unitM"]
        self.step = heights["stepM"]
        self.west, self.north = bounds["west"], bounds["north"]

    def at(self, x: float, z: float) -> float:
        last = self.values.shape[0] - 1.0001
        column = min(max((x - self.west) / self.step, 0.0), last)
        row = min(max((z + self.north) / self.step, 0.0), last)
        c, r = int(column), int(row)
        fc, fr = column - c, row - r
        v = self.values
        return float(v[r, c] * (1 - fc) * (1 - fr) + v[r, c + 1] * fc * (1 - fr) + v[r + 1, c] * (1 - fc) * fr + v[r + 1, c + 1] * fc * fr)


class Run:
    """A dock's run as `docks.json` has it, in the scene: from its place along (cos yaw, -sin yaw)."""

    def __init__(self, kind: str, place: list[float]):
        x, y, z, yaw, width, length = place
        self.kind, self.width, self.length = kind, width, length
        self.start = np.array([x, z])
        self.along = np.array([math.cos(yaw), -math.sin(yaw)])
        self.across = np.array([math.sin(yaw), math.cos(yaw)])
        self.deck = y + DECK_M[kind]

    def holds(self, point: np.ndarray, margin: float = 0.0) -> bool:
        offset = point - self.start
        along, across = float(offset @ self.along), float(offset @ self.across)
        return -margin <= along <= self.length + margin and abs(across) <= self.width / 2 - margin

    def at(self, along: float, across: float) -> np.ndarray:
        return self.start + self.along * along + self.across * across


class Waterfront:
    def __init__(self, tile: Tile, folder: Path, tiles: Path):
        self.tile = tile
        self.manifest = json.loads((folder / "tile.json").read_text(encoding="utf-8"))
        docks = json.loads((folder / self.manifest["docks"]["file"]).read_text(encoding="utf-8"))["models"] if "docks" in self.manifest else {}
        self.docks = docks
        self.runs = [Run(kind, place) for kind in RUNS for place in docks.get(kind, [])]
        self.hulls = [self._hull(model, place) for model in (*BERTHED, *ROWING_BOATS, "sailboat") for place in docks.get(model, [])]
        self.hull_tree = shapely.STRtree(self.hulls)
        bounds = self.manifest["bounds"]
        self.bounds = bounds
        self.shore = Grid(folder, self.manifest["water"]["shoreFile"], self.manifest["heights"], bounds)
        self.heights = Heights(tiles)
        self.folder = folder
        self.figures: list[Figure] = []

    @staticmethod
    def _hull(model: str, place: list[float]) -> Polygon:
        x, _, z, yaw = place[:4]
        length, beam = HULLS[model]
        bow, across = np.array([math.sin(yaw), math.cos(yaw)]), np.array([math.cos(yaw), -math.sin(yaw)])
        centre = np.array([x, z])
        return Polygon([centre + bow * length / 2 * a + across * beam / 2 * b for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1))])

    def deck_under(self, point: np.ndarray, margin: float = 0.0) -> Run | None:
        """The highest dock run under a point, kept this far in from its sides."""
        under = [run for run in self.runs if run.holds(point, margin)]
        return max(under, key=lambda run: run.deck) if under else None

    def clear(self, point: np.ndarray, besides: int = 0) -> bool:
        """No one placed within `APART_M`, leaving out the last `besides` placed, a pair's other half."""
        others = self.figures[: len(self.figures) - besides] if besides else self.figures
        return all(math.hypot(point[0] - other.x, point[1] - other.z) >= APART_M for other in others)

    def boat_beyond(self, point: np.ndarray, out: np.ndarray) -> bool:
        probe = Point(*(point + out * EDGE_CLEAR_M))
        return len(self.hull_tree.query(probe, predicate="dwithin", distance=EDGE_CLEAR_M)) > 0

    def put(self, point: np.ndarray, y: float, toward: np.ndarray, pose: str, key: tuple, spec: dict | None = None) -> Figure:
        figure = Figure(float(point[0]), y, float(point[1]), facing(toward), pose, seed_of(*key), spec or {})
        self.figures.append(figure)
        return figure

    def bake(self) -> list[Figure]:
        self.heads()
        self.rowing_boats()
        self.berths()
        self.strolls()
        self.landmarks()
        return self.figures

    def heads(self) -> None:
        for x, y, z, yaw, *_ in self.docks.get("jetty-head", []):
            out = np.array([math.cos(yaw), -math.sin(yaw)])
            side = np.array([math.sin(yaw), math.cos(yaw)])
            origin = np.array([x, z])
            deck = y + DECK_M["jetty"]
            key = ("head", round(x, 1), round(z, 1))
            at = lambda along, across: origin + out * along + side * across
            chance = roll(*key)
            way = 1 if roll(*key, "side") < 0.5 else -1
            if chance < HEAD_FISH:
                spot = at(HEAD_LONG_M - FISH_IN_M, way * HEAD_EDGE_OFF_M[0])
                self.put(spot, deck, out, "fish", (*key, "fish"))
                if roll(*key, "child") < HEAD_CHILD:
                    self.put(at(HEAD_LONG_M - 1.1, way * (HEAD_EDGE_OFF_M[0] + 0.5)), deck, out, "stand", (*key, "child"), {"age": "child"})
            elif chance < HEAD_FISH + HEAD_EDGE:
                self.put(at(HEAD_LONG_M, way * HEAD_EDGE_OFF_M[0]), deck, out, "sit-edge", (*key, "edge"))
                if roll(*key, "pair") < HEAD_PAIR:
                    self.put(at(HEAD_LONG_M, way * HEAD_EDGE_OFF_M[1]), deck, out, "sit-edge", (*key, "edge", 2))
            elif chance < HEAD_FISH + HEAD_EDGE + HEAD_BENCH_SHARE:
                along, across = HEAD_BENCH
                if roll(*key, "pair") < HEAD_PAIR:
                    self.put(at(along - 0.38, across), deck, side, "sit-bench", (*key, "bench"))
                    self.put(at(along + 0.38, across), deck, side, "sit-bench", (*key, "bench", 2))
                else:
                    self.put(at(along + (roll(*key, "along") - 0.5) * 0.6, across), deck, side, "sit-bench", (*key, "bench"))
            elif chance < HEAD_FISH + HEAD_EDGE + HEAD_BENCH_SHARE + HEAD_SUN:
                self.put(at(0.9, -way * 0.4), deck, out, "sunbathe", (*key, "sun"))

    def rowing_boats(self) -> None:
        heads = [np.array([place[0], place[2]]) for place in self.docks.get("jetty-head", [])]
        if not heads:
            return
        for model in ROWING_BOATS:
            for x, _, z, yaw, *_ in self.docks.get(model, []):
                key = ("rowing", round(x, 1), round(z, 1))
                if roll(*key) >= ROWING_TENDED:
                    continue
                centre = np.array([x, z])
                head = min(heads, key=lambda origin: float(np.hypot(*(origin - centre))))
                if np.hypot(*(head - centre)) > ROWING_REACH_M:
                    continue
                bow = np.array([math.sin(yaw), math.cos(yaw)])
                beside = (centre - head) - bow * float((centre - head) @ bow)
                to_boat = beside / max(float(np.hypot(*beside)), 1e-6)
                abreast = head - bow * ROWING_BACK_M
                run = self.deck_under(abreast, 0.1)
                if run is None or run.kind != "jetty":
                    continue
                middle = run.start + run.along * float((abreast - run.start) @ run.along)
                spot = middle + to_boat * (run.width / 2 - KNEEL_IN_M)
                if self.clear(spot):
                    self.put(spot, run.deck, to_boat, "tend-boat", key)

    def berths(self) -> None:
        for model in BERTHED:
            length = HULLS[model][0]
            for x, _, z, yaw, *_ in self.docks.get(model, []):
                key = ("berth", round(x, 1), round(z, 1))
                if roll(*key) >= BERTH_TENDED:
                    continue
                bow = np.array([math.sin(yaw), math.cos(yaw)])
                edge = np.array([x, z]) + bow * (length / 2 + BOW_GAP_M)
                run = self.deck_under(edge + bow * STAND_IN_M, 0.2)
                if run is None or run.kind == "jetty":
                    continue
                spec = {"look": "sailor"} if roll(*key, "sailor") < BERTH_SAILOR else {}
                if run.kind == "pontoon":
                    spot = edge + bow * KNEEL_IN_M
                    if self.clear(spot):
                        self.put(spot, run.deck, -bow, "tend-boat", key, spec)
                else:
                    spot = edge + bow * STAND_IN_M
                    if self.clear(spot):
                        self.put(spot, run.deck, -bow, "stand", key, spec)

    def strolls(self) -> None:
        for run in self.runs:
            if run.kind == "jetty":
                continue
            key = ("stroll", round(float(run.start[0]), 1), round(float(run.start[1]), 1))
            along = STROLL_FIRST_M
            slot = 0
            while along < run.length - STROLL_FIRST_M / 2:
                self._stroll(run, along, (*key, slot))
                along += STROLL_STEP_M
                slot += 1

    def _stroll(self, run: Run, along: float, key: tuple) -> None:
        chance = roll(*key)
        way = 1 if roll(*key, "side") < 0.5 else -1
        side = run.across * way
        middle = run.at(along, 0)
        if self.deck_under(middle) is not run:
            return
        if chance < STROLL_CHAT:
            a, b = middle - run.along * CHAT_APART_M / 2, middle + run.along * CHAT_APART_M / 2
            if self.clear(a) and self.clear(b):
                self.put(a, run.deck, run.along, "chat", (*key, "chat"))
                self.put(b, run.deck, -run.along, "chat", (*key, "chat", 2))
        elif chance < STROLL_CHAT + STROLL_STAND:
            if self.clear(middle):
                self.put(middle, run.deck, side, "stand", (*key, "stand"))
        elif chance < STROLL_CHAT + STROLL_STAND + STROLL_FAMILY:
            a, b = middle - run.along * FAMILY_APART_M / 2, middle + run.along * FAMILY_APART_M / 2
            if self.clear(a) and self.clear(b):
                self.put(a, run.deck, side, "stand", (*key, "parent"))
                self.put(b, run.deck, side, "wave", (*key, "child"), {"age": "child"})
        elif chance < STROLL_CHAT + STROLL_STAND + STROLL_FAMILY + EDGE_SIT + EDGE_FISH:
            fishing = chance >= STROLL_CHAT + STROLL_STAND + STROLL_FAMILY + EDGE_SIT
            edge = run.at(along, way * run.width / 2)
            spot = edge - side * (FISH_IN_M if fishing else 0)
            # Only where this deck's edge is open water: not over another run, nor beside a boat.
            if self.boat_beyond(edge, side) or self.deck_under(edge + side * 0.4) is not None or not self.clear(spot):
                return
            self.put(spot, run.deck, side, "fish" if fishing else "sit-edge", (*key, "edge"))

    def landmarks(self) -> None:
        sites = Landmarks(self.tile)
        own = [site for site in sites.own if not site.near_only]
        if not own:
            return
        paved = Paved(*read_surface(self.folder, self.manifest))
        buildings = self._buildings()
        west, south, east, north = self.bounds["west"], self.bounds["south"], self.bounds["east"], self.bounds["north"]
        for site in own:
            plan = shapely.transform(site.plan, lambda points: np.column_stack(to_local(points[:, 0], points[:, 1])))
            middle = np.array(plan.centroid.coords[0])
            places = []
            for out in LANDMARK_RINGS_M:
                ring = plan.buffer(out)
                for part in shapely.get_parts(ring):
                    boundary = part.exterior
                    for along in np.arange(0, boundary.length, LANDMARK_STEP_M):
                        point = np.array(boundary.interpolate(along).coords[0])
                        if not (west <= point[0] < east and south <= point[1] < north):
                            continue
                        if self.shore.at(point[0], -point[1]) > -LAND_IN_M or not paved.clear(point, PAVED_CLEAR_M):
                            continue
                        if len(buildings.query(Point(*point), predicate="dwithin", distance=BUILDING_CLEAR_M)) > 0:
                            continue
                        places.append(point)
            if not places:
                continue
            key = ("landmark", site.id)
            groups = LANDMARK_GROUPS[0] + int(roll(*key, "groups") * (LANDMARK_GROUPS[1] - LANDMARK_GROUPS[0] + 1))
            chosen: list[np.ndarray] = []
            for group in range(groups * 4):
                if len(chosen) == groups:
                    break
                point = places[int(roll(*key, group) * len(places))]
                if any(np.hypot(*(point - other)) < LANDMARK_GROUP_APART_M for other in chosen):
                    continue
                chosen.append(point)
                self._landmark_group(point, middle, (*key, group), len(chosen) - 1)

    def _landmark_group(self, point: np.ndarray, middle: np.ndarray, key: tuple, which: int) -> None:
        """A group by a landmark, in the scene: a pair chatting, someone looking at it, or a parent and child."""
        toward = middle - point
        toward = toward / max(float(np.hypot(*toward)), 1e-6)
        across = np.array([-toward[1], toward[0]])
        scene = lambda local: np.array([local[0], -local[1]])
        ground = lambda local: self.heights.at(float(local[0]), float(local[1]))
        kind = (which + int(roll(*key, "kind") * 3)) % 3
        if kind == 0:
            a, b = point - across * CHAT_APART_M / 2, point + across * CHAT_APART_M / 2
            self.put(scene(a), ground(a), scene(across), "chat", (*key, "chat"))
            self.put(scene(b), ground(b), scene(-across), "chat", (*key, "chat", 2))
        elif kind == 1:
            self.put(scene(point), ground(point), scene(toward), "stand", (*key, "look"))
        else:
            a, b = point - across * FAMILY_APART_M / 2, point + across * FAMILY_APART_M / 2
            self.put(scene(a), ground(a), scene(toward), "stand", (*key, "parent"))
            self.put(scene(b), ground(b), scene(toward), "stand", (*key, "child"), {"age": "child"})

    def _buildings(self) -> shapely.STRtree:
        entry = self.folder / "buildings.json"
        rings = json.loads(entry.read_text(encoding="utf-8"))["buildings"] if entry.exists() else []
        return shapely.STRtree([Polygon(building["ring"]) for building in rings if len(building["ring"]) >= 4])


def bake(name: str, tiles: Path) -> dict:
    folder = tiles / name
    figures = Waterfront(tile_from_name(name), folder, tiles).bake()
    return write(folder, SOURCE, figures, LICENCE)


def bake_named(job: tuple[str, Path]) -> tuple[str, dict]:
    name, tiles = job
    folder = tiles / name
    entry = write_figures(folder, SOURCE, Waterfront(tile_from_name(name), folder, tiles).bake(), LICENCE)
    return f"{name} ({entry['count']} people)", entry


def recorded(manifest: dict, entry: dict) -> dict:
    return listed(manifest, SOURCE, entry)


def bake_tiles(names: list[str], tiles: Path, jobs: int = 1) -> None:
    """Adds the waterfront's people to built tiles: after the docks, which they stand on. A tile the mirror hasn't is sea, and has none."""
    tile_steps.run("waterfront", [name for name in names if (tiles / name / "tile.json").exists()], tiles, bake_named, recorded, jobs)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tiles", nargs="*", help="NLS sheet names, such as L2343C; every built tile if none")
    parser.add_argument("--folder", type=Path, default=Path(__file__).resolve().parent.parent / ".data" / "tiles", help="where the built tiles are")
    parser.add_argument("--count", action="store_true", help="count who would be placed, and write nothing")
    arguments = parser.parse_args()
    totals: dict[str, int] = {}
    for name in arguments.tiles or sorted(path.parent.name for path in arguments.folder.glob("*/tile.json")):
        if arguments.count:
            figures = Waterfront(tile_from_name(name), arguments.folder / name, arguments.folder).bake()
            poses = {pose: sum(figure.pose == pose for figure in figures) for pose in sorted({figure.pose for figure in figures})}
            entry = {"count": len(figures), "poses": poses}
        else:
            entry = bake(name, arguments.folder)
        for pose, count in entry["poses"].items():
            totals[pose] = totals.get(pose, 0) + count
        print(name, entry["count"], entry["poses"])
    print("all", sum(totals.values()), dict(sorted(totals.items())))


if __name__ == "__main__":
    main()
