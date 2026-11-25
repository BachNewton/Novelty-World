"""The JAX play loop (`riskgpu/jaxengine/play.py`) sees and moves as the PyTorch one does: on the
positions of random-legal games, the turn so far, the observation, the legal choices, the move a
choice decodes to and a network's most likely choice are the PyTorch code's; and a reading's games
end at a win or at their cap."""

import numpy as np
import pytest
import torch

jax = pytest.importorskip("jax")
import jax.numpy as jnp  # noqa: E402

from riskgpu.board import MAX_SEATS, Board  # noqa: E402
from riskgpu.data import best_tables_prefix  # noqa: E402
from riskgpu.options import options as torch_options  # noqa: E402
from riskgpu.runner import TurnLog as TorchLog  # noqa: E402
from riskgpu.selfplay.actions import amount_group, legal_amount  # noqa: E402
from riskgpu.selfplay.actions import decode as torch_decode  # noqa: E402
from riskgpu.selfplay.actions import legal_main as torch_legal_main  # noqa: E402
from riskgpu.selfplay.net import masked  # noqa: E402
from riskgpu.selfplay.obs import observe as torch_observe  # noqa: E402
from riskgpu.selfplay.parity import random_net  # noqa: E402
from riskgpu.tpu.convert import from_torch as params_of  # noqa: E402
from riskgpu.jaxengine import blitz  # noqa: E402
from riskgpu.jaxengine.actions import decode, legal_main  # noqa: E402
from riskgpu.jaxengine.engine import Rules  # noqa: E402
from riskgpu.jaxengine.obs import TurnLog, clock, observe  # noqa: E402
from riskgpu.jaxengine.play import RANDOM, Player, Seat, act  # noqa: E402
from riskgpu.jaxengine.state import new_games, seed_states, to_torch  # noqa: E402
from riskgpu.jaxengine.lockstep import options_to_torch  # noqa: E402


@pytest.fixture(scope="module")
def board():
    return Board.load("cpu")


@pytest.fixture(scope="module")
def tables():
    return blitz.Tables.of(blitz.cached_thresholds(best_tables_prefix()))


def t(x, dtype=None):
    out = torch.from_numpy(np.array(x))
    return out if dtype is None else out.to(dtype)


def test_the_view_the_choices_and_the_policy_are_the_pytorch_ones(board, tables):
    rules = Rules(board)
    net = random_net(32, 2, 4, 2, board, seed=3, clock=True)
    params = {k: jnp.asarray(v) for k, v in params_of(net.state_dict()).items()}
    player = Player(board, tables, [Seat(clock=True, greedy=True)], jnp.float32)
    batch = 24
    players = jnp.asarray([3, 4, 5, 6] * 6, jnp.int32)
    s = jax.jit(new_games)(rules.setup, seed_states([f"jax-play-{i}" for i in range(batch)]), players)
    cap = jnp.asarray(np.random.default_rng(1).integers(150, 601, batch), jnp.int32)
    log, theirs_log = TurnLog.empty(batch), TorchLog.empty(batch, "cpu")

    @jax.jit
    def look(s, log, key):
        o = rules.options(s)
        legal = legal_main(o)
        node, slot, glob = observe(rules, s, o, log)
        glob = jnp.concatenate([glob, clock(s.turn, cap)], 1)
        main, amount = act(player.forward, params, node, slot, glob, legal, key, True)
        k1, k2 = jax.random.split(key)
        r_main = jnp.argmax(jnp.where(legal, jax.random.gumbel(k1, legal.shape), -jnp.inf), 1)
        r_amount = jax.random.randint(k2, (batch,), 0, 3)
        return o, legal, (node, slot, glob), (main, amount), (r_main, r_amount)

    step = jax.jit(rules.step)
    decode_j = jax.jit(lambda s, o, m, a: decode(rules, m, a, s, o))
    update = jax.jit(lambda log, before, after, moves, moved: log.update(before, after, moves, moved))
    key = jax.random.PRNGKey(0)
    agreed = asked = 0
    for tick in range(160):
        key, k = jax.random.split(key)
        o, legal, views, chosen, random_choice = look(s, log, k)
        theirs = to_torch(s)
        theirs_o = torch_options(theirs, board)
        theirs_legal = torch_legal_main(theirs_o)
        assert np.array_equal(np.asarray(legal), theirs_legal.numpy()), tick
        theirs_views = torch_observe(theirs, theirs_o, theirs_log.placed_on, theirs_log.attacks, theirs_log.captured, board,
                                     t(cap, torch.int64))
        for ours, them in zip(views, theirs_views):
            np.testing.assert_allclose(np.asarray(ours), them.numpy(), rtol=1e-6, atol=1e-6)

        with torch.no_grad():
            x = net.trunk(*theirs_views)
            logits, _, _ = net.heads_main(x)
            z = masked(logits, theirs_legal)
            top2 = z.topk(2, 1).values
            main = z.argmax(1)
            za = masked(net.amount_logits(x, main), legal_amount(amount_group(main)))
            top2_a = za.topk(2, 1).values
        clear = ((top2[:, 0] - top2[:, 1] > 1e-4) & (top2_a[:, 0] - top2_a[:, 1] > 1e-4)).numpy()
        same = (np.asarray(chosen[0]) == main.numpy()) & (np.asarray(chosen[1]) == za.argmax(1).numpy())
        agreed += int(same[clear].sum())
        asked += int(clear.sum())

        r_main, r_amount = (np.asarray(v) for v in random_choice)
        ours_move = np.asarray(decode_j(s, o, *random_choice))
        theirs_move = torch_decode(t(r_main, torch.int64), t(r_amount, torch.int64), theirs, theirs_o, board)
        live = np.asarray(s.phase) != 3
        assert np.array_equal(ours_move[live], theirs_move.numpy()[live]), tick

        moved = jnp.asarray(live)
        after, _ = step(tables, s, jnp.asarray(ours_move))
        log = update(log, s, after, jnp.asarray(ours_move), moved)
        theirs_log.update(theirs, to_torch(after), t(ours_move, torch.int64), t(live))
        s = after
        for name in ("attacks", "captured", "placed_on"):
            assert np.array_equal(np.asarray(getattr(log, name)), getattr(theirs_log, name).numpy()), (tick, name)
    assert asked > 3000 and agreed == asked, (agreed, asked)


def test_a_reading_plays_its_games_to_a_win_or_the_cap(board, tables):
    player = Player(board, tables, [], jnp.float32)
    games = 12
    seat_net = np.full((games, MAX_SEATS), RANDOM)
    g = player.start([f"cap-{i}" for i in range(games)], 3, seat_net, 4, 0)
    g = player.play_out([], g, chunk=32)
    s = g.s
    assert bool(np.asarray(g.done).all())
    over = (np.asarray(s.phase) == 3) | (np.asarray(s.turn) > 4)
    assert over.all()
    # Done games stay as they ended.
    after, _ = player.run([], g, tables, 8)
    assert np.array_equal(np.asarray(after.s.turn), np.asarray(s.turn))
