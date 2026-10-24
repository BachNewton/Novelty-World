"""Rule corners lockstep can't reach. The deck never holds fewer than 15 cards in a real game
(INV-6 caps the hands at 5 + 5 + 5 + 5 + 5 + 4), so an empty deck's draw and a card returned into
a deck of 3 or fewer are set up by hand, and checked against `engine/turn.ts` and
`engine/reinforce.ts` as written."""

import math

import pytest
import torch

from riskgpu.board import Board
from riskgpu.canonical import hash_states, state_ints
from riskgpu.data import fixture_paths, load_best
from riskgpu.engine import END_TURN, PLACE, TRADE, IllegalMove, step
from riskgpu.records import read_records
from riskgpu.rng import mulberry32_scalar
from riskgpu.rules import reinforcements
from riskgpu.state import new_games


@pytest.fixture(scope="module")
def board():
    return Board.load("cpu")


@pytest.fixture(scope="module")
def tables():
    return load_best("cpu")


def moves(*rows):
    return torch.tensor([list(r) for r in rows], dtype=torch.int32)


def cards_of(board, symbol, owner_row, seat, owned):
    """Territory cards of a symbol, owned or not by `seat`."""
    return [t for t in range(42) if int(board.card_symbol[t]) == symbol and (int(owner_row[t]) == seat) == owned]


def test_trade_into_a_short_deck(board, tables):
    games = new_games(["short-deck", "short-deck"], [3, 3], board, "cpu")
    g = 0
    seat = int(games.active[g])
    owner = games.owner[g]
    mine = cards_of(board, 0, owner, seat, True)
    theirs = cards_of(board, 0, owner, seat, False)
    hand = [theirs[0], 42, mine[0], theirs[1]]  # trade theirs[1], mine[0], theirs[0]: mine[0] takes the bonus
    deck = [5, 9]
    for b in range(2):
        games.hand[b, seat, :4] = torch.tensor(hand)
        games.hand_len[b, seat] = 4
        games.deck[b] = -1
        games.deck[b, :2] = torch.tensor(deck)
        games.deck_len[b] = 2
    traded = [theirs[1], mine[0], theirs[0]]
    before = games.clone()
    step(games, moves([TRADE, *traded, -1], [PLACE, 0, 0, 0, 0]), board, tables, done=torch.tensor([False, True]))

    # returnToDeck, card by card in the move's order.
    rng = int(before.rng[g])
    expected_deck = list(deck)
    for card in traded:
        r, rng = mulberry32_scalar(rng)
        lowest = 3 if len(expected_deck) > 3 else 0
        at = lowest + math.floor(r * (len(expected_deck) - lowest + 1))
        expected_deck.insert(at, card)
    assert int(games.rng[g]) == rng
    assert games.deck[g, : games.deck_len[g]].tolist() == expected_deck
    assert games.hand[g, seat, : games.hand_len[g, seat]].tolist() == [42]
    assert int(games.reinf_to_place[g]) == int(before.reinf_to_place[g]) + 4
    assert int(games.armies[g, mine[0]]) == int(before.armies[g, mine[0]]) + 2
    assert int(games.trades[g]) == 1
    # The done game is untouched.
    assert torch.equal(state_ints(games)[1], state_ints(before)[1])


def test_end_turn_with_an_empty_deck(board, tables):
    games = new_games(["empty-deck"], [4], board, "cpu")
    games.phase[0] = 2
    games.reinf_present[0] = False
    games.captured_this_turn[0] = True
    games.deck[0] = -1
    games.deck_len[0] = 0
    order = games.turn_order[0].tolist()
    step(games, moves([END_TURN, 0, 0, 0, 0]), board, tables)
    assert int(games.hand_len[0, order[0]]) == 0
    assert int(games.active[0]) == order[1] and int(games.turn[0]) == 2 and int(games.phase[0]) == 0
    assert not bool(games.captured_this_turn[0])


def test_round_wraps_past_eliminated_seats(board, tables):
    games = new_games(["wrap"], [6], board, "cpu")
    order = games.turn_order[0].tolist()
    # The last seat in turn order is to move; the first two are out.
    games.eliminated[0, order[0]] = True
    games.eliminated[0, order[1]] = True
    games.active[0] = order[5]
    games.phase[0] = 2
    games.reinf_present[0] = False
    step(games, moves([END_TURN, 0, 0, 0, 0]), board, tables)
    assert int(games.active[0]) == order[2]
    assert int(games.round[0]) == 1
    # No first-turn bonus once the round has wrapped.
    assert int(games.reinf_to_place[0]) == int(reinforcements(games.owner, games.active, board)[0])


def test_illegal_moves_raise_naming_the_game_before_touching_any(board, tables):
    games = new_games(["a", "b"], [3, 3], board, "cpu")
    own = int((games.owner[0] == games.active[0]).to(torch.int64).argmax())
    enemy = int((games.owner[1] != games.active[1]).to(torch.int64).argmax())
    before = state_ints(games)
    with pytest.raises(IllegalMove, match="territory you own") as e:
        step(games, moves([PLACE, own, 1, 0, 0], [PLACE, enemy, 1, 0, 0]), board, tables)
    assert e.value.game == 1
    with pytest.raises(IllegalMove, match="not one of this phase") as e:
        step(games, moves([END_TURN, 0, 0, 0, 0], [PLACE, enemy, 1, 0, 0]), board, tables)
    assert e.value.game == 0
    assert torch.equal(state_ints(games), before), "a refused step touched a game"


def test_trade_needs_a_named_bonus_when_two_qualify(board, tables):
    games = new_games(["bonus"], [3], board, "cpu")
    seat = int(games.active[0])
    mine = cards_of(board, 1, games.owner[0], seat, True)
    games.hand[0, seat, :3] = torch.tensor(mine[:3])
    games.hand_len[0, seat] = 3
    deck = [c for c in games.deck[0].tolist() if c not in mine[:3]]
    games.deck[0] = -1
    games.deck[0, : len(deck)] = torch.tensor(deck)
    games.deck_len[0] = len(deck)
    with pytest.raises(IllegalMove, match="choose which territory"):
        step(games, moves([TRADE, *mine[:3], -1]), board, tables)
    with pytest.raises(IllegalMove, match="cannot take"):
        step(games, moves([TRADE, *mine[:3], (set(range(42)) - set(mine[:3])).pop()]), board, tables)
    to_place = int(games.reinf_to_place[0])
    armies = int(games.armies[0, mine[1]])
    step(games, moves([TRADE, *mine[:3], mine[1]]), board, tables)
    assert int(games.reinf_to_place[0]) == to_place + 6 and int(games.hand_len[0, seat]) == 0
    assert int(games.armies[0, mine[1]]) == armies + 2


def test_unchecked_steps_play_the_same_game(board, tables):
    """`check=False` skips only the validation: a record's moves land on the same states."""
    record = min((r for path in fixture_paths() for r in read_records(path)), key=lambda r: len(r["moves"]))
    games = new_games([record["seed"]], [record["players"]], board, "cpu")
    for k, (_, *move) in enumerate(record["moves"]):
        step(games, moves(move), board, tables, check=False)
        assert hash_states(games)[0] == record["stateHashes"][k], k
