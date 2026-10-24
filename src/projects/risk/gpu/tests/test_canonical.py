from riskgpu.board import Board
from riskgpu.canonical import hash_states, state_bytes
from riskgpu.state import new_games


def test_layout_length():
    # players, rng, turnOrder[6], owner[42], armies[42], 6 × (handLen + hand[12]), deckLen, deck[44],
    # tradesCount, eliminated[6], turn, round, active, phase, reinforce (4), occupying (6),
    # capturedThisTurn, winner: 4 bytes each.
    ints = 1 + 1 + 6 + 42 + 42 + 6 * 13 + 1 + 44 + 1 + 6 + 4 + 4 + 6 + 1 + 1
    games = new_games(["fx-0"], [3], Board.load("cpu"), "cpu")
    (b,) = state_bytes(games)
    assert len(b) == ints * 4


def test_fields_land_where_the_layout_puts_them():
    games = new_games(["fx-0"], [3], Board.load("cpu"), "cpu")
    (b,) = state_bytes(games)
    word = [int.from_bytes(b[k : k + 4], "little", signed=True) for k in range(0, len(b), 4)]
    assert word[0] == 3
    assert int.from_bytes(b[4:8], "little") == int(games.rng[0])
    assert word[2:8] == games.turn_order[0].tolist()[:3] + [-1, -1, -1]
    assert word[8:50] == games.owner[0].tolist()
    assert word[50:92] == games.armies[0].tolist()
    assert word[92:105] == [0] + [-1] * 12
    assert word[170] == 44 and word[171:215] == games.deck[0].tolist()
    assert word[-16:-12] == [1, 0, int(games.active[0]), 0]
    assert word[-12:-8] == [1, int(games.reinf_to_place[0]), 0, 0]
    assert word[-2:] == [0, -1]
    assert word[-8:-2] == [0, -1, -1, 0, 0, -1]


def test_hash_deterministic_and_sensitive():
    board = Board.load("cpu")
    games = new_games(["fx-0", "fx-0", "fx-1"], [3, 3, 3], board, "cpu")
    h = hash_states(games)
    assert h[0] == h[1] != h[2]
    assert len(h[0]) == 16 and int(h[0], 16) >= 0
    games.armies[1, 7] += 1
    assert hash_states(games)[1] != h[0]


# `hashOf(canonicalState(newGame({ players }, seed).state))` from `eval/gpu-canonical.ts`.
TYPESCRIPT_HASHES = {
    ("fx-0", 3): "23edeefa2b568fa5", ("fx-1", 3): "af8f15d3df7ba2b9", ("hybrid-data-7", 3): "4f96972eac638d9d",
    ("fx-0", 4): "d085a82b5868d54e", ("fx-1", 4): "ab2f1263ae078338", ("hybrid-data-7", 4): "8b106c0ea062d86c",
    ("fx-0", 5): "dc71b00addcf9b15", ("fx-1", 5): "7bed08f36a4d8386", ("hybrid-data-7", 5): "c04f1a68ad3e891a",
    ("fx-0", 6): "33a029d0a11efae1", ("fx-1", 6): "079f2cc3de10a9dc", ("hybrid-data-7", 6): "70c560156eb8df10",
}


def test_hashes_match_typescript():
    keys = list(TYPESCRIPT_HASHES)
    games = new_games([k[0] for k in keys], [k[1] for k in keys], Board.load("cpu"), "cpu")
    assert dict(zip(keys, hash_states(games))) == TYPESCRIPT_HASHES
