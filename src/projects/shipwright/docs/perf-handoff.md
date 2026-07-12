# Shipwright Perf — Handoff (updated 2026-07-12)

The living pick-up point. **Cost model:** [`PERFORMANCE.md`](./PERFORMANCE.md). **Measured data +
methodology:** [`perf-experiments.md`](./perf-experiments.md). This doc is *state + open threads*.

## Where things stand

The frame is **GPU-bound at ~11.7 ms / ~72 fps** (780M, 1600×900, open water). It was **16.5 ms /
55 fps** before this session. Two bugs accounted for the difference; both are fixed and verified.

CPU is ~2.8 ms and nearly all driver submission. Physics is ~0 with the single gameplay raft. **Every
remaining lever is on the GPU.**

### What landed (2026-07-12)

| | effect | verified by |
|---|---|---|
| **Buoy lanterns leave the graph in daylight** | −1.1 ms overall, **−3.7 ms (−17 %) on the gameplay frame** | interleaved A/B/A/B |
| **No multisampled context when a composer runs** | **−3.2 ms (−21 %)**, pixel-identical | `tools/verify-msaa.mjs` (byte-equal PNGs + a control shot) |
| **Shadow map drawn once a frame, not 3×** | −0.24 ms | `tools/verify-shadow-cache.mjs` (byte-equal PNGs) |
| Benchmark now runs `daylight.update` | — | it was never called; the bench frame was missing a system the real frame runs |
| Render census fixed | — | reported `1 draw call · 1 triangle` for a 114-mesh scene; now 42 / 5,340 |
| Flight covers the game | — | added `fp-sail` (the sailor's-eye gameplay frame), `island-approach`, `twilight` |

New instrument: `tools/sweep.mjs` (the whole suite, unattended, re-baselining per tier) +
`tools/report.mjs` (folds it into tables, flags anything whose passes disagree by >3 %). One full sweep
is 156 runs / ~5.5 h.

## The decisions waiting for Kyle

These are trades, not bugs. I measured them; I did not take them.

### 1. The composer target's MSAA — **~4.5 ms (≈ 38 % of the current frame)**

Now that the context's dead MSAA is gone, the composer's HalfFloat target (`bloom.samples`, default 4)
is the **only** thing antialiasing the scene's geometry. Dropping it to 0 buys ~4.5 ms and costs
aliased edges — the horizon, spruce silhouettes, buoy rims.

Options, in the order I'd suggest:
- **Keep 4.** The frame is already at 72 fps; buy the perf elsewhere (LOD ocean, below).
- **Drop to 0 and lean on render scale.** The scene already supersamples at DPR ≥ 1.5, which
  antialiases everything MSAA can *and* the shader shimmer MSAA can't. On a 2× DPR display this may be
  visually free. Wants an A/B by eye at native res.
- **Make it a quality tier** — 4 on strong GPUs, 0 on weak ones.

I'd want your eye on it before touching it — this is the "photorealistic sea" the project exists for.

### 2. Buoyancy Newton iterations — **~1.7 ms** at 4 → 2

A **fidelity** trade: the sampled waterline drifts from the rendered one. At the calm gameplay sea the
horizontal displacement is tiny, so 2 iterations may be indistinguishable — but "may be" is a thing to
look at, not to assume. Only bites at high body counts (it's ~0 with one raft), so **not urgent**.

## The next perf project: the camera-following LOD ocean — **~8 ms, no quality cost**

This is the biggest single win available and it is **larger than everything else combined**.

Coarsening the ocean grid from the default 4.9 m quads to 20 m takes the GPU frame from **15.9 → 8.6 ms**.
The plane is ~1 M vertices, its vertex shader runs 4 Gerstner waves (sin/cos ×4) + analytic normals per
vertex, and it is drawn **twice a frame** (SSR pass + main pass).

Uniform coarsening is not shippable — the short (48/70 m) waves facet, which is exactly why the fine
grid exists. But the detail is being spent on **far water that doesn't need it**. A camera-following
high-density patch + a coarse far plane keeps the near waves exactly as they are and reclaims most of
the ~8 ms.

**This reverses the old guidance.** `CLAUDE.md` and the old `PERFORMANCE.md` both said the ocean is
"NOT vertex-bound", that tessellation is the "least impactful" lever, and that LOD should **not** be
done pre-emptively. That was wrong — it came from an experiment that measured render-prep **CPU** (which
is genuinely flat in tessellation) and generalised it to the GPU, which was never tested. Both docs are
corrected.

## Open threads

1. **LOD ocean** (above). The frontier.
2. **Terrain is unoptimised — 4.2 ms whenever land is in frame**, and land is the game. No LOD, no
   impostors for the ~1,000 instanced spruce; it lands in the capture pass *and* the shadow map. It was
   hidden from every benchmark until now (`island.object.visible = false`, to keep old runs comparable),
   which is why it had no attribution at all despite shipping in roadmap #7.
3. **Contact-heavy physics is still unmeasured.** `--collision off` is free *because the bench hulls are
   laid out non-overlapping* and never touch. Crowded/touching ships would surface a real collision cost.
   A contact-heavy bench scene is the missing experiment.
4. **No regression gate.** The bench JSON is keyed by git SHA; a gate (fail if p95 rises >X % vs a stored
   baseline) is the natural next step now that the numbers are trustworthy and a sweep is one command.

## Gotchas (do not rediscover these)

- **Interleave every A/B, or thermal drift will invent a finding.** In this very sweep, `--buoys off`
  read **−5.7 ms (−36 %)** across two agreeing passes and **did not reproduce** interleaved (real: −1.1).
  Two passes agreeing is *not* enough if both sit in the same thermal regime. Run A → B → A, warm, in one
  session. `sweep.mjs` re-baselines per tier for this reason.
- **three charges you for things you believe are switched off.** A `PointLight` at `intensity = 0` still
  compiles into `NUM_POINT_LIGHTS` and runs a BRDF loop per fragment. A hidden `Object3D` still gets its
  matrix updated, ×3 passes/frame. If you are not using it, take it **out of the graph**.
- **`setGrade` re-routes the entire renderer.** Any grade or bloom flips the shared hook onto an
  EffectComposer path with its own HDR target. Nothing at the call site suggests this. It is why the grade
  silently inherited the cost the project had already rejected bloom over.
- **Never read `renderer.info` after the frame** — three resets it per `render()` call, so you get the
  last pass (the composer's fullscreen quad), not the scene.
- **Scene-graph node count ≠ draw calls**, and `updateMatrixWorld` walks hidden nodes. Watch the census
  node count as ships grow. Instance; don't multiply nodes.
- **The bench API is dev-only unless you opt in.** `NEXT_PUBLIC_SHIPWRIGHT_BENCH=1` exposes it in a prod
  build (Vercel never sets it). Use a prod server for unattended sweeps — a dev server's Fast Refresh
  remount destroys an in-flight run.
- **`--ssr-cutoff` is a dead knob.** Measured flat twice. Don't reach for it.

## How to re-run

```bash
# one run
node src/projects/shipwright/tools/bench.mjs --label check --url http://localhost:3001/3d-games/shipwright

# the whole suite, unattended (~5.5 h) — against a PRODUCTION server so nothing hot-reloads mid-run
NEXT_DIST_DIR=.next-bench NEXT_PUBLIC_SHIPWRIGHT_BENCH=1 npx next build
NEXT_DIST_DIR=.next-bench NEXT_PUBLIC_SHIPWRIGHT_BENCH=1 npx next start -p 3005 &
node src/projects/shipwright/tools/sweep.mjs --url http://localhost:3005/3d-games/shipwright --passes 2
node src/projects/shipwright/tools/report.mjs            # fold it into tables

# the two pixel-identity guards
node src/projects/shipwright/tools/verify-msaa.mjs --url http://localhost:3005/3d-games/shipwright
node src/projects/shipwright/tools/verify-shadow-cache.mjs
```
