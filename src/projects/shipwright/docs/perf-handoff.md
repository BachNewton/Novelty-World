# Shipwright Perf — Handoff (updated 2026-07-08)

The single living pick-up point for Shipwright perf work. **Measured data + analysis live in
[`perf-experiments.md`](./perf-experiments.md)** (tables, methodology); the **cost model** is in
[`PERFORMANCE.md`](./PERFORMANCE.md). This doc is the *state + open threads*.

## Where things stand

- **Baseline captured** (SHA `3ad3cea`, AMD 780M / Ryzen 7 7840U): Tier 0 census, E1 render-scale, E2
  reflection-res, E3 water, P3 body-count, native-res anchor, a spikes/smoothness pass, and **E6 (SSR
  on/off)**. 2 interleaved passes, agreed within 1–2% (no thermal drift). All in `perf-experiments.md`.
- **Landed since:** the E6 knob (`--ssr off`) + GpuTimer stale-value fix; player **voxel building**
  (place/break/drop, commit `10bfdbf`); and the **`--collision off`** knob + collision-resolution finding
  (commit `0151ad6`, Tier 4). Current `main` ≈ `41aa47d`.
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
4. **The real combined frame is CPU-bound** (`both` mode: ~18 ms CPU vs ~10 ms GPU at 1600×900; ~41 fps
   at native res). Of the ~18 ms CPU, physics is ~6 ms; the other ~12 ms is render-prep (Gerstner CPU
   field + ANGLE→D3D11 draw-call submission) — **not yet split** (see thread 3 / task B).
5. **Spikes: 1%low ≈ half the avg in every mode**, ~2–3% frame-hitch rate uniform across all segments → a
   per-frame-allocation / GC signature (a fixable *global* cause). See thread 2.
6. **Collision RESOLUTION is ~free** (Tier 4, `--collision off`): `phys` moves <2% (noise) at 31 and 64
   bodies, because the bench bodies are non-overlapping. So `phys` = broad-phase collider maintenance +
   per-voxel buoyancy, **not** contacts. A contact-heavy (crowded-ships) scene would differ — unmeasured.

## Open threads / next actions

### 1. Render batching — draw-call submission  ← current focus

**Theory to test (measure, don't assume):** when many bodies are in the scene, the FPS drop is draw-call
**submission** (CPU feeding meshes to the GPU), NOT Rapier physics. Each body is submitted **twice** per
frame — the water's scene-capture pass renders the whole scene (bodies included) before the main pass
(verified: `scene.ts` `renderPrePasses` runs even with SSR off; only the SSR march is gated). Prove or
kill this before building anything.

**Evidence so far (believed, not isolated):**
- Census (finding 4): real frame is CPU-bound, dominated by draw-call submission, not physics.
- `--collision off` (finding 6): contacts are ~free → physics isn't the wall.
- Live: SSR off + no bodies = **100 FPS**; add the physics testbed → **20–30**; **pause physics** (freezes
  the step, bodies *still render*) → only **~75**. The 100→75 gap is the bodies' *render* cost; the
  75→20–30 gap is the step. Pausing removes the step, not the drawing.

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

**The plan:**
1. **TEST the theory** — isolate body draw-submission from the step. Preferred: **seam timers** (this *is*
   thread 3 / task B applied to render — wrap `renderPrePasses` + main render in `performance.now()`,
   self-report like `physicsMs`, add `bench.mjs` columns). Quick alt: a **"hide bodies" toggle**
   (`.visible=false` while stepping) A/B'd against "bodies visible + physics paused". Run **headed** too
   (that's where 100→75 was seen). Success = a number showing draw-submission dwarfs the step at gameplay
   body counts; if not, stop — the theory's wrong.
2. **Quick POC** — smallest draw-call reduction, measured on `--bodies N`. Let Step-1 numbers pick the
   technique: draw-CALL count → global instancing; matrix upload / capture fill → merged-per-body. Don't
   pick before measuring.
3. **TEST again** — POC vs baseline (`--mode both` + live headed). Confirm draw-submit dropped and you
   didn't trade draw-calls for matrix churn.
4. **FULL impl** (only if fruitful) — uniform across all bodies, integrated with place/break/split/drop.
   Large ships → **chunked greedy meshing** (edit re-bakes only the affected chunk; includes face culling)
   — the render twin of greedy-meshing the colliders. Keep it deterministic for host-authoritative co-op.

**Pointers:** `physics.ts` (`Visual` / `placeInstances` / `buildMergedVoxelGeometry` / `makeMesh`),
`scene.ts` (`renderPrePasses`). The GUI "pause physics" freezes the step but keeps bodies rendering — the
manual version of the Step-1 A/B.

### 2. Kill the per-frame-allocation spikes  ← highest felt-quality win (finding 5)
- **Hypothesis:** steady per-frame allocation triggers periodic GC → the uniform ~2–3% spike rate.
- **Concrete suspects (located):** `ocean.sampleSurface` allocates 1 `new THREE.Vector3`;
  `ocean.sampleParticle` allocates 2 (`ocean.ts` ~L799, L814–816). These run **per nav-buoy and per
  buoyancy sample-point, every frame** (nav-buoys sample in *all* modes → explains visuals-mode spikes).
  `benchmark.ts` camera-pose helpers also return fresh objects/arrays each frame (minor, bench-only).
- **Fix:** refactor the samplers to write into caller-provided scratch vectors (out-params). Audit
  `stepBenchmark`/`onFrame` and every `*.update` it calls for other per-frame `new`/array-literal churn.
- **Confirm:** a **headed** Chrome DevTools profile (JS flamechart + GC markers / heap sawtooth) before &
  after — some headless spikes may be GpuTimer-readback / rAF-pacing artifacts, so prove it real-time.

### 3. CPU seam timers — split the ~12 ms render-prep (shared with thread 1)
- Wrap `ocean.update` and `renderPrePasses` (and optionally `navBuoys.update`) in `performance.now()` spans
  in `scene.ts` `stepBenchmark`, self-report alongside `physicsMs`, add `bench.mjs` columns. Tells us
  draw-call-submission vs Gerstner-field. **This is Step 1 of thread 1** — doing it advances both.

### 4. E5 — Fresnel cutoff (`--ssr-cutoff`)  ← grazing/worst-case + anti-spike lever
- Expose `uSsrMinFresnel` (`ocean.ts`, default 0.05) as a runtime setter + `--ssr-cutoff`, **mirroring how
  E6 wired `--ssr off`** (and how the `--collision off` knob was wired — see commit `0151ad6` as a fresh
  template). Sweep 0.02 / 0.05 / 0.1 / 0.2; record `grazing-storm` + `max-stress` `ssr` p50 **and p95**.

### 5. Lower priority
- **E4 SSR steps** — `SSR_STEPS=20` is a compile-time constant (`ocean.ts`); needs a runtime
  uniform-loop-break or rebuild-per-value. Lower value given E6.
- **Main-shader Tier-2** — measure PBR vs the parked Phong (git ~`7085226`) + the composite cost.
- **Reconcile `PERFORMANCE.md`** — fold in DVFS-sublinearity, the CPU-bound real frame, spike/1%low reality.
- **Physics-side measurements** (separate from render, same "measure from the seams" work):
  **buoyancy vs broad-phase split** (`applyBuoyancy` vs `world.step` timers — decides if greedy-meshing
  *colliders* is worth it for large ships), and a **contact-heavy bench scene** (the crowded-ships collision
  cost the non-overlapping grid hides — finding 6 caveat).

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
