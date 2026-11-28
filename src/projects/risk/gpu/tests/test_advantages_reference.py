"""`advantages` with the carry (`riskgpu/selfplay/ppo.py`, `--lam` alone) against a reference written
from the estimator's statement, not from its code.

The estimator taken as intended. A row is one long sequence of steps, cut into rollouts of T. Each
seat's chain is its learner decisions in time order *within one game*. A decision's successor is its
seat's next learner decision in the same game, else that game's end, else nothing yet. A decision is
a **hold point** when it is its seat's last in its rollout and its game is still running at that
rollout's end. With γ = 1,

    δ(d)   = [score of d's seat if the successor is the game's end] + v(successor decision) − v(d)
    adv(d) = δ(d) + λ · adv(successor)   (0 when the successor is the end or a hold point)

so every λ-sum stops at a game's end and at a hold point, which bootstraps its predecessors with its
value. A decision that isn't a hold point trains in its own rollout; a hold point trains in the
rollout that holds its successor, with the same formula, `age` the rollout ends it crossed. The value
target is adv + v. `mc` (each seat's final score) is the decision's game's scores, `mc_ok` that the
game ended inside the rollout the decision trains in.

Where the code's docstring is loose, this is what the code does: "the target a long rollout would
give it" is not literal. A completed hold point's λ-sum is itself cut at its successor's rollout's
hold point, exactly as any other decision's is; `test_bootstrap.py` pins the difference against one
long rollout.

The synthetic rows deal games of 3 to 6 seats with one or several learner seats, decisions served or
not, seats eliminated mid-game, games ending and re-dealt mid-rollout (the new game's seats reusing
the old one's indices), rollouts in which a seat never decides, and games long enough that a held
decision waits several rollouts."""

import random
from types import SimpleNamespace

import pytest
import torch

from riskgpu.board import MAX_SEATS
from riskgpu.selfplay.env import EnvConfig, Env
from riskgpu.selfplay.net import Net, evaluate
from riskgpu.selfplay.ppo import CARRIED, Carry, advantages, state_of
from riskgpu.selfplay.actions import legal_main
from riskgpu.selfplay.obs import observe
from riskgpu.options import options

T, ROLLOUTS, B = 8, 7, 192


def deal_rows(seed: int):
    """Every row's whole sequence of `ROLLOUTS * T` steps, as plain lists, and the score of each
    game end."""
    rng = random.Random(seed)
    N = ROLLOUTS * T
    cols = {k: [[None] * B for _ in range(N)] for k in ("active", "learner", "value", "ended", "game_id")}
    reward = [[[0.0] * MAX_SEATS for _ in range(B)] for _ in range(N)]
    for b in range(B):
        # A quarter of the rows play games that outlast several rollouts.
        end_p = 0.004 if b % 4 == 0 else rng.choice((0.03, 0.08, 0.15))
        game, active = -1, None

        def deal():
            n = rng.randint(3, 6)
            learners = {s for s in range(n) if rng.random() < 0.4} or {rng.randrange(n)}
            return n, learners, set(range(n))

        n, learners, alive = deal()
        game = 0
        for g in range(N):
            if active not in alive or rng.random() < 0.4:
                active = rng.choice(sorted(alive))
            cols["active"][g][b] = active
            cols["learner"][g][b] = active in learners and rng.random() > 0.1
            cols["value"][g][b] = round(rng.uniform(-1, 1), 3)
            cols["game_id"][g][b] = game
            others = sorted(alive - {active})
            if len(alive) > 2 and rng.random() < 0.06:
                alive.discard(rng.choice(others))
            ended = rng.random() < end_p
            cols["ended"][g][b] = ended
            if ended:
                for s in range(n):
                    reward[g][b][s] = round(rng.uniform(-1, 1), 3) or 0.5
                n, learners, alive = deal()
                game += 1
                active = None
    return cols, reward


def reference(cols, reward, lam: float):
    """Each learner decision `(g, b)`: its advantage, the rollout it trains in (None: still pending
    after the last rollout), whether it is a hold point, and its game's end step."""
    N = ROLLOUTS * T
    out = {}
    for b in range(B):
        end_of = {}  # game -> its end step
        for g in range(N):
            if cols["ended"][g][b]:
                end_of[cols["game_id"][g][b]] = g
        decisions = [g for g in range(N) if cols["learner"][g][b]]
        succ = {}
        for i, g in enumerate(decisions):
            s, game = cols["active"][g][b], cols["game_id"][g][b]
            nxt = next((h for h in decisions[i + 1:] if cols["active"][h][b] == s and cols["game_id"][h][b] == game), None)
            succ[g] = ("decision", nxt) if nxt is not None else (("end", end_of[game]) if game in end_of else None)
        hold = {}
        for g in decisions:
            r = g // T
            last_step = (r + 1) * T - 1
            game_end = end_of.get(cols["game_id"][g][b], N)
            s = cols["active"][g][b]
            later_in_rollout = any(cols["learner"][h][b] and cols["active"][h][b] == s for h in range(g + 1, last_step + 1))
            hold[g] = not later_in_rollout and game_end > last_step
        adv = {}
        for g in reversed(decisions):
            s = cols["active"][g][b]
            nxt = succ[g]
            if nxt is None:
                adv[g] = None
                continue
            kind, h = nxt
            if kind == "end":
                adv[g] = reward[h][b][s] - cols["value"][g][b]
            else:
                tail = 0.0 if hold[h] else adv[h]
                adv[g] = cols["value"][h][b] - cols["value"][g][b] + lam * tail
        for g in decisions:
            trains_in = (g // T if not hold[g] else (None if succ[g] is None else succ[g][1] // T))
            out[(g, b)] = SimpleNamespace(adv=adv[g], trains_in=trains_in, hold=hold[g], seat=cols["active"][g][b],
                                          end=end_of.get(cols["game_id"][g][b]), succ=succ[g] and succ[g][0])
    return out


def rollout_buf(cols, reward, r: int) -> dict:
    steps = range(r * T, (r + 1) * T)
    buf = {name: torch.zeros(T, B) for name in CARRIED}
    buf["active"] = torch.tensor([cols["active"][g] for g in steps], dtype=torch.int8)
    buf["learner"] = torch.tensor([cols["learner"][g] for g in steps])
    buf["ended"] = torch.tensor([cols["ended"][g] for g in steps])
    buf["game_id"] = torch.tensor([cols["game_id"][g] for g in steps])
    buf["value"] = torch.tensor([cols["value"][g] for g in steps], dtype=torch.float32)
    buf["reward"] = torch.tensor([reward[g] for g in steps], dtype=torch.float32)
    # Each step's global index, carried with a held decision, so the test knows which one it holds.
    buf["logp"] = torch.arange(r * T, (r + 1) * T, dtype=torch.float32)[:, None].expand(T, B).clone()
    return buf


@pytest.mark.parametrize("lam", [0.0, 0.95])
def test_the_carried_chains_are_the_stated_estimator(lam):
    cols, reward = deal_rows(seed=3)
    ref = reference(cols, reward, lam)
    env = SimpleNamespace(cfg=SimpleNamespace(horizon=T, batch=B), buf=rollout_buf(cols, reward, 0), state=None)
    carry = Carry(env.buf, B, "cpu")
    trained = []
    seen = {"redealt": 0, "eliminated_wait": 0, "aged": 0}
    for r in range(ROLLOUTS):
        env.buf = rollout_buf(cols, reward, r)
        got = advantages(env, None, lam, carry=carry)
        for t in range(T):
            g = r * T + t
            for b in range(B):
                if not cols["learner"][g][b]:
                    assert not got["train"][t, b] and not got["hold"][t, b]
                    continue
                d = ref[(g, b)]
                assert bool(got["hold"][t, b]) == d.hold, (g, b)
                assert bool(got["train"][t, b]) == (not d.hold), (g, b)
                in_rollout = d.end is not None and d.end < (r + 1) * T
                assert bool(got["mc_ok"][t, b]) == in_rollout, (g, b)
                if d.hold:
                    continue
                trained.append((g, b))
                assert abs(float(got["adv"][t, b]) - d.adv) < 1e-4, (g, b, float(got["adv"][t, b]), d.adv)
                assert abs(float(got["ret"][t, b]) - (d.adv + cols["value"][g][b])) < 1e-4
                if in_rollout:
                    assert got["mc"][t, b].tolist() == pytest.approx(reward[d.end][b])
        expect_complete = {(d_g, b): d for (d_g, b), d in ref.items() if d.hold and d.trains_in == r}
        complete = got["complete"]
        assert int(complete.sum()) == len(expect_complete)
        for s, b in complete.nonzero().tolist():
            g = int(carry.fields["logp"][s, b])
            d = expect_complete[(g, b)]
            assert d.seat == s
            assert int(carry.age[s, b]) == r - g // T
            assert abs(float(got["adv"][T + s, b]) - d.adv) < 1e-4, (g, b, float(got["adv"][T + s, b]), d.adv)
            assert abs(float(got["ret"][T + s, b]) - (d.adv + cols["value"][g][b])) < 1e-4
            assert bool(got["train"][T + s, b])
            if d.end is not None and d.end < (r + 1) * T:
                assert bool(got["mc_ok"][T + s, b])
                assert got["mc"][T + s, b].tolist() == pytest.approx(reward[d.end][b])
            else:
                assert not bool(got["mc_ok"][T + s, b])
            trained.append((g, b))
            seen["aged"] += r - g // T >= 3
            if d.succ == "end":
                # The seat decides again in the next game, in this rollout, after its old game's end.
                seen["redealt"] += any(cols["learner"][h][b] and cols["active"][h][b] == s
                                       for h in range(d.end + 1, (r + 1) * T))
                seen["eliminated_wait"] += r - g // T >= 2
        assert not (got["train"][T:] & ~complete).any()
        carry.hold(env, got)
    # Every decision trained once, and those still waiting are exactly the carry's.
    assert len(trained) == len(set(trained))
    pending = {(g, b) for (g, b), d in ref.items() if d.trains_in is None or d.trains_in >= ROLLOUTS}
    assert set(trained) | pending == set(ref) and not set(trained) & pending
    held = {(int(carry.fields["logp"][s, b]), b) for s, b in carry.held.nonzero().tolist()}
    assert held == pending
    # The cases this test exists for, each seen.
    assert all(v > 0 for v in seen.values()), seen


def test_a_held_decision_completes_at_its_games_end_not_at_the_next_games_turn():
    # One row, T = 4: seat 1 (learner) decides at step 2 and is held; in the next rollout its game
    # ends at step 1 and the new game's seat 1 decides at step 3. The held decision's successor is
    # the end, its score 0.7, not the new game's value 0.9.
    env = SimpleNamespace(cfg=SimpleNamespace(horizon=4, batch=1), state=None)

    def buf(active, learner, value, ended, scores):
        out = {name: torch.zeros(4, 1) for name in CARRIED}
        out.update(active=torch.tensor(active)[:, None], learner=torch.tensor(learner)[:, None],
                   value=torch.tensor(value)[:, None], ended=torch.tensor(ended)[:, None],
                   reward=torch.zeros(4, 1, MAX_SEATS))
        for t, s in scores.items():
            out["reward"][t, 0, :3] = torch.tensor(s)
        return out

    env.buf = buf([0, 2, 1, 0], [False, False, True, False], [0, 0, 0.2, 0], [False] * 4, {})
    carry = Carry(env.buf, 1, "cpu")
    first = advantages(env, None, 0.95, carry=carry)
    assert first["hold"][2, 0]
    carry.hold(env, first)
    env.buf = buf([2, 0, 0, 1], [False, False, False, True], [0, 0, 0, 0.9], [False, True, False, False],
                  {1: [0.1, 0.7, -1.0]})
    second = advantages(env, None, 0.95, carry=carry)
    assert second["complete"][1, 0]
    assert float(second["adv"][4 + 1, 0]) == pytest.approx(0.7 - 0.2)
    assert second["mc"][4 + 1, 0, :3].tolist() == pytest.approx([0.1, 0.7, -1.0])


@pytest.mark.parametrize("space", ["buckets", "exact"])
def test_the_update_recomputes_the_logp_the_rollout_stored(space):
    # PPO's ratio is exp(logp now − logp then): the update rebuilds each decision's state without
    # its random stream and deck, so its options, observation and both factors of the move (the main
    # choice and its amount, absent for some) must give back the stored logp under the same weights.
    from riskgpu.board import Board
    from riskgpu.data import load_best
    from riskgpu.selfplay.env import GREEDY

    board = Board.load("cpu")
    tables = load_best("cpu")
    tables.scaled_oversize = True
    torch.manual_seed(5)
    net = Net(16, 1, 2, 2, edges=board.edges, adjacency=board.adjacency, actions=space)
    cfg = EnvConfig(batch=8, sizes=(3, 4, 5, 6), size_weights=(0.25,) * 4, cap_low=20, cap_high=40, pool=8,
                    snapshots=0, horizon=48, bf16=False, cap_learner=1.0, cap_greedy=1.0)
    env = Env(cfg, board, tables, net, "cpu", seed_prefix="logp")
    env.kind_probs.zero_()
    env.kind_probs[GREEDY] = 1.0
    env.run(48)
    t, b = env.buf["learner"].nonzero(as_tuple=True)
    s = state_of(lambda name: env.buf[name][t, b], t)
    with torch.no_grad():
        o = options(s, board)
        node, slot, glob = observe(s, o, env.buf["placed_on"][t, b], env.buf["attacks"][t, b],
                                   env.buf["captured"][t, b], board)
        logp, _, value, _ = evaluate(net, node, slot, glob, legal_main(o, net.exact), env.buf["main"][t, b],
                                     env.buf["amount"][t, b], s, o, board)
    assert torch.allclose(logp, env.buf["logp"][t, b], atol=1e-4)
    assert torch.allclose(value[:, 0], env.buf["value"][t, b], atol=1e-4)
