# Policy bundles

Everything `landon-v1` and `landon-exploiter-v1` know is in a **bundle**: a
directory with exactly two files.

```
public/bundles/<name>/
  manifest.json    the contract — feature layout, head geometry, masking, digests
  policy.onnx      the weights
```

Both are committed. Node reads the directory off disk synchronously at the first
consultation (`bundleDir` in `landon.ts`); a browser fetches the same directory
over HTTP, because Next serves `public/` statically and the loader's default
prefix is `/bundles`. One copy in the repo, served two ways. A fresh clone plays
the learned policy with nothing to configure.

`manifest.json` carries `files[]`, and **every entry is sha256-verified on every
load** — Node and browser alike (`loadBundleSync` / `warmup` in `bundle.ts`). A
digest mismatch is a refusal, not a warning: the manifest describes byte offsets
into a feature blob and column indices into logit grids, so a graph that is not
the graph the manifest describes produces confident, wrong moves rather than an
error.

## The weights are float32 — the exported artifact, unmodified

Each `policy.onnx` is **13,582,334 bytes of float32**, byte for byte the graph the
training rig exported. `manifest.sha256` is that file's digest, and it is the same
digest the parity fixtures were recorded against, so `assertFixtureBundle` is a
plain equality check with no derived-graph escape hatch: the thing being measured
IS the trained policy, not something that resembles it.

That is the whole standard. The bot has to function as it was trained, and only
one artifact satisfies that by construction.

### float16 was evaluated and REJECTED

Storing the initializers as float16 (inputs and outputs left float32, so the
runner's I/O contract is unchanged) halves each bundle — 13,582,334 → 6,814,728
bytes. It was shipped briefly on the claim that it was decision-identical to the
fp32 artifact. **That claim was false**, and three independent measurements refute
it:

| measurement | result |
|---|---|
| greedy decode, post-mask, 12 games / four seatings | **65 divergent decisions / 10,278** — 1 in 158; 8 of 12 games fork |
| independent 4-game replay, whole intent streams | **3 of 4 games diverge**; trace digests differ |
| `onnx/parity.test.ts` raw argmax flips, 400 cases | **76 flips on `trade_cand_logits`** |

**64 of the 65 divergences are the trade-candidate head**, and that head is the
whole explanation: it scores a list of generated offers that are frequently
near-equivalent, so its top two columns sit inside fp16 representation error
constantly. The 65th is one auction bid rung.

The third row is the one that had been misread. `onnx/parity.test.ts` reports both
*raw* and *decisive* argmax flips, and only the decisive count was being read —
but "decisive" deliberately excludes near-ties, which are exactly the cases a real
game walks into. The parity fixtures' own 400/400 argmax agreement is true and
does not generalise for the same reason: 400 recorded observations do not reach
those ties.

13.5 MB is not worth shipping a policy that measurably is not the trained one.
Anyone considering quantisation later should read the table above as the bar to
clear, and note that a head scoring near-equivalent candidates is where it will
fail first. **Mixed precision is not a middle path here** — the divergent head is
the one that would have to stay fp32, at which point almost nothing is saved.

## Producing a bundle

`export_onnx.py` lives with the **training rig**, not here; a bundle is an
artifact of that rig and this repo consumes it. Nothing is done to the graph after
export — no conversion step, no repacking — which is the point.

For the record, since the rejected fp16 path is the obvious thing to reach for
again: `convert_float_to_float16` produces two files that look fine and are not.

**1. It emits invalid ONNX around pre-existing `Cast` nodes.** It retypes such a
node's declared *output* to float16 but leaves the node's `to` attribute still
saying float32. The result **passes `onnx.checker.check_model`**, and is then
refused at load by onnxruntime *and* by this repo's interpreter. The repair is to
bring each `Cast`'s `to` back in line with the type the converter declared for its
output, and to re-validate with:

```python
onnx.shape_inference.infer_shapes(model, strict_mode=True, check_type=True)
```

`strict_mode` is the part that matters — it makes shape inference type-check every
node instead of giving up silently, which is why the mis-typed `Cast` sails past
the default settings.

**2. The masked-fill constant is clamped.** `-3.4028235e+38` (fp32 min) is not
representable in fp16, and the converter rewrites it to `-1e4`. That is a real
semantic edit, not a re-encoding — it happened to be harmless in this graph
because the constant feeds a `ReduceMax` over seats where at least one seat is
always present and every activation is far below 1e4, but it would not be in a
graph where the fill can win. `manifest.masking.neg_inf` is a separate thing,
applied by this runner rather than baked into the graph; `parity.test.ts` mutates
it to prove the masking is load-bearing.

## Parity fixtures

`fixtures/parity-<name>.json.gz` — recorded observations paired with the reference
masked distributions the trainer's own code produced for them. Committed gzipped:
2.5 MB each raw, 121 KB for the pair compressed. Read synchronously via
`readFixtureText` in `assets.ts` (`gunzipSync`), because the measurement runs from
plain `it()` bodies with no await in reach. `PPO_ASSETS_DIR` points the fixture
lookup at an out-of-repo tree instead, and accepts the recorder's uncompressed
layout, which is how a replacement fixture is checked before it is compressed and
committed.

## Running evaluation faster: `PPO_EXECUTOR=ort`

The shipped interpreter runs this graph at **~18 ms per decision**. That is fine
in a game — a human is deciding too — and brutal in an evaluation: a full
`sim:ratings` refresh is tens of thousands of games, i.e. hours of pure `run()`.
`onnxruntime-node` runs the same graph at **~1 ms**, and offline runs can opt into
it:

```bash
PPO_EXECUTOR=ort npm run sim:ratings
```

**Unset, nothing changes.** No worker, no native module, no import an app build
can reach: `bots/ppo/offline-ort.ts` is imported only by `bots/eval/` entry
points, and nothing under `bots/eval/` is statically reachable from
`bots/versions/index.ts`. Set but unwired, it **throws** — a silent fall back to
the slow path would cost an operator eight hours of waiting for a run they
believed was eighteen times faster.

It runs **the shipped bundle**. There is no substitute graph and no second bundle
root, because there is only one artifact: the fp32 export both executors read. The
only thing `PPO_EXECUTOR=ort` changes is who multiplies the matrices. (This is
also why the fp16 bundle would have been awkward here even if it had been faithful
— ORT's f16 CPU kernels round each op's output back to half while the interpreter
upcasts f16 initializers and accumulates in fp32, so on a narrowed graph the two
would have been different players.)

### How close is it, measured

`eval/ort-check-cli.ts` plays whole games and compares the complete intent
streams, which is the only thing that settles it — a distribution can agree to
1e-4 everywhere and still cross a near-tie argmax, and one crossed tie forks the
rest of the game.

```bash
npx tsx src/projects/monopoly/bots/eval/ort-check-cli.ts --out /tmp/ts.json
PPO_EXECUTOR=ort \
  npx tsx src/projects/monopoly/bots/eval/ort-check-cli.ts --out /tmp/ort.json
diff /tmp/ts.json /tmp/ort.json && echo IDENTICAL
```

It is also how a candidate bundle is checked against the artifact it claims to be
— point `PPO_BUNDLE_DIR` at the other tree and diff the traces:

```bash
npx tsx …/ort-check-cli.ts --out /tmp/shipped.json
PPO_BUNDLE_DIR=/path/to/other/bundles npx tsx …/ort-check-cli.ts --out /tmp/other.json
diff /tmp/shipped.json /tmp/other.json && echo IDENTICAL
```

| comparison | what varies | result |
|---|---|---|
| shipped `public/bundles` vs the rig's export | nothing — same bytes | **0 divergences**, identical trace digests (4 games, 3,783 intents) |
| interpreter fp16 vs interpreter fp32 | the **weights** | **65 / 10,278** (1 in 158); 8/12 games fork |
| ORT vs interpreter, same fp32 graph | the **executor** | **4/4 traces fork** (first divergence at intent 112–338) |

Row 1 is the one that matters and it is the acceptance bar: what is in
`public/bundles/` produces the same game, decision for decision, as the artifact
the training rig wrote. Row 2 is the measurement that retired the fp16 bundle,
kept as the record of it.

**Row 3 is a correction.** This was previously recorded as "byte-identical intent
streams, zero divergence", and that is not reproducible — re-measured on the
default four seeds and seatings, every trace forks. The cause is visible in
`onnx/parity.test.ts`'s *raw* flip counts on the fp32 graph: `landon-v1` 0/400,
`landon-exploiter-v1` **2/400 on `trade_cand_logits`**, worst elementwise
disagreement 4.2e-5. Both flips are inside the tie margin, so the decisive count
is 0 and the suite is green and honest — but a game walks into those ties, and one
crossed tie forks the rest of it.

That is not the fp16 problem in miniature and should not be read as one. fp16
changed the **weights**; ORT changes the **summation order** on the same weights,
which is a legitimate degree of freedom ONNX does not pin down (ORT blocks and
vectorises its matmuls; this executor unrolls by four, and fp32 addition is not
associative). Nothing on the shipped path is affected: the browser and every
`npm run sim` play the interpreter over the fp32 graph, and that pairing is exact
against the trainer's own recorded distributions.

What it does mean is narrower and worth stating: **an Elo produced under
`PPO_EXECUTOR=ort` is the ladder's number for a player that picks a different
near-equivalent trade offer a fraction of a percent of the time.** For rating a
bot against a field that is the right trade — 400-game pairings have SE ~2.5pp and
these divergences are between offers the policy itself scores as equivalent — but
it is a rating tool, not a replay tool. Anything that has to reproduce a specific
game must run the shipped interpreter.

`PPO_ORT_THREADS` (default 1) sets ORT's own thread count. Leave it at 1 under
`eval/parallel.ts`, which already saturates the machine with worker threads.
