"""The league's pick by results: snapshots that still beat the learner come back more often than
ones it beats, an unseated one counts at par, and a pick never repeats a snapshot."""

import random

from riskgpu.selfplay.ppo import pick_by_results


def test_a_snapshot_that_wins_its_seats_is_picked_more_than_one_that_loses():
    random.seed(7)
    record_of = {"strong": [400.0, 1000.0], "weak": [20.0, 1000.0]}
    picks = [pick_by_results(["strong", "weak"], 1, record_of)[0] for _ in range(2000)]
    # x is about 0.40 against 0.024, so weights of about 0.16 against 0.0006.
    assert picks.count("strong") > 1950


def test_an_unseated_snapshot_counts_at_par():
    random.seed(7)
    record_of = {"seated-at-par": [220.0, 1000.0]}
    picks = [pick_by_results(["seated-at-par", "new"], 1, record_of)[0] for _ in range(4000)]
    assert 1800 < picks.count("new") < 2200


def test_a_pick_is_without_replacement_and_never_more_than_there_are():
    random.seed(7)
    chosen = pick_by_results(["a", "b", "c"], 5, {})
    assert sorted(chosen) == ["a", "b", "c"]
    assert pick_by_results([], 2, {}) == []
