import torch

from riskgpu.board import Board
from riskgpu.canonical import hash_options, options_ints
from riskgpu.options import TRIPLES, is_valid_set, options, set_value
from riskgpu.state import new_games

# `hashOf(canonicalOptions(options(newGame({ players }, seed))))` from `eval/gpu-canonical.ts`.
PINS = {("fx-0", 3): "565bb726c402e145", ("fx-1", 6): "cc9cab2757fad1d9"}


def test_first_options_match_typescript():
    board = Board.load("cpu")
    games = new_games([k[0] for k in PINS], [k[1] for k in PINS], board, "cpu")
    assert dict(zip(PINS, hash_options(options(games, board)))) == PINS


def test_layout_lengths_by_kind():
    board = Board.load("cpu")
    games = new_games(["a", "b", "c", "d"], [3, 3, 3, 3], board, "cpu")
    games.phase[1] = 1
    games.phase[2] = 1
    games.occ_present[2] = True
    games.phase[3] = 2
    lengths = [len(row) for row in options_ints(options(games, board))]
    assert lengths == [1 + 1 + 1 + 1 + 42 + 1 + 0 + 42, 1 + 166, 1 + 4, 1 + 42 * 42]


def test_triples_in_sets_in_order():
    assert TRIPLES[:3].tolist() == [[0, 1, 2], [0, 1, 3], [0, 1, 4]]
    assert TRIPLES[-1].tolist() == [9, 10, 11]


def test_sets_and_values():
    board = Board.load("cpu")
    by_symbol = {k: [t for t in range(42) if int(board.card_symbol[t]) == k] for k in range(3)}
    inf, cav, art = by_symbol[0], by_symbol[1], by_symbol[2]
    wild = 42
    cases = [
        ([inf[0], inf[1], inf[2]], True, 4),
        ([cav[0], cav[1], cav[2]], True, 6),
        ([art[0], art[1], art[2]], True, 8),
        ([inf[0], cav[0], art[0]], True, 10),
        ([cav[0], cav[1], wild], True, 6),
        ([wild, art[0], art[1]], True, 8),
        ([inf[0], cav[0], wild], True, 10),
        ([inf[0], wild, wild + 1], True, 10),
        ([inf[0], inf[1], cav[0]], False, None),
    ]
    cards = torch.tensor([c for c, _, _ in cases])
    assert is_valid_set(cards, board).tolist() == [v for _, v, _ in cases]
    values = set_value(cards, board).tolist()
    assert [v for v, (_, ok, _) in zip(values, cases) if ok] == [x for _, ok, x in cases if ok]
