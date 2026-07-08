# Shipwright Perf — Render Batching (draw-call submission) Handoff

Pick-up point for the next perf thread. Cost-model background: [`PERFORMANCE.md`](./PERFORMANCE.md).
Measured tables: [`perf-experiments.md`](./perf-experiments.md). The prior thread's handoff (SSR/render
baseline + the seam-timer / allocation-spike tasks): [`perf-handoff.md`](./perf-handoff.md).

## The theory to test (do this FIRST — measure, don't assume)

**When many bodies are in the scene, the FPS drop is draw-call SUBMISSION (the CPU feeding meshes to the
GPU), NOT Rapier physics.** Rapier is doing fine; the cost is the per-body draw calls — and each body is
submitted **twice** per frame, because the water's scene-capture pass re-renders the whole scene before
the main pass. Prove or kill this theory before building anything.

### Evidence so far (why we believe it, but haven't isolated it)

- **Census** (`perf-experiments.md` Tier 0): the real combined frame is **CPU-bound**, dominated by
  ANGLE→D3D11 **draw-call submission**, not physics (~6 ms of ~18 ms was physics).
- **`--collision off`** (Tier 4): contacts are ~free → physics isn't contact-bound.
- **Live observation:** SSR off + no bodies = **100 FPS** (monitor cap). Add the physics testbed → **20–30**.
  **Pause physics** in the GUI (freezes the step; bodies still render) → only recovers to **~75**. The
  100→75 gap is the bodies' *render* cost; the 75→20–30 gap is the step. Pausing removes the step, not the
  drawing — so a big chunk of the drop is rendering the bodies, not simulating them.
- **Bodies render twice:** `scene.ts` `renderPrePasses` renders the whole scene (bodies included) into the
  colour+depth capture **every frame** (it runs even with SSR off — verified; only the SSR march is gated),
  then the main pass renders them again.

## Design constraints (LOCKED by the game direction — do not violate)

- **No 1×1×1 special case.** A Q-dropped single voxel is just a ship at size 1; it's expected to grow into
  a full ship. The render solution must treat a **1-voxel body and a 1000-voxel body identically** — no
  separate path for "debris." (A "kinematic tier for tiny bodies" idea was floated and **rejected** for
  this reason.)
- **Ships get large** — at least 10× the raft (≈1000+ voxels), likely more — and **multiple ships coexist**,
  plus potentially **many** simultaneous bodies. Both "large body" and "many bodies" are real load, not
  edge cases.
- **The raft is a throwaway test object** (~113 voxels). Don't optimize around its scale; it's only useful
  as the *technique* reference (it's the one body that already renders as a single merged mesh).

## Current render architecture (what's there today)

- Each body renders as **either** a per-body **`InstancedMesh`** (one instance per voxel — the demos) **or**
  a merged **single `Mesh`** (the raft: `merged: true, single: true`). See `physics.ts` `Visual.mesh`,
  `placeInstances`, `buildMergedVoxelGeometry`, `makeMesh`.
- The per-body **instanced** path writes a **full world matrix per voxel every frame** (`placeInstances`,
  non-`single` branch). The **merged** path poses **one matrix per body**. So merged is cheaper on
  per-frame transform work; instanced is cheaper on edits (no geometry re-bake).
- The water capture (`scene.ts` `renderPrePasses`) draws the whole scene into a colour+depth target each
  frame → **every body is submitted twice** (capture pass + main pass).

## The plan (test → POC → test → impl)

### Step 1 — TEST THE THEORY

Isolate the **body render-submission** cost from the physics step. Pick the cleanest of:

- **Seam timers** (preferred, reusable): wrap `renderPrePasses` (capture submit) and the main render in
  `performance.now()` spans in `scene.ts` `stepBenchmark`, self-report them in the bench sample alongside
  `physicsMs`, and add columns to `bench.mjs`. This is task B from `perf-handoff.md` ("measure from the
  seams") applied to rendering — it also splits capture-submit vs main-submit.
- **Or a quick "hide bodies" toggle** (set the physics group `.visible = false`) while still stepping, and
  A/B FPS against "bodies visible + physics paused". If hiding bodies recovers FPS that pausing physics
  doesn't, draw-submission is confirmed dominant.
- Run in the **live headed** scene too (that's where 100→75 was seen; real frame pacing is the felt signal),
  not only headless.

**Success criterion:** a number that says "X ms/frame is body draw submission" and shows it dwarfs the
physics step at gameplay body counts. If it *doesn't*, stop — the theory is wrong and the bottleneck is
elsewhere (re-check physics or capture-pass fill).

### Step 2 — QUICK PROOF OF CONCEPT

If the theory holds, prototype the **smallest** draw-call reduction and measure. Candidate techniques (all
uniform — no 1×1×1 special case):

- **Merged mesh per body, for every body** (extend the raft's approach to all): 1 draw call + 1 transform
  per body. Re-bakes geometry on edit (cheap small; large ships need chunking — see Step 4).
- **Global `InstancedMesh` across all bodies' voxels:** 1 draw call *total*, but per-voxel matrices (loses
  the merged 1-transform win for large ships) + constraints: one material (need `instanceColor` / a texture
  atlas), whole-mesh frustum culling, and shared-buffer bookkeeping ((body,voxel)→index, capacity/free-list)
  that complicates the live-edit path.
- Likely a **hybrid**, but **let the Step-1 numbers choose:** if the bottleneck is draw-CALL *count* →
  global instancing; if it's per-voxel *matrix upload* / capture *fill* → merged-per-body. Don't pick before
  measuring.

Scope: one technique, on the bench `--bodies N` load, measured vs baseline.

### Step 3 — TEST AGAIN

Bench the POC vs baseline (`--mode both`, plus the live headed scene). Confirm the draw-submit number
dropped and FPS rose at high body count — and check you didn't trade CPU draw-calls for CPU matrix churn
(watch the seam timers from Step 1).

### Step 4 — FULL IMPL (only if Step 3 is fruitful)

Build the chosen technique properly, **uniform across all bodies**, integrated with the live-edit path
(place / break / split / drop in `physics.ts`). For large ships this means **chunked greedy meshing**
(Minecraft-style regions) so an edit re-bakes only the affected chunk, not the whole ship — the render-side
twin of greedy-meshing the colliders. Keep it **deterministic** (fixed order) for host-authoritative
multiplayer.

## Pointers

- **Bench:** `node src/projects/shipwright/tools/bench.mjs --mode both --bodies N --url http://localhost:3001/3d-games/shipwright`
  (dev server on 3001; the bench API is dev-only). `--collision off` and `--ssr off` also exist.
- **Render code:** `physics.ts` (`Visual` / `placeInstances` / `buildMergedVoxelGeometry` / `makeMesh`),
  `scene.ts` (`renderPrePasses`, the capture pass).
- **The GUI "pause physics"** freezes the step but keeps bodies rendering — the manual version of the
  Step-1 A/B (pause vs hide).

## Related open measurements (not blockers for this thread)

- **Buoyancy vs broad-phase split** (`applyBuoyancy` vs `world.step` timers) — decides whether greedy-meshing
  the *colliders* is worth it for large ships (physics side, not render). Same "measure from the seams" work.
- **Contact-heavy bench scene** — the crowded-ships collision cost the non-overlapping grid hides
  (`perf-experiments.md` Tier 4 caveat).
