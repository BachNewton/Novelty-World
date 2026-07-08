import { TEST_SHAPES } from "./shapes";
import { analyzeBuildVoids } from "./flooding";

/**
 * The physics load the benchmark puts under test — a stable, benchmark-OWNED set, seeded from the
 * demo's `TEST_SHAPES`. The benchmark runs these in its OWN Rapier world (see scene.ts
 * `runBenchmark`), separate from the live scene's gameplay raft + sailor and immune to any runtime
 * mutation you do while testing (respawn, GUI toggles, dragging) — so its numbers stay reproducible.
 *
 * Seeded from `TEST_SHAPES` today (a good representative mix: tetrominoes, upright hulls, a sealed
 * air-cavity hull, breached/bulkhead edge cases, the stability-bucket matrix, a crown raft). If the
 * demo's shapes churn and you want the benchmark load FROZEN independent of those edits, replace this
 * re-export with a literal copy of the shape list — that fully decouples it from `physics.ts`.
 */
export const BENCH_SHAPES = TEST_SHAPES;

type BenchShape = (typeof BENCH_SHAPES)[number];

/**
 * The buoyant-hull subset of `BENCH_SHAPES`: the builds that actually ENCLOSE air (boat, sealed /
 * breached / bulkhead hulls, the stability buckets, the crown raft). This is what a physics scaling
 * sweep must be made of — our custom buoyancy system's cost is driven by the per-voxel flood-fill
 * over enclosed void cells, so a body that encloses no air (a solid tetromino, a pillar) would pad
 * the body count without exercising the flood/air path, giving a misleading curve.
 *
 * Computed from the SAME void analysis the buoyancy uses, not hand-listed, so it stays correct as the
 * demo shapes change. This is a pure, SETUP-time read of `analyzeBuildVoids` (once, here) — it does
 * NOT touch the per-frame physics loop.
 */
const BUOYANT_HULLS: BenchShape[] = BENCH_SHAPES.filter((s) =>
  analyzeBuildVoids(s.cells).enclosed.some(Boolean),
);

// Grid layout for a scaled bench load. Spacing is comfortably larger than the largest hull's extent
// (the ~6 m boat) so replicated bodies never spawn overlapping — overlap would inject uncontrolled
// contact-solve cost (and trip the runaway velocity guard), confounding a clean object-count curve.
const GRID_SPACING = 8; // metres between grid slots
const GRID_DROP_HEIGHT = 1.5; // metres above the waterline the bodies drop from
const GRID_Z0 = -6; // near-row Z; further rows march away from the camera

/**
 * A benchmark physics load of exactly `count` buoyant hulls, cycled from `BUOYANT_HULLS` and laid out
 * on a fresh square grid (overriding each shape's demo spawn) so no two overlap regardless of count.
 * Powers `bench.mjs --bodies N` — the object-count scaling sweep (perf-experiments P3).
 *
 * `count <= 0` returns the full `BENCH_SHAPES` set unchanged — the default load when `--bodies` is
 * absent (the curated demo scene at its authored spawns).
 */
export function benchShapesForCount(count: number): BenchShape[] {
  if (count <= 0) return BENCH_SHAPES;
  const cols = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, i): BenchShape => {
    const base = BUOYANT_HULLS[i % BUOYANT_HULLS.length];
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      ...base,
      name: `${base.name}#${i}`, // unique so nothing dedupes on name
      spawnOverride: [
        (col - (cols - 1) / 2) * GRID_SPACING,
        GRID_DROP_HEIGHT,
        GRID_Z0 - row * GRID_SPACING,
      ],
    };
  });
}
