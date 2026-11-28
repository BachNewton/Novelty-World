"""The search's noise and what is read from it (`search.py`'s budget, `distil.py`'s targets): the
default search plays exactly as it always has; the adaptive budget stops a decided decision after
its first round and spends its whole budget on an undecided one; the completed-Q target is the
shrunk, tilted prior it is defined as, at its limits the prior and the hard choice; and the z filter
relabels exactly the overrules under its bar."""

import hashlib
import math
from types import SimpleNamespace

import torch

from riskgpu.board import Board
from riskgpu.data import load_best
from riskgpu.options import options
from riskgpu.runner import TurnLog
from riskgpu.selfplay import distil
from riskgpu.selfplay.actions import MAIN
from riskgpu.selfplay.net import NEG
from riskgpu.selfplay.parity import random_net
from riskgpu.selfplay.search import SearchConfig, Searcher, game_base, seating
from riskgpu.state import LAYOUT, new_games


def setup():
    board = Board.load("cpu")
    tables = load_best("cpu")
    tables.scaled_oversize = True
    return board, tables


def test_the_default_search_plays_as_it_always_has():
    """Two games' end state, searched decisions, overrules and work, as the search without the
    adaptive budget played them before the budget existed."""
    board, tables = setup()
    net = random_net(32, 1, 4, 2, board, seed=3)
    seeds, searcher, _ = seating(["one-in"], 2, 5)
    cfg = SearchConfig(k=3, r=4, leaf="turn", kinds=("reinforce", "attack"), skip_mass=2.0, cap=8, margin=0.0)
    with torch.inference_mode():
        s = Searcher(net, board, tables, cfg, "cpu")
        out = s.play(seeds, 5, searcher, raw_greedy=False)
    h = hashlib.sha256()
    for name in LAYOUT:
        h.update(getattr(out["state"], name).contiguous().numpy().tobytes())
    assert h.hexdigest() == "83fad83def437de9108f52670606fe5d0bb823a73d604e0bf9cd3fa8c86c624f"
    assert (s.searched["reinforce"], s.searched["attack"], s.overruled["reinforce"], s.overruled["attack"]) == (5, 35, 2, 16)
    assert (s.work.game, s.work.rollout, s.work.leaf) == (180, 3608, 384)


def one_decision(net, board, tables, s, cfg):
    """`(detail, searcher)` of the search at the one decision of the game `s`."""
    with torch.inference_mode():
        searcher = Searcher(net, board, tables, cfg, "cpu")
        o = options(s, board)
        log = TurnLog.empty(1, "cpu")
        x, logits, _, legal = searcher.heads(s, o, log)
        first = searcher.policy(x, logits, legal, s, o, None)
        _, detail = searcher.choose(s, o, log, torch.ones(1, 6, dtype=torch.int64), s.players.to(torch.int64),
                                    torch.tensor([game_base("noise")]), torch.zeros(1, dtype=torch.int64), x, logits,
                                    legal, first)
    return detail, searcher


def test_the_budget_stops_a_decided_decision_and_spends_all_on_an_undecided_one():
    board, tables = setup()
    # Decided: two seats left, the searcher's 30 armies round the other's last territory, the
    # network rigged to end the attack and to value everything 0, so an attack's real win is a gap
    # with no spread.
    net = random_net(32, 1, 4, 2, board, seed=5)
    with torch.no_grad():
        net.glob_out.bias[1] += 100.0  # END_ATTACK, the global head's second output
        net.value.weight.zero_()
        net.value.bias.zero_()
    s = new_games(["noise-win"], [3], board, "cpu")
    me, other, out = (int(x) for x in s.turn_order[0, :3])
    s.owner[0] = me
    s.owner[0, 0] = other
    s.armies[0] = 30
    s.armies[0, 0] = 1
    s.eliminated[0, out] = True
    s.active[0] = me
    s.phase[0] = 1
    s.reinf_present[0] = False
    s.reinf_to_place[0] = 0
    cfg = SearchConfig(k=3, r=6, kinds=("attack",), skip_mass=2.0, r_max=24, z_stop=2.0)
    detail, searcher = one_decision(net, board, tables, s, cfg)
    ok = torch.isfinite(detail["means"][0])
    assert int(detail["count"][0]) == 6 and searcher.rollouts == 6 * int(ok.sum())
    assert float(detail["means"][0].max()) > 0 and searcher.overruled["attack"] == 1

    # Undecided: a fresh deal's placement, every leaf valued 0, so no candidate's gap ever shows.
    s = new_games(["noise-even"], [5], board, "cpu")
    cfg = SearchConfig(k=2, r=6, leaf="turn", kinds=("reinforce",), skip_mass=2.0, r_max=24, z_stop=2.0)
    detail, searcher = one_decision(net, board, tables, s, cfg)
    assert bool(detail["candidates"][0][0, 1].ne(detail["candidates"][0][0, 0]).any())
    assert not bool(detail["same"][0][0, 1])
    assert int(detail["count"][0]) == 24 and detail["vals"][0].shape == (1, 2, 24)
    assert searcher.rollouts == 2 * 24 and searcher.overruled["reinforce"] == 0


def toy(spread: float) -> dict:
    """Three candidates of one decision, four rollouts each: the first choice and the third share
    main choice 5 (two amounts), the second is main choice 7. Paired gaps over the first: the
    second's 0.05 and the third's −0.02, each with `spread` round it."""
    wobble = torch.tensor([1.0, -1.0, 1.0, -1.0])
    vals = torch.stack([torch.zeros(4), 0.05 + spread * wobble, -0.02 - spread * wobble])[None]
    return {"vals": vals, "count": torch.tensor([[4, 4, 4]]), "cand_ok": torch.tensor([[True, True, True]]),
            "same_move": torch.tensor([[True, False, False]]), "cand_main": torch.tensor([[5, 7, 5]]),
            "cand_amount": torch.tensor([[0, 0, 1]]), "chosen": torch.tensor([1]), "overruled": torch.tensor([True]),
            "p_main": torch.tensor([[0.5, 0.2, 0.5]]), "p_amount": torch.tensor([[0.6, 1.0, 0.3]])}


def legal_logits() -> torch.Tensor:
    z = torch.zeros(1, MAIN)
    z[0, 100:] = NEG  # illegal
    return z


def test_the_completed_q_target_is_the_shrunk_tilted_prior_and_its_limits():
    tau, temp = 0.03, 0.03
    x = toy(0.05)
    se = math.sqrt(4 * 0.05 ** 2 / 3 / 4)  # each rival's gap's standard error, by hand
    shrunk = [0.0, 0.05 * tau ** 2 / (tau ** 2 + se ** 2), -0.02 * tau ** 2 / (tau ** 2 + se ** 2)]
    prior = [0.5 * 0.6, 0.2 * 1.0, 0.5 * 0.3]
    tilt = [p * math.exp(d / temp) for p, d in zip(prior, shrunk)]
    w = [v / sum(tilt) for v in tilt]
    held = sum(prior)
    t = distil.completed_q_main_target(legal_logits(), x, distil.completed_q_weights(x, tau, temp))[0]
    assert torch.allclose(distil.completed_q_weights(x, tau, temp)[0], torch.tensor(w), atol=1e-6)
    assert abs(float(t[5]) - (0.5 - prior[0] - prior[2] + held * (w[0] + w[2]))) < 1e-6
    assert abs(float(t[7]) - held * w[1]) < 1e-6
    rest = torch.cat([t[:5], t[6:7], t[8:100]])
    assert torch.allclose(rest, torch.full_like(rest, (1 - 0.7) / 98)) and float(t[100:].sum()) == 0

    # No evidence: the network's own probabilities.
    t = distil.completed_q_main_target(legal_logits(), toy(1e3), distil.completed_q_weights(toy(1e3), tau, temp))[0]
    assert abs(float(t[5]) - 0.5) < 1e-6 and abs(float(t[7]) - 0.2) < 1e-6
    # Exact gaps at a cold temperature: the candidates' mass on the best gap, the hard choice.
    exact = toy(0.0)
    w = distil.completed_q_weights(exact, tau, 1e-4)[0]
    assert torch.allclose(w, torch.tensor([0.0, 1.0, 0.0]), atol=1e-6)
    args = SimpleNamespace(target="completed-q", tau_prior=tau, temp=1e-4, z_min=None)
    assert int(distil.train_choice(exact, args)[0]) == int(exact["chosen"][0]) == 1


def test_the_z_filter_relabels_exactly_the_overrules_under_its_bar():
    # Four decisions; the second candidate's gap over the first at a spread of 0.1 (se 0.0577):
    # z 0.52, 3.46, 2.60 and 3.46, the last one the search kept.
    wobble = torch.tensor([1.0, -1.0, 1.0, -1.0])
    gaps = torch.tensor([0.03, 0.2, 0.15, 0.2])
    second = gaps[:, None] + 0.1 * wobble[None, :]
    vals = torch.stack([torch.zeros(4, 4), second, torch.zeros(4, 4)], 1)
    x = {"vals": vals, "count": torch.full((4, 3), 4), "chosen": torch.tensor([1, 1, 1, 0]),
         "overruled": torch.tensor([True, True, True, False])}
    z = distil.chosen_z(x)
    assert torch.allclose(z, torch.tensor([0.03, 0.2, 0.15, 0.0]) / (0.1 * math.sqrt(4 / 3) / 2), atol=1e-4)
    args = SimpleNamespace(target="hard", z_min=2.0)
    assert distil.train_choice(x, args).tolist() == [0, 1, 1, 0]
    args.z_min = 3.0
    assert distil.train_choice(x, args).tolist() == [0, 1, 0, 0]
