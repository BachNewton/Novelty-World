"""The league's pick by results: snapshots that still beat the learner come back more often than
ones it beats, an unseated one counts at par, and a pick never repeats a snapshot. The league's mix:
an anchor in every slot is every opponent seat, however many snapshots the run has saved."""

import random

import pytest
import torch

from riskgpu.selfplay.env import GD, GD_PERSONAS, GREEDY, LEARNER, SNAPSHOT
from riskgpu.selfplay.ppo import league_mix, pick_by_results

KINDS = SNAPSHOT + 4


@pytest.mark.parametrize("own_snapshots", [0, 1, 5])
def test_an_anchor_in_every_slot_takes_every_opponent_seat(own_snapshots):
    probs, anchors, own = league_mix(KINDS, 0.0, 1.0, 0.0, fixed=1, slots=1, own_snapshots=own_snapshots)
    assert (anchors, own) == (1, 0)
    expected = torch.zeros(KINDS)
    expected[SNAPSHOT] = 1.0
    assert torch.equal(probs, expected)


def test_a_slot_past_the_anchors_seats_the_runs_own_snapshot():
    probs, anchors, own = league_mix(KINDS, 0.15, 0.35, 0.35, fixed=2, slots=3, own_snapshots=4)
    assert (anchors, own) == (2, 1)
    assert probs[LEARNER] == pytest.approx(0.15)
    assert probs[GREEDY] == pytest.approx(0.15)
    assert probs[GD:GD + len(GD_PERSONAS)].tolist() == pytest.approx([0.35 / len(GD_PERSONAS)] * len(GD_PERSONAS))
    assert probs[SNAPSHOT:SNAPSHOT + 3].tolist() == pytest.approx([0.35 / 3] * 3)
    assert probs[SNAPSHOT + 3] == 0


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
