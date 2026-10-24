"""GD-lite against the TypeScript GD port: the committed GD fixtures replayed as one batch, and at
every decision a GD seat made, GD-lite asked the same position (the same turn so far, the same
decision seed) compared with the recorded move, by decision kind."""

import os
from collections import Counter

import pytest
import torch

from riskgpu.board import Board
from riskgpu.bots.gd import GD_BOTS
from riskgpu.bots.gd_cards import best_card_match, bonus_territory_of
from riskgpu.bots.gd_choice import apply_step_variance, iterative_array
from riskgpu.data import FIXTURES, load_best
from riskgpu.engine import step
from riskgpu.options import options
from riskgpu.records import read_records
from riskgpu.rng import bot_seed, xmur3
from riskgpu.runner import Decision, TurnLog
from riskgpu.state import new_games

FILES = ("gd-5p", "gd-greedy-3p")
KINDS = {0: "place", 1: "trade", 3: "attack", 5: "attack", 4: "occupy", 6: "fortify", 7: "fortify"}


def replay_gd(records: list[dict], board: Board, tables) -> tuple[Counter, list[str]]:
    """Each record's GD decisions compared: the count per kind, and every disagreement described."""
    batch = len(records)
    s = new_games([r["seed"] for r in records], [r["players"] for r in records], board, "cpu")
    labels = [r["bots"] + [""] * (6 - r["players"]) for r in records]
    log = TurnLog.empty(batch, "cpu")
    seeds = [bot_seed(r["seed"]) for r in records]
    humans = torch.zeros(batch, 6, dtype=torch.bool)
    compared: Counter = Counter()
    disagreements: list[str] = []
    for decision in range(max(len(r["moves"]) for r in records)):
        live = torch.tensor([decision < len(r["moves"]) for r in records])
        recorded = torch.tensor([r["moves"][decision][1:] if decision < len(r["moves"]) else [0] * 5 for r in records])
        legal = options(s, board)
        d = Decision(s, legal, board, tables, log, torch.full((batch,), decision, dtype=torch.int64), humans, seeds)
        active = s.active.tolist()
        seated = [labels[g][active[g]] for g in range(batch)]
        for label, bot in GD_BOTS.items():
            mine = live & torch.tensor([seat == label for seat in seated])
            if not bool(mine.any()):
                continue
            ours = bot(d, mine).to(torch.int64)
            for g in mine.nonzero()[:, 0].tolist():
                kind = KINDS[int(recorded[g, 0])]
                compared[kind] += 1
                if ours[g].tolist() != recorded[g].tolist():
                    disagreements.append(
                        f"{kind}: {records[g]['seed']} ({label}) decision {decision}: "
                        f"GD-lite {ours[g].tolist()}, recorded {recorded[g].tolist()}"
                    )
        before = s.clone()
        step(s, recorded, board, tables, done=~live, legal=legal)
        log.update(before, s, recorded, live)
    return compared, disagreements


def test_gd_lite_agrees_with_the_recorded_gd_moves():
    board, tables = Board.load("cpu"), load_best("cpu")
    records = [r for name in FILES for r in read_records(os.path.join(FIXTURES, f"{name}.jsonl.gz"))]
    compared, disagreements = replay_gd(records, board, tables)
    wrong = Counter(line.split(":")[0] for line in disagreements)
    for kind in sorted(compared):
        print(f"{kind:8} {compared[kind] - wrong[kind]:5} / {compared[kind]:5}")
    print("\n".join(disagreements))
    # Every one of the 2,267 GD decisions in the fixtures agrees: attack 1,013, occupy 506, place
    # 448, fortify 232, trade 68. Nothing differs in the last bit on these games, so the port is
    # held to all of them; a near-tie that ever does differ is to be shown as one before this
    # is loosened.
    assert sum(compared.values()) == 2267
    assert disagreements == []


# The fixtures never place 100 armies or more at once (so no amount is jittered) and never find no
# territory worth placing on, and each hand they trade is one of few; these pin those paths to the
# TypeScript's own answers, worked out by `bots/gd/choice.ts` and `cards.ts`.


def test_iterative_array_spreads_100_amounts_past_100():
    # (start, end): the amounts' sum and the variance, from `iterativeArray`.
    for start, end, total, variance in ((1, 250, 12550, 1), (3, 402, 20250, 2), (1, 100, 5050, 0), (2, 101, 5150, 0)):
        amounts, listed, v = iterative_array(torch.tensor([start]), torch.tensor([end]))
        assert int(amounts[listed].sum()) == total and int(v[0]) == variance, (start, end)
    amounts, _, _ = iterative_array(torch.tensor([1, 3]), torch.tensor([250, 402]))
    assert amounts[0, :6].tolist() == [1, 4, 6, 9, 11, 14]
    assert amounts[1, -4:].tolist() == [390, 394, 398, 402]


def test_apply_step_variance_draws_as_the_typescript():
    # (value, min, max, variance, the decision seed's string, `applyStepVariance`'s answer)
    cases = [(1, 1, 250, 1, "s1", 1), (250, 1, 250, 1, "s2", 250), (120, 1, 250, 1, "s3", 120), (0, 1, 402, 2, "s4", 1),
             (400, 3, 402, 2, "s5", 400), (200, 3, 402, 2, "s6", 198), (5, 1, 9, 0, "s7", 5), (0, 1, 9, 0, "s8", 1)]
    value, low, high, variance = (torch.tensor([c[k] for c in cases]) for k in range(4))
    seed = torch.tensor([xmur3(c[4]) for c in cases])
    got, draws = apply_step_variance(value, low, high, variance, seed, torch.zeros_like(value))
    assert got.tolist() == [c[5] for c in cases]
    assert draws.tolist() == (variance > 0).to(torch.int64).tolist()


# (hand as card indices, the territories the trader owns, `bestCardMatch`'s set or None,
# `bonusTerritoryOf`'s territory or −1), from random hands of 3 to 9 cards.
HANDS = [
    [[27, 23, 1, 19, 37], [3, 4, 5, 10, 11, 16, 18, 20, 21, 23, 31, 34, 39, 41], [27, 1, 19], -1],
    [[19, 32, 10, 15, 21, 41, 22, 0, 24], [1, 3, 4, 9, 10, 11, 12, 14, 15, 16, 17, 19, 20, 23, 27, 31, 33, 34, 35, 37, 41], [32, 10, 22], 10],
    [[30, 6, 26, 29, 41, 2, 39], [4, 7, 8, 9, 14, 15, 19, 23, 24, 25, 27, 31, 37, 38], [26, 29, 2], -1],
    [[18, 39, 22, 8, 25, 35], [1, 4, 8, 9, 14, 15, 21, 24, 25, 26, 27, 29, 30, 35, 41], [25, 18, 22], 25],
    [[27, 37, 24, 43, 30, 25, 8, 1, 26], [0, 2, 3, 4, 11, 13, 16, 17, 20, 23, 27, 28, 32, 33, 36, 38, 40], [30, 8, 27], 27],
    [[28, 32, 3], [2, 6, 10, 12, 13, 14, 16, 24, 25, 32, 33, 41], None, -1],
    [[6, 10, 37, 41, 35, 33, 13, 25], [5, 6, 8, 13, 15, 16, 26, 30, 31, 36, 39, 41], [6, 10, 37], 6],
    [[16, 34, 29, 19, 14], [1, 3, 4, 5, 7, 8, 10, 15, 16, 20, 23, 25, 29, 30, 34, 35, 40, 41], [34, 29, 14], 34],
    [[10, 20, 14, 31, 16, 29, 7, 1], [1, 3, 4, 6, 7, 8, 9, 11, 16, 24, 25, 26, 27, 28, 31, 38, 39, 40, 41], [20, 10, 31], 31],
    [[41, 0, 39, 3, 22, 14], [6, 10, 16, 21, 23, 25, 29, 31, 32, 34, 35, 37, 38, 40], [41, 39, 22], -1],
    [[42, 19, 4], [0, 3, 5, 8, 10, 11, 14, 15, 17, 19, 22, 25, 31, 32, 34, 38, 39, 41], [19, 4, 42], 19],
    [[32, 34, 23, 20, 22], [7, 9, 12, 15, 20, 21, 22, 25, 26, 27, 34, 36, 39, 41], [32, 22, 23], 22],
    [[6, 16, 33, 9], [3, 4, 7, 10, 13, 15, 16, 21, 26, 28, 30, 35, 38, 40, 41], [6, 16, 9], 16],
    [[19, 6, 20, 8, 5, 30, 2], [0, 2, 4, 7, 10, 12, 14, 15, 17, 21, 23, 26, 29, 33, 34, 36, 38], [6, 19, 2], 2],
    [[36, 16, 14, 2, 31, 32], [2, 5, 6, 8, 9, 10, 11, 16, 22, 23, 28, 35, 36, 40], [16, 31, 32], 16],
    [[8, 27, 41, 26], [1, 4, 6, 7, 11, 12, 15, 17, 22, 25, 26, 27, 28, 29, 37, 39], [41, 8, 27], 27],
    [[29, 11, 20, 28], [1, 2, 7, 12, 18, 30, 32, 35, 38, 40, 41], [20, 29, 11], -1],
    [[13, 17, 12, 31, 28, 29, 5], [1, 4, 8, 10, 12, 14, 17, 18, 21, 26, 28, 29, 32, 33, 36, 38, 39, 40], [13, 12, 31], 12],
    [[5, 34, 36, 42, 26], [2, 3, 4, 6, 8, 13, 16, 20, 23, 27, 33, 37, 38, 40], [36, 34, 5], -1],
    [[7, 34, 16, 31, 8, 23, 2, 24, 14], [2, 4, 10, 13, 15, 18, 21, 27, 29, 33, 39, 41], [7, 31, 24], -1],
    [[14, 12, 35, 29, 13, 32, 21], [0, 1, 5, 8, 17, 20, 27, 28, 30, 31, 33, 34], [13, 14, 35], -1],
    [[38, 35, 5, 40], [1, 3, 4, 9, 10, 11, 12, 14, 16, 21, 22, 23, 24, 25, 27, 29, 30, 32, 33, 37], [35, 5, 40], -1],
    [[1, 7, 40], [0, 2, 3, 7, 8, 13, 14, 15, 22, 25, 30, 35, 40], [1, 7, 40], 7],
    [[38, 18, 14, 21, 19, 9], [4, 7, 10, 11, 15, 25, 26, 27, 30, 33, 35, 36, 39, 41], [21, 38, 19], -1],
    [[41, 18, 35], [1, 5, 6, 7, 16, 17, 19, 21, 22, 25, 26, 28, 30, 32, 38], [41, 18, 35], -1],
    [[43, 1, 9], [6, 8, 10, 11, 14, 18, 22, 24, 25, 27, 30, 31, 33, 35, 36, 37, 40], [1, 9, 43], -1],
    [[36, 13, 11, 33, 9, 4, 24, 7], [1, 14, 15, 16, 18, 27, 29, 30, 31, 32, 36, 40], [11, 9, 4], -1],
    [[12, 27, 39, 37, 16], [1, 2, 7, 8, 9, 10, 11, 19, 26, 27, 29, 36, 41], [12, 39, 16], -1],
    [[30, 25, 28, 27, 35, 22, 12, 17, 39], [1, 2, 3, 5, 9, 11, 12, 13, 14, 18, 19, 20, 22, 23, 29, 34, 35, 36, 37, 38, 39, 41], [30, 27, 12], 12],
    [[21, 3, 24, 36, 8, 1], [3, 7, 8, 10, 13, 16, 17, 22, 25, 27, 29, 30, 31, 32, 35, 36, 37, 39, 40], [21, 8, 24], 8],
    [[28, 0, 38, 12, 23, 21, 15, 33, 6], [0, 1, 4, 6, 7, 8, 14, 17, 20, 24, 25, 27, 29, 31, 32, 33, 34, 37, 38, 39], [0, 28, 15], 0],
    [[7, 36, 30, 27], [2, 3, 10, 14, 19, 20, 22, 23, 30, 36], None, -1],
    [[6, 4, 41, 26, 5, 2, 19, 1], [1, 3, 5, 8, 9, 12, 13, 20, 23, 24, 25, 28, 31, 34, 37, 38, 39, 40], [6, 26, 5], 5],
    [[2, 9, 40, 19, 1], [2, 4, 6, 7, 8, 11, 16, 17, 19, 22, 27, 29, 30, 32, 34, 36, 37, 39, 40], [9, 19, 1], 19],
    [[23, 0, 41, 7, 3, 16, 8, 24], [0, 3, 5, 8, 10, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 30, 34, 37, 39, 40], [23, 7, 41], 23],
    [[7, 2, 34, 40, 10, 27], [1, 5, 6, 9, 12, 14, 20, 22, 23, 25, 26, 29, 31, 34, 35, 37, 39, 41], [7, 40, 27], -1],
    [[41, 5, 29], [1, 3, 6, 18, 20, 21, 23, 27, 31, 32, 35, 37, 38, 40, 41], [41, 29, 5], 41],
    [[38, 23, 22, 33, 18], [1, 3, 4, 7, 12, 14, 21, 25, 28, 32, 33, 34, 36, 40], [33, 38, 22], 33],
    [[39, 2, 28, 20], [0, 1, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 20, 21, 23, 24, 26, 28, 30, 31, 32, 33, 36, 37, 39, 40], [39, 2, 28], 39],
    [[12, 40, 3, 0, 26, 6, 7], [1, 7, 8, 13, 14, 19, 25, 32, 35, 36, 39, 41], [3, 12, 7], 7],
    [[11, 30, 41, 17, 18, 15], [4, 5, 7, 11, 14, 18, 21, 26, 31, 32, 34, 35, 37], [30, 18, 15], 18],
    [[5, 40, 42, 25], [1, 6, 7, 8, 13, 18, 19, 22, 23, 24, 25, 26, 27, 34, 40], [25, 42, 5], 25],
    [[23, 21, 40, 18], [3, 5, 6, 7, 14, 16, 17, 20, 24, 25, 37, 39], [21, 23, 40], -1],
    [[34, 23, 28, 16, 29, 12, 0], [0, 1, 3, 5, 6, 7, 9, 10, 13, 14, 17, 21, 24, 29, 35, 36, 38, 39, 40, 41], [23, 28, 29], 29],
    [[35, 33, 26, 4, 43], [3, 5, 7, 9, 12, 23, 29, 32, 36, 38, 40], [33, 26, 35], -1],
    [[26, 29, 2], [0, 2, 3, 4, 11, 12, 13, 19, 24, 25, 28, 34, 36], [26, 29, 2], 2],
]


def test_best_card_match_and_its_bonus_as_the_typescript():
    board = Board.load("cpu")
    hand = torch.full((len(HANDS), 12), -1)
    owner = torch.ones(len(HANDS), 42, dtype=torch.int64)
    for g, (cards, owned, _, _) in enumerate(HANDS):
        hand[g, : len(cards)] = torch.tensor(cards)
        owner[g, owned] = 0
    territory = board.card_territory[hand.clamp(min=0)]
    owns = (hand >= 0) & (territory >= 0) & (owner.gather(1, territory.clamp(min=0)) == 0)
    cards, has_set = best_card_match(hand, owns, board)
    bonus = bonus_territory_of(cards, torch.zeros(len(HANDS), dtype=torch.int64), owner, board)
    for g, (_, _, want, want_bonus) in enumerate(HANDS):
        assert bool(has_set[g]) == (want is not None), g
        if want is not None:
            assert (cards[g].tolist(), int(bonus[g])) == (want, want_bonus), g


# `survey-gd5-18` (gd-defensive, gd-continental, gd-aggressive, gd-stacker, gd-defensive), as the
# reference engine played it: its first 475 moves (kind, x, y, z, w). At decision 475 Stacker
# blitzes from 15, and its two best targets, 16 and 13, score within the last bit of each other: a
# division by a number that CUDA rounds as a product with the reciprocal turned the tie to 13.
SURVEY_GD5_18 = [[int(v) for v in move.split(",")] for move in (
    "0,9,3,0,0 3,9,10,1,0 4,4,0,0,0 3,11,20,1,0 4,4,0,0,0 5,0,0,0,0 6,10,9,2,0 0,34,3,0,0 3,33,26,1,0 "
    "3,12,11,1,0 5,0,0,0,0 6,34,37,2,0 0,4,3,0,0 3,17,14,1,0 3,4,6,1,0 3,14,13,1,0 3,16,15,1,0 5,0,0,0,0 "
    "6,40,39,2,0 0,27,4,0,0 3,27,26,1,0 4,9,0,0,0 3,26,34,1,0 4,8,0,0,0 3,34,33,1,0 4,7,0,0,0 3,33,36,1,0 "
    "4,5,0,0,0 5,0,0,0,0 6,36,31,4,0 0,29,3,0,0 0,25,2,0,0 3,25,24,1,0 3,29,30,1,0 4,4,0,0,0 3,2,4,1,0 "
    "4,4,0,0,0 5,0,0,0,0 6,5,2,4,0 0,10,3,0,0 3,10,12,1,0 4,4,0,0,0 3,20,17,1,0 3,19,16,1,0 4,3,0,0,0 "
    "5,0,0,0,0 6,12,9,1,0 0,11,3,0,0 3,11,10,1,0 4,3,0,0,0 3,37,36,1,0 4,4,0,0,0 3,36,33,1,0 5,0,0,0,0 "
    "6,33,36,1,0 0,15,3,0,0 3,15,19,1,0 3,39,38,1,0 3,19,26,1,0 5,0,0,0,0 6,6,3,1,0 0,31,3,0,0 "
    "3,31,32,1,0 4,10,0,0,0 3,32,29,1,0 4,9,0,0,0 3,29,30,1,0 4,7,0,0,0 5,0,0,0,0 6,30,29,6,0 0,24,3,0,0 "
    "3,24,23,1,0 4,4,0,0,0 3,23,20,1,0 3,20,18,1,0 3,2,1,1,0 4,4,0,0,0 3,1,0,1,0 5,0,0,0,0 6,4,2,2,0 "
    "0,12,3,0,0 3,12,11,1,0 4,4,0,0,0 3,11,20,1,0 3,9,8,1,0 5,0,0,0,0 6,20,11,1,0 0,10,3,0,0 3,10,12,1,0 "
    "4,4,0,0,0 5,0,0,0,0 6,12,10,2,0 0,40,3,0,0 3,40,38,1,0 4,4,0,0,0 3,38,37,1,0 3,37,34,1,0 5,0,0,0,0 "
    "6,3,6,1,0 0,29,3,0,0 3,29,0,1,0 4,6,0,0,0 3,0,1,1,0 4,5,0,0,0 5,0,0,0,0 6,28,1,2,0 0,4,3,0,0 "
    "3,41,39,1,0 3,4,3,1,0 4,4,0,0,0 3,3,0,1,0 5,0,0,0,0 6,2,0,2,0 0,11,3,0,0 3,11,12,1,0 3,17,14,1,0 "
    "5,0,0,0,0 7,0,0,0,0 1,33,43,9,33 0,36,8,0,0 0,10,3,0,0 0,33,2,0,0 3,10,12,1,0 3,36,35,1,0 4,5,0,0,0 "
    "5,0,0,0,0 6,33,36,3,0 0,22,3,0,0 3,22,21,1,0 4,3,0,0,0 3,21,18,1,0 5,0,0,0,0 7,0,0,0,0 1,27,37,24,27 "
    "0,1,11,0,0 3,1,2,1,0 4,15,0,0,0 3,2,5,1,0 4,14,0,0,0 3,5,7,1,0 4,13,0,0,0 3,7,4,1,0 4,11,0,0,0 "
    "3,4,3,1,0 4,9,0,0,0 3,3,6,1,0 4,7,0,0,0 5,0,0,0,0 6,6,3,6,0 1,11,31,42,-1 0,39,7,0,0 0,0,3,0,0 "
    "0,23,1,0,0 3,0,1,1,0 4,6,0,0,0 3,1,2,1,0 4,4,0,0,0 3,2,5,1,0 5,0,0,0,0 7,0,0,0,0 1,41,40,14,14 "
    "0,16,9,0,0 0,20,3,0,0 0,14,1,0,0 3,16,18,1,0 4,8,0,0,0 3,14,13,1,0 4,4,0,0,0 3,18,19,1,0 4,5,0,0,0 "
    "3,16,15,1,0 5,0,0,0,0 6,15,19,2,0 0,33,3,0,0 3,12,11,1,0 3,33,34,1,0 5,0,0,0,0 7,0,0,0,0 0,22,3,0,0 "
    "3,22,25,1,0 3,25,24,1,0 5,0,0,0,0 6,24,22,1,0 0,3,3,0,0 3,3,0,1,0 4,9,0,0,0 3,0,1,1,0 4,7,0,0,0 "
    "3,1,2,1,0 4,5,0,0,0 5,0,0,0,0 6,27,2,2,0 0,23,3,0,0 3,23,24,1,0 4,4,0,0,0 3,24,25,1,0 3,39,38,1,0 "
    "4,7,0,0,0 3,38,40,1,0 4,3,0,0,0 5,0,0,0,0 6,40,38,2,0 0,18,5,0,0 0,19,3,0,0 3,19,26,1,0 4,6,0,0,0 "
    "3,18,21,1,0 4,5,0,0,0 3,20,23,1,0 4,4,0,0,0 3,23,24,1,0 5,0,0,0,0 6,26,18,4,0 0,34,3,0,0 3,34,31,1,0 "
    "4,4,0,0,0 3,31,32,1,0 3,36,37,1,0 4,4,0,0,0 5,0,0,0,0 7,0,0,0,0 1,28,23,12,-1 0,22,5,0,0 0,22,3,0,0 "
    "0,22,1,0,0 3,22,25,1,0 4,5,0,0,0 3,22,20,1,0 4,4,0,0,0 3,20,17,1,0 3,25,24,1,0 3,24,23,1,0 5,0,0,0,0 "
    "6,23,20,1,0 0,2,4,0,0 3,2,5,1,0 4,8,0,0,0 6,5,2,7,0 0,38,3,0,0 0,38,2,0,0 3,38,37,1,0 4,8,0,0,0 "
    "3,37,36,1,0 4,5,0,0,0 5,0,0,0,0 6,39,38,1,0 0,18,3,0,0 3,18,17,1,0 4,5,0,0,0 3,17,20,1,0 4,4,0,0,0 "
    "3,20,23,1,0 5,0,0,0,0 7,0,0,0,0 0,11,3,0,0 3,11,9,1,0 4,4,0,0,0 3,9,8,1,0 3,35,22,1,0 4,4,0,0,0 "
    "5,0,0,0,0 7,0,0,0,0 1,19,1,15,-1 0,24,7,0,0 0,24,3,0,0 0,24,1,0,0 3,24,23,1,0 4,8,0,0,0 3,23,20,1,0 "
    "4,6,0,0,0 3,20,11,1,0 4,3,0,0,0 5,0,0,0,0 6,11,20,1,0 1,22,31,43,-1 0,2,12,0,0 3,2,13,1,0 4,18,0,0,0 "
    "3,13,15,1,0 4,16,0,0,0 3,15,19,1,0 4,15,0,0,0 3,19,16,1,0 4,14,0,0,0 3,16,18,1,0 4,9,0,0,0 "
    "3,18,17,1,0 4,8,0,0,0 5,0,0,0,0 7,0,0,0,0 0,37,3,0,0 0,36,2,0,0 3,36,35,1,0 4,5,0,0,0 3,35,33,1,0 "
    "4,3,0,0,0 3,33,19,1,0 3,37,34,1,0 3,34,31,1,0 5,0,0,0,0 6,36,33,1,0 1,29,2,39,-1 0,26,5,0,0 "
    "0,21,3,0,0 0,14,1,0,0 3,26,27,1,0 4,5,0,0,0 3,27,28,1,0 3,28,29,1,0 5,0,0,0,0 7,0,0,0,0 1,42,8,11,8 "
    "0,22,8,0,0 0,12,4,0,0 0,12,1,0,0 3,12,11,1,0 4,5,0,0,0 3,22,25,1,0 4,5,0,0,0 3,22,20,1,0 5,0,0,0,0 "
    "6,11,25,4,0 0,24,3,0,0 3,24,22,1,0 4,5,0,0,0 3,22,20,1,0 4,4,0,0,0 5,0,0,0,0 6,23,24,1,0 0,17,4,0,0 "
    "3,17,14,1,0 4,11,0,0,0 6,14,15,10,0 1,16,10,23,-1 0,19,6,0,0 0,35,3,0,0 0,31,2,0,0 3,31,27,1,0 "
    "3,19,26,1,0 4,3,0,0,0 3,27,28,1,0 5,0,0,0,0 6,26,28,2,0 0,29,3,0,0 3,21,22,1,0 4,6,0,0,0 3,29,30,1,0 "
    "4,3,0,0,0 5,0,0,0,0 7,0,0,0,0 0,11,3,0,0 0,11,2,0,0 3,25,24,1,0 4,6,0,0,0 3,24,23,1,0 4,4,0,0,0 "
    "3,8,6,1,0 5,0,0,0,0 7,0,0,0,0 0,20,3,0,0 3,20,21,1,0 4,3,0,0,0 5,0,0,0,0 6,21,20,1,0 0,15,4,0,0 "
    "3,15,19,1,0 4,12,0,0,0 3,19,26,1,0 4,11,0,0,0 3,26,27,1,0 4,10,0,0,0 3,27,30,1,0 4,9,0,0,0 "
    "3,30,29,1,0 4,6,0,0,0 3,29,31,1,0 4,5,0,0,0 5,0,0,0,0 7,0,0,0,0 0,33,3,0,0 0,35,2,0,0 3,35,21,1,0 "
    "4,4,0,0,0 3,28,27,1,0 3,33,26,1,0 4,4,0,0,0 3,21,20,1,0 1,6,39,19,39 0,20,6,0,0 0,21,3,0,0 "
    "0,27,1,0,0 3,20,22,1,0 4,4,0,0,0 1,13,38,40,38 0,28,6,0,0 0,20,3,0,0 0,22,1,0,0 3,28,29,1,0 "
    "4,5,0,0,0 3,29,32,1,0 5,0,0,0,0 6,38,35,3,0 0,11,3,0,0 0,6,2,0,0 3,11,20,1,0 4,6,0,0,0 3,6,3,1,0 "
    "4,4,0,0,0 5,0,0,0,0 7,0,0,0,0 0,31,10,0,0 3,31,32,1,0 4,12,0,0,0 3,32,29,1,0 4,10,0,0,0 3,29,28,1,0 "
    "4,7,0,0,0 3,28,27,1,0 4,6,0,0,0 3,27,34,1,0 4,5,0,0,0 3,34,37,1,0 4,4,0,0,0 5,0,0,0,0 7,0,0,0,0 "
    "0,21,3,0,0 0,38,2,0,0 3,26,19,1,0 3,19,15,1,0 3,21,18,1,0 4,5,0,0,0 3,18,17,1,0 4,4,0,0,0 5,0,0,0,0 "
    "6,35,22,4,0 0,20,3,0,0 0,3,2,0,0 3,20,21,1,0 4,5,0,0,0 5,0,0,0,0 7,0,0,0,0 0,37,5,0,0 3,37,36,1,0 "
    "4,7,0,0,0 3,36,35,1,0 4,5,0,0,0 3,35,33,1,0 4,4,0,0,0 3,33,26,1,0 5,0,0,0,0 7,0,0,0,0 0,15,3,0,0 "
    "0,38,2,0,0 3,15,13,1,0 4,4,0,0,0 3,13,14,1,0 3,14,16,1,0 5,0,0,0,0 6,39,38,2,0 1,26,12,14,12 "
    "0,21,7,0,0 0,20,3,0,0 0,3,2,0,0 3,21,22,1,0 4,4,0,0,0 3,20,18,1,0 4,4,0,0,0 5,0,0,0,0 6,23,20,3,0 "
    "1,34,16,39,34 0,26,19,0,0 3,26,19,1,0 4,21,0,0,0 3,19,15,1,0 4,20,0,0,0 "
).split()]


@pytest.mark.parametrize("device", ["cpu", pytest.param("cuda", marks=pytest.mark.skipif(
    not torch.cuda.is_available(), reason="no CUDA device"))])
def test_a_last_bit_tie_breaks_as_the_typescript_on_every_device(device):
    board = Board.load(device)
    tables = load_best(device)
    s = new_games(["survey-gd5-18"], [5], board, device)
    log = TurnLog.empty(1, device)
    everyone = torch.ones(1, dtype=torch.bool, device=device)
    for move in SURVEY_GD5_18:
        recorded = torch.tensor([move], device=device)
        before = s.clone()
        step(s, recorded, board, tables)
        log.update(before, s, recorded, everyone)
    d = Decision(s, options(s, board), board, tables, log, torch.full((1,), 475, device=device),
                 torch.zeros(1, 6, dtype=torch.bool, device=device), [bot_seed("survey-gd5-18")])
    assert int(s.active[0]) == 3
    assert GD_BOTS["gd-stacker"](d, everyone)[0].tolist() == [3, 15, 16, 1, 0]
