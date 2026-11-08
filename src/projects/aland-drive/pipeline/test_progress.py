"""The whole build's time left, which scales a past island build's steps by this run's sizes and pace.

    pipeline/.venv/Scripts/python -m unittest discover -s src/projects/aland-drive/pipeline
"""

import unittest

from progress import Build

PAST = {"jobs": 4, "steps": {"tiles": {"seconds": 1000, "size": 100}, "roadside": {"seconds": 200, "size": 100}, "version": {"seconds": 60, "size": 100}}}


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self) -> float:
        return self.t


class TestBuild(unittest.TestCase):
    def test_no_history_says_so(self):
        build = Build({"tiles": 10}, None)
        build.start("tiles")
        self.assertIn("no island build", build.left(5))

    def test_the_rest_is_scaled_by_size_and_pace(self):
        clock = Clock()
        build = Build({"tiles": 10, "roadside": 10, "version": 50}, PAST, clock)
        build.start("tiles")
        # Half the tiles in 100 s: the tiles take 200 s, twice the past's 10 s a tile, so the rest runs twice as slow too.
        clock.t = 100
        self.assertEqual(build.left(100), "about 3:20 left for the whole build")

    def test_a_step_with_nothing_to_count_uses_the_finished_steps_pace(self):
        clock = Clock()
        build = Build({"tiles": 10, "roadside": 10, "version": 50}, PAST, clock)
        build.start("tiles")
        clock.t = 300
        build.start("version")
        # 300 s for steps the past did in 120 s: the version's 30 s is 75 s.
        self.assertEqual(build.left(), "about 1:15 left for the whole build")

    def test_a_step_never_timed_is_named(self):
        build = Build({"tiles": 10, "lanes": 10}, PAST)
        build.start("tiles")
        self.assertIn("not counting the lanes", build.left(1))


if __name__ == "__main__":
    unittest.main()
