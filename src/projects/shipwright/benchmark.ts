/**
 * The Shipwright render-cost benchmark: a scripted, fixed-timestep flight through the
 * scene's known GPU stressors. This module is PURE DATA + a schedule builder — the
 * driver that applies it (sets the camera/sea/sun, runs the passes, samples the GPU
 * timer) lives in `scene.ts`, and the CLI that launches it + crunches the numbers is
 * `tools/bench.mjs`. See `docs/PERFORMANCE.md` ("cost, not look").
 *
 * WHY FIXED-DT: the sea (`f(t)`) and the camera (`f(u)`) are pure functions, so stepping
 * one fixed dt per rendered frame makes every run render a byte-identical sequence — an
 * A/B diff between two render tweaks then reflects only the tweak, not timing noise. This
 * is the dev/regression-harness convention (contrast the real-time, wall-clock convention
 * a player-facing settings benchmark uses — that's the separate, deferred "does it LOOK
 * good" tool that also does screen recording).
 *
 * Determinism caveat (v1): LIVE physics is not stepped here — the raft is shown at its
 * reset spawn pose (a deterministic reflective object for SSR/fill), because the Rapier
 * bodies (raft + sailor) settle in real time before a run starts and only the raft can be
 * reset today. Live-physics CPU load is a fast-follow (needs a deterministic reset of the
 * sailor too + fixed-step driving); see docs/PERFORMANCE.md.
 */

/** The physics/animation step, matched to the sim's own fixed timestep (`physics.ts`). */
export const FIXED_DT = 1 / 60;

// --- Wire types: the contract between the CLI (`tools/bench.mjs`) and the scene-closure driver that
// runs a flight. The driver and its live per-run state (`BenchmarkRun`) live in `scene.ts` because they
// need the camera/ocean/renderer/physics; these config/result shapes are what cross to the tool.

/** Which cost centre a run exercises: "visuals" (render only, physics frozen — the default, GPU cost),
 *  "physics" (step the bench physics with the ocean hidden — isolate CPU physics), or "both" (render
 *  AND step — the true combined gameplay frame). See tools/bench.mjs --mode. */
export type BenchmarkMode = "visuals" | "physics" | "both";

export interface BenchmarkConfig {
  /** Device-pixel-ratio the frame renders at (the dominant fill lever). */
  renderScale?: number;
  /** Fraction of render res the SSR march runs at (the reflection-resolution dial). */
  reflectionRes?: number;
  /** Turn SSR off (env-map-only reflection) to measure its share of the frame — E6. Skips the whole
   *  low-res march pass, so the `ssr` GPU-ms drops to ~0. Default (undefined) leaves it on. */
  ssrEnabled?: boolean;
  /** SSR Fresnel cutoff (E5): `uSsrMinFresnel` (default 0.05). The march discards pixels whose raw
   *  geometric Fresnel is below this BEFORE marching, so raising it culls near-head-on pixels — the
   *  lever for the grazing worst case + SSR spikes. Sweep 0.02/0.05/0.1/0.2. */
  ssrMinFresnel?: number;
  /** Jerlov water type to pin for the whole run (optics cost). */
  water?: string;
  /** Real-time mode: advance the flight by the real frame delta (wall-clock, natural playback
   *  speed) instead of the deterministic FIXED_DT. Set for headed WATCH runs — the numbers then
   *  reflect felt smoothness, not the byte-identical cost the headless (default) mode gives. */
  realtime?: boolean;
  /** Seconds to hold the final frame before closing (real-time only), so the end reads as "done". */
  endHoldSeconds?: number;
  /** Which cost centre to exercise: "visuals" (render only, physics frozen — the default, GPU cost),
   *  "physics" (step the bench physics with the ocean hidden — isolate CPU physics cost), or "both"
   *  (render AND step — the true combined gameplay frame). See tools/bench.mjs --mode. */
  mode?: BenchmarkMode;
  /** Scale the physics load to this many buoyant hulls (physics/both modes) for the object-count
   *  scaling sweep — a fresh grid of `benchShapesForCount` bodies instead of the demo BENCH_SHAPES.
   *  Undefined = the default demo load. See tools/bench.mjs --bodies. */
  bodies?: number;
  /** Turn Rapier contact generation off on the bench bodies (collision groups) to isolate the
   *  collision-resolution share of the physics step — mass/inertia/buoyancy/broad-phase stay put, only
   *  narrow-phase + solver contacts drop. physics/both only. Default (undefined) = collision on. */
  collisionEnabled?: boolean;
  /** Ocean tessellation quad edge in metres (E8): larger = a coarser plane (fewer segments/vertices).
   *  The segment count is `planeSize / quadSize`, clamped to [8, 2048]. The scene default is ~4.9 m
   *  (~1024² segments ≈ 1 M verts). Raise it (e.g. 625 → 8 segments, a near-flat plane) to isolate the
   *  ocean plane's VERTEX cost from the fixed per-render-call submission overhead. See tools/bench.mjs. */
  quadSize?: number;
  /** Disable the GpuTimer's TIME_ELAPSED queries for the run (still measures wall-clock CPU). The
   *  per-span queries force ANGLE to fence/flush the command buffer, which may inflate the CPU submit
   *  time; turning them off isolates that overhead. GPU-ms columns read 0. Default (undefined) = on. */
  gpuTimer?: boolean;
  /** Diagnostic: render an empty scene per measured frame and report the CPU ms (bareMs) — the
   *  irreducible per-call renderer.render() floor. Adds one render/frame, so opt-in. Default off. */
  bareProbe?: boolean;
}

/** One recorded frame: CPU prep ms, the physics-step ms, and the raw per-pass GPU ms from the timer. */
export interface BenchmarkSample {
  seg: string;
  cpuMs: number;
  physicsMs: number;
  capture: number;
  ssr: number;
  main: number;
  /** CPU seam-timer split of the ~16 ms render-prep (see docs/perf-handoff.md thread 1). All
   *  wall-clock `performance.now()` spans, so they measure CPU *submission* time, not GPU execution.
   *  `oceanMs` = the Gerstner uniform update + nav-buoy sampling; `captureCpuMs` = the capture-pass
   *  draw submission (whole scene, water hidden); `ssrCpuMs` = the low-res SSR pass submission (0 when
   *  SSR is off — the pass is skipped); `mainCpuMs` = the MAIN scene-render submission (the second full
   *  draw of the scene, timed in the shared hook — previously counted nowhere). `cpuMs` above spans
   *  onFrame only (ocean + prepass + physics + misc), so it EXCLUDES `mainCpuMs`. */
  oceanMs: number;
  captureCpuMs: number;
  ssrCpuMs: number;
  mainCpuMs: number;
  /** Diagnostic (--bare-probe only, else 0): CPU ms to render an EMPTY scene to the default
   *  framebuffer — the irreducible per-call renderer.render() overhead (no draws, no target switch). */
  bareMs: number;
  /** Physics-step split (physics/both modes; 0 in visuals), summed across the frame's substeps:
   *  `buoyancyMs` = the per-voxel flood-fill + trapped-air force loop; `solverMs` = Rapier world.step().
   *  Their sum is ≤ physicsMs (the remainder is velocity-clamp + snapshot + interpolation). */
  buoyancyMs: number;
  solverMs: number;
}

export interface BenchmarkResult {
  fixedDt: number;
  /** Which cost centre this run exercised (visuals / physics / both). */
  mode: BenchmarkMode;
  /** Number of physics bodies actually under load (0 in visuals mode) — the x-axis of a scaling
   *  sweep, so it must travel with the numbers. */
  bodies: number;
  /** True when this was a real-time (headed) run — numbers are felt-smoothness, not deterministic. */
  realtime: boolean;
  /** False when EXT_disjoint_timer_query is unavailable — the tool must reject the run. */
  gpuAvailable: boolean;
  /** The GPU the run actually executed on (WebGL UNMASKED_* strings) — cross-GPU comparison is the
   *  whole point of a portable benchmark, so this must travel with the numbers. */
  gpu: { vendor: string; renderer: string };
  /** Actual pixels the frame was rendered at (res dominates cost, so record it): the drawing-buffer
   *  size = viewport × pixelRatio, plus the low-res SSR pass fraction. */
  render: { width: number; height: number; pixelRatio: number; reflectionRes: number };
  segments: { name: string; description: string; measuredSeconds: number }[];
  /** A one-shot census of the render at flight's end (the last main pass): draw `calls` + `triangles`
   *  (three.js resets info.render per render call, so this is the main pass alone), plus the live
   *  scene-graph size. Diagnoses whether draw-call SUBMISSION drives the CPU render-prep (thread 1). */
  renderInfo: { calls: number; triangles: number; sceneObjects: number; visibleMeshes: number };
  samples: BenchmarkSample[];
}

/** Default real-time end-hold (seconds) when the tool doesn't override it — long enough that the
 *  ending clearly reads as "done" when watching live, without dragging out the close. */
export const DEFAULT_END_HOLD_SECONDS = 2;

// The flight is laid out on a TIME axis (seconds), walked by both drivers: the headless
// (deterministic) driver advances it by FIXED_DT per frame; the headed (real-time) driver advances
// it by the real frame delta, so it plays at natural wall-clock speed. Same path, only the clock
// differs. Durations are in seconds so "2 s of measured window" means 120 frames at 60 Hz headless,
// but whatever the GPU manages in 2 real seconds when headed.

/** Seconds at each segment's start that are set up but NOT recorded — absorbs the GpuTimer's
 *  ~1–2 frame async readback lag and any one-off state-change hitch (PMREM re-bake, plane rebuild,
 *  raft respawn) so measured frames read this segment's cost, never the previous one's. */
export const DEFAULT_WARMUP_SECONDS = 0.3;
/** Recorded seconds per segment — 2 s is enough for stable p95/p99 + a spike scan at 60 Hz. */
export const DEFAULT_MEASURED_SECONDS = 2.0;
/** Unmeasured "clock warm-up lap" BEFORE the flight: the heaviest scene for a few seconds, to ramp
 *  the GPU's DVFS clocks from idle to steady state so the FIRST measured segment isn't read at
 *  cold/ramping clocks (which skews ms — see docs/PERFORMANCE.md). Kept in BOTH modes. */
export const WARMUP_LAP_SECONDS = 4.0;

/** A camera pose in world metres: eye position + look-at target. */
export interface Pose {
  pos: [number, number, number];
  target: [number, number, number];
}

export interface BenchSegment {
  /** Stable id used to group samples + label the report. */
  name: string;
  /** One-line human note on what this segment stresses (shown in the report). */
  description: string;
  warmupSeconds?: number;
  measuredSeconds?: number;
  /** Sea state for this segment (drives wave height/steepness → fill + normal variance). */
  sea: { amplitude: number; steepness: number; wavelength?: number };
  /** Sun [elevation°, azimuth°] — set once on entry (one PMREM re-bake, in warmup). */
  sun: [number, number];
  /** Jerlov water type; defaults to the run's configured water (or the scene default). */
  water?: string;
  /** Ocean plane size (m); defaults to STANDARD_PLANE. Rebuilt on entry (in warmup). */
  plane?: number;
  /** Show the raft (reset to spawn pose, not stepped) as an SSR/fill stressor. */
  raft?: boolean;
  /** Sweep the sun `from` → `to` (e.g. noon → sunset) — a VISUAL lighting/colour-shift test, applied
   *  in REAL-TIME (headed) mode only. It EASES OUT (fast near noon, slowing toward the horizon, where
   *  the light is most interesting) over the first `sweepFraction` of the measured window, then HOLDS
   *  at `to` for the remainder (a pause at sunset). It re-bakes the PMREM env map each frame — real
   *  GPU work — so it's suppressed in the headless cost run (sun holds at `from`, a clean cost point).
   *  When set, overrides `sun` (= the `from`). `sweepFraction` defaults to 1 (no hold). */
  sunSweep?: { from: [number, number]; to: [number, number]; sweepFraction?: number };
  /** Camera pose as a function of the segment's normalised measured time u ∈ [0, 1]. */
  camera: (u: number) => Pose;
}

// Most segments share one plane size so vertex load (the least-impactful lever — the ocean
// is fill-bound, not vertex-bound) is held constant; only max-stress widens it.
const STANDARD_PLANE = 5000;

// --- Camera helpers --------------------------------------------------------
// Eyes are kept comfortably ABOVE the crests for each segment's sea state: a crest within
// ~1 m of the near plane clips into a pale wedge, and one above the eye swamps the view
// (see tools/shots.mjs). Storm segments therefore use a higher eye than calm ones.

/** Fixed eye; the look-target yaws horizontally around it by ±sweep/2° across u — sweeping
 *  the view through varied fill + SSR hit-rate (grazing water reflects mostly sky = misses,
 *  the SSR worst case) without moving the eye into a crest. */
const yaw =
  (pos: [number, number, number], baseTarget: [number, number, number], sweepDeg: number) =>
  (u: number): Pose => {
    const dx = baseTarget[0] - pos[0];
    const dz = baseTarget[2] - pos[2];
    const a = ((u - 0.5) * sweepDeg * Math.PI) / 180;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    return {
      pos,
      target: [pos[0] + dx * ca - dz * sa, baseTarget[1], pos[2] + dx * sa + dz * ca],
    };
  };

/** Eye orbits the origin at (radius, height), sweeping startDeg→startDeg+sweepDeg across u,
 *  always looking at `look` — for the down-look/overhead/raft segments where a slow orbit
 *  varies which way the water faces the sun (glitter road) + the reflected content. */
const orbit =
  (radius: number, height: number, startDeg: number, sweepDeg: number, look: [number, number, number]) =>
  (u: number): Pose => {
    const a = ((startDeg + sweepDeg * u) * Math.PI) / 180;
    return { pos: [Math.cos(a) * radius, height, Math.sin(a) * radius], target: look };
  };

/** Fixed eye near the water; the LOOK heading follows a keyframed schedule of `[u, degrees]` points
 *  (linear between them, flat segments = pauses), added to `baseDeg` (heading 0 = looking at the
 *  scene). Lets a segment choreograph turns + holds — e.g. turn 180° to the stern, pause, turn 180°
 *  back, pause, then a full 360° spin. Fast heading changes are the worst case for SSR temporal
 *  coherence, so this is the spike-hunter. */
const turnSequence =
  (pos: [number, number, number], lookY: number, baseDeg: number, keys: [number, number][]) =>
  (u: number): Pose => {
    let deg = keys[keys.length - 1][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [u0, d0] = keys[i];
      const [u1, d1] = keys[i + 1];
      if (u <= u1) {
        const f = u1 > u0 ? Math.max(0, Math.min(1, (u - u0) / (u1 - u0))) : 0;
        deg = d0 + (d1 - d0) * f;
        break;
      }
    }
    const a = ((baseDeg + deg) * Math.PI) / 180;
    return { pos, target: [pos[0] + Math.cos(a) * 10, lookY, pos[2] + Math.sin(a) * 10] };
  };

// --- The flight ------------------------------------------------------------
// Ordered low → high load, ending on the worst case, so the report reads like a ramp. Each
// segment isolates a stressor the perf model calls out (docs/PERFORMANCE.md): grazing SSR,
// storm fill + normal variance, lighting/env cost, a complex reflected object.
export const FLIGHT: BenchSegment[] = [
  {
    name: "down-calm",
    description: "Overhead-ish down-look, calm sea — light load baseline (SSR mostly Fresnel-culled)",
    sea: { amplitude: 0.3, steepness: 0.08 },
    sun: [30, 135],
    plane: STANDARD_PLANE,
    camera: orbit(14, 11, 200, 40, [2, 0, -4]),
  },
  {
    name: "grazing-calm",
    description: "Low eye-level grazing over calm sea — the SSR spike appears (grazing Fresnel + sky-miss marches)",
    sea: { amplitude: 0.3, steepness: 0.08 },
    sun: [14, 135],
    plane: STANDARD_PLANE,
    camera: yaw([-6, 2.8, 6], [8, 1.6, -8], 30),
  },
  {
    name: "player-turn",
    description: "Eye-level near the water: 180° turn, pause, 180° turn, pause, then a full 360° spin — hunts rotational SSR spikes",
    sea: { amplitude: 0.5, steepness: 0.12 },
    sun: [14, 135],
    plane: STANDARD_PLANE,
    measuredSeconds: 5.7,
    // [u, heading°] from a forward look (baseDeg): each turn takes the SAME 1.5 s regardless of angle
    // — 180° (1.5 s) → pause 0.6 s → 180° (1.5 s) → pause 0.6 s → 360° (1.5 s). So every turn lands on
    // the same beat; the 360° just rotates faster to cover twice the angle in the same time.
    camera: turnSequence([-4, 2.4, 4], 1.6, -45, [
      [0.0, 0],
      [0.263, 180],
      [0.368, 180],
      [0.632, 360],
      [0.737, 360],
      [1.0, 720],
    ]),
  },
  {
    name: "grazing-storm",
    description: "Low grazing over a rough sea — SSR + heavy fill + wave-normal variance (high load)",
    sea: { amplitude: 1.8, steepness: 0.7 },
    sun: [14, 135],
    plane: STANDARD_PLANE,
    camera: yaw([-8, 5, 8], [10, 2, -10], 30),
  },
  {
    name: "overhead-storm",
    description: "High down-look over a rough sea, slow orbit — fill-bound (water fills the screen)",
    sea: { amplitude: 1.8, steepness: 0.7 },
    sun: [45, 135],
    plane: STANDARD_PLANE,
    camera: orbit(16, 22, 200, 60, [0, 0, -4]),
  },
  {
    name: "day-sweep",
    description: "Sun swept slowly noon(90°)→sunset(0°) over ~5 s on a moderate sea — lighting + reflection colour shift (VISUAL, headed only; judge by eye)",
    sea: { amplitude: 1.0, steepness: 0.3 },
    sun: [90, 110],
    sunSweep: { from: [90, 110], to: [0, 160], sweepFraction: 0.77 },
    measuredSeconds: 13, // ~10 s ease-out sweep 90°→0° + ~3 s hold at sunset
    plane: STANDARD_PLANE,
    camera: yaw([-6, 3.2, 6], [9, 1.9, -9], 20),
  },
  {
    name: "short-chop",
    description: "Short-wavelength (½×) choppy wind sea from a low camera — the tessellation QA: tight peaked crests facet on a coarse grid (long swells hide it)",
    sea: { amplitude: 0.7, steepness: 0.65, wavelength: 0.5 },
    sun: [20, 135],
    plane: STANDARD_PLANE,
    camera: yaw([-7, 3.5, 7], [8, 1.4, -8], 25),
  },
  {
    name: "raft-clear",
    description: "Slow orbit around the reset raft in CLEAR Oceanic water — SSR on a textured hull + water-type contrast vs the turbid default",
    sea: { amplitude: 0.6, steepness: 0.15 },
    sun: [25, 135],
    water: "Oceanic I",
    plane: STANDARD_PLANE,
    raft: true,
    camera: orbit(8, 4, 0, 90, [0, 0.5, 0]),
  },
  {
    name: "max-stress",
    description: "Very low grazing over a very rough sea on a wide plane — worst-case SSR + fill + horizon",
    sea: { amplitude: 2.0, steepness: 0.85 },
    sun: [14, 135],
    plane: 10000,
    camera: yaw([-4, 4.5, 4], [16, 2.2, -16], 24),
  },
];

/** A segment placed on the flight's time axis (seconds). `[warmStart, measStart)` is the discarded
 *  warm-up; `[measStart, end)` is the recorded window. */
export interface TimelineEntry {
  seg: BenchSegment;
  index: number;
  warmStart: number;
  measStart: number;
  end: number;
}
export interface Timeline {
  entries: TimelineEntry[];
  duration: number;
}
/** Where the flight is at a given flight-time: which segment, normalised measured progress `u`
 *  (0→1, and 0 during warm-up) for the camera/sun, and whether to record this frame. */
export interface TimelineSample {
  seg: BenchSegment;
  index: number;
  u: number;
  measured: boolean;
}

/** Lay the flight out on a time axis. A leading unmeasured warm-up lap (the heaviest segment for
 *  WARMUP_LAP_SECONDS) ramps GPU clocks before the first measured segment; kept in both modes. Both
 *  the deterministic (fixed-dt) and real-time drivers walk this SAME timeline, so the camera path +
 *  segment order are identical headless and headed — only the clock stepping it differs. */
export function buildTimeline(flight: BenchSegment[] = FLIGHT, warmupLap = true): Timeline {
  const entries: TimelineEntry[] = [];
  let cursor = 0;
  let index = 0;
  if (warmupLap) {
    // The lap is fully unmeasured: measStart == end, so `measured` is never true within it.
    const heaviest = flight[flight.length - 1];
    entries.push({ seg: heaviest, index: index++, warmStart: 0, measStart: WARMUP_LAP_SECONDS, end: WARMUP_LAP_SECONDS });
    cursor = WARMUP_LAP_SECONDS;
  }
  for (const seg of flight) {
    const warm = seg.warmupSeconds ?? DEFAULT_WARMUP_SECONDS;
    const meas = seg.measuredSeconds ?? DEFAULT_MEASURED_SECONDS;
    const measStart = cursor + warm;
    const end = measStart + meas;
    entries.push({ seg, index: index++, warmStart: cursor, measStart, end });
    cursor = end;
  }
  return { entries, duration: cursor };
}

/** Sample the timeline at flight-time `t` (seconds). Returns null once `t` is past the end — the
 *  driver treats that as "run complete". */
export function sampleTimeline(timeline: Timeline, t: number): TimelineSample | null {
  if (t >= timeline.duration) return null;
  // Segments are contiguous + ordered; a linear scan over ~10 entries is trivial.
  for (const e of timeline.entries) {
    if (t < e.end) {
      const measured = t >= e.measStart;
      const span = e.end - e.measStart;
      const u = measured && span > 0 ? Math.min(1, Math.max(0, (t - e.measStart) / span)) : 0;
      return { seg: e.seg, index: e.index, u, measured };
    }
  }
  return null;
}
