// Turns a sweep's JSON into the tables that go in the docs.
//
// The sweep (tools/sweep.mjs) writes one JSON per run under ../.bench/<label>/. This reads them back,
// pairs each experiment with the BASELINE measured next to it in the same tier and pass, and averages
// the result across passes — which is the whole methodology the perf docs prescribe, mechanised:
//
//   • A delta is always against a baseline from the SAME tier and pass, never one from hours earlier
//     on a differently-warmed GPU.
//   • Every experiment is reported across BOTH passes, with the spread shown. If the two passes
//     disagree by more than the ~3 % noise floor, the number is flagged (~) rather than quietly
//     averaged — that is the signal you were measuring thermal drift, not the change.
//
// Usage: node src/projects/shipwright/tools/report.mjs [--tier gpu] [--segments] [--csv]

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BENCH_DIR = join(HERE, "..", ".bench");

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) => {
    if (!a.startsWith("--")) return [];
    const next = all[i + 1];
    return [[a.slice(2), next === undefined || next.startsWith("--") ? "true" : next]];
  }),
);
const TIER = args.tier ?? null;
const SHOW_SEGMENTS = args.segments !== undefined;

if (!existsSync(BENCH_DIR)) {
  console.error(`no ${BENCH_DIR} — run tools/sweep.mjs first`);
  process.exit(1);
}

// --- load -------------------------------------------------------------------
// Labels are `p<pass>-<tier>-<name>`; anything else is an ad-hoc run and is ignored here.
const runs = [];
for (const dir of readdirSync(BENCH_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const m = /^p(\d+)-([a-z]+)-(.+)$/.exec(dir.name);
  if (!m) continue;
  const [, pass, tier, name] = m;
  const files = readdirSync(join(BENCH_DIR, dir.name)).filter((f) => f.endsWith(".json"));
  if (files.length === 0) continue;
  const json = JSON.parse(readFileSync(join(BENCH_DIR, dir.name, files[0]), "utf8"));
  runs.push({ pass: Number(pass), tier, name, json });
}
if (runs.length === 0) {
  console.error("no sweep runs found (expected labels like p1-gpu-baseline)");
  process.exit(1);
}

const metrics = (json) => {
  const m = json.overall.ms;
  return {
    total: m.total.p50,
    cloud: m.cloud.p50,
    capture: m.capture.p50,
    ssr: m.ssr.p50,
    main: m.main.p50,
    cpu: m.cpuTotal.p50,
    phys: m.physics.p50,
    buoyancy: m.buoyancy.p50,
    solver: m.solver.p50,
    fps: json.overall.fps.avg,
    low: json.overall.fps.onePctLow,
    spikes: json.overall.spikes.count,
  };
};

// --- fold passes ------------------------------------------------------------
// Mean across passes, plus the spread (max-min as a % of the mean) so a number that moved between
// passes can't masquerade as a measurement.
const byKey = new Map();
for (const r of runs) {
  const key = `${r.tier}/${r.name}`;
  if (!byKey.has(key)) byKey.set(key, { tier: r.tier, name: r.name, passes: [] });
  byKey.get(key).passes.push({ pass: r.pass, m: metrics(r.json), json: r.json });
}

const fold = (entry, field) => {
  const vals = entry.passes.map((p) => p.m[field]).filter((v) => typeof v === "number");
  if (vals.length === 0) return { v: 0, spread: 0 };
  const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
  const spread = vals.length > 1 && mean > 0 ? (Math.max(...vals) - Math.min(...vals)) / mean : 0;
  return { v: mean, spread };
};

const NOISE = 0.03; // the documented p50 noise floor
const fmt = (entry, field, digits = 2) => {
  const { v, spread } = fold(entry, field);
  return `${v.toFixed(digits)}${spread > NOISE ? "~" : ""}`;
};

// The baseline each tier is read against. `gpu`/`clouds`/`levers` all re-run plain `baseline`;
// physics uses its own, and `native` has no in-tier baseline (it is its own axis).
const baselineFor = (tier) => byKey.get(`${tier}/baseline`) ?? null;

// --- print ------------------------------------------------------------------
const first = runs[0].json;
console.log(`\nShipwright perf sweep — ${first.meta.sha} on ${first.meta.branch}`);
console.log(`hardware: ${first.meta.hardware.gpu}`);
console.log(`          ${first.meta.hardware.cpu} · ${first.meta.hardware.os}`);
const passes = [...new Set(runs.map((r) => r.pass))].sort();
console.log(`${byKey.size} experiments × ${passes.length} pass(es) · render ${first.meta.render.width}×${first.meta.render.height}`);
console.log(`a "~" marks a value whose two passes disagreed by more than the ${NOISE * 100}% noise floor — treat it as directional\n`);

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

const TIER_ORDER = ["census", "gpu", "clouds", "levers", "physics", "native"];
const tiers = TIER_ORDER.filter((t) => (TIER ? t === TIER : true) && [...byKey.values()].some((e) => e.tier === t));

for (const tier of tiers) {
  const entries = [...byKey.values()].filter((e) => e.tier === tier);
  const base = baselineFor(tier);
  const isPhysics = tier === "physics";

  console.log(`\n=== ${tier.toUpperCase()} ${"=".repeat(60 - tier.length)}`);
  const head =
    pad("experiment", 26) +
    (isPhysics
      ? padL("phys", 8) + padL("buoy", 8) + padL("solver", 8) + padL("cpu", 8) + padL("fps", 7)
      : padL("total", 8) + padL("capture", 9) + padL("ssr", 7) + padL("main", 8) + padL("cloud", 7) + padL("cpu", 7) + padL("fps", 6) + padL("1%low", 7)) +
    (base ? padL("Δ total", 10) : "");
  console.log(head);
  console.log("-".repeat(head.length));

  for (const e of entries.sort((a, b) => (a.name === "baseline" ? -1 : b.name === "baseline" ? 1 : a.name.localeCompare(b.name)))) {
    let delta = "";
    if (base && e !== base) {
      const b = fold(base, "total").v;
      const v = fold(e, "total").v;
      if (b > 0) {
        const d = v - b;
        const pct = (d / b) * 100;
        delta = `${d >= 0 ? "+" : ""}${d.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%)`;
      }
    }
    const row = isPhysics
      ? pad(e.name, 26) +
        padL(fmt(e, "phys"), 8) +
        padL(fmt(e, "buoyancy"), 8) +
        padL(fmt(e, "solver"), 8) +
        padL(fmt(e, "cpu"), 8) +
        padL(fmt(e, "fps", 0), 7)
      : pad(e.name, 26) +
        padL(fmt(e, "total"), 8) +
        padL(fmt(e, "capture"), 9) +
        padL(fmt(e, "ssr"), 7) +
        padL(fmt(e, "main"), 8) +
        padL(fmt(e, "cloud"), 7) +
        padL(fmt(e, "cpu"), 7) +
        padL(fmt(e, "fps", 0), 6) +
        padL(fmt(e, "low", 0), 7);
    console.log(row + (base ? padL(delta, 10) : ""));
  }
}

// --- per-segment view -------------------------------------------------------
// The levers hit different segments differently, and the gameplay segments (fp-sail, island-approach)
// are the ones that decide whether the game ships — an OVERALL average hides both.
if (SHOW_SEGMENTS) {
  const segsOf = (entry) => entry.passes[0].json.segments.map((s) => s.name);
  const segMetric = (entry, seg, field) => {
    const vals = entry.passes
      .map((p) => p.json.segments.find((s) => s.name === seg))
      .filter(Boolean)
      .map((s) => (field === "total" ? s.ms.total.p50 : field === "fps" ? s.fps.avg : s.ms[field].p50));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  for (const tier of tiers) {
    const entries = [...byKey.values()].filter((e) => e.tier === tier);
    if (entries.length === 0 || tier === "physics") continue;
    const segs = segsOf(entries[0]);
    console.log(`\n\n=== ${tier.toUpperCase()} — GPU total p50 (ms) per segment ${"=".repeat(20)}`);
    console.log(pad("experiment", 26) + segs.map((s) => padL(s.slice(0, 9), 11)).join(""));
    console.log("-".repeat(26 + segs.length * 11));
    for (const e of entries) {
      console.log(
        pad(e.name, 26) + segs.map((s) => padL(segMetric(e, s, "total").toFixed(1), 11)).join(""),
      );
    }
  }
}
console.log("");
