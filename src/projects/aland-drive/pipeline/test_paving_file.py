"""A paved tile's files read back as they were laid, to within what the format promises (`paving_file.py`).

    pipeline/.venv/Scripts/python -m unittest test_paving_file

`fixture/paved/` is a small paved tile the game's own decoders are held to (`sim/paved.test.ts`), with what it was laid
from beside it. After a change to the format, write it again: `pipeline/.venv/Scripts/python test_paving_file.py --fixture`.
"""

import gzip
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import shapely

import paving
import paving_file
from build import as_written, encode_ground_cut, encode_heights, encode_paving, paving_way_points
from test_paving import TILE_M, hilly, land, road

# Heights come back to the millimetre, and float32 adds a few micrometres at these heights.
HEIGHT_M = 0.0005 + 1e-5
PLACE_M = 1e-5
ACROSS = 0.5 / paving_file.ACROSS_UNITS + 1e-6
ALONG_M = 0.5 / paving_file.ALONG_UNITS + 1e-4
FIXTURE = Path(__file__).resolve().parent.parent / "fixture" / "paved"


def gentle(east, north):
    """`hilly` with no ripple across the rows, so the fixture's heights pack small."""
    return 12 + 0.02 * east + 3 * np.sin(north / 60)


def ways() -> list[dict]:
    """A main road over a cycle underpass, a street crossing it with a sidewalk beside it, and a path off at an angle."""
    laid = [
        road([(100, 600), (1100, 600)], "primary"),
        road([(600, 400), (600, 800)], "cycleway", motor=False, tunnel="yes"),
        road([(300, 200), (300, 1000)], "residential"),
        road([(304, 200), (304, 590)], "footway", motor=False, footway="sidewalk"),
        road([(300, 800), (500, 950)], "path", motor=False),
    ]
    # Ids of their own: `road` hashes its kind's name, which a new process hashes differently.
    for index, way in enumerate(laid):
        way["id"] = index + 1
    return laid


def laid_tile(height=hilly) -> tuple[paving.Paved, np.ndarray, paving.GroundCut, paving_file.Grid]:
    paved = paving.lay(ways(), land(height=height))
    nodes = as_written(paved.conformed[:: paving.NODE_STRIDE, :: paving.NODE_STRIDE])
    grid = paving_file.Grid.of(nodes, 0.0, TILE_M, 4.0)
    return paved, nodes, paved.ground_cut(nodes), grid


def write_tile(folder: Path, paved: paving.Paved, nodes: np.ndarray, cut: paving.GroundCut, grid: paving_file.Grid) -> dict:
    """The tile's files, as `build.py` writes them, and its manifest."""
    ribbons = paving.rings_of(paved, nodes, grid.step)
    (folder / "heights.bin.gz").write_bytes(encode_heights(nodes))
    (folder / "road-surface.bin.gz").write_bytes(encode_paving(ribbons, paved, grid))
    (folder / "ground-cut.bin.gz").write_bytes(encode_ground_cut(cut, grid))
    manifest = {
        "tile": "PAVED",
        "bounds": {"west": 0.0, "south": 0.0, "east": TILE_M, "north": TILE_M},
        "heights": {"file": "heights.bin.gz", "nodes": int(nodes.shape[0]), "stepM": grid.step, "unitM": 0.01},
        "roadSurface": {
            "file": "road-surface.bin.gz",
            "chains": [{"sections": len(ring), "kind": chain.kind_name, "motor": chain.motor} for chain, ring, _, _ in ribbons],
            "paved": True,
            "aprons": {"points": len(paved.points), "triangles": len(paved.triangles), "junctionPoints": paved.junction_points, "areaPoints": paved.area_points},
            "groundCut": {"file": "ground-cut.bin.gz", "cells": len(cut.cells), "points": len(cut.points), "triangles": len(cut.triangles), "walls": cut.walls},
        },
        "solids": {"file": "", "unitM": 0.02, "cells": [], "walls": 0},
    }
    (folder / "tile.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    return manifest


def turned(triangles: np.ndarray) -> np.ndarray:
    """Each triangle from its least corner, keeping its winding, sorted: one triangle list however it was ordered."""
    first = np.argmin(triangles, axis=1)
    out = np.stack([triangles[np.arange(len(triangles)), (first + corner) % 3] for corner in range(3)], axis=1)
    return out[np.lexsort(out.T[::-1])]


class ReadBack(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.paved, cls.nodes, cls.cut, cls.grid = laid_tile()
        cls.folder = tempfile.TemporaryDirectory()
        folder = Path(cls.folder.name)
        cls.manifest = write_tile(folder, cls.paved, cls.nodes, cls.cut, cls.grid)
        cls.read = paving_file.read_paving(folder, cls.manifest)
        cls.read_cut = paving_file.read_ground_cut(folder, cls.manifest)
        ribbons = paving.rings_of(cls.paved, cls.nodes, cls.grid.step)
        # As the files list them.
        cls.points, cls.triangles = paving_file.in_written_order(paving_way_points(ribbons, cls.paved), cls.paved.triangles, cls.grid, (cls.paved.junction_points, cls.paved.area_points))
        cut = cls.cut
        cut_points, cut_triangles = paving_file.in_written_order(cut.points, cut.triangles, cls.grid)
        cls.cut = paving.GroundCut(cut.cells, cut_points, cut_triangles, cut.walls)

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def test_the_paving_reads_back_as_laid(self):
        read, laid = self.read.points, self.points
        self.assertGreater(len(laid), 1000)
        np.testing.assert_allclose(read[:, :2], laid[:, :2], atol=PLACE_M)
        np.testing.assert_allclose(read[:, paving.HEIGHT], laid[:, paving.HEIGHT], atol=HEIGHT_M)
        np.testing.assert_allclose(read[:, paving.ACROSS], laid[:, paving.ACROSS], atol=ACROSS)
        np.testing.assert_allclose(read[:, paving.ALONG], laid[:, paving.ALONG], atol=ALONG_M)
        for column in (paving.TIER, paving.WAY, paving.CLASS):
            np.testing.assert_array_equal(read[:, column], laid[:, column])
        np.testing.assert_allclose(read[:, [paving.RUN_COS, paving.RUN_SIN]], laid[:, [paving.RUN_COS, paving.RUN_SIN]], atol=1e-9)
        np.testing.assert_array_equal(turned(self.read.triangles), turned(self.triangles))

    def test_the_cut_ground_reads_back_as_laid_with_its_walls_last(self):
        read, cut = self.read_cut, self.cut
        self.assertGreater(cut.walls, 0)
        np.testing.assert_array_equal(read.cells, cut.cells)
        np.testing.assert_allclose(read.points[:, :2], cut.points[:, :2], atol=PLACE_M)
        np.testing.assert_allclose(read.points[:, 2], cut.points[:, 2], atol=HEIGHT_M)
        ground = len(cut.triangles) - cut.walls
        self.assertEqual(read.walls, cut.walls)
        np.testing.assert_array_equal(turned(read.triangles[:ground]), turned(cut.triangles[:ground]))
        np.testing.assert_array_equal(turned(read.triangles[ground:]), turned(cut.triangles[ground:]))

    def test_a_place_the_paving_and_the_cut_ground_share_reads_back_as_one_height(self):
        paving_at = {}
        for x, y, z in np.round(self.paved.points[:, :3], 3):
            paving_at.setdefault((x, y), set()).add(z)
        laid = np.round(self.cut.points, 3)
        shared = np.array([(x, y) in paving_at and z in paving_at[(x, y)] for x, y, z in laid])
        self.assertGreater(int(shared.sum()), 100)
        read_paving = {}
        for (x, y, _), z in zip(np.round(self.points[:, :3], 3), self.read.points[:, 2]):
            read_paving.setdefault((x, y), set()).add(z)
        for (x, y, _), z in zip(laid[shared], self.read_cut.points[shared, 2]):
            self.assertIn(z, read_paving[(x, y)])

    def test_a_point_on_a_node_is_the_node_s_height_exactly(self):
        read = self.read_cut.points
        column, row = read[:, 0] / self.grid.step, (TILE_M - read[:, 1]) / self.grid.step
        on_node = (np.abs(column - np.round(column)) < 1e-6) & (np.abs(row - np.round(row)) < 1e-6)
        at_grid = np.abs(self.cut.points[:, 2] - self.nodes[np.round(row).astype(int), np.round(column).astype(int)]) < 1e-6
        self.assertGreater(int((on_node & at_grid).sum()), 100)
        np.testing.assert_array_equal(read[on_node & at_grid, 2], self.grid.heights[np.round(row[on_node & at_grid]).astype(int), np.round(column[on_node & at_grid]).astype(int)])

    def test_every_cut_cell_has_paving_in_it(self):
        """A cell the paving doesn't touch is the grid's own two triangles, which the game draws and collides with by itself."""
        cells = self.cut.cells
        size = int(TILE_M / self.grid.step)
        boxes = shapely.box(cells % size * 4.0, TILE_M - (cells // size + 1) * 4.0, (cells % size + 1) * 4.0, TILE_M - cells // size * 4.0)
        paved = shapely.union_all(shapely.polygons(np.concatenate((self.paved.points[self.paved.triangles][:, :, :2], self.paved.points[self.paved.triangles][:, :1, :2]), axis=1)))
        self.assertTrue(shapely.intersects(boxes, paved).all())


class Fixture(unittest.TestCase):
    def test_the_fixture_reads_back_as_it_was_laid(self):
        """What the game's decoders are held to: if the format changes, write the fixture again."""
        manifest = json.loads((FIXTURE / "tile.json").read_text(encoding="utf-8"))
        laid = read_laid(FIXTURE)
        read = paving_file.read_paving(FIXTURE, manifest)
        cut = paving_file.read_ground_cut(FIXTURE, manifest)
        np.testing.assert_allclose(read.points[:, :3], laid["paving"][:, :3], atol=HEIGHT_M)
        np.testing.assert_array_equal(turned(read.triangles), turned(laid["triangles"]))
        np.testing.assert_allclose(cut.points, laid["cutPoints"], atol=HEIGHT_M)
        np.testing.assert_array_equal(cut.cells, laid["cells"])


def read_laid(folder: Path) -> dict[str, np.ndarray]:
    """`laid.bin.gz`: what the fixture was laid from, float64, in the order `laid.json` lists."""
    layout = json.loads((folder / "laid.json").read_text(encoding="utf-8"))
    data = gzip.decompress((folder / "laid.bin.gz").read_bytes())
    found, at = {}, 0
    for name, (kind, shape) in layout.items():
        array = np.frombuffer(data, kind, count=int(np.prod(shape)), offset=at).reshape(shape)
        found[name] = array
        at += array.nbytes
    return found


def write_fixture() -> None:
    FIXTURE.mkdir(parents=True, exist_ok=True)
    paved, nodes, cut, grid = laid_tile(height=gentle)
    write_tile(FIXTURE, paved, nodes, cut, grid)
    ribbons = paving.rings_of(paved, nodes, grid.step)
    points, triangles = paving_file.in_written_order(paving_way_points(ribbons, paved), paved.triangles, grid, (paved.junction_points, paved.area_points))
    cut_points, cut_triangles = paving_file.in_written_order(cut.points, cut.triangles, grid)
    # In the order the files list them.
    laid = {
        "paving": points.astype("<f8"),
        "triangles": triangles.astype("<u4"),
        "cells": cut.cells.astype("<u4"),
        "cutPoints": cut_points.astype("<f8"),
        "cutTriangles": cut_triangles.astype("<u4"),
    }
    (FIXTURE / "laid.json").write_text(json.dumps({name: [array.dtype.str, list(array.shape)] for name, array in laid.items()}, indent=1), encoding="utf-8")
    (FIXTURE / "laid.bin.gz").write_bytes(gzip.compress(b"".join(array.tobytes() for array in laid.values()), 9, mtime=0))
    print(f"wrote {FIXTURE}: {len(paved.points)} paving points, {len(cut.cells)} cut cells, {cut.walls} wall triangles")


if __name__ == "__main__":
    if "--fixture" in sys.argv:
        write_fixture()
    else:
        unittest.main()
