"""People by the water stand on the docks `docks.py` lays, at their decks' height: the rule a change to either can quietly break."""

import gzip
import json
import math
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import numpy as np

import waterfront
from docks import DECK_M, Docks
from grid import tile_from_name, to_local
from people import CHILD_POSES
from test_docks import TILE, land, pier
from waterfront import HEAD_LONG_M, Waterfront

HEAD_WIDE_M = 3.0
EDGE_POSES = ("fish", "sit-edge")


def docks_models() -> dict:
    """A shore of private jetties, every one long enough for a head, and two floating pontoons with berths, as `docks.py` places them."""
    docks = Docks(TILE, land(), [], [])
    jetties = [pier([(x, 52), (x, 22)]) for x in range(8, 120, 8)]
    pontoons = [pier([(x, 42), (x, 4)], floating="yes") for x in (140, 175)]
    for number, each in enumerate([*jetties, *pontoons]):
        each.id = number
    docks.place([*jetties, *pontoons], [], [])
    return docks.models


def tile_folder(root: Path, models: dict) -> Path:
    """A built tile of the fewest files the rules read: all of it open water 50 m from the shore, at height 0."""
    tile = tile_from_name("L2343C")
    west, south = to_local(tile.west, tile.south)
    nodes = 3
    coded = gzip.compress(np.zeros((nodes, nodes), dtype="<i2").tobytes())
    shore = gzip.compress(np.column_stack([np.full(nodes, 5000), np.zeros((nodes, nodes - 1))]).astype("<i2").tobytes())
    folder = root / tile.name
    folder.mkdir()
    (folder / "heights.bin.gz").write_bytes(coded)
    (folder / "shore.bin.gz").write_bytes(shore)
    (folder / "docks.json").write_text(json.dumps({"models": models}), encoding="utf-8")
    heights = {"file": "heights.bin.gz", "nodes": nodes, "stepM": 3000.0, "unitM": 0.01}
    manifest = {"tile": tile.name, "bounds": {"west": west, "south": south, "east": west + 6000, "north": south + 6000}, "heights": heights, "water": {"shoreFile": "shore.bin.gz"}, "docks": {"file": "docks.json"}}
    (folder / "tile.json").write_text(json.dumps(manifest), encoding="utf-8")
    return folder


def on_head(head: list[float], x: float, z: float) -> bool:
    hx, _, hz, yaw = head[:4]
    offset = np.array([x - hx, z - hz])
    along = offset @ np.array([math.cos(yaw), -math.sin(yaw)])
    across = offset @ np.array([math.sin(yaw), math.cos(yaw)])
    return -0.05 <= along <= HEAD_LONG_M + 0.05 and abs(across) <= HEAD_WIDE_M / 2 + 0.05


class OnTheDocks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.models = docks_models()
        cls.root = tempfile.TemporaryDirectory()
        tile_folder(Path(cls.root.name), cls.models)

    @classmethod
    def tearDownClass(cls):
        cls.root.cleanup()

    def placed(self, **shares: float) -> list:
        """Everyone placed with the rules' shares as given, the rest as they are, so every rule is exercised whatever the rolls.
        No landmark stands here, and reading every site's plan to find that out is most of a bake's time."""
        with mock.patch.multiple(waterfront, **shares, Landmarks=lambda tile: SimpleNamespace(own=[])):
            name = tile_from_name("L2343C").name
            return Waterfront(tile_from_name(name), Path(self.root.name) / name, Path(self.root.name)).bake()

    def assert_on_a_deck(self, figures: list) -> None:
        heads = self.models["jetty-head"]
        runs = [waterfront.Run(kind, place) for kind in waterfront.RUNS for place in self.models.get(kind, [])]
        for figure in figures:
            point = np.array([figure.x, figure.z])
            head = next((head for head in heads if on_head(head, figure.x, figure.z)), None)
            if head is not None:
                self.assertAlmostEqual(figure.y, head[1] + DECK_M["jetty"], places=2, msg=f"{figure.pose} isn't at its head's deck")
                continue
            under = [run for run in runs if run.holds(point, -0.05)]
            self.assertTrue(under, f"{figure.pose} at {figure.x:.1f}, {figure.z:.1f} stands on no dock")
            self.assertAlmostEqual(figure.y, max(run.deck for run in under), places=2, msg=f"{figure.pose} isn't at its deck's height")

    def test_the_docks_have_heads_boats_and_berths(self):
        self.assertGreater(len(self.models.get("jetty-head", [])), 5)
        self.assertTrue(any(model.startswith("rowing-boat") for model in self.models))
        self.assertTrue(any(model in waterfront.BERTHED for model in self.models))

    def test_everyone_on_a_head_stands_on_it(self):
        for shares in ({"HEAD_FISH": 1}, {"HEAD_FISH": 0, "HEAD_EDGE": 1}, {"HEAD_FISH": 0, "HEAD_EDGE": 0, "HEAD_BENCH_SHARE": 1}, {"HEAD_FISH": 0, "HEAD_EDGE": 0, "HEAD_BENCH_SHARE": 0, "HEAD_SUN": 1}):
            figures = self.placed(**shares, ROWING_TENDED=0, BERTH_TENDED=0, STROLL_CHAT=0, STROLL_STAND=0, STROLL_FAMILY=0, EDGE_SIT=0, EDGE_FISH=0)
            self.assertGreaterEqual(len(figures), len(self.models["jetty-head"]), shares)
            self.assert_on_a_deck(figures)
            for figure in figures:
                if figure.pose in EDGE_POSES:
                    head = next(head for head in self.models["jetty-head"] if on_head(head, figure.x, figure.z))
                    out = np.array([math.cos(head[3]), -math.sin(head[3])])
                    self.assertGreater(np.array([math.sin(figure.yaw), math.cos(figure.yaw)]) @ out, 0.99, "faces out over the water")

    def test_a_tender_kneels_on_the_dock_facing_their_boat(self):
        figures = self.placed(HEAD_FISH=0, HEAD_EDGE=0, HEAD_BENCH_SHARE=0, HEAD_SUN=0, ROWING_TENDED=1, BERTH_TENDED=1, STROLL_CHAT=0, STROLL_STAND=0, STROLL_FAMILY=0, EDGE_SIT=0, EDGE_FISH=0)
        tenders = [figure for figure in figures if figure.pose == "tend-boat"]
        self.assertGreater(len(tenders), 3)
        self.assert_on_a_deck(tenders)
        boats = [np.array([place[0], place[2]]) for model, places in self.models.items() if model.startswith("rowing-boat") or model in waterfront.BERTHED for place in places]
        for figure in tenders:
            point = np.array([figure.x, figure.z])
            boat = min(boats, key=lambda centre: float(np.hypot(*(centre - point))))
            to_boat = (boat - point) / np.hypot(*(boat - point))
            self.assertGreater(np.array([math.sin(figure.yaw), math.cos(figure.yaw)]) @ to_boat, 0.6, "faces the boat beside them")

    def test_strollers_stand_on_the_pontoons_and_children_only_stand_or_wave(self):
        figures = self.placed(HEAD_FISH=0, HEAD_EDGE=0, HEAD_BENCH_SHARE=0, HEAD_SUN=0, ROWING_TENDED=0, BERTH_TENDED=0, STROLL_CHAT=0.3, STROLL_STAND=0.2, STROLL_FAMILY=0.2, EDGE_SIT=0.2, EDGE_FISH=0.1)
        self.assertGreaterEqual(len(figures), 2)
        self.assert_on_a_deck(figures)
        for figure in figures:
            if figure.spec.get("age") == "child":
                self.assertIn(figure.pose, CHILD_POSES)


if __name__ == "__main__":
    unittest.main()
