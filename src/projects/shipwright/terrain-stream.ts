"use client";

// Terrain streaming: the worker client, the PURE tile-planning math (quadtree LOD
// tiers + hysteresis, unit-tested in terrain-stream.test.ts), and the manager that
// keeps the world tiled around the viewer — nearest-first loading, swap-on-ready
// (never a hole), and an in-memory payload cache keyed on `GEN_VERSION`.
//
// Persistence is deliberately ABSENT: chunks are pure functions of
// (seed, GEN_VERSION, tile), so a durable store could only ever save regeneration
// time — and generation params churn in development, which would invalidate it
// constantly. The cache key is version-aware so IndexedDB/Supabase can bolt onto
// this map later without rework (the decision + reasoning: docs/ISLANDS.md).

import * as THREE from "three";
import type { TerrainWorkRequest, TerrainWorkResponse } from "./terrain.worker";
import {
  GEN_VERSION,
  TREE_SPACING,
  bedrockField,
  generateChunk,
  type ChunkPayload,
  type ChunkRequest,
} from "./terrain-gen";
import type { TerrainTile, TerrainTileFactory } from "./terrain";

// --- The worker client -------------------------------------------------------

export interface TerrainGenerator {
  /** Generate one chunk in the worker. Rejects if the generator is disposed first
   *  (callers must treat that as "stop, the scene is gone", not as an error). */
  generate: (req: ChunkRequest) => Promise<ChunkPayload>;
  dispose: () => void;
}

export const createTerrainGenerator = (): TerrainGenerator => {
  // The `new Worker(new URL(...), { type: "module" })` form is what Next.js
  // (webpack AND Turbopack) statically bundles — same pattern as family-tree.
  const worker = new Worker(new URL("./terrain.worker.ts", import.meta.url), {
    type: "module",
  });
  let nextId = 0;
  let disposed = false;
  const pending = new Map<
    number,
    { resolve: (p: ChunkPayload) => void; reject: (e: Error) => void }
  >();

  worker.onmessage = (e: MessageEvent<TerrainWorkResponse>) => {
    const waiter = pending.get(e.data.id);
    if (!waiter) return; // stale: the request was superseded or the caller gave up
    pending.delete(e.data.id);
    if (e.data.ok) waiter.resolve(e.data.payload);
    else waiter.reject(new Error(e.data.error));
  };
  worker.onerror = (e) => {
    // A worker-level error (a failed bundle load, an uncaught throw outside a
    // request) kills every in-flight promise — callers fall back or surface it.
    const err = new Error(`terrain worker failed: ${e.message}`);
    for (const waiter of pending.values()) waiter.reject(err);
    pending.clear();
  };

  return {
    generate: (req) => {
      if (disposed) return Promise.reject(new Error("terrain generator disposed"));
      const id = nextId++;
      const message: TerrainWorkRequest = { id, req };
      return new Promise<ChunkPayload>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage(message);
      });
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      worker.terminate();
      const err = new Error("terrain generator disposed");
      for (const waiter of pending.values()) waiter.reject(err);
      pending.clear();
    },
  };
};

/** The `?terrainWorker=off` escape hatch: the SAME streamed tiles, generated on the
 *  main thread — so a broken worker bundle can be routed around explicitly, and the
 *  pixel guard (`tools/verify-terrain-worker.mjs`) compares two identical worlds that
 *  differ only in which thread ran `generateChunk`. Each generate yields to the event
 *  loop first (a macrotask, not a wait) so the page still paints between tiles instead
 *  of freezing for the whole plan's worth of microtasks. */
export const createSyncTerrainGenerator = (): TerrainGenerator => ({
  generate: (req) =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolve(generateChunk(req));
      }, 0);
    }),
  dispose: () => {},
});

// --- Tile planning (pure) ----------------------------------------------------
// Tile size DOUBLES with spacing, so every tile is the same ~46k vertices and a
// ~constant worker job, and the tiers form a perfect quadtree: one tier-t tile is
// exactly four tier-(t-1) tiles. Radii follow the plan in docs/ISLANDS.md: full
// detail where skerries must resolve, silhouette detail far out. Outer radii are
// where the NEXT coarser tier takes over; the streaming radius caps the whole set.

export interface Tier {
  /** Metres between bedrock samples (the LOD dial; T0 = the shipped 1.2 m). */
  spacing: number;
  /** Tile edge, metres. spacing and tileSize double together (constant verts/tile). */
  tileSize: number;
  /** Beyond this camera distance the next coarser tier takes over (× tierScale). */
  outerRadius: number;
  /** Tree-scatter lattice (m): the true 2.5 m stand lattice (individual spruce) on the
   *  near tiers, a coarser CANOPY-CLUMP lattice on the far ones — a bald far island
   *  reads as snow (docs/ISLANDS.md), so every tier keeps its canopy mass. Must stay
   *  ≤ the tier's spacing so clump jitter never leaves the tile's sampled apron. */
  treeLattice: number;
}

// Tuned against the MEASURED budget, not the first draft: tile-granular refinement
// overshoots each band by ~1.8× in area (a tile refines whenever its nearest point
// touches the band), so the draft radii/spacings ballooned to 6.7 M verts / ~400 MB.
// This table lands ~100 tiles ≈ 2.9 M verts ≈ 140 MB (attrs + u16 indices) at the
// 12 km default. T0's 320 m of full 1.2 m detail is no regression — the old fixed
// window was 600 m WIDE (a ~300 m radius). Far spacings grow ×2.5 per tier from T2:
// land out there is silhouette-only (docs/ISLANDS.md), and vertices ∝ 1/spacing².
export const TIERS: Tier[] = [
  { spacing: 1.2, tileSize: 256, outerRadius: 320, treeLattice: TREE_SPACING },
  { spacing: 2.4, tileSize: 512, outerRadius: 800, treeLattice: TREE_SPACING },
  { spacing: 6, tileSize: 1024, outerRadius: 1800, treeLattice: 5 },
  { spacing: 15, tileSize: 2048, outerRadius: 4000, treeLattice: 10 },
  { spacing: 37.5, tileSize: 4096, outerRadius: 7000, treeLattice: 20 },
  { spacing: 90, tileSize: 8192, outerRadius: 12000, treeLattice: 40 },
];

/** Tiers at or below this are the "near world" a capture must wait for (isReady):
 *  everything out to ~2.2 km — a superset of the old 600 m window's content. */
export const NEAR_READY_TIER = 2;

export interface TileSpec {
  tier: number;
  /** Tile coords: world x spans [cx·tileSize, (cx+1)·tileSize); z likewise. */
  cx: number;
  cz: number;
}

/** Identity for hysteresis + the live-tile map (what is on screen where). */
export const tileId = (s: TileSpec): string => `${s.tier}:${s.cx}:${s.cz}`;

/** Cache key: identity + everything that changes the generated bytes. */
export const tileCacheKey = (s: TileSpec, spacingScale: number): string =>
  `${tileId(s)}:${spacingScale}:${GEN_VERSION}`;

/** Distance from (px, pz) to the nearest point of the tile's AABB (0 inside). */
const tileDistance = (s: TileSpec, px: number, pz: number): number => {
  const size = TIERS[s.tier].tileSize;
  const dx = Math.max(s.cx * size - px, 0, px - (s.cx + 1) * size);
  const dz = Math.max(s.cz * size - pz, 0, pz - (s.cz + 1) * size);
  return Math.hypot(dx, dz);
};

export interface PlanOptions {
  px: number;
  pz: number;
  /** Streaming radius, metres — land beyond it is not generated at all. */
  radius: number;
  /** Multiplies every tier's outerRadius: the one fidelity-vs-memory lever. */
  tierScale: number;
  /** `tileId`s currently intended/displayed, for hysteresis. Empty set = fresh plan. */
  current: ReadonlySet<string>;
}

/**
 * The set of tiles the world should be made of, viewed from (px, pz): a quadtree
 * refined toward the viewer. A tile refines into its four children when its nearest
 * point is inside the finer tier's outer radius — with ±10 % hysteresis against the
 * CURRENT state, so a viewer hovering exactly on a boundary doesn't flap tiles
 * (a tile only re-tiers once it is clearly past the line in the new direction).
 * Complete and overlap-free by construction; the unit tests prove it by probing.
 */
export const planTiles = (opts: PlanOptions): TileSpec[] => {
  const { px, pz, radius, tierScale, current } = opts;
  const out: TileSpec[] = [];

  const refine = (spec: TileSpec): void => {
    // The radius caps the world at EVERY level: a refined parent's far children can
    // sit wholly beyond it and must not be emitted (the world is a disc, not
    // tile-aligned — coarse tiles may overhang the rim, but never lie past it).
    if (tileDistance(spec, px, pz) > radius) return;
    if (spec.tier === 0) {
      out.push(spec);
      return;
    }
    const threshold = TIERS[spec.tier - 1].outerRadius * tierScale;
    // Hysteresis: if this exact tile is displayed, demand a clear entry (×0.9) before
    // splitting it; if any of its children are displayed, hold the split until a clear
    // exit (×1.1). A fresh area uses the plain threshold.
    const hasSelf = current.has(tileId(spec));
    let hasChild = false;
    for (let dx = 0; dx <= 1 && !hasChild; dx++) {
      for (let dz = 0; dz <= 1 && !hasChild; dz++) {
        hasChild = current.has(
          tileId({ tier: spec.tier - 1, cx: spec.cx * 2 + dx, cz: spec.cz * 2 + dz }),
        );
      }
    }
    const factor = hasSelf ? 0.9 : hasChild ? 1.1 : 1.0;
    if (tileDistance(spec, px, pz) < threshold * factor) {
      for (let dx = 0; dx <= 1; dx++) {
        for (let dz = 0; dz <= 1; dz++) {
          refine({ tier: spec.tier - 1, cx: spec.cx * 2 + dx, cz: spec.cz * 2 + dz });
        }
      }
    } else {
      out.push(spec);
    }
  };

  const top = TIERS.length - 1;
  const size = TIERS[top].tileSize;
  const c0x = Math.floor((px - radius) / size);
  const c1x = Math.floor((px + radius) / size);
  const c0z = Math.floor((pz - radius) / size);
  const c1z = Math.floor((pz + radius) / size);
  for (let cx = c0x; cx <= c1x; cx++) {
    for (let cz = c0z; cz <= c1z; cz++) {
      const spec = { tier: top, cx, cz };
      if (tileDistance(spec, px, pz) <= radius) refine(spec);
    }
  }
  return out;
};

/** Nearest-first — a distance sort IS the spiral-out load order. */
export const loadOrder = (specs: TileSpec[], px: number, pz: number): TileSpec[] =>
  [...specs].sort((a, b) => tileDistance(a, px, pz) - tileDistance(b, px, pz));

// --- The streaming manager ---------------------------------------------------

/** Payload cache entries kept (LRU) — VACATED tiles only: a live tile keeps its payload on
 *  its entry (free — the geometry shares the arrays) and hands it back here at removal, so
 *  the whole budget serves the pan-away-and-return case. 48 comfortably covers a vacated
 *  full-detail neighbourhood (~30–50 fine tiles) at ~2 MB/payload worst case (~100 MB).
 *  Version-keyed (`tileCacheKey`), so a durable store can replace this map without rework. */
const CACHE_CAP = 48;

/** Re-plan when the viewer has moved this far since the last plan. Must sit well
 *  inside the ±10 % hysteresis margins (the tightest is ~±45 m at T0's boundary)
 *  or planning granularity would defeat the hysteresis. */
const REPLAN_DISTANCE = 32;

export interface TerrainStreamStats {
  tilesLoaded: number;
  tilesPending: number;
  vertices: number;
  avgGenMs: number;
  worstGenMs: number;
}

export interface TerrainStream {
  /** One Group holding every live tile — add to the scene once; the existing
   *  terrain cost switch / visibility toggles target it as one object. */
  object: THREE.Group;
  /** Debug (default ON): wireframe placeholder boxes over tiles still queued (blue) or
   *  generating right now (orange), so "no land here yet" is distinguishable from open
   *  water while sailing or panning into ungenerated world. Self-hiding — nothing
   *  renders once the plan is settled, and captures gate on settle (`isReady`). */
  setShowPending: (on: boolean) => void;
  /** Call once per frame with the viewer's world position. Cheap: it re-plans only
   *  after `REPLAN_DISTANCE` of movement, and does nothing while frozen. */
  update: (x: number, z: number) => void;
  /** Resolves when every planned tile is built (the full streaming radius). */
  settle: () => Promise<void>;
  /** Resolves when the near tiers (≤ NEAR_READY_TIER) are built — the isReady gate. */
  settleNear: () => Promise<void>;
  /** Freeze retiling (the benchmark's determinism switch): in-flight tiles finish,
   *  no new planning happens until unfrozen. */
  setFrozen: (on: boolean) => void;
  setRadius: (radius: number) => void;
  setTierScale: (scale: number) => void;
  /** Multiplies every tier's sample spacing (the bench `terrainSpacing` knob,
   *  normalised so 1 = shipped density). Rebuilds the world. */
  setSpacingScale: (scale: number) => void;
  stats: () => TerrainStreamStats;
  // Terrain-interface compatibility (scene call sites + bench knobs):
  heightAt: (x: number, z: number) => number;
  triangleCounts: () => { bedrock: number; trees: number };
  treeCount: () => number;
  setTreesVisible: (on: boolean) => void;
  setShading: (mode: "full" | "flat") => void;
  setCastShadow: (on: boolean) => void;
  setTintByTier: (on: boolean) => void;
  dispose: () => void;
}

export interface TerrainStreamOptions {
  seed: number;
  grain: number;
  deep: number;
  radius: number;
  tierScale: number;
  generator: TerrainGenerator;
  factory: TerrainTileFactory;
}

export const createTerrainStream = (opts: TerrainStreamOptions): TerrainStream => {
  const { generator, factory } = opts;
  let radius = opts.radius;
  let tierScale = opts.tierScale;
  let spacingScale = 1;
  let frozen = false;
  let disposed = false;

  const object = new THREE.Group();
  object.name = "archipelago";
  let castShadow = true;

  interface Entry {
    spec: TileSpec;
    tile: TerrainTile | null; // null while the payload is generating
    doomed: boolean; // superseded — remove once its replacements are built
    /** The generated buffers, kept for the tile's whole life — FREE, because the
     *  geometry references the same arrays — and handed back to the cache at removal,
     *  so panning away and back re-attaches instantly instead of regenerating. */
    payload: ChunkPayload | null;
    /** The cache key the payload was generated under (spacingScale may change later). */
    cacheKey: string | null;
  }
  const entries = new Map<string, Entry>(); // by tileId
  // Vacated-tile payloads ONLY (a live tile's payload lives on its entry): the cache's
  // job is exactly the pan-away-and-return case, so its budget is spent on tiles that
  // LEFT the world, not duplicated across the ones still in it.
  const cache = new Map<string, ChunkPayload>(); // by tileCacheKey, LRU
  const cacheInsert = (key: string, payload: ChunkPayload) => {
    cache.delete(key);
    cache.set(key, payload);
    while (cache.size > CACHE_CAP) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  };
  let queue: TileSpec[] = [];

  // Pending-tile placeholders (see setShowPending). Debug overlay colours, like the CPU
  // probe dots — the photoreal rule governs the render, not the diagnostics drawn over it.
  const placeholderGroup = new THREE.Group();
  placeholderGroup.name = "loading-tiles";
  object.add(placeholderGroup);
  // EdgesGeometry, not a wireframe material: wireframe draws triangle-face DIAGONALS,
  // which read as stray lines across the sky whenever the camera is inside a big tile's
  // box. Edges give the clean 12-line outline. One shared unit geometry, scaled per tile.
  const placeholderGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const pendingMaterial = new THREE.LineBasicMaterial({ color: 0x3a9bd5 });
  const generatingMaterial = new THREE.LineBasicMaterial({ color: 0xff8c42 });
  const placeholders = new Map<string, THREE.LineSegments>();
  let generatingId: string | null = null;
  let showPending = true;
  const clearPlaceholders = () => {
    for (const lines of placeholders.values()) placeholderGroup.remove(lines);
    placeholders.clear();
  };
  const refreshPlaceholders = () => {
    // Disabled = ZERO impact, not hidden nodes: three walks every node's matrix on every
    // render regardless of `visible`, which is exactly how the buoyancy debug arrows once
    // cost ~18 ms while switched off (docs/PERFORMANCE.md). Off ⇒ nothing is built at all;
    // re-enabling rebuilds from the current plan.
    if (!showPending) return;
    const wanted = new Set<string>();
    for (const [id, e] of entries) {
      if (e.tile !== null || e.doomed) continue;
      wanted.add(id);
      let lines = placeholders.get(id);
      if (!lines) {
        lines = new THREE.LineSegments(placeholderGeometry, pendingMaterial);
        const size = TIERS[e.spec.tier].tileSize;
        // A flat box straddling sea level: tall enough to clear the waves and read from
        // deck height, thin enough not to loom.
        lines.scale.set(size, 24, size);
        lines.position.set((e.spec.cx + 0.5) * size, 0, (e.spec.cz + 0.5) * size);
        placeholders.set(id, lines);
        placeholderGroup.add(lines);
      }
      lines.material = id === generatingId ? generatingMaterial : pendingMaterial;
    }
    for (const [id, lines] of placeholders) {
      if (!wanted.has(id)) {
        placeholderGroup.remove(lines);
        placeholders.delete(id);
      }
    }
  };
  let inFlight = false;
  let lastPlanX = Number.NaN;
  let lastPlanZ = Number.NaN;
  const settleWaiters: { near: boolean; resolve: () => void }[] = [];

  // The pure field, taper-free: the whole world exists; tiles are just the meshed part.
  const field = bedrockField({
    seed: opts.seed,
    grain: opts.grain,
    deep: opts.deep,
    center: [0, 0],
    extent: 1e9,
  });

  const requestFor = (spec: TileSpec): ChunkRequest => {
    const tier = TIERS[spec.tier];
    const size = tier.tileSize;
    const fullTrees = tier.treeLattice === TREE_SPACING;
    return {
      seed: opts.seed,
      grain: opts.grain,
      deep: opts.deep,
      originX: (spec.cx + 0.5) * size,
      originZ: (spec.cz + 0.5) * size,
      size,
      spacing: tier.spacing * spacingScale,
      trees: fullTrees,
      // Clump lattice scales with spacing so jitter stays inside the sampled apron.
      clumpLattice: fullTrees ? undefined : tier.treeLattice * spacingScale,
      // Skirts hide the sliver cracks where tiles of different spacing abut; scale with
      // the coarser side's relief resolution so the wall always covers the mismatch.
      skirtDepth: Math.max(3, 2 * tier.spacing * spacingScale),
    };
  };

  const pendingCount = (nearOnly: boolean) => {
    let count = 0;
    for (const e of entries.values()) {
      if (e.tile === null && !e.doomed && (!nearOnly || e.spec.tier <= NEAR_READY_TIER)) count++;
    }
    return count;
  };

  const notifySettled = () => {
    for (let i = settleWaiters.length - 1; i >= 0; i--) {
      if (pendingCount(settleWaiters[i].near) === 0) {
        settleWaiters[i].resolve();
        settleWaiters.splice(i, 1);
      }
    }
  };

  // Remove doomed tiles whose area is fully covered by BUILT replacements — the
  // swap-on-ready rule: the old coarse tile keeps rendering until every finer tile
  // over it exists (and vice versa on coarsening), so retiling never opens a hole.
  const sweepDoomed = () => {
    for (const [id, e] of entries) {
      if (!e.doomed) continue;
      const size = TIERS[e.spec.tier].tileSize;
      const x0 = e.spec.cx * size;
      const x1 = x0 + size;
      const z0 = e.spec.cz * size;
      const z1 = z0 + size;
      let covered = true;
      for (const other of entries.values()) {
        if (other.doomed || other.tile !== null) continue;
        const oSize = TIERS[other.spec.tier].tileSize;
        const ox0 = other.spec.cx * oSize;
        const oz0 = other.spec.cz * oSize;
        // A pending (unbuilt) replacement overlapping this area → keep the old tile up.
        if (ox0 < x1 && ox0 + oSize > x0 && oz0 < z1 && oz0 + oSize > z0) {
          covered = false;
          break;
        }
      }
      if (covered) {
        if (e.tile) {
          object.remove(e.tile.object);
          e.tile.dispose(); // frees the GPU copy; the JS arrays live on in the cache entry
          if (e.payload && e.cacheKey !== null) cacheInsert(e.cacheKey, e.payload);
        }
        entries.delete(id);
      }
    }
    // Every tile state change routes through here (replan, attach, removal), so this keeps
    // the pending placeholders in lock-step with the plan.
    refreshPlaceholders();
  };

  const attach = (e: Entry, payload: ChunkPayload, cacheKey: string) => {
    const size = TIERS[e.spec.tier].tileSize;
    const tile = factory.buildTile(
      payload,
      (e.spec.cx + 0.5) * size,
      (e.spec.cz + 0.5) * size,
      e.spec.tier,
    );
    tile.object.traverse((o) => {
      o.castShadow = o.castShadow && castShadow;
    });
    e.tile = tile;
    e.payload = payload; // retained for the cache hand-back at removal (shared arrays — free)
    e.cacheKey = cacheKey;
    object.add(tile.object);
  };

  const pump = () => {
    if (disposed || inFlight) return;
    // Serve cache hits synchronously first — they cost only a geometry upload.
    while (queue.length > 0) {
      const spec = queue[0];
      const e = entries.get(tileId(spec));
      if (!e || e.doomed || e.tile !== null) {
        queue.shift(); // superseded while queued
        continue;
      }
      const key = tileCacheKey(spec, spacingScale);
      const hit = cache.get(key);
      if (!hit) break;
      cache.delete(key); // moves OUT of the cache — it is live again (handed back at removal)
      queue.shift();
      attach(e, hit, key);
      continue;
    }
    sweepDoomed();
    notifySettled();
    const spec = queue.shift();
    if (!spec) return;
    const e = entries.get(tileId(spec));
    if (!e || e.doomed || e.tile !== null) {
      pump();
      return;
    }
    inFlight = true;
    generatingId = tileId(spec);
    refreshPlaceholders(); // highlight the tile the worker is on right now
    const key = tileCacheKey(spec, spacingScale);
    generator
      .generate(requestFor(spec))
      .then((payload) => {
        inFlight = false;
        generatingId = null;
        if (disposed) return;
        const entry = entries.get(tileId(spec));
        // Still wanted → it goes live (and hands its payload back at removal). A
        // doomed/removed entry means the plan moved on — cache the work instead.
        if (entry && !entry.doomed && entry.tile === null) attach(entry, payload, key);
        else cacheInsert(key, payload);
        sweepDoomed();
        notifySettled();
        pump();
      })
      .catch((err: unknown) => {
        inFlight = false;
        generatingId = null;
        if (disposed) return; // dispose rejects in-flight generation — expected
        // A failed tile means a broken generator/worker — OUR bug, and it FAILS LOUDLY
        // (CLAUDE.md): no drop-and-continue that would leave a quiet hole in the world.
        // The stream stops pumping (the missing tiles are visible) and the rethrow
        // surfaces as an unhandled rejection with the failing tile named.
        console.error("shipwright: terrain tile generation failed", tileId(spec), err);
        throw err;
      });
  };

  const replan = (px: number, pz: number) => {
    lastPlanX = px;
    lastPlanZ = pz;
    const current = new Set<string>();
    for (const [id, e] of entries) {
      if (!e.doomed) current.add(id);
    }
    const desired = planTiles({ px, pz, radius, tierScale, current });
    const desiredIds = new Set(desired.map(tileId));
    for (const [id, e] of entries) {
      if (!desiredIds.has(id)) e.doomed = true;
      else if (e.doomed) e.doomed = false; // wanted again before its removal — resurrect
    }
    for (const spec of desired) {
      if (!entries.has(tileId(spec))) {
        entries.set(tileId(spec), { spec, tile: null, doomed: false, payload: null, cacheKey: null });
      }
    }
    queue = loadOrder(
      desired.filter((s) => {
        const e = entries.get(tileId(s));
        return e !== undefined && e.tile === null && !e.doomed;
      }),
      px,
      pz,
    );
    sweepDoomed();
    notifySettled();
    pump();
  };

  const rebuildAll = () => {
    // Spacing changed: every built tile is stale. Doom them all and re-plan; the
    // swap-on-ready sweep replaces them as the new-spacing tiles arrive.
    for (const e of entries.values()) e.doomed = true;
    const px = Number.isNaN(lastPlanX) ? 0 : lastPlanX;
    const pz = Number.isNaN(lastPlanZ) ? 0 : lastPlanZ;
    lastPlanX = Number.NaN; // force the next update() to re-plan too
    replan(px, pz);
  };

  return {
    object,
    update: (x, z) => {
      if (frozen || disposed) return;
      if (
        !Number.isNaN(lastPlanX) &&
        Math.hypot(x - lastPlanX, z - lastPlanZ) < REPLAN_DISTANCE
      ) {
        return;
      }
      replan(x, z);
    },
    settle: () =>
      new Promise((resolve) => {
        settleWaiters.push({ near: false, resolve });
        notifySettled();
      }),
    settleNear: () =>
      new Promise((resolve) => {
        settleWaiters.push({ near: true, resolve });
        notifySettled();
      }),
    setShowPending: (on) => {
      showPending = on;
      if (on) refreshPlaceholders();
      else clearPlaceholders(); // zero nodes, not hidden nodes — see refreshPlaceholders
    },
    setFrozen: (on) => {
      frozen = on;
    },
    setRadius: (r) => {
      radius = r;
      if (!Number.isNaN(lastPlanX)) replan(lastPlanX, lastPlanZ);
    },
    setTierScale: (s) => {
      tierScale = s;
      if (!Number.isNaN(lastPlanX)) replan(lastPlanX, lastPlanZ);
    },
    setSpacingScale: (s) => {
      if (s === spacingScale) return;
      spacingScale = s;
      rebuildAll();
    },
    stats: () => {
      let loaded = 0;
      let vertices = 0;
      let genSum = 0;
      let genWorst = 0;
      for (const e of entries.values()) {
        if (e.tile) {
          loaded++;
          // A grid has ~2 triangles per vertex, so tris/2 is the vertex count near enough
          // for a budget readout (the exact count would need the payload, long transferred).
          vertices += Math.round(e.tile.triangles.bedrock / 2);
          genSum += e.tile.generationMs;
          genWorst = Math.max(genWorst, e.tile.generationMs);
        }
      }
      return {
        tilesLoaded: loaded,
        tilesPending: pendingCount(false),
        vertices,
        avgGenMs: loaded > 0 ? genSum / loaded : 0,
        worstGenMs: genWorst,
      };
    },
    heightAt: field.height,
    triangleCounts: () => {
      let bedrock = 0;
      let trees = 0;
      for (const e of entries.values()) {
        if (e.tile) {
          bedrock += e.tile.triangles.bedrock;
          trees += e.tile.triangles.trees;
        }
      }
      return { bedrock, trees };
    },
    treeCount: () => {
      let count = 0;
      for (const e of entries.values()) if (e.tile) count += e.tile.treeCount;
      return count;
    },
    setTreesVisible: (on) => factory.setTreesVisible(on),
    setShading: (mode) => factory.setShading(mode),
    setCastShadow: (on) => {
      castShadow = on;
      // Per-tile, not object.traverse: the pending-placeholder wireframes live under
      // `object` too and must never become shadow casters.
      for (const e of entries.values()) {
        e.tile?.object.traverse((o) => {
          o.castShadow = on;
        });
      }
    },
    setTintByTier: (on) => factory.setTintByTier(on),
    dispose: () => {
      disposed = true;
      for (const e of entries.values()) {
        if (e.tile) {
          object.remove(e.tile.object);
          e.tile.dispose();
        }
      }
      entries.clear();
      clearPlaceholders();
      placeholderGeometry.dispose();
      pendingMaterial.dispose();
      generatingMaterial.dispose();
      cache.clear();
      queue = [];
      for (const w of settleWaiters) w.resolve(); // never leave a bench awaiting a dead stream
      settleWaiters.length = 0;
    },
  };
};
