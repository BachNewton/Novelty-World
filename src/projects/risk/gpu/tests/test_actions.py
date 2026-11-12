"""The network's two action spaces (`riskgpu/selfplay/actions.py`).

The bucket space is frozen: every checkpoint trained on it (the anchors, learned-v1's weights) must
decide exactly as it did before the exact space was added, so a fixed network's decisions on fixed
positions are pinned (`fixtures/bucket-decisions.json.gz`, written by the code before the change).
The exact space must be sound and complete: every candidate its masks allow is a move the engine
accepts, every legal move of each kind is one of its candidates while the range fits its slots,
and a teacher's move maps to a target that decodes back to it."""

import gzip
import json
import os

import torch

import riskgpu.selfplay.env as env_module
from riskgpu.board import TERRITORIES, Board
from riskgpu.data import FIXTURES, fixture_paths, load_best
from riskgpu.engine import ATTACK as K_ATTACK
from riskgpu.engine import step
from riskgpu.options import options
from riskgpu.records import read_records
from riskgpu.selfplay.actions import (C_BLITZ, C_FORTIFY, C_OCCUPY, C_PLACE, C_TRADE, SLOTS, candidate_moves, candidates,
                                      decode, decode_exact, legal_main, spread)
from riskgpu.selfplay.env import KEPT, LEARNER, SNAPSHOT, Env, EnvConfig
from riskgpu.selfplay.imitate import edge_index, exact_targets, normalize, replay
from riskgpu.selfplay.net import Net, act, evaluate, init_from
from riskgpu.selfplay.obs import observe
from riskgpu.selfplay.parity import random_net
from riskgpu.state import LAYOUT, State

BUCKETS = os.path.join(FIXTURES, "bucket-decisions.json.gz")


def positions(games: int = 4):
    """Every decision of the shortest few committed reference games: the states, their options
    and the turn so far."""
    records = sorted((r for path in fixture_paths() for r in read_records(path)), key=lambda r: len(r["moves"]))[:games]
    board = Board.load("cpu")
    samples, _, _ = replay(records, lambda label: True, board, load_best("cpu"), "cpu")
    n = len(samples["game"])
    fields = {name: samples[name] for name in KEPT}
    fields["armies"] = fields["armies"].to(torch.int32)
    fields["rng"] = torch.zeros(n, dtype=torch.int64)
    fields["deck"] = torch.full((n, LAYOUT["deck"][0][0]), -1, dtype=torch.int8)
    s = State(**{name: fields[name] for name in LAYOUT})
    o = options(s, board)
    return board, s, o, samples


def bucket_decisions() -> dict:
    board, s, o, samples = positions()
    net = random_net(32, 2, 4, 2, board, seed=11)
    node, slot, glob = observe(s, o, samples["placed_on"], samples["attacks"], samples["captured"], board)
    legal = legal_main(o)
    with torch.no_grad():
        main, amount, _, _, _ = act(net, node, slot, glob, legal, greedy=True)
        torch.manual_seed(5)
        smain, samount, slogp, _, _ = act(net, node, slot, glob, legal)
        logp, entropy, _, _ = evaluate(net, node, slot, glob, legal, smain, samount)
    return {"main": main.tolist(), "amount": amount.tolist(), "move": decode(main, amount, s, o, board).tolist(),
            "sample_main": smain.tolist(), "sample_amount": samount.tolist(),
            "sample_logp": slogp.tolist(), "logp": logp.tolist(), "entropy": entropy.tolist()}


def test_a_bucket_space_network_decides_as_before_the_exact_space():
    with gzip.open(BUCKETS, "rt") as f:
        pinned = json.load(f)
    now = bucket_decisions()
    for key in ("main", "amount", "move", "sample_main", "sample_amount"):
        assert now[key] == pinned[key], key
    for key in ("sample_logp", "logp", "entropy"):
        assert torch.allclose(torch.tensor(now[key]), torch.tensor(pinned[key]), atol=1e-5), key


def rows_of(s: State, o, board: Board, per_position: int = 6, seed: int = 3):
    """(position, main) pairs to sweep: every position's move-in and trade choices, and up to
    `per_position` of its other legal exact-space main choices, drawn the same way every time."""
    legal = legal_main(o, exact=True)
    gen = torch.Generator().manual_seed(seed)
    position, main = [], []
    for p in range(s.batch):
        choices = legal[p].nonzero()[:, 0]
        choices = choices[torch.randperm(len(choices), generator=gen)[:per_position]]
        position += [p] * len(choices)
        main += choices.tolist()
    return torch.tensor(position), torch.tensor(main)


def widened(s: State, board: Board) -> State:
    """The same positions with 200 more armies on every territory of the seat to move: blitzes,
    fortifies and placements with ranges far wider than the slots."""
    s = s.select(torch.arange(s.batch))
    mine = s.owner.to(torch.int64) == s.active.to(torch.int64)[:, None]
    s.armies = torch.where(mine, s.armies + 200, s.armies)
    s.reinf_to_place = torch.where(s.reinf_present, s.reinf_to_place + 200, s.reinf_to_place)
    return s


def sweep(s: State, board: Board):
    o = options(s, board)
    position, main = rows_of(s, o, board)
    sub, sub_o = s.select(position), o.select(position)
    c = candidates(main, sub, sub_o, board)
    return sub, sub_o, main, c, candidate_moves(main, c, board)


def test_every_exact_candidate_is_a_move_the_engine_accepts():
    board, s, _, _ = positions()
    tables = load_best("cpu")
    tables.scaled_oversize = True
    for state in (s, widened(s, board)):
        sub, sub_o, main, c, moves = sweep(state, board)
        assert bool(c.legal.any(1).all()), "a legal main choice without a legal argument"
        for k in range(SLOTS):
            rows = c.legal[:, k].nonzero()[:, 0]
            if rows.numel():
                # Raises `IllegalMove` on the first move the engine refuses.
                step(sub.select(rows), moves[rows, k], board, tables, legal=sub_o.select(rows))


def test_every_legal_count_and_trade_is_a_candidate_while_it_fits():
    board, s, _, _ = positions()
    seen = set()
    for state in (s, widened(s, board)):
        sub, sub_o, main, c, moves = sweep(state, board)
        rows = torch.arange(len(main))
        source = sub.armies.to(torch.int64)[rows, moves[:, 0, 1].clamp(0, TERRITORIES - 1)]
        for r in range(len(main)):
            kind = int(c.kind[r, -1])
            if kind == C_TRADE:
                cards = sub_o.set_cards[r]
                owner = sub.owner[r].to(torch.int64)
                active = int(sub.active[r])
                expected = set()
                for p in sub_o.sets[r].nonzero()[:, 0].tolist():
                    owned = [int(x) for x in cards[p] if int(x) < TERRITORIES and int(owner[int(x)]) == active]
                    key = tuple(sorted(int(x) for x in cards[p]))
                    expected |= {key + (b,) for b in owned} if len(owned) > 1 else {key + (-1,)}
                got = {tuple(sorted(moves[r, k, 1:4].tolist())) + (int(moves[r, k, 4]),)
                       for k in c.legal[r].nonzero()[:, 0].tolist()}
                assert (got == expected) if len(expected) <= SLOTS else (got < expected and len(got) == SLOTS)
                assert bool(c.overflow[r]) == (len(expected) > SLOTS)
                seen.add(("trade", len(expected) > 1))
                continue
            if kind not in (C_PLACE, C_BLITZ, C_OCCUPY, C_FORTIFY):
                continue
            lo, hi = {
                C_PLACE: (1, int(sub_o.to_place[r])),
                C_BLITZ: (1, int(source[r]) - 1),
                C_OCCUPY: (int(sub_o.occ_min[r]), int(sub_o.occ_max[r])),
                C_FORTIFY: (1, int(sub_o.fortify_max[r, moves[r, 0, 1], moves[r, 0, 2]])),
            }[kind]
            slots = SLOTS - 1 if kind == C_BLITZ else SLOTS
            got = sorted(int(c.number[r, k]) for k in (c.legal[r] & (c.kind[r] == kind)).nonzero()[:, 0].tolist())
            if hi - lo + 1 <= slots:
                assert got == list(range(lo, hi + 1)) and not bool(c.overflow[r]), (kind, lo, hi, got)
            else:
                assert got[0] == lo and got[-1] == hi and len(set(got)) == slots and bool(c.overflow[r]), (kind, lo, hi, got)
            seen.add((kind, hi - lo + 1 > slots))
    # The sweep reached every kind, each in a range that fits and (but for the move-ins, which the
    # widening doesn't reach) one that doesn't.
    assert {(k, wide) for k in (C_PLACE, C_BLITZ, C_FORTIFY) for wide in (False, True)} | {(C_OCCUPY, False), ("trade", True)} <= seen, seen


def test_spread_keeps_both_ends_both_halves_and_distinct_counts_on_any_width():
    for slots in (SLOTS - 1, SLOTS):
        hi = torch.arange(1, 1500)
        values, legal, overflow = spread(torch.ones_like(hi), hi, slots)
        for r in range(len(hi)):
            got, width = values[r][legal[r]].tolist(), int(hi[r])
            assert got == sorted(set(got)) and got[0] == 1 and got[-1] == width, got
            assert len(got) == min(slots, width) and bool(overflow[r]) == (width > slots)
            assert width <= slots or (width // 2 in got and (width + 1) // 2 in got)


def test_a_teachers_move_maps_to_an_exact_target_that_decodes_back_to_it():
    board, s, o, samples = positions()
    move = samples["move"].to(torch.int64)
    main, slot, flagged, c = exact_targets(s, o, move, board, edge_index(board))
    played = decode_exact(main, slot, s, o, board, c)
    same = (normalize(played, s, o) == normalize(move, s, o)).all(1)
    assert bool(same[~flagged].all())
    rows = torch.arange(s.batch)
    max_dice = o.attack_dice[rows, board.edge_id[move[:, 1].clamp(0, 41), move[:, 2].clamp(0, 41)].clamp(min=0)]
    fewer_dice = (move[:, 0] == K_ATTACK) & (move[:, 3] < max_dice)
    # Only what the space can't hold is flagged: fewer dice than the most, or a range past the slots.
    assert bool((flagged == (fewer_dice | (flagged & c.overflow))).all())
    assert bool(legal_main(o, exact=True)[rows, main].all()) and bool(c.legal[rows, slot].all())


def test_an_exact_net_from_a_bucket_checkpoint_keeps_its_trunk_and_main_choice():
    board, s, o, samples = positions(1)
    bucket = random_net(32, 2, 4, 2, board, seed=11)
    exact = Net(32, 2, 4, 2, edges=board.edges, adjacency=board.adjacency, actions="exact")
    init_from(exact, bucket.state_dict())
    node, slot, glob = observe(s, o, samples["placed_on"], samples["attacks"], samples["captured"], board)
    with torch.no_grad():
        theirs = bucket.heads_main(bucket.trunk(node, slot, glob))
        ours = exact.heads_main(exact.trunk(node, slot, glob))
    assert all(torch.equal(a, b) for a, b in zip(theirs, ours))


def test_a_league_of_both_spaces_plays_only_legal_moves(monkeypatch):
    board = Board.load("cpu")
    tables = load_best("cpu")
    tables.scaled_oversize = True

    def checked(*args, **kwargs):
        kwargs["check"] = True
        return step(*args, **kwargs)

    monkeypatch.setattr(env_module, "step", checked)
    torch.manual_seed(2)
    learner = Net(32, 1, 4, 2, edges=board.edges, adjacency=board.adjacency, actions="exact")
    cfg = EnvConfig(batch=24, sizes=(4,), size_weights=(1.0,), pool=8, snapshots=1, record=False, bf16=False,
                    cap_learner=1.0, cap_snapshot=1.0, cap_greedy=1.0)
    env = Env(cfg, board, tables, learner, "cpu", seed_prefix="spaces")
    env.snapshots[0] = random_net(32, 1, 4, 2, board, seed=4)
    env.active_snapshots = 1
    env.kind_probs.zero_()
    env.kind_probs[SNAPSHOT] = 1.0
    env._draw_seats(torch.ones(cfg.batch, dtype=torch.bool))
    seats = env.seat_kind[:, :4]
    assert bool((seats == LEARNER).any()) and bool((seats == SNAPSHOT).any())
    env.run(300)
    stats = env.take_stats()
    assert stats["stalled"] == 0


if __name__ == "__main__":
    # Pins the bucket space's decisions: run only on the code they are to be held to.
    with gzip.open(BUCKETS, "wt") as f:
        json.dump(bucket_decisions(), f, separators=(",", ":"))
