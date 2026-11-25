"""The JAX engine (`riskgpu/jaxengine/`) plays the rules and the odds of the PyTorch engine, which
lockstep holds to the reference engine (`ideas/tpu.md`, "The engine on the TPU"):

- lockstep: every committed reference game, its options and state hashed at every decision;
- the rules with the dice taken out: random-legal games on both engines from the same position,
  move and stream, the options and the state equal after every move, and the legality of fuzzed
  moves equal to the PyTorch engine's `validate`;
- the odds: the blitz's integer thresholds give the float64 tables' outcome for every draw tried,
  boundaries included, and sampled battles and blitzes match their exact probabilities.
"""

import itertools
import os

import numpy as np
import pytest
import torch

jax = pytest.importorskip("jax")
import jax.numpy as jnp  # noqa: E402

from riskgpu.board import Board  # noqa: E402
from riskgpu.canonical import options_ints, state_ints  # noqa: E402
from riskgpu.data import best_tables_prefix, fixture_paths  # noqa: E402
from riskgpu.engine import ATTACK, BLITZ, IllegalMove, Ctx, StepInfo, step, validate  # noqa: E402
from riskgpu.options import options as torch_options  # noqa: E402
from riskgpu.records import read_records  # noqa: E402
from riskgpu.selfplay.actions import MAIN  # noqa: E402
from riskgpu.state import new_games as torch_new_games  # noqa: E402
from riskgpu.tables import BlitzTables, resolve_blitz  # noqa: E402
from riskgpu.jaxengine import blitz  # noqa: E402
from riskgpu.jaxengine.actions import amount_group, decode, legal_amount, legal_main  # noqa: E402
from riskgpu.jaxengine.engine import Rules  # noqa: E402
from riskgpu.jaxengine.lockstep import options_to_torch, run  # noqa: E402
from riskgpu.jaxengine.rng import below, next_bits  # noqa: E402
from riskgpu.jaxengine.state import from_torch, new_games, seed_states, to_torch  # noqa: E402

PREFIX = best_tables_prefix()


@pytest.fixture(scope="module")
def board():
    return Board.load("cpu")


@pytest.fixture(scope="module")
def rules(board):
    return Rules(board)


@pytest.fixture(scope="module")
def jstep(rules):
    return jax.jit(rules.step)


@pytest.fixture(scope="module")
def torch_tables():
    return BlitzTables.load(PREFIX, "cpu")


@pytest.fixture(scope="module")
def tables(torch_tables):
    return blitz.Tables.of(blitz.cached_thresholds(PREFIX, torch_tables))


def test_every_fixture_game_exact_at_every_decision(tables):
    games = [(path, record) for path in fixture_paths() for record in read_records(path)]
    assert len(games) >= 19
    reports = run(games, tables)
    # A blitz past the table is approximate on the JAX engine: such a game may differ, and is skipped.
    failures = [(os.path.basename(r.file), r.seed, r.decision, r.mismatch) for r in reports if not r.exact and not r.oversize]
    assert failures == []
    assert sum(r.exact for r in reports) >= 19


def test_setup_deals_every_table_size_as_the_reference(board, rules):
    seeds = [f"jax-setup-{p}-{i}" for p in range(3, 7) for i in range(16)]
    players = [p for p in range(3, 7) for _ in range(16)]
    ours = jax.jit(new_games)(rules.setup, seed_states(seeds), jnp.asarray(players, jnp.int32))
    theirs = torch_new_games(seeds, players, board, "cpu")
    assert torch.equal(state_ints(to_torch(ours)), state_ints(theirs))


def test_the_stream_and_its_integer_floor(board):
    seeds = seed_states([f"stream-{i}" for i in range(64)])
    from riskgpu.rng import floor_draw, next_draws
    state_t = torch.from_numpy(np.asarray(seeds).astype(np.int64))
    state_j = seeds
    for n in (1, 2, 6, 7, 42, 44, 45):
        r, state_t = next_draws(state_t)
        t, state_j = next_bits(state_j)
        assert np.array_equal(np.asarray(t).astype(np.float64) / 4294967296.0, r.numpy())
        assert np.array_equal(np.asarray(below(t, n)), floor_draw(r, n).numpy())
    edge = jnp.asarray(np.array([0, 1, 2**32 - 1, 2**31, 715827882, 715827883, 2863311530, 2863311531], np.uint32))
    expected = np.floor(np.asarray(edge).astype(np.float64) / 4294967296.0 * 6).astype(np.int32)
    assert np.array_equal(np.asarray(below(edge, 6)), expected)


# --- the rules with the dice taken out -------------------------------------------------------


def torch_legal(s, o, moves, board, tables) -> np.ndarray:
    """Per game, whether the PyTorch engine's `validate` accepts its move."""
    ctx = Ctx(s, board, tables, StepInfo(*(torch.zeros(s.batch, dtype=d) for d in (torch.bool, torch.int64, torch.int64))),
              True, torch.arange(s.batch))
    live = s.phase != 3
    ok = np.ones(s.batch, bool)
    while True:
        try:
            validate(ctx, live, moves, o)
            return ok
        except IllegalMove as e:
            ok[e.game] = False
            live = live.clone()
            live[e.game] = False


def fuzz(rng: np.random.Generator, legal_moves: np.ndarray) -> np.ndarray:
    """Moves near the legal ones (a field nudged, another kind, a field out of range) and noise."""
    moves = legal_moves.copy()
    b = len(moves)
    how = rng.integers(0, 4, b)
    field = rng.integers(1, 5, b)
    nudged = moves[np.arange(b), field] + rng.choice([-1, 1], b)
    moves[np.arange(b), field] = np.where(how == 0, nudged, moves[np.arange(b), field])
    moves[:, 0] = np.where(how == 1, rng.integers(0, 8, b), moves[:, 0])
    noise = np.stack([rng.integers(-1, 9, b)] + [rng.integers(-2, 46, b) for _ in range(4)], 1)
    return np.where((how == 2)[:, None], noise, moves).astype(np.int32)


def test_random_legal_games_agree_move_for_move(board, rules, jstep, tables, torch_tables):
    players = [3, 4, 5, 6] * 6
    seeds = [f"jax-rules-{i}" for i in range(len(players))]
    theirs = torch_new_games(seeds, players, board, "cpu")
    ours = from_torch(theirs)
    options, step_j, legal_move = jax.jit(rules.options), jstep, jax.jit(rules.legal_move)
    pick = jax.jit(lambda s, o, key: _random_move(rules, s, o, key))
    rng = np.random.default_rng(5)
    key = jax.random.PRNGKey(5)
    fuzzed, refused, kinds = 0, 0, set()
    for tick in range(400):
        o = options(ours)
        theirs_o = torch_options(theirs, board)
        assert [r.tobytes() for r in options_ints(options_to_torch(o))] == [r.tobytes() for r in options_ints(theirs_o)], tick
        key, k = jax.random.split(key)
        moves = np.asarray(pick(ours, o, k))
        kinds.update(moves[np.asarray(ours.phase) != 3, 0].tolist())

        bad = fuzz(rng, moves)
        ours_ok = np.asarray(legal_move(ours, o, jnp.asarray(bad)))
        assert np.array_equal(ours_ok, torch_legal(theirs, theirs_o, torch.from_numpy(bad).long(), board, torch_tables)), tick
        fuzzed += len(bad)
        refused += int((~ours_ok).sum())
        assert np.asarray(legal_move(ours, o, jnp.asarray(moves))).all(), tick

        ours, oversize = step_j(tables, ours, jnp.asarray(moves))
        step(theirs, torch.from_numpy(moves).long(), board, torch_tables)
        assert not bool(np.asarray(oversize).any()), "a random game's blitz left the table"
        assert torch.equal(state_ints(to_torch(ours)), state_ints(theirs)), tick
    assert kinds == set(range(8)), kinds
    assert refused > fuzzed // 4 and refused < fuzzed, (refused, fuzzed)


def _random_move(rules, s, o, key):
    """A uniformly random legal main choice and amount bucket, as a move."""
    k1, k2 = jax.random.split(key)
    legal = legal_main(o)
    main = jnp.argmax(jnp.where(legal, jax.random.gumbel(k1, legal.shape), -jnp.inf), 1)
    amounts = legal_amount(amount_group(main))
    amount = jnp.argmax(jnp.where(amounts, jax.random.gumbel(k2, amounts.shape), -jnp.inf), 1)
    return decode(rules, main, amount, s, o)


# --- the odds ----------------------------------------------------------------------------------


def test_blitz_thresholds_give_the_tables_outcome(tables, torch_tables):
    arrays = blitz.cached_thresholds(PREFIX, torch_tables)
    bound = torch_tables.bound
    rng = np.random.default_rng(3)
    n = 60000
    a = rng.integers(1, bound + 1, n)
    d = rng.integers(1, bound + 1, n)
    cell = arrays["cell"][a * (bound + 1) + d]
    # Draws on either side of each kind of threshold: the capture's, an attacker's, a defender's.
    pick_a = cell[:, blitz.OFF_A] + rng.integers(0, a)
    pick_d = cell[:, blitz.OFF_D] + rng.integers(0, d)
    edges = np.stack([arrays["cap_thr"][a * (bound + 1) + d], arrays["thr"][pick_a], arrays["thr"][pick_d]], 1)
    t = edges[np.arange(n), rng.integers(0, 3, n)].astype(np.int64) + rng.integers(0, 2, n)
    t = np.where(rng.random(n) < 0.2, rng.integers(0, 2**32, n), t)
    t = np.clip(t, 0, 2**32 - 1)
    t[:50] = 0
    ours = jax.jit(blitz.resolve)(tables, jnp.asarray(a, jnp.int32), jnp.asarray(d, jnp.int32), jnp.asarray(t.astype(np.uint32)))
    theirs = resolve_blitz(torch_tables, torch.from_numpy(a), torch.from_numpy(d),
                           torch.from_numpy(t.astype(np.float64) / 4294967296.0))
    assert np.array_equal(np.asarray(ours[0]), theirs[0].numpy())
    assert np.array_equal(np.asarray(ours[1]), theirs[1].numpy())


def chi_square_p(counts: np.ndarray, probs: np.ndarray) -> float:
    """Pearson's test of `counts` against `probs`, the outcomes expected fewer than 5 times pooled."""
    from scipy.stats import chisquare
    assert counts[probs <= 0].sum() == 0, "an impossible outcome happened"
    expected = probs / probs.sum() * counts.sum()
    small = expected < 5
    observed = np.append(counts[~small], counts[small].sum())
    expected = np.append(expected[~small], expected[small].sum())
    if expected[-1] == 0:
        observed, expected = observed[:-1], expected[:-1]
    return float(chisquare(observed, expected).pvalue)


def draws(n: int, prefix: str) -> np.ndarray:
    """n 32-bit draws, each the first of its own stream, as the engine's games draw."""
    t, _ = next_bits(seed_states([f"{prefix}-{i}" for i in range(n)]))
    return np.asarray(t)


@pytest.mark.parametrize("dice,defend", [(3, 2), (2, 2), (1, 2), (3, 1), (1, 1)])
def test_battles_lose_armies_with_the_dice_odds(board, jstep, tables, dice, defend):
    n, deals = 20000, 64
    s = torch_new_games([f"battle-{i}" for i in range(deals)], [3] * deals, board, "cpu").select(np.arange(n) % deals)
    s.rng = torch.from_numpy(np.asarray(seed_states([f"battle-{dice}-{defend}-{i}" for i in range(n)])).astype(np.int64))
    # One territory of the active seat's with dice + 1 armies, beside an enemy's with `defend`.
    edges = board.edges.numpy()
    owner = s.owner.numpy()
    active = s.active.numpy()
    border = (owner[:, edges[:, 0]] == active[:, None]) & (owner[:, edges[:, 1]] != active[:, None])
    e = border.argmax(1)
    frm, to = edges[e, 0], edges[e, 1]
    rows = np.arange(n)
    s.armies[rows, frm] = dice + 1
    s.armies[rows, to] = defend
    s.phase[:] = 1
    s.reinf_present[:] = False
    s.reinf_to_place[:] = 0
    ours = from_torch(s)
    moves = np.zeros((n, 5), np.int32)
    moves[:, 0], moves[:, 1], moves[:, 2], moves[:, 3] = ATTACK, frm, to, dice
    after, _ = jstep(tables, ours, jnp.asarray(moves))
    lost = np.where(np.asarray(after.owner)[rows, to] == active, defend, defend - np.asarray(after.armies)[rows, to])
    counts = np.bincount(lost, minlength=3)[:3]
    probs = np.zeros(3)
    pairs = min(dice, defend)
    for roll in itertools.product(range(1, 7), repeat=dice + defend):
        a = sorted(roll[:dice], reverse=True)
        d = sorted(roll[dice:], reverse=True)
        probs[sum(a[k] > d[k] for k in range(pairs))] += 1
    assert chi_square_p(counts, probs) > 1e-3


@pytest.mark.parametrize("a,d", [(1, 1), (3, 2), (5, 5), (12, 9), (20, 30), (31, 31)])
def test_blitz_outcomes_have_the_tables_odds(tables, torch_tables, a, d):
    n = 40000
    t = jnp.asarray(draws(n, f"blitz-{a}-{d}"))
    lost_a, lost_d, _ = jax.jit(blitz.resolve)(tables, jnp.full(n, a, jnp.int32), jnp.full(n, d, jnp.int32), t)
    lost_a, lost_d = np.asarray(lost_a), np.asarray(lost_d)
    captures = lost_d == d
    # The outcomes' chances from the reference's running totals (`tables.py`): capturing with
    # i attacker losses, then failing with j defender losses.
    cell = a * (torch_tables.bound + 1) + d
    off_a, off_d = int(torch_tables.index[cell, 0]), int(torch_tables.index[cell, 1])
    values = torch_tables.values.numpy()

    def chances(off, length):
        totals = values[off:off + length]
        out, last = np.zeros(length), 0.0
        for i, v in enumerate(totals):
            if v >= 0:
                out[i], last = v - last, v
        return out

    probs = np.concatenate([chances(off_a, a), chances(off_d, d)])
    counts = np.concatenate([np.bincount(lost_a[captures], minlength=a)[:a], np.bincount(lost_d[~captures], minlength=d)[:d]])
    assert counts.sum() == n
    assert chi_square_p(counts, probs) > 1e-3
