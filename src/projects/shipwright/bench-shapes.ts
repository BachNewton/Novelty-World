import { TEST_SHAPES } from "./physics";

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
