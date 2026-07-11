// The unattended perf sweep: runs the whole experiment suite through tools/bench.mjs, back to back,
// and survives a failed run instead of dying on it.
//
// WHY A RUNNER. A single bench run is ~2 min, and the suite is ~60 of them — several hours. Doing that
// by hand invites the two mistakes the perf docs already warn about: comparing a COLD run against a
// warm one, and comparing an "after" measured an hour later than its "before" on a thermally drifted
// APU. So this runner:
//
//   • RE-BASELINES between experiments (`baseline` is re-run at the head of every tier). A tier's
//     numbers are only ever read against the baseline that sits next to it in time, never against one
//     from two hours ago.
//   • Runs the whole suite in PASSES. Pass 2 repeats pass 1 in the same warm session, so every
//     experiment has an interleaved twin: a delta that survives both passes is real, one that doesn't
//     is thermal noise. (docs/perf-experiments.md: p50 has a ~3 % noise floor.)
//   • Keeps going on failure, records it, and reports the failures at the end — one flaky page load
//     must not cost you the other 59 runs.
//
// The measurements land in ../.bench/<label>/ as JSON (bench.mjs writes them); this only orchestrates
// and writes a manifest of what ran.
//
// Usage: node src/projects/shipwright/tools/sweep.mjs [--url U] [--passes 2] [--only TIER] [--dry]

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BENCH = join(HERE, "bench.mjs");
const PROJECT_DIR = join(HERE, "..");

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) => {
    if (!a.startsWith("--")) return [];
    const next = all[i + 1];
    return [[a.slice(2), next === undefined || next.startsWith("--") ? "true" : next]];
  }),
);
const URL = args.url ?? "http://localhost:3001/3d-games/shipwright";
const PASSES = Number(args.passes ?? 2);
const ONLY = args.only ?? null;
const DRY = args.dry !== undefined;

// --- The suite --------------------------------------------------------------
// Each run is [label, ...flags]. `baseline` repeats inside every tier on purpose (see above).
const BASELINE = ["baseline"];

const TIERS = {
  // Tier 0 — the census. What each cost centre costs right now, on this SHA + this hardware.
  census: [
    ["census-visuals", "--mode", "visuals"],
    ["census-physics", "--mode", "physics"],
    ["census-both", "--mode", "both"],
  ],

  // Tier A — decompose the GPU frame. THE question of this sweep: the frame is GPU-bound and the main
  // pass doubled after the lighting overhaul; where did it go? Each entry removes ONE thing, so its
  // cost is `baseline − this`. Ordered by hypothesis strength.
  gpu: [
    BASELINE,
    // The display grade is on by default, and a grade (or a bloom) is what makes the shared hook route
    // the whole scene through an EffectComposer — into a HalfFloat target with 4x MSAA, then an
    // OutputPass and the grade pass, then a blit. The project's own bloom measurements priced that
    // target's MSAA resolve at ~2.5 ms on this GPU. So this is three experiments, not one:
    ["grade-off", "--grade", "off"], //            the grade AND the composer path it drags in
    ["composer-s0", "--composer-samples", "0"], // the composer, but no MSAA on its target
    ["composer-s1", "--composer-samples", "1"],
    // MSAA on the DEFAULT framebuffer. With the composer active the scene never draws there, so this
    // MSAA only antialiases the final fullscreen blit — i.e. it should be pure cost.
    ["msaa-off", "--msaa", "off"],
    ["msaa-off-grade-off", "--msaa", "off", "--grade", "off"],
    // Universal shadows came with the lighting overhaul and no knob ever isolated them.
    ["shadows-off", "--shadows", "off"],
    // What the once-per-frame shadow-map cache saves: this restores three's 3x-per-frame redraw.
    ["shadow-cache-off", "--shadow-cache", "off"],
    BASELINE,
    // The dome's own fragment cost (ozone + per-species tints + the Preetham residue).
    ["sky-dome-off", "--sky-dome", "off"],
    ["buoys-off", "--buoys", "off"],
    // The islands, which the bench has hidden since they shipped.
    ["terrain-on", "--terrain", "on"],
    // The pre-existing decomposition levers, re-measured on current main (the docs' numbers are stale).
    ["shading-flat", "--shading", "flat"],
    ["waterfx-off", "--water-fx", "off"],
    ["ssr-off", "--ssr", "off"],
    BASELINE,
  ],

  // Tier B — the lighting CONDITIONS. The flight is clear-sky, so the cloud-shadow pass is skipped
  // entirely (cloud50 reads 0) and the overcast frame — a real gameplay condition — has never been
  // measured. `cloud-shadow off` under cloud isolates the per-lit-fragment map fetch in the global
  // lights_fragment_begin override, which touches EVERY lit material in the scene.
  clouds: [
    BASELINE,
    ["cloud-cumulus", "--clouds", "cumulus"],
    ["cloud-cumulus-noshadow", "--clouds", "cumulus", "--cloud-shadow", "off"],
    ["cloud-stratus", "--clouds", "stratus"],
    ["cloud-cumulonimbus", "--clouds", "cumulonimbus"],
    ["cloud-cumulonimbus-noshadow", "--clouds", "cumulonimbus", "--cloud-shadow", "off"],
    BASELINE,
  ],

  // Tier C — the GPU levers, as sweeps. These are the knobs a quality tier would actually turn.
  levers: [
    BASELINE,
    ...[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((s) => [`rs-${s}`, "--render-scale", String(s)]), // E1
    BASELINE,
    ...[0.1, 0.25, 0.5, 0.75, 1.0].map((r) => [`rr-${r}`, "--reflection-res", String(r)]), // E2
    BASELINE,
    ...[8, 12, 20, 32, 48].map((n) => [`steps-${n}`, "--ssr-steps", String(n)]), // E4 (new knob)
    ...[0.02, 0.05, 0.1, 0.2].map((c) => [`cut-${c}`, "--ssr-cutoff", String(c)]), // E5
    BASELINE,
    ...[0.25, 0.5, 1.0].map((c) => [`cap-${c}`, "--capture-scale", String(c)]), // E7 (new knob)
    ...[2.5, 5, 10, 20].map((q) => [`quad-${q}`, "--quad-size", String(q)]), // E8
    BASELINE,
  ],

  // Tier D — the CPU / physics clock. `sample-iters` is the new one: the Newton inversion of the
  // Gerstner displacement is the innermost cost of the frame's #1 CPU system (buoyancy runs it per
  // voxel, per void cell, per substep), and the perf docs name it as the lever but never priced it.
  physics: [
    ["phys-baseline", "--mode", "physics", "--bodies", "32"],
    ...[4, 8, 16, 32, 64].map((n) => [`phys-b${n}`, "--mode", "physics", "--bodies", String(n)]), // P3
    ["phys-baseline2", "--mode", "physics", "--bodies", "32"],
    ...[0, 1, 2, 3, 4].map((n) => [
      `iters-${n}`,
      "--mode",
      "physics",
      "--bodies",
      "32",
      "--sample-iters",
      String(n),
    ]),
    ["phys-drag-off", "--mode", "physics", "--bodies", "32", "--drag", "off"],
    ["phys-collision-off", "--mode", "physics", "--bodies", "32", "--collision", "off"],
    ["phys-baseline3", "--mode", "physics", "--bodies", "32"],
    // The real combined frame, at a realistic and a heavy load.
    ["both-b8", "--mode", "both", "--bodies", "8"],
    ["both-b32", "--mode", "both", "--bodies", "32"],
  ],

  // Tier E — native resolution. The bench's 1600x900 UNDER-LOADS this GPU (the docs' DVFS finding:
  // 4x the pixels costs only ~1.2x the time), so a lever's delta measured there can under-represent
  // the shipped game. These anchor the suite at the display's real resolution.
  native: [
    ["native-visuals", "--width", "2752", "--height", "1152"],
    ["native-grade-off", "--width", "2752", "--height", "1152", "--grade", "off"],
    ["native-both-b8", "--width", "2752", "--height", "1152", "--mode", "both", "--bodies", "8"],
  ],
};

const plan = [];
for (let pass = 1; pass <= PASSES; pass++) {
  for (const [tier, runs] of Object.entries(TIERS)) {
    if (ONLY && tier !== ONLY) continue;
    for (const [label, ...flags] of runs) {
      plan.push({ tier, pass, label: `p${pass}-${tier}-${label}`, flags });
    }
  }
}

console.log(`sweep: ${plan.length} runs (${PASSES} pass${PASSES > 1 ? "es" : ""}) against ${URL}`);
console.log(`estimated ~${Math.round((plan.length * 2.2) / 60 * 10) / 10} h at ~2.2 min/run\n`);
if (DRY) {
  for (const r of plan) console.log(`  ${r.label}  ${r.flags.join(" ")}`);
  process.exit(0);
}

const runBench = (r) =>
  new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [BENCH, "--label", r.label, "--url", URL, ...r.flags],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });

const started = Date.now();
const results = [];
for (const [i, r] of plan.entries()) {
  const elapsedMin = (Date.now() - started) / 60000;
  const etaMin = i > 0 ? (elapsedMin / i) * (plan.length - i) : plan.length * 2.2;
  const stamp = new Date().toISOString().slice(11, 19);
  process.stdout.write(
    `[${stamp}] ${String(i + 1).padStart(3)}/${plan.length}  ${r.label.padEnd(34)} eta ${etaMin.toFixed(0)}m ... `,
  );

  let attempt = await runBench(r);
  // One retry: a page load can flake (a cold compile, a lost GPU context). A second failure is real.
  if (attempt.code !== 0) {
    process.stdout.write("retry ... ");
    attempt = await runBench(r);
  }

  if (attempt.code === 0) {
    // Pull the OVERALL row out of bench.mjs' stdout table for a live progress read.
    const line = attempt.out.split("\n").find((l) => l.startsWith("OVERALL"));
    const tot = line ? line.trim().split(/\s+/).slice(-4, -3)[0] : "?";
    console.log(`ok  (tot50 ${tot} ms)`);
    results.push({ ...r, ok: true });
  } else {
    console.log("FAILED");
    results.push({ ...r, ok: false, error: attempt.out.split("\n").slice(-6).join("\n") });
  }
}

const dir = join(PROJECT_DIR, ".bench");
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, "sweep-manifest.json"),
  JSON.stringify({ url: URL, passes: PASSES, startedAt: new Date(started).toISOString(), results }, null, 2),
);

const failed = results.filter((r) => !r.ok);
console.log(`\ndone in ${((Date.now() - started) / 3600000).toFixed(1)} h — ${results.length - failed.length}/${results.length} ok`);
if (failed.length) {
  console.log(`\n${failed.length} FAILED:`);
  for (const f of failed) console.log(`  ${f.label}\n${f.error}\n`);
}
