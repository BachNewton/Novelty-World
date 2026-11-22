"""The roads as one paved surface, on small made-up lands.

    pipeline/.venv/Scripts/python -m unittest discover -s src/projects/aland-drive/pipeline

These pin what the paving's design rests on (`docs/ROAD-SURFACES.md`): one height per point on each level, paving and
ground that share their edge, two tiles that cut a road crossing their edge alike, and pieces that keep their own way.
"""

import unittest

import numpy as np
import shapely

import path_surfaces
import paving
from grid import TILE_SIZE_M, Tile
from roads import Ground
from vectors import clip_line, seam_direction

TILE_M = 1200.0


def land(height=None, west=0.0, town=1.0):
    """A square of 2 m corners, 1.2 km across, its north edge at 1200: a town's, whose streets have their kerbs and paving,
    unless `town` says how far it is one."""
    rim = 100
    count = int(TILE_M / 2) + 2 * rim + 1
    rows, columns = np.mgrid[0:count, 0:count]
    east, north = west + (columns - rim) * 2.0, TILE_M - (rows - rim) * 2.0
    corners = height(east, north) if height else np.full((count, count), 10.0)
    return Ground(corners.astype(np.float32), 0.0, TILE_M, rim, built_up=lambda xy: np.full(len(xy), town))


def road(line, kind="residential", motor=True, **tags):
    return {"id": hash((kind, tuple(map(tuple, line)))) % 100000, "kind": kind, "motor": motor, "line": [list(map(float, point)) for point in line], **tags}


def hilly(east, north):
    return 12 + 0.02 * east + 3 * np.sin(north / 60) + 0.3 * np.sin(east / 7 + north / 11)


class OneSurface(unittest.TestCase):
    def test_a_sidewalk_beside_its_street_is_one_surface_and_keeps_its_own_look(self):
        street = road([(100, 600), (1100, 600)])
        sidewalk = road([(100, 603.5), (1100, 603.5)], "footway", motor=False)
        paved = paving.lay([street, sidewalk], land(height=hilly))
        polygons = shapely.polygons(np.concatenate((paved.points[paved.triangles][:, :, :2], paved.points[paved.triangles][:, :1, :2]), axis=1))
        # No two triangles lie over each other: the surface has one height wherever it is.
        self.assertAlmostEqual(float(shapely.area(polygons).sum()), shapely.union_all(polygons).area, delta=0.01)
        chains = {chain.kind_name: chain.index for chain in paved.chains}
        way = paved.points[:, 6].astype(int)
        north = paved.points[:, 1]
        self.assertTrue((way[north > 604.6] == chains["footway"]).all())
        self.assertTrue((way[north < 602] == chains["residential"]).all())
        # Where the two meet, one place is one height, whoever's piece it is.
        places = {}
        for x, y, z in np.round(paved.points[:, :3], 3):
            places.setdefault((x, y), set()).add(z)
        self.assertTrue(all(len(heights) == 1 for heights in places.values()))

    def test_each_point_wears_its_own_way_s_surface_and_runs_its_way(self):
        street = road([(100, 600), (1100, 600)])
        # One chain of two OSM ways: a sidewalk that's slabs, then a plain footway on to the north-east.
        sidewalk = road([(100, 603.5), (600, 603.5)], "footway", motor=False, footway="sidewalk")
        footway = road([(600, 603.5), (900, 903.5)], "footway", motor=False)
        paved = paving.lay([street, sidewalk, footway], land())
        way = paved.points[:, 6].astype(int)
        surface = paved.points[:, 7].astype(int) & paving.CLASS_BITS
        east, north = paved.points[:, 0], paved.points[:, 1]
        chains = {chain.kind_name: chain.index for chain in paved.chains}
        self.assertTrue((surface[way == chains["residential"]] == path_surfaces.NONE).all())
        on_sidewalk = (way == chains["footway"]) & (east < 590) & (north > 602)
        on_footway = (way == chains["footway"]) & (north > 620)
        self.assertTrue(on_sidewalk.any() and on_footway.any())
        self.assertTrue((surface[on_sidewalk] == path_surfaces.SLAB).all())
        self.assertTrue((surface[on_footway] == path_surfaces.TARMAC).all())
        # East is an angle of 0; north-east doubles to a quarter turn.
        np.testing.assert_allclose(paved.points[on_sidewalk, 8:10], [[1, 0]] * on_sidewalk.sum(), atol=1e-6)
        np.testing.assert_allclose(paved.points[on_footway, 8:10], [[0, 1]] * on_footway.sum(), atol=1e-6)

    def test_no_way_is_drawn_as_grass(self):
        """A path OSM tags grass is a worn track: drawn as a lawn, it read as more grass where the owner wants a path."""
        for surface in ("grass", "grass_paver"):
            self.assertEqual(path_surfaces.way_class({"kind": "footway", "surface": surface}, False), path_surfaces.GRAVEL)
            self.assertEqual(path_surfaces.way_class({"kind": "track", "surface": surface}, True), path_surfaces.NONE)
        street = road([(100, 600), (1100, 600)], **{"sidewalk": "left", "sidewalk:left:surface": "grass"})
        paved = paving.lay([street], land())
        self.assertNotIn(path_surfaces.LAWN, set(paved.points[:, 7].astype(int) & paving.CLASS_BITS))
        self.assertIn(path_surfaces.GRAVEL, set(paved.points[:, 7].astype(int) & paving.CLASS_BITS))

    def test_a_path_has_no_shoulder_to_draw_at_its_edge(self):
        """A path's outline is kept within a couple of centimetres of its edge, and a point a hair past it was drawn as a
        shoulder's far side: every triangle from its middle to that point faded to the photo's colour, a pale lens."""
        bend = [(300 + 200 * np.sin(step / 20), 300 + step * 6.0) for step in range(80)]
        paved = paving.lay([road(bend, "footway", motor=False)], land(height=hilly))
        path = paved.points[paved.points[:, 6].astype(int) == paved.chains[0].index]
        self.assertGreater(len(path), 100)
        self.assertLessEqual(float(np.abs(path[:, 3]).max()), 1.0)

    def test_a_point_is_as_far_along_its_way_as_it_lies(self):
        """Each point took its nearest station's distance along, in 2 m steps, so the treads of a flight of steps, laid
        across that distance, ran askew between its middle and its edges: stripes and chevrons."""
        start, end = np.array([300.0, 300.0]), np.array([420.0, 460.0])
        paved = paving.lay([road([start, end], "steps", motor=False)], land())
        run = (end - start) / np.linalg.norm(end - start)
        along = (paved.points[:, :2] - start) @ run
        inside = (along > 1) & (along < np.linalg.norm(end - start) - 1)
        self.assertGreater(int(inside.sum()), 10)
        np.testing.assert_allclose(paved.points[inside, 5], along[inside], atol=0.02)

    def test_the_ground_meets_the_paving_on_the_paving_s_own_points(self):
        ways = [road([(100, 600), (1100, 640)], "tertiary"), road([(600, 619), (600, 1000)]), road([(300, 200), (900, 1000)], "path", motor=False)]
        paved = paving.lay(ways, land(height=hilly))
        cover = paving.Cover(paved.points[paved.triangles][:, :, :3])
        ground_cut = paved.ground_cut(paved.conformed[:: paving.NODE_STRIDE, :: paving.NODE_STRIDE])
        cut = ground_cut.points
        on_node = (np.abs(cut[:, 0] / 4 - np.round(cut[:, 0] / 4)) < 1e-6) & (np.abs(cut[:, 1] / 4 - np.round(cut[:, 1] / 4)) < 1e-6)
        edge = cut[~on_node & (cut[:, 2] > -100)]
        self.assertGreater(len(edge), 100)
        self.assertLess(np.nanmax(np.abs(cover.at(edge[:, :2]) - edge[:, 2])), 0.002)
        # Every cut cell is covered once, by its cut ground and the paving in it.
        cells = ground_cut.cells
        size = int(TILE_M / 4)
        boxes = shapely.box(cells % size * 4.0, TILE_M - (cells // size + 1) * 4.0, (cells % size + 1) * 4.0, TILE_M - cells // size * 4.0)
        cut_area = shapely.area(shapely.polygons(np.concatenate((cut[ground_cut.triangles][:, :, :2], cut[ground_cut.triangles][:, :1, :2]), axis=1))).sum()
        paving_in = shapely.intersection(shapely.union_all(shapely.polygons(np.concatenate((paved.points[paved.triangles][:, :, :2], paved.points[paved.triangles][:, :1, :2]), axis=1))), shapely.union_all(boxes)).area
        self.assertAlmostEqual(cut_area + paving_in, len(cells) * 16.0, delta=len(cells) * 16.0 * 1e-4)

    def test_the_cut_ground_meets_the_grid_on_the_heights_it_is_given(self):
        """The ground is reshaped after the roads are laid (the seabed is lowered under the water), so the cut ground must
        take its nodes from the heights as written, not from the ground as the paving left it, or it stands over the grid."""
        # Its ends off the grid's lines, so no edge of the paving runs through a node.
        paved = paving.lay([road([(102, 601), (1098, 601)], "tertiary")], land())
        nodes = paved.conformed[:: paving.NODE_STRIDE, :: paving.NODE_STRIDE].astype(np.float64)
        # Lower the ground south of the road's margin, as a seabed would.
        nodes[int((TILE_M - 590) / 4) :, :] -= 2.0
        ground_cut = paved.ground_cut(nodes)
        corners = ground_cut.points[ground_cut.triangles]
        # The ground's own triangles, not the upright faces closing it against the paving, whose corners take the paving's heights.
        one, two = corners[:, 1, :2] - corners[:, 0, :2], corners[:, 2, :2] - corners[:, 0, :2]
        flat = np.abs(one[:, 0] * two[:, 1] - one[:, 1] * two[:, 0]) > 1e-6
        cut = corners[flat].reshape(-1, 3)
        column, row = cut[:, 0] / 4, (TILE_M - cut[:, 1]) / 4
        on_node = (np.abs(column - np.round(column)) < 1e-6) & (np.abs(row - np.round(row)) < 1e-6)
        self.assertGreater(on_node.sum(), 100)
        np.testing.assert_allclose(cut[on_node, 2], nodes[np.round(row[on_node]).astype(int), np.round(column[on_node]).astype(int)], atol=1e-3)

    def test_ways_at_different_heights_side_by_side_are_never_joined_by_a_cliff(self):
        """A street along a bank with a road below it: their outlines touch, but joined, the lower one is dragged up the bank or
        the paving between them is a cliff, which the game drops (`render/roads.ts`), leaving a hole. They stay apart, each on
        its own profile, with the bank between them."""

        def bank(east, north):
            return np.where(north > 602, 14.0, 10.0)

        ways = [road([(100, 606), (1100, 606)], "tertiary"), road([(100, 597.5), (1100, 597.5)])]
        paved = paving.lay(ways, land(height=bank))
        a, b, c = (paved.points[paved.triangles[:, corner], :3] for corner in range(3))
        normal = np.cross(b - a, c - a)
        heights = np.stack((a[:, 2], b[:, 2], c[:, 2]), axis=1)
        cliff = (np.ptp(heights, axis=1) > 1.2) & (np.abs(normal[:, 2]) / np.linalg.norm(normal, axis=1) < np.sqrt(0.5))
        self.assertEqual(int(cliff.sum()), 0)
        for chain in paved.chains:
            own = paved.points[paved.points[:, 6].astype(int) == chain.index]
            self.assertLess(np.abs(own[:, 2] - chain.plane(own[:, :2])).max(), 0.1, chain.kind_name)

    def test_a_narrow_strip_beside_a_street_is_paved_where_the_two_agree_though_they_part_further_on(self):
        """Judged whole, the strip between a street and its path was left as ground, a pale band all along it, because the
        path climbs a bank at its far end."""

        def bank_at_the_end(east, north):
            return 10 + np.where(north > 604, 1.5 * np.clip((east - 900) / 40, 0, 1), 0)

        street = road([(100, 600), (1100, 600)])
        path = road([(100, 606.75), (1100, 606.75)], "footway", motor=False)
        paved = paving.lay([street, path], land(height=bank_at_the_end))
        cover = paving.Cover(paved.points[paved.triangles][:, :, :3])
        strip = 600 + paved.crosses[paved.chains[0].index].reach_left.max() + 1.0
        self.assertTrue(np.isfinite(cover.at(np.array([[east, strip] for east in (300.0, 500.0, 700.0)]))).all())
        self.assertTrue(np.isnan(cover.at(np.array([[1050.0, strip]]))).all())

    def test_between_a_street_and_its_sidewalk_past_the_kerb_is_the_sidewalk(self):
        """Drawn as shoulders, the street's own past its kerb and the strip paved on to the sidewalk faded to the photo's
        colour: a pale band all along the street."""
        street = road([(100, 600), (1100, 600)])
        sidewalk = road([(100, 606.75), (1100, 606.75)], "footway", motor=False, footway="sidewalk")
        paved = paving.lay([street, sidewalk], land())
        chains = {chain.kind_name: chain for chain in paved.chains}
        footway = chains["footway"]
        kerb = 600 + chains["residential"].half.max() + paving.KERB_STRIP_M
        corners = paved.points[paved.triangles]
        north = corners[:, :, 1].mean(axis=1)
        strip = corners[(north > kerb + 0.05) & (north < 606.75 - footway.half.max() - 0.05) & (np.abs(corners[:, :, 0].mean(axis=1) - 600) < 300)]
        self.assertGreater(len(strip), 10)
        self.assertTrue((strip[:, :, 6].astype(int) == footway.index).all())
        self.assertTrue(((strip[:, :, 7].astype(int) & paving.CLASS_BITS) == path_surfaces.SLAB).all())
        self.assertTrue((np.abs(strip[:, :, 3]) < 1).all())

    def test_a_strip_across_a_street_from_a_side_street_s_mouth_is_still_its_own_street_s_sidewalk(self):
        """A side street's last station stands on the line of the street it joins, so the strip between that street and its
        sidewalk, across from the mouth, lay beside the side street as nearly as its own, and wore a path running the
        side street's way: a footpath meeting the sidewalk there painted the strip dark all along the block."""
        street = road([(500, 600), (601, 600), (702, 600)])
        side = road([(601, 500), (601, 600)])
        sidewalk = road([(500, 606.75), (601, 606.75), (702, 606.75)], "footway", motor=False, footway="sidewalk")
        footpath = road([(606, 700), (601, 606.75)], "footway", motor=False)
        paved = paving.lay([street, side, sidewalk, footpath], land())
        through = next(chain for chain in paved.chains if chain.kind_name == "residential" and np.ptp(chain.xy[:, 0]) > 100)
        walk = next(chain for chain in paved.chains if chain.tag("footway") == "sidewalk")
        kerb = 600 + through.half.max() + paving.KERB_STRIP_M
        corners = paved.points[paved.triangles]
        middle = corners[:, :, :2].mean(axis=1)
        strip = corners[(middle[:, 1] > kerb + 0.05) & (middle[:, 1] < 606.75 - walk.half.max() - 0.05) & (np.abs(middle[:, 0] - 601) < 80)]
        self.assertGreater(len(strip), 10)
        self.assertTrue(((strip[:, :, 7].astype(int) & paving.CLASS_BITS) == path_surfaces.SLAB).all())

    def test_where_a_way_s_surface_changes_the_paving_is_cut_and_no_triangle_wears_two(self):
        """Read point by point, slabs and tarmac met in a smear across whichever triangles spanned the change, on the
        sidewalk and on the street's band beside it."""
        street = road([(100, 600), (1100, 600)])
        sidewalk = [
            road([(100, 606.75), (600, 606.75)], "footway", motor=False, footway="sidewalk", surface="paving_stones"),
            road([(600, 606.75), (1100, 606.75)], "footway", motor=False, footway="sidewalk", surface="asphalt"),
        ]
        paved = paving.lay([street, *sidewalk], land())
        kerb = 600 + next(chain for chain in paved.chains if chain.motor).half.max() + paving.KERB_STRIP_M
        corners = paved.points[paved.triangles]
        middle = corners[:, :, :2].mean(axis=1)
        walked = corners[(middle[:, 1] > kerb + 0.05) & (np.abs(middle[:, 0] - 600) < 60)]
        surfaces = walked[:, :, 7].astype(int) & paving.CLASS_BITS
        self.assertTrue((surfaces.min(axis=1) == surfaces.max(axis=1)).all())
        east = walked[:, :, 0].mean(axis=1)
        self.assertTrue((surfaces[east < 598.9, 0] == path_surfaces.SLAB).all())
        self.assertTrue((surfaces[east > 601.1, 0] == path_surfaces.TARMAC).all())
        # On both the sidewalk itself and the street's band beside it.
        for rows in (walked[:, :, 1].mean(axis=1) > 606, walked[:, :, 1].mean(axis=1) < 605):
            self.assertEqual(set(surfaces[rows, 0].astype(int)), {path_surfaces.SLAB, path_surfaces.TARMAC})

    def test_a_road_that_turns_from_asphalt_to_gravel_says_so_on_each_side_of_a_cut_across_it(self):
        """Drawn as whichever most of its length was, a road of both was asphalt or gravel all the way."""
        sealed = road([(100, 600), (600, 600)], "unclassified", surface="asphalt")
        loose = road([(600, 600), (1100, 600)], "unclassified", surface="gravel")
        paved = paving.lay([sealed, loose], land(town=0.0))
        corners = paved.points[paved.triangles]
        said = corners[:, :, 7].astype(int) & ~paving.ON_CARRIAGEWAY
        self.assertTrue((said.min(axis=1) == said.max(axis=1)).all())
        east = corners[:, :, 0].mean(axis=1)
        self.assertEqual(set(said[east < 598.9, 0]), {paving.SEALED_WAY})
        self.assertEqual(set(said[east > 601.1, 0]), {paving.LOOSE_WAY})

    def test_a_sidewalk_carries_on_across_a_driveway(self):
        """A driveway's asphalt cut every sidewalk it crossed; real ones carry their slabs across the drive's mouth."""
        street = road([(100, 600), (1100, 600)])
        sidewalk = road([(100, 604.5), (1100, 604.5)], "footway", motor=False, footway="sidewalk")
        drive = road([(600, 600), (600, 640)], "service")
        paved = paving.lay([street, sidewalk, drive], land())
        chains = {chain.kind_name: chain for chain in paved.chains}
        corners = paved.points[paved.triangles]
        middle = corners[:, :, :2].mean(axis=1)
        crossing = (np.abs(middle[:, 0] - 600) < chains["service"].half.min() - 0.1) & (np.abs(middle[:, 1] - 604.5) < chains["footway"].half.min() - 0.1)
        self.assertGreater(int(crossing.sum()), 0)
        self.assertTrue((corners[crossing][:, :, 6].astype(int) == chains["footway"].index).all())
        self.assertTrue(((corners[crossing][:, :, 7].astype(int) & paving.CLASS_BITS) == path_surfaces.SLAB).all())

    def test_a_crossing_s_surface_is_only_for_the_road_it_crosses(self):
        """A crossing tagged asphalt, mapped on a sidewalk's line across a side road's mouth, painted metres of the sidewalk
        either side of the mouth dark, and the street's walk band beside it too."""
        street = road([(100, 600), (600, 600), (1100, 600)])
        side = road([(600, 600), (600, 605), (600, 700)])
        sidewalk = [
            road([(100, 605), (590, 605)], "footway", motor=False, footway="sidewalk", surface="paving_stones"),
            road([(590, 605), (600, 605), (610, 605)], "footway", motor=False, footway="crossing", surface="asphalt"),
            road([(610, 605), (1100, 605)], "footway", motor=False, footway="sidewalk", surface="paving_stones"),
        ]
        paved = paving.lay([street, side, *sidewalk], land())
        mouth = next(chain for chain in paved.chains if chain.kind_name == "residential" and chain.xy[:, 1].max() > 650).half.max()
        points = paved.points
        off_the_mouth = (np.abs(points[:, 0] - 600) > mouth + 0.1) & (np.abs(points[:, 0] - 600) < 9) & (points[:, 1] > 602.6) & (points[:, 1] < 606)
        self.assertGreater(int(off_the_mouth.sum()), 0)
        self.assertFalse((off_the_mouth & ((points[:, 7].astype(int) & paving.CLASS_BITS) == path_surfaces.TARMAC)).any())

    def test_a_crossing_does_not_outrank_the_street_s_kerb_and_walk_band_or_the_sidewalk(self):
        """A crossing over a street owned its own carriageway through the street's kerb strip, its walk band and the gap to
        the sidewalk, all wearing its asphalt: a square dark block across the paving beside the street."""
        street = road([(100, 600), (600, 600), (1100, 600)])
        sidewalk = road([(100, 606.75), (600, 606.75), (1100, 606.75)], "footway", motor=False, footway="sidewalk")
        crossing = road([(600, 593.25), (600, 600), (600, 606.75)], "footway", motor=False, footway="crossing", surface="asphalt")
        paved = paving.lay([street, sidewalk, crossing], land())
        crossings = [chain.index for chain in paved.chains if chain.tag("footway") == "crossing"]
        chain = next(chain for chain in paved.chains if chain.kind_name == "residential")
        half, reach = chain.half.max(), paved.crosses[chain.index].reach_left.max()
        corners = paved.points[paved.triangles]
        middle = corners[:, :, :2].mean(axis=1)
        beside = (np.abs(middle[:, 0] - 600) < 0.8) & (middle[:, 1] > 600 + half + 0.05) & (middle[:, 1] < 607.75)
        self.assertGreater(int(beside.sum()), 0)
        self.assertFalse(((corners[beside][:, :, 7].astype(int) & paving.CLASS_BITS) == path_surfaces.TARMAC).any())
        # The street's paving and the sidewalk's own are theirs; only the gap between them is left to the crossing.
        theirs = beside & ((middle[:, 1] < 600 + reach - 0.05) | (middle[:, 1] > 606.75 - 0.95))
        self.assertGreater(int(theirs.sum()), 0)
        self.assertFalse(np.isin(corners[theirs][:, :, 6].astype(int), crossings).all(axis=1).any())

    def test_a_named_service_way_is_a_street_not_a_driveway(self):
        """Stava Mostersvägen is a service way by OSM's class, and the sidewalk carried on across its mouth as across a
        driveway's: the street ended square on the sidewalk."""
        street = road([(100, 600), (600, 600), (1100, 600)])
        sidewalk = road([(100, 604.5), (600, 604.5), (1100, 604.5)], "footway", motor=False, footway="sidewalk")
        lane = road([(600, 600), (600, 604.5), (600, 700)], "service", name="Stava Mostersvägen")
        paved = paving.lay([street, sidewalk, lane], land())
        service = next(chain for chain in paved.chains if chain.kind_name == "service")
        corners = paved.points[paved.triangles]
        middle = corners[:, :, :2].mean(axis=1)
        mouth = (np.abs(middle[:, 0] - 600) < service.half.min() - 0.1) & (np.abs(middle[:, 1] - 604.5) < 0.9)
        self.assertGreater(int(mouth.sum()), 0)
        self.assertTrue((corners[mouth][:, :, 6].astype(int) == service.index).all())

    def test_the_street_s_walk_band_carries_on_across_a_driveway(self):
        """Only a sidewalk's own carriageway carried on across a drive's mouth: the street's band beside it, which wears the
        sidewalk's surface, was cut by the drive's asphalt in a square mouth up to the kerb."""
        street = road([(100, 600), (600, 600), (1100, 600)])
        sidewalk = road([(100, 606.75), (600, 606.75), (1100, 606.75)], "footway", motor=False, footway="sidewalk")
        drive = road([(600, 600), (600, 606.75), (600, 640)], "service", service="driveway")
        paved = paving.lay([street, sidewalk, drive], land())
        chains = {chain.kind_name: chain for chain in paved.chains}
        cross = paved.crosses[chains["residential"].index]
        at = int(np.abs(chains["residential"].xy[:, 0] - 600).argmin())
        band = 600 + cross.kerb[0][at], 600 + cross.reach_left[at]
        self.assertGreater(band[1] - band[0], 0.5)
        corners = paved.points[paved.triangles]
        middle = corners[:, :, :2].mean(axis=1)
        mouth = (np.abs(middle[:, 0] - 600) < chains["service"].half.min() - 0.1) & (middle[:, 1] > band[0] + 0.05) & (middle[:, 1] < band[1] - 0.05)
        self.assertGreater(int(mouth.sum()), 0)
        footways = [chain.index for chain in paved.chains if chain.kind_name == "footway"]
        self.assertTrue(np.isin(corners[mouth][:, :, 6].astype(int), footways).all())
        self.assertTrue(((corners[mouth][:, :, 7].astype(int) & paving.CLASS_BITS) == path_surfaces.SLAB).all())

    def test_a_drive_s_mouth_across_a_sidewalk_has_no_corners_swept_through_the_slabs(self):
        """A corner of asphalt was swept from the drive to the street either side of the drive's own width, through the
        street's paving beside its sidewalk, and the slabs carried across the drive stood between them as an island."""
        street = road([(100, 600), (600, 600), (1100, 600)])
        sidewalk = road([(100, 606.75), (600, 606.75), (1100, 606.75)], "footway", motor=False, footway="sidewalk")
        drive = road([(600, 600), (600, 606.75), (600, 640)], "service", service="driveway")
        paved = paving.lay([street, sidewalk, drive], land())
        chains = {chain.kind_name: chain for chain in paved.chains}
        cross = paved.crosses[chains["residential"].index]
        at = int(np.abs(chains["residential"].xy[:, 0] - 600).argmin())
        band = 600 + cross.kerb[0][at], 600 + cross.reach_left[at]
        corners = paved.points[paved.triangles]
        middle = corners[:, :, :2].mean(axis=1)
        half = float(chains["service"].half.max())
        beside = (np.abs(middle[:, 0] - 600) > half + 0.2) & (np.abs(middle[:, 0] - 600) < half + 2.5) & (middle[:, 1] > band[0] + 0.1) & (middle[:, 1] < band[1] - 0.1)
        self.assertGreater(int(beside.sum()), 0)
        self.assertTrue(((corners[beside][:, :, 7].astype(int) & paving.CLASS_BITS) == path_surfaces.SLAB).all())

    def test_a_sidewalk_tagged_on_a_street_is_laid_beside_it_on_its_side(self):
        """OSM maps many of Mariehamn's sidewalks on the street's own way, and they were left out, the street a bare strip of
        asphalt between kerbs. OSM names a side as its way runs: this one runs west, so its left is the south."""
        street = road([(1100, 600), (100, 600)], **{"sidewalk": "left", "sidewalk:left:width": "3"})
        paved = paving.lay([street], land())
        chain = paved.chains[0]
        corners = paved.points[paved.triangles]
        cover = paving.Cover(corners[:, :, :3])
        kerb = chain.half.max() + paving.KERB_STRIP_M
        self.assertTrue(np.isfinite(cover.at(np.array([[600.0, 600 - kerb - 2.9]]))).all())
        self.assertTrue(np.isnan(cover.at(np.array([[600.0, 600 + kerb + 1.5]]))).all())
        middle = corners[:, :, :2].mean(axis=1)
        band = corners[(middle[:, 1] < 600 - kerb - 0.05) & (np.abs(middle[:, 0] - 600) < 300)]
        self.assertGreater(len(band), 10)
        self.assertTrue(((band[:, :, 7].astype(int) & paving.CLASS_BITS) == path_surfaces.SLAB).all())
        self.assertTrue((np.abs(band[:, :, 3]) < 1).all())

    def test_a_corner_between_a_drive_and_a_sidewalk_is_drawn_as_the_drive_s_shoulder(self):
        """Paving no way's outline holds wore the nearest path's surface, so the rounded corners where a drive meets a
        sidewalk wore its dark asphalt: sharp flaps standing out beyond the drive's pale shoulder."""
        street = road([(100, 600), (600, 600), (1100, 600)], "tertiary")
        sidewalk = road([(100, 605.5), (600, 605.5), (1100, 605.5)], "footway", motor=False, footway="sidewalk", surface="asphalt")
        drive = road([(600, 600), (600, 605.5), (600, 640)], "service")
        paved = paving.lay([street, sidewalk, drive], land())
        chains = {chain.kind_name: chain for chain in paved.chains}
        footways = [chain.index for chain in paved.chains if chain.kind_name == "footway"]
        edge = max(float(chain.xy[:, 1].max() + chain.half.max()) for chain in paved.chains if chain.kind_name == "footway")
        points = paved.points
        beyond = (points[:, 1] > edge + 0.05) & (np.abs(points[:, 0] - 600) < 10) & (np.abs(points[:, 0] - 600) > chains["service"].half.max() + 0.05)
        self.assertGreater(int(beyond.sum()), 0)
        worn = np.isin(points[:, 6].astype(int), footways) & (np.abs(points[:, 3]) < 1)
        self.assertFalse((beyond & worn).any())

    def test_a_corner_with_a_street_wears_no_path_s_surface(self):
        """A sidewalk's corner round a side street wore the asphalt of a crossing that runs alongside the side street over
        the main one: a dark flap beyond the side street's pale paving."""
        street = road([(100, 600), (595, 600), (600, 600), (1100, 600)], "tertiary")
        sidewalk = road([(100, 607.5), (595, 607.5), (600, 607.5), (1100, 607.5)], "footway", motor=False, footway="sidewalk", surface="asphalt")
        crossing = road([(595, 600), (595, 607.5)], "footway", motor=False, footway="crossing", surface="asphalt")
        side = road([(600, 600), (600, 607.5), (600, 700)])
        paved = paving.lay([street, sidewalk, crossing, side], land())
        footways = [chain.index for chain in paved.chains if chain.kind_name == "footway"]
        points = paved.points
        beyond = (points[:, 1] > 607.5 + 1.05) & (np.abs(points[:, 0] - 600) < 8)
        self.assertGreater(int(beyond.sum()), 0)
        worn = np.isin(points[:, 6].astype(int), footways) & (np.abs(points[:, 3]) < 1)
        self.assertFalse((beyond & worn).any())

    def test_a_path_lends_its_surface_only_across_paving(self):
        """A corner of two streets wore the asphalt of a cycleway beside one of them, a few metres off across the grass:
        a dark flap."""
        street = road([(100, 600), (600, 600), (1100, 600)], "tertiary")
        side = road([(600, 600), (600, 700)])
        cycleway = road([(591.75, 611), (591.75, 700)], "cycleway", motor=False, surface="asphalt")
        paved = paving.lay([street, side, cycleway], land())
        chains = {chain.kind_name: chain for chain in paved.chains}
        points = paved.points
        reach = paved.crosses[chains["tertiary"].index].reach_left.max()
        corner = (points[:, 1] > 600 + reach + 0.05) & (points[:, 1] < 610) & (points[:, 0] < 600 - paved.crosses[chains["residential"].index].reach_left.max() - 0.05)
        self.assertGreater(int(corner.sum()), 0)
        worn = (points[:, 6].astype(int) == chains["cycleway"].index) & (np.abs(points[:, 3]) < 1)
        self.assertFalse((corner & worn).any())

    def test_a_junction_s_corners_are_only_between_its_two_ways(self):
        """Rounding a side road's corners with the loop street it joins also rounded the inside of the loop's own corner
        nearby, on its far side: a flap of paving reaching into the block."""
        loop = road([(500, 500), (700, 500), (700, 700), (515, 700), (500, 700), (500, 500)])
        side = road([(515, 700), (515, 800)], "unclassified")
        paved = paving.lay([loop, side], land())
        ring = next(chain for chain in paved.chains if chain.kind_name == "residential")
        own = paving.footprints(ring, np.zeros(len(ring.xy), dtype=int), shapely.box(0, 0, TILE_M, TILE_M), paved.crosses[ring.index].paving)[paving.GROUND]
        corners = paved.points[paved.triangles]
        paving_drawn = shapely.union_all(shapely.polygons(np.concatenate((corners[:, :, :2], corners[:, :1, :2]), axis=1)))
        # Inside the block's corner by the junction, nothing past the loop's own paving.
        self.assertLess(paving_drawn.difference(own.buffer(0.01)).intersection(shapely.box(501, 670, 530, 699)).area, 0.05)

    def test_a_junction_s_corner_stops_at_a_third_way_between_its_two(self):
        """A drive's corners with the street it joins were rounded over the cycleway running between them, and what poked
        out past the cycleway's far edge was a pale sliver along it."""
        street = road([(100, 600), (600, 600), (1100, 600)], "secondary")
        # Crossing the drive with no node of its own, so only the drive's corners with the street are rounded.
        cycleway = road([(100, 606.4), (1100, 606.4)], "cycleway", motor=False)
        drive = road([(600, 600), (600, 640)], "service", service="driveway")
        paved = paving.lay([street, cycleway, drive], land())
        tile = shapely.box(0, 0, TILE_M, TILE_M)
        prints = {chain.index: paving.footprints(chain, paving.station_levels(chain), tile, paved.crosses[chain.index].paving)[paving.GROUND] for chain in paved.chains}
        corners = shapely.union_all([corner for corner, _ in paving._corners(paved.chains, prints)])
        far_edge = 606.4 + next(chain for chain in paved.chains if chain.kind_name == "cycleway").half.max()
        self.assertLess(corners.intersection(shapely.box(500, far_edge - 0.01, 700, 700)).area, 1e-3)

    def test_a_loop_closing_at_a_corner_keeps_each_end_s_own_direction(self):
        """A loop street closing on itself at a corner took the bisector of its two ends as both ends' direction, as a
        roundabout does, so across was measured on a skewed line there and the carriageway's colour bit into the kerb. A
        roundabout's ends still run on into each other."""
        loop = road([(500, 500), (700, 500), (700, 700), (500, 700), (500, 500)])
        ring = road([(900 + 15 * np.cos(turn), 900 + 15 * np.sin(turn)) for turn in np.linspace(0, 2 * np.pi, 25)], junction="roundabout")
        paved = paving.lay([loop, ring], land())
        street = next(chain for chain in paved.chains if not chain.edges[0].is_ring)
        self.assertGreater(float(street.tangent[0] @ street.tangent[1]), np.cos(np.radians(10)))
        self.assertGreater(float(street.tangent[-1] @ street.tangent[-2]), np.cos(np.radians(10)))
        roundabout = next(chain for chain in paved.chains if chain.edges[0].is_ring)
        np.testing.assert_allclose(roundabout.tangent[0], roundabout.tangent[-1])

    def test_a_road_joining_another_keeps_its_carriageway_through_the_greater_road_s_shoulder(self):
        """A main road's shoulder painted across the mouth of a side road shows as a pale band across that road."""
        main = road([(100, 600), (600, 600), (1100, 600)], "primary")
        side = road([(600, 600), (600, 900)], "residential")
        paved = paving.lay([main, side], land())
        chains = {chain.kind_name: chain for chain in paved.chains}
        primary, residential = chains["primary"], chains["residential"]
        corners = paved.points[paved.triangles]
        middle = corners[:, :, :2].mean(axis=1)
        mouth = (np.abs(middle[:, 0] - 600) < residential.half.min()) & (middle[:, 1] > 600 + primary.half.max()) & (middle[:, 1] < 600 + paved.crosses[primary.index].reach_left.max())
        self.assertGreater(int(mouth.sum()), 0)
        self.assertTrue((corners[mouth][:, :, 6].astype(int) == residential.index).all())

    def test_a_junction_s_corner_carries_on_the_shoulders_beside_it(self):
        """A corner no way owns was drawn as one flat shoulder at 1.5 across, with no fade and no paving's joints, between
        shoulders that run from 1 to 2 and fade to the land at their edge: a flat, lighter curved triangle at every corner."""
        paved = paving.lay([road([(100, 600), (1100, 600)], "tertiary"), road([(600, 600), (600, 900)])], land())
        points = paved.points
        first = len(points) - paved.junction_points - paved.area_points
        corner = points[first : first + paved.junction_points]
        owned = points[:first]
        self.assertGreater(len(corner), 10)
        # Where a corner meets a way's own piece, at one place, it is that piece's across.
        piece = {tuple(np.round(point[:2], 3)): abs(point[3]) for point in owned}
        shared = [(across, piece[place]) for place, across in ((tuple(np.round(point[:2], 3)), point[3]) for point in corner) if place in piece]
        self.assertGreater(len(shared), 4)
        np.testing.assert_allclose(*zip(*shared), atol=0.03)
        self.assertFalse(np.isclose(corner[:, 3], 1.5).any())

    def test_pieces_no_way_owns_change_nothing_of_a_way_s_own(self):
        ways = [road([(100, 600), (1100, 600)], "tertiary"), road([(600, 600), (600, 900)]), road([(100, 606.5), (1100, 606.5)], "footway", motor=False, footway="sidewalk")]
        paved = paving.lay(ways, land(height=hilly))
        original = paving.shoulder_across
        paving.shoulder_across = lambda xy, *rest: np.full(len(xy), 1.5)
        try:
            flat = paving.lay(ways, land(height=hilly))
        finally:
            paving.shoulder_across = original
        own = len(paved.points) - paved.junction_points - paved.area_points
        self.assertGreater(paved.junction_points, 0)
        self.assertTrue(np.array_equal(paved.points[:own], flat.points[:own]))
        self.assertTrue(np.array_equal(paved.triangles, flat.triangles))

    def test_a_sidewalk_mapped_close_to_a_wide_street_keeps_its_width_and_the_street_stops_at_it(self):
        """By its class a main road reaches 7.5 m of carriageway and its shoulders round OSM's line: over a sidewalk mapped
        4 m away, which was left a sliver, its width wandering with the gap between the two lines."""
        street = road([(100, 600), (1100, 600)], "primary")
        sidewalk = road([(100, 604), (1100, 604)], "footway", motor=False)
        paved = paving.lay([street, sidewalk], land())
        chains = {chain.kind_name: chain for chain in paved.chains}
        corners = paved.points[paved.triangles]
        owned = paving.Cover(corners[corners[:, 0, 6].astype(int) == chains["footway"].index][:, :, :3])
        across = np.column_stack((np.full(9, 600.0), np.linspace(603.1, 604.9, 9)))
        self.assertTrue(np.isfinite(owned.at(across)).all())
        middle = len(chains["primary"].xy) // 2
        self.assertAlmostEqual(float(paved.crosses[chains["primary"].index].reach_left[middle]), 3.0, delta=0.05)

    def test_laying_the_roads_never_moves_a_row_of_heights_a_neighbour_shares(self):
        ground = land(height=hilly)
        paved = paving.lay([road([(0, 600), (TILE_M, 600)], "primary"), road([(600, 0), (600, TILE_M)], "tertiary")], ground)
        raw = ground.tile_corners()
        for edge in ((0, ...), (-1, ...), (..., 0), (..., -1)):
            self.assertTrue(np.array_equal(paved.conformed[edge], raw[edge]))


def triangle_at(paved, east, north):
    """The corners of the triangle of paving over a place, each with its attributes."""
    corners = paved.points[paved.triangles]
    over = shapely.contains_xy(shapely.polygons(np.concatenate((corners[:, :, :2], corners[:, :1, :2]), axis=1)), east, north)
    return corners[np.flatnonzero(over)[0]]


def across_at(paved, east, north):
    """How far across its way a place lies, as the game reads it: blended over the triangle that holds it."""
    corners = triangle_at(paved, east, north)
    (ax, ay), (bx, by), (cx, cy) = corners[:, :2]
    area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
    first = ((bx - east) * (cy - north) - (cx - east) * (by - north)) / area
    second = ((cx - east) * (ay - north) - (ax - east) * (cy - north)) / area
    return float(first * abs(corners[0, 3]) + second * abs(corners[1, 3]) + (1 - first - second) * abs(corners[2, 3]))


# Where the game paints an edge line across a main road (`LINE_INSET`, `LINE_WIDTH` in `render/game.ts`), and its middle.
EDGE_LINE = (0.895, 0.965)
LINE_MIDDLE = 0.93


class Mouths(unittest.TestCase):
    def junction(self):
        main = road([(100, 600), (600, 600), (1100, 600)], "tertiary")
        side = road([(600, 600), (600, 900)], "tertiary")
        paved = paving.lay([main, side], land(town=0.0))
        through, joining = sorted(paved.chains, key=lambda chain: -np.ptp(chain.xy[:, 0]))
        return paved, through, joining

    def test_where_a_road_ends_on_another_the_corner_of_their_carriageways_is_filled_out_to_an_arc(self):
        """Two carriageways met at a corner as sharp as the angle between them, a square mouth of asphalt with the
        rounding all in the shoulder outside it."""
        paved, through, joining = self.junction()
        half = float(through.half.max())
        # A metre and a half out from the corner, a little off its diagonal, which the triangles are cut along: shoulder
        # before, the joining road's carriageway now.
        inside = triangle_at(paved, 600 + half + 1.7, 600 + half + 1.3)
        self.assertTrue((np.abs(inside[:, 3]) <= 1).all())
        self.assertTrue((inside[:, 6] == joining.index).all())
        # Past the arc is its strip, drawn as a shoulder, and past that the land.
        radius = 7.0 + float(joining.shoulder[0])
        centre = 600 + half + radius
        towards = np.array([np.cos(np.radians(40)), np.sin(np.radians(40))])
        strip = triangle_at(paved, *(centre - (radius - 0.2) * towards))
        self.assertTrue((np.abs(strip[:, 3]) >= 1).all())
        corners = paved.points[paved.triangles][:, :, :2]
        self.assertFalse(shapely.contains_xy(shapely.polygons(np.concatenate((corners, corners[:, :1]), axis=1)), *(centre - (radius - 1.5) * towards)).any())

    def test_an_edge_line_stops_where_more_carriageway_lies_beyond_the_edge(self):
        """Painted at every road's own edge, the line ran on across the mouth of each road that joined, and straight on
        down the joining road beside its arc."""
        paved, through, joining = self.junction()
        points = paved.points
        east, north, across, way = points[:, 0], points[:, 1], np.abs(points[:, 3]), points[:, 6].astype(int)
        half = float(through.half.max())
        near = np.abs(east - 600) < 200
        mouth_side = near & (way == through.index) & (np.abs(north - (600 + half)) < 0.03)
        self.assertTrue((across[mouth_side & (np.abs(east - 600) < 8)] <= paving.OPEN_EDGE_ACROSS + 1e-6).all())
        self.assertTrue((across[mouth_side & (np.abs(east - 600) > 14)] == 1).all())
        far_side = near & (way == through.index) & (np.abs(north - (600 - half)) < 0.03)
        self.assertTrue((across[far_side] == 1).all())
        beside = (way == joining.index) & (np.abs(east - (600 + half)) < 0.03) & (points[:, 3] < 0)
        self.assertTrue((across[beside & (north > 604) & (north < 608)] <= paving.OPEN_EDGE_ACROSS + 1e-6).all())
        self.assertTrue((across[beside & (north > 616)] == 1).all())


    def test_the_strip_round_a_mouth_s_arc_is_only_where_its_fill_is(self):
        """A sidewalk beside the street keeps the mouth's fill out of the far part of each corner, and the strip past
        that part edged nothing: a pale kidney of kerb beyond the sidewalk."""
        street = road([(100, 600), (600, 600), (1100, 600)])
        sidewalk = road([(100, 605), (1100, 605)], "footway", motor=False, footway="sidewalk")
        side = road([(600, 600), (600, 900)])
        paved = paving.lay([street, sidewalk, side], land())
        joining = sorted((chain for chain in paved.chains if chain.motor), key=lambda chain: -np.ptp(chain.xy[:, 0]))[1]
        footway = next(chain for chain in paved.chains if not chain.motor)
        corners = paved.points[paved.triangles]
        middle = corners[:, :, :2].mean(axis=1)
        across = np.abs(corners[:, :, 3])
        kerb = (across.min(axis=1) >= 1) & (across.max(axis=1) > paving.CARRIAGEWAY_EDGE_ACROSS) & (corners[:, 0, 6].astype(int) == joining.index)
        beyond = kerb & (middle[:, 1] > 605 + float(footway.half.max()) + 0.05) & (np.abs(middle[:, 0] - 600) < 14)
        self.assertGreater(int(beyond.sum()), 0)
        # Past the sidewalk the side street's kerb is its own strip along its edge, and nothing further out.
        reach = float(paved.crosses[joining.index].reach_left.max())
        self.assertLessEqual(float(np.abs(corners[beyond][:, :, 0] - 600).max()), reach + 0.05)

    def test_the_wedge_between_two_roads_that_merge_at_a_slant_is_asphalt_back_to_a_nose(self):
        """The shoulder between two merging carriageways ran on to where they met as a needle metres long, pale down the
        middle of the asphalt."""
        main = road([(100, 600), (600, 600), (1100, 600)], "tertiary")
        slip = road([(600, 600), (900, 640)], "tertiary")
        paved = paving.lay([main, slip], land(town=0.0))
        half = float(max(chain.half.max() for chain in paved.chains))
        slope = 40 / 300

        def between(gap):
            """The triangle half way between the two carriageways' edges, where they stand `gap` apart."""
            return triangle_at(paved, 600 + (half + half * np.hypot(1, slope) + gap) / slope, 600 + half + gap / 2)

        self.assertTrue((np.abs(between(0.6)[:, 3]) <= 1).all())
        self.assertTrue((np.abs(between(2.4)[:, 3]) >= 1).all())


class Paint(unittest.TestCase):
    def test_an_edge_line_turns_a_mouth_s_corner_with_the_asphalt_as_wide_as_on_the_road(self):
        """Painted from each road's own edge, the line round a mouth's corner was whatever a few big triangles blended
        it to: a crescent, fat in the corner's middle and gone at its ends."""
        main = road([(100, 600), (600, 600), (1100, 600)], "tertiary")
        side = road([(600, 600), (600, 900)], "tertiary")
        paved = paving.lay([main, side], land(town=0.0))
        through, joining = sorted(paved.chains, key=lambda chain: -np.ptp(chain.xy[:, 0]))
        half = float(through.half.max())
        radius = 7.0 + float(joining.shoulder[0])
        centre = 600 + half + radius
        # Not on the corner's diagonal, which the triangles are cut along.
        for degrees in (12, 30, 43, 60, 78):
            towards = np.array([np.cos(np.radians(degrees)), np.sin(np.radians(degrees))])
            on_line = centre - (radius + (1 - LINE_MIDDLE) * half) * towards
            self.assertTrue(EDGE_LINE[0] < across_at(paved, *on_line) < EDGE_LINE[1], degrees)
            self.assertEqual(float(triangle_at(paved, *on_line)[:, 4].max()), 0, degrees)
            # Inside it, bare asphalt.
            self.assertLess(across_at(paved, *(centre - (radius + 0.25 * half) * towards)), EDGE_LINE[0], degrees)

    def test_a_slip_road_s_edge_line_is_whole_where_its_edge_runs_out_of_the_greater_road_s_asphalt(self):
        """Its own asphalt there is a wedge as thin as the two roads' angle, and its line, painted on that alone, was a
        needle cut off along the greater road's edge for metres."""
        main = road([(100, 600), (600, 600), (1100, 600)], "tertiary")
        slip = road([(600, 600), (900, 640)], "tertiary")
        paved = paving.lay([main, slip], land(town=0.0))
        through, joining = sorted(paved.chains, key=lambda chain: -np.ptp(chain.xy[:, 0]))
        edge = joining.xy + joining.half[:, None] * joining.normal
        clear = np.flatnonzero((edge[:, 1] > 600 + float(through.half.max()) + 0.05) & (edge[:, 0] < 640))
        self.assertGreater(len(clear), 8)
        for station in clear:
            on_line = joining.xy[station] + LINE_MIDDLE * joining.half[station] * joining.normal[station]
            self.assertTrue(EDGE_LINE[0] < across_at(paved, *on_line) < EDGE_LINE[1], edge[station])

    def test_a_road_s_centre_line_stops_where_its_mouth_opens(self):
        """Its dashes ran on through the mouth to the middle of the road it met."""
        main = road([(100, 600), (600, 600), (1100, 600)], "tertiary")
        side = road([(600, 600), (600, 900)], "tertiary")
        paved = paving.lay([main, side], land(town=0.0))
        through, joining = sorted(paved.chains, key=lambda chain: -np.ptp(chain.xy[:, 0]))
        points = paved.points
        own = (points[:, 6].astype(int) == joining.index) & (np.abs(points[:, 0] - 600) < 0.03)
        half = float(through.half.max())
        in_mouth = own & (points[:, 1] > 600 + half) & (points[:, 1] < 600 + half + 6)
        self.assertGreater(int(in_mouth.sum()), 0)
        self.assertTrue((np.abs(points[in_mouth, 3]) >= paving.NO_CENTRE_ACROSS - 1e-3).all())
        self.assertTrue((points[own & (points[:, 1] > 640), 3] == 0).any())
        # The road it meets keeps its own, right through.
        along_main = (points[:, 6].astype(int) == through.index) & (np.abs(points[:, 1] - 600) < 0.03) & (np.abs(points[:, 0] - 600) < 300)
        self.assertTrue((points[along_main, 3] == 0).all())

    def test_a_one_way_road_of_one_lane_has_no_centre_line(self):
        """A roundabout's ring and each one-way arm of it had a line down the middle of its one lane."""
        for lanes, lined in ((None, False), ("2", True)):
            tags = {"oneway": "yes"} if lanes is None else {"oneway": "yes", "lanes": lanes}
            paved = paving.lay([road([(100, 600), (1100, 600)], "tertiary", **tags)], land(town=0.0))
            middle = (np.abs(paved.points[:, 1] - 600) < 0.03) & (np.abs(paved.points[:, 0] - 600) < 300)
            self.assertGreater(int(middle.sum()), 0)
            self.assertEqual(bool((paved.points[middle, 3] == 0).all()), lined)
            self.assertEqual(bool((np.abs(paved.points[middle, 3]) >= paving.NO_CENTRE_ACROSS - 1e-3).all()), not lined)

    def test_a_point_says_whether_it_lies_on_its_own_way_s_carriageway(self):
        """The game lays the paint at a road's end on its own carriageway: a mouth's fill wears the road's surface, with
        points on the carriageway's very edge, and is bare."""
        main = road([(100, 600), (600, 600), (1100, 600)], "tertiary")
        side = road([(600, 600), (600, 900)], "tertiary")
        paved = paving.lay([main, side], land(town=0.0))
        through, joining = sorted(paved.chains, key=lambda chain: -np.ptp(chain.xy[:, 0]))
        half = float(through.half.max())
        on_road = triangle_at(paved, 601.0, 600 + half + 3)
        self.assertTrue((on_road[:, 7].astype(int) & paving.ON_CARRIAGEWAY).all())
        in_fill = triangle_at(paved, 600 + half + 1.7, 600 + half + 1.3)
        self.assertFalse((in_fill[:, 7].astype(int) & paving.ON_CARRIAGEWAY).any())


class Scraps(unittest.TestCase):
    def test_two_paths_mapped_along_one_line_leave_no_scrap_of_either_s_surface(self):
        """A square's gravel and a footway's slabs, mapped along one line and then apart, as they are by Mariehamn's
        library: cut along both outlines where they part at a slant, the paving kept scraps of gravel under a square metre
        among the slabs."""
        slabs = road([(644.9, 597.5), (643.3, 596.2), (633.0, 592.0), (620.0, 591.9), (610.8, 593.9), (602.2, 599.0), (598.0, 604.0), (594.8, 606.8)], "footway", motor=False, surface="paving_stones")
        square = [(609.2, 632.6), (614.9, 630.9), (621.1, 627.6), (627.0, 621.3), (629.4, 616.7), (631.0, 610.4), (630.6, 600.6), (625.3, 597.8), (615.2, 596.5)]
        gravel = road([*square, (610.8, 593.9), (602.2, 599.0), (598.0, 604.0), (586.6, 637.4), (590.9, 637.2), (599.2, 634.3), (604.4, 633.0), (609.2, 632.6)], "pedestrian", motor=False, surface="fine_gravel")
        paved = paving.lay([slabs, gravel], land())
        corners = paved.points[paved.triangles]
        kinds = (corners[:, :, 7].astype(int) & paving.CLASS_BITS).max(axis=1)
        over = shapely.polygons(np.concatenate((corners[:, :, :2], corners[:, :1, :2]), axis=1))
        for kind in (path_surfaces.GRAVEL, path_surfaces.SLAB):
            stretches = shapely.get_parts(shapely.union_all(over[kinds == kind], grid_size=0.005))
            self.assertGreater(len(stretches), 0)
            self.assertGreaterEqual(float(shapely.area(stretches).min()), paving.SPECK_M2)


    def test_a_spike_of_one_surface_along_another_is_cut_off_and_given_to_it(self):
        """Where a gravel path crosses a slab footway at a slant, its gravel ran on along the slabs' edge as a needle
        metres long, part of a piece too wide at its other end to be taken for a sliver."""
        slabs = road([(100, 600), (1100, 600)], "footway", motor=False, surface="paving_stones")
        gravel = road([(500, 590), (700, 610)], "path", motor=False, surface="gravel")
        paved = paving.lay([slabs, gravel], land())
        corners = paved.points[paved.triangles]
        kinds = (corners[:, :, 7].astype(int) & paving.CLASS_BITS).max(axis=1)
        over = shapely.polygons(np.concatenate((corners[:, :, :2], corners[:, :1, :2]), axis=1))
        shape = shapely.union_all(over[kinds == path_surfaces.GRAVEL], grid_size=0.005)
        opened = shape.buffer(-paving.SLIVER_WIDE_M / 2, join_style="mitre").buffer(paving.SLIVER_WIDE_M / 2 + 0.005, join_style="mitre")
        self.assertGreater(shape.area, 100)
        self.assertLess(max((float(part.area) for part in shapely.get_parts(shape.difference(opened))), default=0.0), 2 * paving.SPIKE_LEAST_M2)


class Ends(unittest.TestCase):
    def test_a_road_that_ends_free_ends_round_with_its_strip_carried_round_the_end(self):
        """A way laid by its class ended on a line ruled square across it, strip and all."""
        paved = paving.lay([road([(100, 600), (600, 600)], "unclassified")], land(town=0.0))
        chain = paved.chains[0]
        half, reach = float(chain.half[-1]), float(paved.crosses[chain.index].reach_left[-1])
        corners = paved.points[paved.triangles][:, :, :2]
        over = shapely.polygons(np.concatenate((corners, corners[:, :1]), axis=1))
        # The square end's corner is land, and the paving still reaches the end on the road's line.
        self.assertFalse(shapely.contains_xy(over, 600 - 0.1, 600 + reach - 0.1).any())
        self.assertTrue(shapely.contains_xy(over, 600 - 0.05, 600.03).any())
        # Round the end, carriageway inside its arc and the strip outside it.
        centre = 600 - reach
        self.assertTrue((np.abs(triangle_at(paved, centre + half - 0.4, 600.3)[:, 3]) <= 1).all())
        self.assertTrue((np.abs(triangle_at(paved, centre + half + 0.5 * (reach - half), 600.03)[:, 3]) >= 1).all())


class RealWidth(unittest.TestCase):
    def test_a_country_road_has_a_strip_and_a_town_street_its_kerb_and_paving(self):
        for town, strip in ((0.0, 0.3), (1.0, 1.5)):
            paved = paving.lay([road([[100, 600], [1100, 600]])], land(town=town))
            cross = paved.crosses[0]
            middle = len(cross.reach_left) // 2
            self.assertAlmostEqual(float(cross.reach_left[middle] - cross.half_left[middle]), strip, delta=0.01)

    def test_a_carriageway_narrows_through_a_gap_and_opens_out_again(self):
        street = road([[100, 600], [1100, 600]], pinches=[[600.0, 600.0, 1.7]])
        chain = paving.lay([street], land(town=0.0)).chains[0]
        half = lambda east: float(chain.half[np.abs(chain.xy[:, 0] - east).argmin()])
        self.assertAlmostEqual(half(600), 1.7, delta=0.02)
        self.assertAlmostEqual(half(300), 2.25, delta=0.02)
        self.assertTrue(1.7 < half(603) < half(606) < 2.25)

    def test_a_strip_stops_short_of_a_wall_beside_it(self):
        # A town street 3 m from a house on its left: its paving runs to the eaves' room and no further, and its other side keeps its own.
        wall = shapely.box(500, 600 + 2.25 + 0.8, 520, 620)
        paved = paving.lay([road([[100, 600], [1100, 600]])], land(), walls=[wall])
        chain, cross = paved.chains[0], paved.crosses[0]
        beside = int(np.abs(chain.xy[:, 0] - 510).argmin())
        left_is_north = chain.normal[beside][1] > 0
        near, far = (cross.reach_left, cross.reach_right) if left_is_north else (cross.reach_right, cross.reach_left)
        self.assertAlmostEqual(float(near[beside] - chain.half[beside]), 0.8 - 0.5, delta=0.02)
        self.assertAlmostEqual(float(far[beside] - chain.half[beside]), 1.5, delta=0.02)

    def test_the_land_beside_the_paving_is_a_verge_before_it_is_a_bank(self):
        # A 10 m wall of land standing right beside the paving: the land may rise one in four over the verge's 4 m, and
        # only then as steeply as a bank.
        raw = np.full((61, 61), 20.0)
        laid = np.full((61, 61), np.nan)
        laid[:, :30] = 10.0
        row = paving.embanked(raw, laid, 2.0)[30]
        self.assertAlmostEqual(float(row[30]), 10.5, places=6)
        self.assertAlmostEqual(float(row[31]), 11.0, places=6)
        self.assertAlmostEqual(float(row[32]), 12.2, places=6)

    def test_a_point_on_a_carriageways_edge_is_stored_on_it_however_narrow_the_strip(self):
        # The outline is kept within 2 cm, which is a fifteenth of a country road's strip: read as that far across it, half a
        # carriageway's triangles counted as shoulder.
        paved = paving.lay([road([[100, 600], [600, 640], [1100, 600]])], land(town=0.0))
        across = np.abs(paved.points[:, paving.ACROSS])
        own = paved.points[:, paving.WAY] >= 0
        self.assertFalse(((across > 1) & (across < 1 + 0.03 / 0.3) & own).any())
        self.assertTrue((across[own] > 1.5).any())


class Seams(unittest.TestCase):
    def test_a_road_built_apart_on_two_tiles_meets_on_the_same_points_along_their_edge(self):
        def world(east, north):
            return 12 + 0.01 * east + 0.2 * np.sin(east / 5 + north / 9)

        whole = np.array([(900 + step * 12.0, 500 + 30 * np.sin(step / 6) + step * 5.0) for step in range(50)])
        # Tiles are 6 km to `clip_line`: these two meet at TILE_M, the only edge the road crosses.
        west_of_seam = clip_line(whole, Tile("W", int(TILE_M) - TILE_SIZE_M, 0))
        east_of_seam = clip_line(whole, Tile("E", int(TILE_M), 0))

        def tile_road(part, west):
            ends = [end for end in (part[0], part[-1]) if abs(end[0] - TILE_M) < 1e-6]
            direction = seam_direction(whole, ends[0])
            seam = [round(ends[0][0] - west, 2), round(ends[0][1], 2), direction[0], direction[1]]
            return road(np.round(part - [west, 0], 2), "tertiary", seams=[seam])

        def on_edge(paved, x):
            points = paved.points[np.abs(paved.points[:, 0] - x) < 1e-3][:, :3]
            return np.unique(np.round(points[:, 1:], 3), axis=0)

        here = on_edge(paving.lay([tile_road(west_of_seam[0], 0)], land(height=world)), TILE_M)
        there = on_edge(paving.lay([tile_road(east_of_seam[0], TILE_M)], land(height=world, west=TILE_M)), 0)
        self.assertGreaterEqual(len(here), 2)
        np.testing.assert_allclose(here, there, atol=0.002)

    def test_what_only_one_tile_sees_near_the_edge_changes_nothing_on_it(self):
        """Each tile sees only its own side of the edge: a sidewalk beside a street there, a path a street's chain carries on
        into, a junction just past the edge, a way running beside the edge without crossing it. Shaped by any of them, the
        paving on the edge differed between the two tiles, in where it reaches and how high it stands."""

        def world(east, north):
            return 12 + 0.01 * east + 0.004 * north + 0.3 * np.sin(east / 9 + north / 13)

        ways = [
            ("residential", [(900, 600), (1500, 604)]),
            # Beside the street on the west tile only, stopping short of the edge.
            ("footway", [(1000, 605.5), (1196, 605.8)]),
            # A street the west tile's chain carries on into a path across the edge.
            ("residential", [(1100, 650), (1190, 650)]),
            ("footway", [(1190, 650), (1400, 652)]),
            # A path crossing the edge that ends, just past it, on a road the west tile can't see.
            ("cycleway", [(1000, 520), (1211, 521)]),
            ("secondary", [(1211, 450), (1211, 580)]),
            # A service road beside the edge, its paving reaching over it, on the west tile only.
            ("service", [(1198.5, 690), (1198.5, 760)]),
        ]

        def tile_roads(west):
            roads = []
            for kind, line in ways:
                whole = np.array(line, dtype=float)
                # Tiles are 6 km to `clip_line`: these two meet at TILE_M, the only edge any way crosses.
                for part in clip_line(whole, Tile("T", int(TILE_M) - TILE_SIZE_M if west == 0 else int(TILE_M), 0)):
                    ends = [end for end in (part[0], part[-1]) if abs(end[0] - TILE_M) < 1e-6]
                    seams = [[round(end[0] - west, 2), round(end[1], 2), *seam_direction(whole, end)] for end in ends]
                    roads.append(road(np.round(part - [west, 0], 2), kind, motor=kind not in ("footway", "cycleway"), **({"seams": seams} if seams else {})))
            return roads

        def edge_surface(paved, x):
            north = np.arange(400, 800, 0.01)
            cut = paved.ground_cut(paved.conformed[:: paving.NODE_STRIDE, :: paving.NODE_STRIDE])
            inward = 1e-3 if x == 0 else -1e-3
            at = np.column_stack((np.full(len(north), x + inward), north))
            drawn = paving.Cover(paved.points[paved.triangles][:, :, :3]).at(at)
            ground = paving.Cover(cut.points[cut.triangles[: len(cut.triangles) - cut.walls]]).at(at)
            points = paved.points[np.abs(paved.points[:, 0] - x) < 1e-3][:, 1:3]
            return drawn, np.where(np.isnan(drawn), ground, drawn), np.unique(np.round(points, 3), axis=0)

        west_drawn, west_surface, west_points = edge_surface(paving.lay(tile_roads(0), land(height=world)), TILE_M)
        east_drawn, east_surface, east_points = edge_surface(paving.lay(tile_roads(TILE_M), land(height=world, west=TILE_M)), 0)
        np.testing.assert_array_equal(np.isnan(west_drawn), np.isnan(east_drawn))
        self.assertGreater(int((~np.isnan(west_drawn)).sum()), 1000)
        np.testing.assert_array_equal(west_points, east_points)
        both = ~np.isnan(west_surface) & ~np.isnan(east_surface)
        np.testing.assert_allclose(west_surface[both], east_surface[both], atol=0.002)


class Bridges(unittest.TestCase):
    def test_a_deck_lands_on_the_road_it_joins(self):
        """A bridge that reaches a junction ended on its own surface, level across, where the main road it joins climbs
        across the deck's end: a step of a hand's width at one corner and twice that at the other."""
        ground = land(lambda east, north: 10 + 0.06 * (north - 600))
        ways = [road([(600, 200), (600, 1000)], "primary"), road([(600, 600), (700, 600)], "tertiary", bridge="yes"), road([(700, 600), (1100, 600)], "tertiary")]
        paved = paving.lay(ways, ground)
        primary = next(chain.index for chain in paved.chains if chain.kind_name == "primary")
        way = paved.points[:, paving.WAY].astype(int)
        corners = paved.points[paved.triangles]
        main_road = paving.Cover(corners[(corners[:, :, paving.WAY].astype(int) == primary).all(axis=1)][:, :, :3])
        end = (way != primary) & (np.abs(paved.points[:, 0] - 600) < 0.06) & (np.abs(paved.points[:, 1] - 600) < 4)
        self.assertGreaterEqual(int(end.sum()), 2)
        step = paved.points[end, 2] - main_road.at(paved.points[end, :2], paving.LANDING_WITHIN_M)
        self.assertLess(float(np.abs(step).max()), 0.002)


class Underpasses(unittest.TestCase):
    def test_a_path_through_a_tunnel_keeps_clear_of_the_road_over_it_and_has_walls(self):
        ways = [road([(100, 600), (1100, 600)], "primary"), road([(600, 400), (600, 800)], "cycleway", motor=False, tunnel="yes")]
        paved = paving.lay(ways, land())
        chains = {chain.kind_name: chain.index for chain in paved.chains}
        path = paved.points[paved.points[:, 6].astype(int) == chains["cycleway"]]
        # The deck reaches its carriageway and shoulder either side of its line: the path's points under it stand at its edges.
        primary = paved.chains[chains["primary"]]
        # Over the underpass the deck is the carriageway alone, with no shoulder: the path's points under it stand at its edges.
        over = np.abs(primary.xy[:, 0] - 600) < 1
        self.assertLess(float(max(paved.crosses[primary.index].reach_left[over].max(), paved.crosses[primary.index].reach_right[over].max())), float(primary.half.max()) + 0.01)
        under = path[np.abs(path[:, 1] - 600) < primary.half.max() + 0.05]
        deck = paved.points[(paved.points[:, 6].astype(int) == chains["primary"]) & (np.abs(paved.points[:, 0] - 600) < 5)]
        self.assertGreater(len(under), 0)
        self.assertLessEqual(under[:, 2].max(), deck[:, 2].min() - paving.UNDERPASS_CLEAR_M + 0.01)
        ground_cut = paved.ground_cut(paved.conformed[:: paving.NODE_STRIDE, :: paving.NODE_STRIDE])
        upright = ground_cut.points[ground_cut.triangles]
        rise = upright[:, :, 2].max(1) - upright[:, :, 2].min(1)
        across = np.hypot(*(upright[:, :, :2].max(1) - upright[:, :, :2].min(1)).T)
        self.assertTrue(((rise > 1) & (across < 4)).any())

    def test_two_paths_tagged_as_tunnels_past_the_road_share_one_floor_under_it_and_are_on_the_ground_beyond(self):
        """OSM tags an underpass's ways well past the road over them: below all that way, each ran in a trench of its own,
        with a ridge of land between them."""
        # The cycleway is tagged far past the road; the footway beside it only where it passes under.
        footway = [road([(601.5, 450), (601.5, 590)], "footway", motor=False), road([(601.5, 590), (601.5, 610)], "footway", motor=False, tunnel="yes"), road([(601.5, 610), (601.5, 750)], "footway", motor=False)]
        ways = [road([(100, 600), (1100, 600)], "primary"), road([(598, 450), (598, 750)], "cycleway", motor=False, tunnel="yes"), *footway]
        paved = paving.lay(ways, land())
        corners = paved.points[paved.triangles]
        deck = corners[corners[:, :, 6].astype(int) == [chain.index for chain in paved.chains if chain.kind_name == "primary"][0]][:, 2].min()
        floor = corners[(corners[:, :, 2] < deck - paving.UNDERPASS_CLEAR_M + 0.01).all(axis=1)]
        # Under the road, between the two paths' own outlines, is the shared floor.
        self.assertTrue(np.isfinite(paving.Cover(floor[:, :, :3]).at(np.array([[599.75, 600.0]]))).all())
        # Away from the road both are on the ground, one paving with the strip between them, not two trenches.
        self.assertTrue(np.isfinite(paving.Cover(corners[:, :, :3]).at(np.array([[599.75, 650.0], [599.75, 550.0]]))).all())

    def test_a_road_under_a_deck_keeps_its_carriageway_s_edge_where_it_is_outside(self):
        """The floor under a deck was cut only along its outline, so its triangles ran from the centre to the shoulder's edge
        and the carriageway's edge, drawn where across is 1, came three quarters of the way out: inward, by a jog at each end."""
        ways = [road([(600, 400), (600, 800)], "footway", motor=False), road([(100, 600), (1100, 600)], "primary", tunnel="yes")]
        paved = paving.lay(ways, land())
        primary = next(chain for chain in paved.chains if chain.kind_name == "primary")
        corners = paved.points[paved.triangles]
        mine = (corners[:, :, 6].astype(int) == primary.index).all(axis=1)
        deck = float(corners[(corners[:, :, 6].astype(int) != primary.index).all(axis=1)][:, :, 2].max())
        floor = corners[mine & (corners[:, :, 2] < deck - paving.UNDERPASS_CLEAR_M + 0.01).all(axis=1)]
        self.assertGreater(len(floor), 0)
        half = float(primary.half.max())
        for north in (600 + half, 600 - half):
            at = np.array([[600.0, north - np.sign(north - 600) * 0.01]])
            held = shapely.STRtree(shapely.polygons(np.concatenate((floor[:, :, :2], floor[:, :1, :2]), axis=1))).query(shapely.points(at), predicate="intersects")[1]
            self.assertGreater(len(held), 0)
            across = paving._on_planes(floor[held][:, :, [0, 1, 3]], np.repeat(at, len(held), axis=0))
            np.testing.assert_allclose(np.abs(across), 1, atol=0.02)

    def test_each_way_s_rings_stand_on_its_own_level(self):
        """What places things beside a way reads its rings. Under a deck they took whichever paving the point found first,
        the floor's or the deck's, so a way over an underpass could read the floor and one under it the deck."""
        ways = [road([(100, 600), (1100, 600)], "primary"), road([(600, 400), (600, 800)], "cycleway", motor=False, tunnel="yes")]
        paved = paving.lay(ways, land())
        nodes = paved.conformed[:: paving.NODE_STRIDE, :: paving.NODE_STRIDE]
        rings = {chain.kind_name: ring for chain, ring, _, _ in paving.rings_of(paved, nodes, paved.ground.spacing * paving.NODE_STRIDE)}
        chains = {chain.kind_name: chain for chain in paved.chains}
        for kind in ("primary", "cycleway"):
            edges = rings[kind][:, 1:4]
            np.testing.assert_allclose(edges[:, :, 2].ravel(), chains[kind].plane(edges[:, :, :2].reshape(-1, 2)), atol=0.3)

if __name__ == "__main__":
    unittest.main()
