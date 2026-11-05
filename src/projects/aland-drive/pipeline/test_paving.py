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


def land(height=None, west=0.0):
    """A square of 2 m corners, 1.2 km across, its north edge at 1200."""
    rim = 100
    count = int(TILE_M / 2) + 2 * rim + 1
    rows, columns = np.mgrid[0:count, 0:count]
    east, north = west + (columns - rim) * 2.0, TILE_M - (rows - rim) * 2.0
    corners = height(east, north) if height else np.full((count, count), 10.0)
    return Ground(corners.astype(np.float32), 0.0, TILE_M, rim)


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
        surface = paved.points[:, 7]
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

    def test_a_path_has_no_shoulder_to_draw_at_its_edge(self):
        """A path's outline is kept within a couple of centimetres of its edge, and a point a hair past it was drawn as a
        shoulder's far side: every triangle from its middle to that point faded to the photo's colour, a pale lens."""
        bend = [(300 + 200 * np.sin(step / 20), 300 + step * 6.0) for step in range(80)]
        paved = paving.lay([road(bend, "footway", motor=False)], land(height=hilly))
        path = paved.points[paved.points[:, 6].astype(int) == paved.chains[0].index]
        self.assertGreater(len(path), 100)
        self.assertLessEqual(float(np.abs(path[:, 3]).max()), 1.0)

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
        self.assertTrue((strip[:, :, 7] == path_surfaces.SLAB).all())
        self.assertTrue((np.abs(strip[:, :, 3]) < 1).all())

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
        self.assertTrue((corners[crossing][:, :, 7] == path_surfaces.SLAB).all())

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
        self.assertTrue((band[:, :, 7] == path_surfaces.SLAB).all())
        self.assertTrue((np.abs(band[:, :, 3]) < 1).all())

    def test_a_road_joining_another_keeps_its_carriageway_through_the_greater_road_s_shoulder(self):
        """A main road's shoulder painted across the mouth of a side road shows as a pale band across that road."""
        main = road([(100, 600), (1100, 600)], "primary")
        side = road([(600, 600), (600, 900)], "residential")
        paved = paving.lay([main, side], land())
        chains = {chain.kind_name: chain for chain in paved.chains}
        primary, residential = chains["primary"], chains["residential"]
        corners = paved.points[paved.triangles]
        middle = corners[:, :, :2].mean(axis=1)
        mouth = (np.abs(middle[:, 0] - 600) < residential.half.min()) & (middle[:, 1] > 600 + primary.half.max()) & (middle[:, 1] < 600 + paved.crosses[primary.index].reach_left.max())
        self.assertGreater(int(mouth.sum()), 0)
        self.assertTrue((corners[mouth][:, :, 6].astype(int) == residential.index).all())

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

if __name__ == "__main__":
    unittest.main()
