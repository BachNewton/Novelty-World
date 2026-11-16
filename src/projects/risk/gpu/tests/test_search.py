"""The search reading (`riskgpu/selfplay/search.py`): a copy never plays the real game's dice and is
reproducible; with one candidate the searcher plays exactly the raw network's first choice (the
tool's parity check, which holds only if the copies leave the real games untouched); and a
candidate that throws away a won game is not chosen over the win."""

import torch

from riskgpu.board import CARDS, Board
from riskgpu.data import load_best
from riskgpu.engine import ATTACK as K_ATTACK
from riskgpu.engine import BLITZ as K_BLITZ
from riskgpu.engine import END_ATTACK as K_END_ATTACK
from riskgpu.options import options
from riskgpu.runner import TurnLog
from riskgpu.selfplay.parity import random_net
from riskgpu.selfplay.search import SearchConfig, Searcher, copy_states, game_base, seating
from riskgpu.state import LAYOUT, new_games


def setup():
    board = Board.load("cpu")
    tables = load_best("cpu")
    tables.scaled_oversize = True
    return board, tables


def dealt_hands(board):
    """Two games in which every seat holds cards drawn from the top of the deck."""
    s = new_games(["search-a", "search-b"], [5, 4], board, "cpu")
    for g in range(2):
        top = 0
        for seat, n in enumerate([3, 2, 4, 1, 0][: int(s.players[g])]):
            s.hand[g, seat, :n] = s.deck[g, top:top + n]
            s.hand_len[g, seat] = n
            top += n
        rest = s.deck[g, top:].clone()
        s.deck[g] = -1
        s.deck[g, : CARDS - top] = rest
        s.deck_len[g] = CARDS - top
    return s


def test_copies_never_hold_the_real_stream_and_are_reproducible():
    board, _ = setup()
    s = dealt_hands(board)
    seat = torch.tensor([0, 2])
    base = torch.tensor([game_base("search-a"), game_base("search-b")])
    decision = torch.tensor([7, 11])
    k, r = 3, 4
    a = copy_states(s, seat, base, decision, k, r, "resample", crn=True)
    b = copy_states(s, seat, base, decision, k, r, "resample", crn=True)
    for name in LAYOUT:
        assert torch.equal(getattr(a, name), getattr(b, name)), name
    real = s.rng.repeat_interleave(k * r)
    assert bool((a.rng != real).all())
    streams = a.rng.view(2, k, r)
    # Common random numbers: copy r shares its stream across candidates, and no two copies share one.
    assert torch.equal(streams[:, 0], streams[:, 2])
    assert len(set(streams[:, 0].reshape(-1).tolist())) == 2 * r
    no_crn = copy_states(s, seat, base, decision, k, r, "resample", crn=False).rng.view(2, k, r)
    assert len(set(no_crn.reshape(-1).tolist())) == 2 * k * r
    # Another decision of the same game draws other dice.
    later = copy_states(s, seat, base, decision + 1, k, r, "resample", crn=True)
    assert bool((later.rng != a.rng).all())

    # The deal: the searcher's own hand and every size kept, every card once, the rest reshuffled.
    for i in range(a.batch):
        g = i // (k * r)
        own = int(seat[g])
        assert torch.equal(a.hand[i, own], s.hand[g, own])
        assert torch.equal(a.hand_len[i], s.hand_len[g])
        assert int(a.deck_len[i]) == int(s.deck_len[g])
        cards = [c for seat_ in range(int(a.players[i])) for c in a.hand[i, seat_, : int(a.hand_len[i, seat_])].tolist()]
        cards += a.deck[i, : int(a.deck_len[i])].tolist()
        assert sorted(cards) == list(range(CARDS))
    assert not torch.equal(a.deck[0], s.deck[0])
    assert len({tuple(a.deck[i].tolist()) for i in range(r)}) == r
    real_hidden = copy_states(s, seat, base, decision, k, r, "real", crn=True)
    assert torch.equal(real_hidden.deck, s.deck.repeat_interleave(k * r, 0))


def test_one_candidate_plays_exactly_as_the_raw_networks_first_choice():
    board, tables = setup()
    net = random_net(32, 1, 4, 2, board, seed=3)
    seeds, searcher, _ = seating(["one-in"], 3, 5)
    searched = SearchConfig(k=1, r=1, leaf="own", kinds=("reinforce", "attack", "occupy", "fortify"), skip_mass=2.0, cap=7)
    control = SearchConfig(k=1, r=1, leaf="own", kinds=searched.kinds, skip_mass=0.0, cap=7)
    with torch.inference_mode():
        a = Searcher(net, board, tables, searched, "cpu")
        played = a.play(seeds, 5, searcher, raw_greedy=False)
        b = Searcher(net, board, tables, control, "cpu")
        raw = b.play(seeds, 5, searcher, raw_greedy=False)
    assert sum(a.searched.values()) > 20 and a.work.rollout > 0
    assert sum(b.searched.values()) == 0
    for name in LAYOUT:
        assert torch.equal(getattr(played["state"], name), getattr(raw["state"], name)), name
    assert torch.equal(played["winner"], raw["winner"])


def test_a_candidate_that_throws_away_the_win_is_not_chosen():
    """Two seats left; the searcher's armies surround the other's last territory. The network is
    rigged to end the attack first, and its value is 0 everywhere, so only the real win scores."""
    board, tables = setup()
    net = random_net(32, 1, 4, 2, board, seed=5)
    with torch.no_grad():
        net.glob_out.bias[1] += 100.0  # END_ATTACK, the global head's second output
        net.value.weight.zero_()
        net.value.bias.zero_()
    s = new_games(["search-win"], [3], board, "cpu")
    me, other, out = (int(x) for x in s.turn_order[0, :3])
    target = 0
    s.owner[0] = me
    s.owner[0, target] = other
    s.armies[0] = 30
    s.armies[0, target] = 1
    s.eliminated[0, out] = True
    s.active[0] = me
    s.phase[0] = 1
    s.reinf_present[0] = False
    s.reinf_to_place[0] = 0
    cfg = SearchConfig(k=3, r=4, kinds=("attack",), skip_mass=2.0)
    with torch.inference_mode():
        searcher = Searcher(net, board, tables, cfg, "cpu")
        o = options(s, board)
        log = TurnLog.empty(1, "cpu")
        x, logits, _, legal = searcher.heads(s, o, log)
        first = searcher.policy(x, logits, legal, s, o, None)
        assert int(first[0, 0]) == K_END_ATTACK
        moves, detail = searcher.choose(s, o, log, torch.ones(1, 6, dtype=torch.int64), s.players.to(torch.int64),
                                        torch.tensor([game_base("search-win")]), torch.zeros(1, dtype=torch.int64),
                                        x, logits, legal, first)
    means = detail["means"][0][0]
    assert float(means[0]) == 0.0
    # Each attack scores its copies' captures (a win, 1) and failures (the turn ends at value 0).
    assert float(means.max()) > 0.0
    assert torch.equal(moves[0], detail["candidates"][0][0, int(means.argmax())])
    assert int(moves[0, 0]) in (K_ATTACK, K_BLITZ) and int(moves[0, 2]) == target
    assert searcher.overruled["attack"] == 1


class LeafRecorder(Searcher):
    """Keeps every leaf state the rollouts score, with the seat each is scored for."""

    def __init__(self, *args):
        super().__init__(*args)
        self.leaves = []

    def leaf_values(self, s, log, seat):
        self.leaves.append((s.clone(), seat.clone()))
        return super().leaf_values(s, log, seat)


def test_an_own_leaf_is_the_searchers_next_decision_after_every_other_seats_turn():
    board, tables = setup()
    net = random_net(32, 1, 4, 2, board, seed=7)
    s = new_games(["search-own"], [5], board, "cpu")
    me = int(s.active[0])
    turn0 = int(s.turn[0])
    cfg = SearchConfig(k=2, r=2, leaf="own", kinds=("reinforce",), skip_mass=2.0)
    with torch.inference_mode():
        searcher = LeafRecorder(net, board, tables, cfg, "cpu")
        o = options(s, board)
        log = TurnLog.empty(1, "cpu")
        x, logits, _, legal = searcher.heads(s, o, log)
        first = searcher.policy(x, logits, legal, s, o, None)
        searcher.choose(s, o, log, torch.ones(1, 6, dtype=torch.int64), s.players.to(torch.int64),
                        torch.tensor([game_base("search-own")]), torch.zeros(1, dtype=torch.int64), x, logits, legal, first)
    assert sum(searcher.searched.values()) == 1
    leaves = [(state.select(torch.tensor([i])), int(seat[i])) for state, seat in searcher.leaves for i in range(state.batch)]
    # Nobody is out after one round of a fresh 5-player deal, so every copy reaches its leaf.
    assert len(leaves) == cfg.k * cfg.r == searcher.work.leaf
    for leaf, seat in leaves:
        assert seat == me
        assert int(leaf.active[0]) == me and int(leaf.phase[0]) != 3
        assert not bool(leaf.eliminated[0].any())
        assert int(leaf.turn[0]) == turn0 + 5  # its own turn, then each of the other four


def test_a_searcher_knocked_out_in_the_rollout_scores_its_real_place():
    """Three seats; the seat before the searcher blitzes its one territory from 29 armies. The
    value head is rigged high, so only the real score (third of three, −1) reads −1."""
    board, tables = setup()
    net = random_net(32, 1, 4, 2, board, seed=5)
    with torch.no_grad():
        net.value.weight.zero_()
        net.value.bias.fill_(0.5)
    s = new_games(["search-out"], [3], board, "cpu")
    attacker, me, third = (int(x) for x in s.turn_order[0, :3])
    target = 0
    frm = int(board.adjacent[target, 0])
    far = next(t for t in range(42) if t not in (target, frm) and not bool(board.adjacency[target, t]))
    s.owner[0] = attacker
    s.owner[0, target] = me
    s.owner[0, far] = third
    s.armies[0] = 30
    s.armies[0, target] = 1
    s.active[0] = attacker
    s.phase[0] = 1
    s.reinf_present[0] = False
    s.reinf_to_place[0] = 0
    cfg = SearchConfig(k=1, r=4, leaf="own")
    seat = torch.tensor([me])
    with torch.inference_mode():
        searcher = Searcher(net, board, tables, cfg, "cpu")
        cs = copy_states(s, seat, torch.tensor([game_base("search-out")]), torch.zeros(1, dtype=torch.int64), 1, cfg.r,
                         cfg.hidden, cfg.crn)
        n = cs.batch
        log = TurnLog.empty(1, "cpu").select(torch.zeros(n, dtype=torch.int64))
        places = torch.ones(n, 6, dtype=torch.int64)
        in_game = cs.players.to(torch.int64).clone()
        blitz = torch.tensor([[K_BLITZ, frm, target, 1, 0]]).expand(n, -1)
        out = searcher.rollout(cs, log, places, in_game, seat.expand(n), cs.turn.to(torch.int64), blitz,
                               torch.zeros(n, dtype=torch.bool))
    assert bool(cs.eliminated[:, me].all()) and not bool(cs.eliminated[:, third].any())
    assert out.tolist() == [-1.0] * n
    assert searcher.work.leaf == 0
