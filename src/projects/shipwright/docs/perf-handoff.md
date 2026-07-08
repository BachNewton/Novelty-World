# Shipwright Perf — Handoff (updated 2026-07-09)

The single living pick-up point for Shipwright perf work. **Measured data + analysis live in
[`perf-experiments.md`](./perf-experiments.md)** (tables, methodology); the **cost model** is in
[`PERFORMANCE.md`](./PERFORMANCE.md). This doc is the *state + open threads*.

## [2026-07-09] THREAD 1 SOLVED — the render-prep floor was hidden debug nodes

**The "~16 ms render-prep" that this doc called the one unexplored bottleneck was scene-graph
TRAVERSAL over thousands of hidden force-arrow debug objects — not draw calls, pixels, or vertices.**
The seam timers (thread 1's actual task) were built, and they + a render census found it:

- The scene graph held **~12,800 `Object3D` nodes** (visuals) / **~30,000** (both, 32 bodies) but only
  **11–44 draw calls**. The bulk were force-arrow `ArrowHelper`s — one per voxel + void cell per body
  (~3 nodes each) — **created eagerly even though the "force arrows" overlay defaults OFF**. three.js'
  `updateMatrixWorld` traverses hidden nodes too, on **every** `renderer.render` (capture + SSR + main
  = 3×/frame), so ~12,800 nodes were walked ~38,000×/frame. That traversal was the entire CPU floor.
- Ruled out first (all null → the levers this doc assumed were wrong): render-scale (fill),
  `--quad-size` (a new E8 knob: 1 M→128 plane verts, no change), `--gpu-timer off` (the dev overlay),
  and a `--bare-probe` empty render (~0 ms). The cost was pixel- AND geometry-independent.
- **Fix (commit `bd2c693`): build the arrow objects LAZILY** — only while the toggle is on. No visual
  change with arrows off (they never drew); GPU-ms unchanged. Verified arrows still render when on.

| p50, 780M, headless | scene objects | render CPU (capt+ssr+main) | total CPU | avgFPS |
|---|---|---|---|---|
| **visuals** before→after | 12,792 → **72** | 9.0 → **0.8 ms** | 9.0 → **0.8** | → **109** |
| **both/32** before→after | 29,873 → **107** | 20.1 → **1.4 ms** | 30.1 → **9.9** | 44 → **100** |

**The frame is now PHYSICS-bound** (both/32 ≈ 8.5 ms physics vs ~1.4 ms render CPU). The GPU-fill levers
(render-scale/reflection-res/ssr-cutoff/E7 capture-scale) were never the lever for this — they move
GPU-ms (now co-equal, ~9.5 ms), not the CPU floor. **New frontier: the buoyancy loop** — the physics
seam split (commit `b9348b0`) shows per-voxel buoyancy is **~67 %** of the step (solver ~27 %), linear
in body count. See thread 5. New diagnostic knobs kept: `--quad-size`, `--gpu-timer off`, `--bare-probe`,
and the render census (draw calls + scene-graph size) in every run's header.

## Where things stand

- **Baseline captured** (SHA `3ad3cea`, AMD 780M / Ryzen 7 7840U): Tier 0 census, E1 render-scale, E2
  reflection-res, E3 water, P3 body-count, native-res anchor, a spikes/smoothness pass, and **E6 (SSR
  on/off)**. 2 interleaved passes, agreed within 1–2% (no thermal drift). All in `perf-experiments.md`.
- **Landed since:** the E6 knob (`--ssr off`) + GpuTimer stale-value fix; player **voxel building**
  (place/break/drop, commit `10bfdbf`); the **`--collision off`** knob + collision-resolution finding
  (commit `0151ad6`, Tier 4); and the **2026-07-09 render-prep session** — CPU seam timers (`0b4f70f`),
  the `--quad-size`/`--gpu-timer`/`--bare-probe` diagnostics (`430270e`), the **lazy-arrows fix**
  (`bd2c693`, the thread-1 resolution above), and the **physics-step seam split** (`b9348b0`). Current
  `main` ≈ `b9348b0`.
- **Servers:** none left running. Start `npm run dev` (port 3001) to bench. No prod build needed.
- **`.bench/` data** is gitignored but present locally under `src/projects/shipwright/.bench/`
  (`census-*`, `e1-*`, `e2-*`, `e3-*`, `p3-*`, `native-*`, `e6-*`, `coll-*`). Re-runnable any time.

## The findings that matter (condensed)

1. **GPU cost is DVFS-sublinear in resolution** — 4× pixels ≈ 1.2× cost. 1600×900 under-loads the 780M
   (per-pixel numbers there can under-represent the boosted native-res game). Absolute ms still valid.
2. **SSR is ~37% of the average frame** (E6 on/off), NOT the ~25% the isolated `ssr` pass timer shows —
   the timer misses the SSR sampling cost inside the `main` pass. `main` is the largest single isolated
   pass; SSR is a co-equal true cost.
3. **SSR-off saves ~37% in calm/moderate views but ≈0 at grazing** — at grazing the env-map fallback is
   as expensive as the SSR march. The lever for the worst case is the **Fresnel cutoff** (E5), not on/off.
4. **The real combined frame WAS CPU-bound on render-prep — now RESOLVED** (see the 2026-07-09 callout
   at the top). The "~12–16 ms render-prep" split (seam timers) attributed it to **scene-graph traversal
   over ~12,800 hidden force-arrow debug nodes**, NOT the Gerstner CPU field (measured **0 ms**) or draw
   submission. Lazy arrows cut render CPU to ~1.4 ms (both/32). The frame is now physics-bound (~8.5 ms,
   of which buoyancy is ~67 %). Historical FPS numbers here (~41 fps native) were partly this artifact
   AND were optimistic — the old bench never counted the main-render CPU submit (the seam timers now do).
5. **Spikes: 1%low ≈ half the avg in every mode**, ~2–3% frame-hitch rate uniform across all segments → a
   per-frame-allocation / GC signature (a fixable *global* cause). See thread 2.
6. **Collision RESOLUTION is ~free** (Tier 4, `--collision off`): `phys` moves <2% (noise) at 31 and 64
   bodies, because the bench bodies are non-overlapping. So `phys` = broad-phase collider maintenance +
   per-voxel buoyancy, **not** contacts. A contact-heavy (crowded-ships) scene would differ — unmeasured.
7. **Render batching / instancing is NOT the lever — RULED OUT (2026-07-08), and correctly so.** Every
   body is already ONE draw call, and draw-call *count* was confirmed trivial (11–44) by the render
   census. The doc was right that batching is a non-problem — but it then reasoned that draw-call count
   being small meant render-prep was cheap, which was the wrong conclusion: the cost was **scene-graph
   node count** (~12,800, mostly hidden debug arrows), which `updateMatrixWorld` walks regardless of draw
   count. Lesson: **measure the scene-graph size, not just draw calls** — a scene can have 35 draws and
   30,000 nodes. Resolved by lazy arrows (see the top callout). The per-voxel matrix-posing A/B (−0.4 ms,
   noise) still stands as a separate, correct non-lever.

## Open threads / next actions

### 1. ✅ DONE (2026-07-09) — render-prep floor was hidden debug nodes; lazy arrows fixed it

Resolved — see the top callout + findings 4/7. The seam timers shipped (`0b4f70f`), the split pointed at
scene-graph traversal (not the Gerstner field or draw submission), the census found ~12,800 hidden
force-arrow nodes, and lazy arrows (`bd2c693`) cut render CPU ~11× with no visual change. The
depth-only-capture idea below is **moot for CPU** (the cost was traversal, not the capture draw) but may
still help **GPU-ms**, which is now co-equal with physics (~9.5 ms) — file it under the GPU levers (E7).

**The rest of this section is REFERENCE for the eventual large-ship / many-body meshing work** — still
valid and worth keeping. Note the census now gives a cheap guardrail: **watch scene-graph node count**, not
just draw calls, as ships/bodies scale (a place/break adds real nodes; the arrow overlay is lazy now).

**Ruled out — do NOT re-run (see finding 7):** render *batching* / instancing is a dead end.
Bodies are already 1 draw call each; draw-call count is trivial; a global InstancedMesh solves a non-problem.
The per-voxel matrix-posing fix (pose the mesh node once instead of rewriting every instance each frame) was
implemented, A/B'd interleaved, and measured **neutral (−0.4 ms, noise)** — the first 23% reading was
thermal. The change was **reverted** (perf-neutral + unverified visually); it's cleaner code if ever wanted,
but it's not a perf lever.

**Live evidence that the render cost is real (still valid):** SSR off + no bodies = **100 FPS**; add the
testbed → **20–30**; **pause physics** (freezes the step, bodies *still render*) → only **~75**. The 100→75
gap is the bodies' *render* cost (which the 16 ms split will finally attribute); the 75→20–30 gap is the step.

> **The rest of this thread (constraints, lever taxonomy, meshing plan) is REFERENCE for the eventual
> large-ship / many-body meshing work** — valid and worth keeping, but it is **NOT a current perf lead**
> (thread 1 is resolved; the frontier is buoyancy, thread 5). Read it when ships actually get large.

**Design constraints (LOCKED by game direction):**
- **No 1×1×1 special case.** A Q-dropped single voxel is a ship at size 1; it grows. Treat a 1-voxel body
  and a 1000-voxel body identically. (A "kinematic tier for tiny bodies" idea was floated and **rejected**.)
- **Ships get large** (≥10× the ~113-voxel raft) and **multiple coexist**, plus potentially **many** bodies.
  Both "large body" and "many bodies" are real load. The raft is a throwaway test object — don't optimize
  around its scale; it's only the *technique* reference (the one body already rendered as a merged mesh).

**The render levers, and what each actually reduces (do not conflate them):**

| lever | draw calls | triangles / memory | per-frame transforms | edit cost |
|---|---|---|---|---|
| per-body **InstancedMesh** (demos now) | 1 / body | same (full boxes, internal faces incl.) | per-voxel matrix | cheap |
| **merged mesh / body** (raft now) | 1 / body | same (full boxes) | 1 matrix / body | re-bake |
| **global InstancedMesh** (all bodies) | **1 total** | same | per-voxel matrix | shared-buffer bookkeeping |
| **face culling** | — | fewer (drop hidden faces) | — | — |
| **greedy visual meshing** (cull + merge coplanar faces) | 1 / mesh | **far fewer** | 1 matrix / body | re-bake (chunk it) |

Key: **instancing cuts draw calls, keeps triangles; greedy visual meshing cuts both** (face culling is its
first half). Face culling reduces *triangles + memory*, **not draw calls** — so it does NOT help the
draw-submission bottleneck (though it's worth it for large-ship memory + edit-rebake, and as insurance if
the bodies ever turn out vertex-bound; note our hollow hulls waste fewer internal faces than solid blocks).

**Deferred large-ship meshing plan** (do this when ships get big enough that *triangle count / memory /
edit-rebake* actually bite — NOT a current perf lead; it does **not** cut draw calls, which are already
minimal): **greedy visual meshing** (cull hidden faces + merge coplanar faces into quads) per **chunk**,
uniform across all bodies, integrated with place/break/split/drop, chunked so an edit re-bakes only the
touched region, and deterministic for host-authoritative co-op — the render twin of greedy-meshing the
colliders.

**Pointers:** `physics.ts` (`Visual` / `placeInstances` / `buildMergedVoxelGeometry` / `makeMesh`),
`scene.ts` (`renderPrePasses`). The GUI "pause physics" freezes the step but keeps bodies rendering — the
manual version of the Step-1 A/B.

### 2. Per-frame allocation — audit; note spikes are now ~0 in the clean benches
- **Status update (2026-07-09):** the post-lazy-arrows benches show **0 spikes** across all segments
  (both/visuals), so finding 5's motivation is now weak in headless — some of it may have been the arrows
  bloating traversal. Still worth the cleanup for GC hygiene, and it **overlaps the new #1 cost** (thread 5).
- **Concrete suspects (located):** `ocean.sampleSurface` allocates 1 `new THREE.Vector3` (the normal),
  `ocean.sampleParticle` allocates 2 (`ocean.ts` ~L799, L811–816). **`applyBuoyancy` calls both PER VOXEL
  PER SUBSTEP** — `sampleSurface` for the height (and **discards the allocated normal** — line ~948 uses
  only `.height`), plus `waterVelocity` → `sampleParticle` ×2 → ~5 `Vector3`/voxel/substep (~16k/frame at
  32 bodies). This is inside the buoyancy loop that thread 5 shows is 67 % of physics.
- **Fix:** add non-allocating variants — a `sampleHeight(x,z,time): number` (buoyancy's hot path; safe,
  zero behaviour change) and an out-param `sampleParticle(...,outPos)` (for `waterVelocity`, which needs
  **two distinct** scratch vectors — a single shared scratch would alias `p1===p0` → zero velocity).
- **Confirm:** determinism holds (headless byte-identical), `physics.test.ts` green, and the buoyancy
  seam timer (thread 5) drops. A headed DevTools GC profile is the felt-quality check.

### 3. (merged into thread 1) CPU seam timers — DONE
Shipped with thread 1 (`0b4f70f`): `oceanMs`/`captureCpuMs`/`ssrCpuMs`/`mainCpuMs` on the sample, plus the
shared hook's `mainRenderMs()` (the main-render CPU submit, previously counted nowhere).

### 4. E5 — Fresnel cutoff (`--ssr-cutoff`)  ← GPU grazing lever (GPU is now co-equal with physics)
- Expose `uSsrMinFresnel` (`ocean.ts`, default 0.05) as a runtime setter + `--ssr-cutoff`, **mirroring how
  E6 wired `--ssr off`** (and how the `--collision off` knob was wired — see commit `0151ad6` as a fresh
  template). Sweep 0.02 / 0.05 / 0.1 / 0.2; record `grazing-storm` + `max-stress` `ssr` p50 **and p95**.
- Priority note: with the CPU render floor gone, **GPU-ms (~9.5 ms) is now co-equal with physics** as the
  frame ceiling — so the GPU levers (this, E7 capture-scale, E1 render-scale) matter again for the top end.

### 5. Buoyancy is the new #1 cost — optimize the per-voxel loop  ← FRONTIER
The physics seam split (`b9348b0`) shows **buoyancy ~67 % of the step, Rapier solver ~27 %**, both linear
in body count (32 bodies: 6.1 / 2.5 ms; 64: 11.6 / 4.6 ms). So:
- **Greedy-meshing the COLLIDERS (solver) is the smaller prize** — the solver is only 27 %. Deprioritize it.
- **The buoyancy sample loop is the lever.** Each voxel + void cell does a Gerstner `sampleSurface`
  (Newton-inverted) + a `waterVelocity` (2 `sampleParticle`s) every substep. Levers to explore: fewer
  sample points (sample per-N-voxels / per-face, not per-voxel), a cheaper height sample for buoyancy
  (the Newton inversion may be overkill when only submersion depth is needed), the out-param cleanup
  (thread 2), and — real-time only — the **substep count**: at low FPS the accumulator runs 2–N substeps
  (bounded by `MAX_SUBSTEPS`), multiplying the per-substep cost (headed 32-body `phys` was ~22 ms = ~2–3
  substeps of ~8.5 ms). A slow-frame→bigger-dt→more-substeps mild spiral; worth confirming behaviour.
- Still open: a **contact-heavy bench scene** (the crowded-ships collision cost the non-overlapping grid
  hides — finding 6 caveat).

### 6. Lower priority
- **E4 SSR steps** — `SSR_STEPS=20` is a compile-time constant (`ocean.ts`); needs a runtime
  uniform-loop-break or rebuild-per-value. Lower value given E6.
- **Main-shader Tier-2** — measure PBR vs the parked Phong (git ~`7085226`) + the composite cost.
- **Reconcile `PERFORMANCE.md`** — fold in DVFS-sublinearity, the (now-fixed) CPU render floor, the
  render census (scene-graph size ≠ draw calls), the physics split (buoyancy 67 %), spike/1%low reality.
- **Speed up the bench harness** (noticed 2026-07-08 — idle overhead around each flight). `bench.mjs` pays
  ~8–11 s/run of non-GPU wait: `goto(..., waitUntil: "networkidle")` (slow/flaky on the Next *dev* server,
  and redundant since we already `waitForFunction(__shipwright)` — switch to `"domcontentloaded"`); a fixed
  3.5 s settle (replace with a `window.__shipwright.ready` signal set after the PMREM bake + Rapier init);
  and `browser.close()` (~1–3 s, unavoidable). Trimming the first two speeds every run.

## Gotchas (don't rediscover them)

- **`GpuTimer.values()` carries the last per-span value forward** (for its panel), so a *skipped* span
  reports a stale reading. The benchmark forces `ssr = 0` when SSR is off — replicate that guard for any
  future "skip a pass" experiment (the `--collision off` knob needed no such guard — it doesn't skip a span).
- **Pause physics ≠ despawn.** The GUI "pause physics" freezes the step but keeps bodies **rendering** — to
  remove their render cost you must hide/despawn them, not pause. (This is the core of thread 1.)
- **Render-scale caps at 2×** (`maxPixelRatio`): `--render-scale 2.5`/`3.0` all render at 3200×1800. To
  exceed 5.76 MP, use a larger `--width`/`--height` viewport.
- **Bench control API is dev-only** (`window.__shipwright`, gated on `NODE_ENV !== "production"`). Bench
  against `npm run dev` (port 3001). A prod build will NOT expose it.
- **A/B'ing an engine change:** use two git **worktrees**, each running its own dev server on a different
  port (leave "A" untouched so it doesn't hot-reload while you edit "B"). Don't junction node_modules.
- **Per-run wall-clock ≈ 2 min** for a visuals run; physics runs are faster. A full sweep is ~1 hr — script
  it in the background.
- **Thermal masks A/B deltas.** A hot baseline vs a cooled "after" faked a **23% win** on 2026-07-08 that
  interleaved re-baselining exposed as noise (real Δ −0.4 ms). Always interleave (baseline → fixed →
  baseline) in one warm session, and trust p50 only on **0-spike** runs — a spiky run (e.g. 20 spikes) is
  thermally compromised; discard it.

## How to re-run

```bash
npm run dev                                    # port 3001; the bench API is dev-only
BASE=http://localhost:3001/3d-games/shipwright
node src/projects/shipwright/tools/bench.mjs --label census-vis --url $BASE                    # visuals
node src/projects/shipwright/tools/bench.mjs --label e6-off --mode visuals --ssr off --url $BASE
node src/projects/shipwright/tools/bench.mjs --label coll-off --mode physics --collision off --bodies 64 --url $BASE
# JSON lands in src/projects/shipwright/.bench/<label>/<host>-<sha>-<slug>.json — parse for tables.
```
Compare p50 (median); a delta < ~3% is noise. Diff `--ssr off` vs default for SSR's share; `--collision off`
vs default for contact-resolution's share.
