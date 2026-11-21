"""The TPU's supervised trainer (`riskgpu/tpu/prepare.py`, `riskgpu/tpu/train.py`): a prepared sample is
the PyTorch trainers' own rebuild of it, the JAX loss and read on it are theirs, and a run stopped on
its hours and started again ends where an unbroken run does, with checkpoints the PyTorch tools load."""

import json
import os
import subprocess
import sys

import numpy as np
import pytest
import torch

jax = pytest.importorskip("jax")
import jax.numpy as jnp  # noqa: E402

from riskgpu.board import Board  # noqa: E402
from riskgpu.data import load_best  # noqa: E402
from riskgpu.records import write_records  # noqa: E402
from riskgpu.selfplay import distil, imitate, record  # noqa: E402
from riskgpu.selfplay.parity import random_net  # noqa: E402
from riskgpu.tpu import convert, prepare, train  # noqa: E402
from riskgpu.tpu.net import Forward, constants, unpack_legal  # noqa: E402

GPU = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(scope="module")
def board():
    return Board.load("cpu")


@pytest.fixture(scope="module")
def imitation(tmp_path_factory):
    """An imitation's extraction of the three shortest fixture games, the third held out."""
    from test_imitate import shortest
    root = tmp_path_factory.mktemp("imit")
    games = shortest(3)
    folder = root / "records" / "fx"
    folder.mkdir(parents=True)
    write_records(str(folder / "fx-0-0.jsonl.gz"), games[:2])
    write_records(str(folder / "fx-4-0.jsonl.gz"), games[2:])
    imitate.extract(str(root / "records"), str(root / "data"), "*", "cpu", batch=8, check_every=16)
    return str(root / "data")


@pytest.fixture(scope="module")
def recording(board, tmp_path_factory):
    """A small search recording (`test_record`'s) and the random net it searched with."""
    tables = load_best("cpu")
    tables.scaled_oversize = True
    net = random_net(32, 1, 4, 2, board, seed=3)
    net.requires_grad_(False)
    root = tmp_path_factory.mktemp("rec")
    ckpt = str(root / "net.pt")
    torch.save({"net": net.state_dict(), "config": net.config()}, ckpt)
    from test_record import GAMES
    args = record.parser().parse_args(["--ckpt", ckpt, "--dir", str(root / "rec"), *GAMES])
    record.record(args, net, board, tables, record.search_config(args, bf16=False), "cpu")
    return str(root / "rec"), ckpt


def prepared(data: str, out, task: str, actions=None) -> prepare.Prepared:
    argv = [task, "--data", data, "--out", str(out), "--chunk", "100"] + (["--actions", actions] if actions else [])
    prepare.prepare(prepare.parser().parse_args(argv))
    return prepare.Prepared(str(out))


def rounded(b: dict) -> dict:
    """The rebuilt batch with its observation as the prepared set stores it."""
    return {**b, **{k: b[k].half().float() for k in ("node", "slot", "glob")}}


CASES = [("imitate", None), ("imitate", "exact"), ("distil", None)]


@pytest.mark.parametrize("task,actions", CASES)
def test_a_prepared_sample_is_the_pytorch_rebuild_and_the_jax_loss_and_read_are_pytorch_s(
        task, actions, imitation, recording, board, tmp_path):
    folder = imitation if task == "imitate" else recording[0]
    data = prepared(folder, tmp_path / "set", task, actions)
    source = imitate.Dataset(folder) if task == "imitate" else distil.Recording(folder)
    idx = torch.arange(data.n)
    space = actions or "buckets"
    b = source.inputs(idx, board, "cpu", space) if task == "imitate" else source.inputs(idx, board, "cpu", False)
    a = data.arrays
    for k in ("node", "slot", "glob"):
        assert np.array_equal(a[k], b[k].numpy().astype(np.float16)), k
    assert np.array_equal(np.asarray(unpack_legal(jnp.asarray(a["legal"]))), b["legal"].numpy())
    assert np.array_equal(a["main"], b["main"].numpy()) and np.array_equal(a["amount"], b["amount"].numpy())
    assert np.array_equal(a["value"], b["value"].numpy()) and np.array_equal(a["value_ok"], b["value_ok"].numpy())
    assert int(a["held_out"].sum()) > 0 and int(a["train"].sum()) > 0

    net = random_net(32, 2, 4, 4, board, seed=9, actions=space)
    net.eval()
    params = convert.from_torch(net.state_dict())
    forward = Forward(constants(board.edges.numpy(), board.adjacency.numpy()), jnp.float32)
    trainer = train.Trainer.__new__(train.Trainer)
    trainer.data, trainer.args = data, train.parser().parse_args(["--data", "x", "--dir", "y"])
    names = train.STEP_FIELDS + (train.EXACT_FIELDS if data.exact else ()) + train.READ_FIELDS
    batch = {k: jnp.asarray(v) for k, v in trainer.host_batch(np.arange(data.n), names).items()}
    r = rounded(b)

    # The loss: imitate's, or distil's hard target with the skipped decisions at their weight.
    with torch.no_grad():
        if task == "imitate":
            theirs = imitate.losses(net, r, bf16=False)
        else:
            theirs = distil.losses(net, {**r, "x": b["x"]}, distil.parser().parse_args(
                ["--data", "x", "--init", "y", "--dir", "z", "--no-bf16"]))
    _, ours = jax.jit(lambda p, x: train.losses(forward, p, x, 0.5, 0.25))(params, batch)
    for k in ("main", "amount", "value", "agree"):
        assert abs(float(ours[k]) - float(theirs[k])) < 1e-4 * max(1.0, abs(float(theirs[k]))), (k, ours[k], theirs[k])

    # The read: the most likely main choice and whole move agree exactly where PyTorch's do.
    main, _, move, value = imitate.predict(net, r, False, board)
    target = b["x"]["move"].to(torch.int64)
    their_move = (imitate.normalize(move, b["s"], b["o"]) == imitate.normalize(target, b["s"], b["o"])).all(1)
    main_ok, move_ok, _, _ = (np.asarray(x) for x in jax.jit(lambda p, x: train.predict(forward, p, x))(params, batch))
    assert np.array_equal(main_ok, (main == b["main"]).numpy())
    assert np.array_equal(move_ok, their_move.numpy())
    # Both kinds of answer occur, so the comparison could have failed either way.
    assert 0 < move_ok.sum() < len(move_ok) or task == "distil"


def run_args(data: str, folder, *extra) -> list[str]:
    return ["--data", data, "--dir", str(folder), "--width", "32", "--layers", "1", "--heads", "4", "--minibatch", "32",
            "--max-samples", str(32 * 12), "--warmup", "3", "--lr", "3e-3", "--read-every", "4", "--monitor", "64",
            "--read-chunk", "64", "--no-bf16", "--loader-threads", "2", *extra]


def test_a_run_stopped_on_its_hours_and_started_again_ends_where_an_unbroken_run_does(imitation, tmp_path):
    data = str(tmp_path / "set")
    prepared(imitation, data, "imitate")
    whole = train.train(train.parser().parse_args(run_args(data, tmp_path / "a")))
    assert whole["stopped"] is None and whole["step"] == 12
    # Out of hours at once: read, saved, stopped after its first step.
    first = train.train(train.parser().parse_args(run_args(data, tmp_path / "b", "--hours", "0")))
    assert first["stopped"] == "hours" and first["step"] == 1 and not os.path.exists(tmp_path / "b" / "last.pt")
    with pytest.raises(AssertionError, match="another recipe"):
        train.train(train.parser().parse_args(run_args(data, tmp_path / "b", "--lr", "1e-3")))
    rest = train.train(train.parser().parse_args(run_args(data, tmp_path / "b")))
    assert rest["stopped"] is None and rest["step"] == 12
    a, b = torch.load(tmp_path / "a" / "last.pt", weights_only=False), torch.load(tmp_path / "b" / "last.pt", weights_only=False)
    for k, v in a["net"].items():
        assert torch.allclose(v, b["net"][k], atol=1e-6, rtol=0), k
    logs = [json.loads(line) for line in open(tmp_path / "b" / "log.jsonl")]
    assert [r["step"] for r in logs] == [1, 4, 8, 12] and logs[0]["stopped"] == "hours"

    # Its checkpoints are PyTorch's, and the read at the end adds up.
    from riskgpu.selfplay.ladder import load_net
    load_net(str(tmp_path / "b" / "best.pt"), Board.load("cpu"), "cpu")
    read = rest["held_out"]
    assert read["main"]["all"]["n"] == read["samples"]
    assert sum(r["n"] for k, r in read["by_decision"].items() if r) == read["samples"]


def test_a_distillation_lowers_its_loss_and_its_read_splits_add_up(recording, board, tmp_path):
    folder, ckpt = recording
    data = str(tmp_path / "set")
    prepared(folder, data, "distil")
    args = ["--data", data, "--dir", str(tmp_path / "d"), "--init", ckpt, "--minibatch", "64", "--max-samples", "3200",
            "--lr", "3e-3", "--warmup", "5", "--read-every", "1000", "--monitor", "256", "--read-chunk", "128"]  # bf16, as on a TPU
    source = distil.Recording(folder)
    idx = torch.nonzero(~source.held_out[source.sample_game()])[:, 0]
    d_args = distil.parser().parse_args(["--data", "x", "--init", "y", "--dir", "z", "--no-bf16"])

    def loss(path: str) -> float:
        from riskgpu.selfplay.ladder import load_net
        with torch.no_grad():
            parts = distil.losses(load_net(path, board, "cpu"), source.inputs(idx, board, "cpu", False), d_args)
        return float(parts["main"] + parts["amount"])

    before = loss(ckpt)
    out = train.train(train.parser().parse_args(args))
    assert loss(str(tmp_path / "d" / "last.pt")) < 0.8 * before
    report = out["held_out"]
    for what in ("main", "move"):
        read = report[what]
        searched = read["searched"]["n"]
        assert sum(r["n"] for r in read["by_source"].values() if r) == report["samples"]
        assert sum(r["n"] for r in read["by_kind"].values() if r) == searched


def test_the_minibatch_split_over_two_devices_is_the_one_device_update(imitation, tmp_path):
    """Run in a process of its own, since JAX's device count is fixed when it starts."""
    data = str(tmp_path / "set")
    prepared(imitation, data, "imitate")
    script = (
        "import sys; from riskgpu.tpu import train; "
        f"train.train(train.parser().parse_args(sys.argv[1:]))")
    env = {**os.environ, "XLA_FLAGS": "--xla_force_host_platform_device_count=2", "JAX_PLATFORMS": "cpu"}
    for chips, folder in ((1, "one"), (2, "two")):
        done = subprocess.run([sys.executable, "-c", script, *run_args(data, tmp_path / folder, "--chips", str(chips),
                                                                     "--max-samples", str(32 * 4))],
                              cwd=GPU, env=env, capture_output=True, text=True)
        assert done.returncode == 0, done.stderr[-3000:]
        assert f"{chips} x" in done.stdout
    a = torch.load(tmp_path / "one" / "last.pt", weights_only=False)["net"]
    b = torch.load(tmp_path / "two" / "last.pt", weights_only=False)["net"]
    for k, v in a.items():
        assert torch.allclose(v, b[k], atol=1e-5, rtol=1e-4), k
