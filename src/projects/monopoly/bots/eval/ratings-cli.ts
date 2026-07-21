import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { fitElo, type PairResult } from "./elo";
import { defaultWorkerCount, pairingSpecs, WorkerPool } from "./parallel";
import { RATING_EXCLUDED, RATING_PANEL, VERSIONS } from "../versions";

// ---------------------------------------------------------------------------
// `npm run sim:ratings` — produce the bot strength ladder and write it to
// `bots/ratings.ts` (a GENERATED data file; never hand-edit it). By default it
// rates the WHOLE archive (every version except `dumb` and the `RATING_EXCLUDED`
// set): a full round-robin, fitting one Bradley–Terry Elo across the field. A
// bot's Elo IS its rank, so this single ladder feeds everything the lobby shows —
// the overall best (highest Elo), each family's best, and the deprecated/active
// split (no Elo ⇒ deprecated). See `bots/CLAUDE.md` "Lobby strength ratings".
//
// WHY a fixed anchor: Elo is only defined up to a global offset, so we pin one
// version to 0. We pin `claude-v2` (the field floor) FOREVER — never a moving
// champion — so a saved number stays comparable across regenerations and over
// time. The display offset that turns 0 into a friendly baseline lives in
// `roles.ts` (`ratingFor`); this file stays the raw measurement.
//
// CACHING — why a re-run is cheap after the first. A simulated game is a PURE
// function of (seed, seating, versions), and versions are FROZEN snapshots, so a
// pairing's decisive tally never changes once measured. We persist every
// pairing's tally to `ratings-cache.json` and reuse it on the next run.
//
// SCALING — the ANCHOR PANEL (why the default is NOT a full round-robin). A
// complete round-robin is O(N²) pairings, and a brand-new version's marginal cost
// is its whole O(N) column — both grow without bound as the archive does, and most
// of that work re-measures tiny distinctions between near-duplicate parameter
// siblings (e.g. 34 of the first 35 versions share DENY_FACTOR=0.6). Elo does not
// need a COMPLETE comparison graph — only a CONNECTED one. So by default we fit
// over the ANCHOR-PANEL graph: a small fixed panel of strategically-spanning
// versions plays a full round-robin among itself, and every other version plays
// ONLY the panel. That makes a new version's cost O(k) (k = panel size, constant)
// and the whole archive O(N·k) (linear). The panel is chosen to span both the Elo
// range (floor → champion) and the real strategic axes (denial level, trade
// mechanism), so transitive comparisons through it stay fair — see `RATING_PANEL`
// and `bots/CLAUDE.md` "Anchor panel". Re-examine the panel when a STRUCTURALLY
// different lineage (e.g. a learned bot) enters: parameter siblings are ~transitive
// so a small panel suffices, but a genuinely new engine can expose a matchup the
// panel doesn't represent.
//
// Modes:
//   (no args)            rate/refresh the whole archive via the panel graph (default).
//   --full               whole archive via a COMPLETE round-robin (high-precision
//                        recalibration; O(N²), slow on a cold cache).
//   <explicit versions>  rate just those (+ the anchor), full round-robin among them
//                        — a small focused check; the panel does not apply.
// ---------------------------------------------------------------------------

/** Pinned to 0 Elo, permanently — the field floor. Do not change without
 *  regenerating every number against the new anchor (a re-anchor is just a
 *  constant shift, so prefer keeping this stable). */
const ANCHOR = "claude-v2";

// The ANCHOR PANEL (`RATING_PANEL`, defined in `./versions` so the gauntlet can
// share it) is the fixed set every non-panel version is rated against — see the
// SCALING note above and the roster rationale where it's declared.

interface Args {
  versions: string[];
  games: number;
  maxTurns: number;
  workers: number;
  prefix: string;
  /** True when no explicit version list was given — the whole-archive default,
   *  which uses the panel graph unless `--full` forces a complete round-robin. */
  defaultSet: boolean;
  /** Force a COMPLETE round-robin over the whole archive (ignores the panel). */
  full: boolean;
}

function num(argv: readonly string[], i: number, fallback: number): number {
  const n = Number(argv[i]);
  return Number.isNaN(n) ? fallback : n;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = {
    versions: [],
    games: 400,
    maxTurns: 2000,
    workers: defaultWorkerCount(),
    prefix: "ratings",
    defaultSet: false,
    full: false,
  };
  const explicit: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--games") a.games = num(argv, ++i, a.games);
    else if (arg === "--turns") a.maxTurns = num(argv, ++i, a.maxTurns);
    else if (arg === "--workers") a.workers = num(argv, ++i, a.workers);
    else if (arg === "--prefix") a.prefix = argv[++i];
    // Force a complete round-robin over the whole archive (bypass the panel).
    else if (arg === "--full") a.full = true;
    // `--all` is the default behavior now (rate the whole archive); accepted as a
    // no-op so existing muscle memory / scripts don't error.
    else if (arg === "--all") continue;
    else if (arg.startsWith("--")) throw new Error(`unknown flag "${arg}"`);
    else explicit.push(arg);
  }

  // Default: the whole archive minus `dumb` (a null stub) and `RATING_EXCLUDED`
  // (versions that stall the field, e.g. claude-v1). An explicit list overrides.
  const rateable = Object.keys(VERSIONS).filter(
    (v) => v !== "dumb" && !RATING_EXCLUDED.has(v),
  );
  a.defaultSet = explicit.length === 0;
  const chosen = a.defaultSet ? rateable : explicit;
  a.versions = [...new Set([ANCHOR, ...chosen])];
  return a;
}

// --- pairwise-result cache (see header) ------------------------------------

/** A pairing's decisive tally, oriented to the lexicographically-smaller label
 *  (`lo`): `loWins` is `lo`'s wins, `hiWins` the other's. Storing one canonical
 *  orientation means `(a,b)` and `(b,a)` share a single cache entry. */
interface CacheValue {
  loWins: number;
  hiWins: number;
}

const CACHE_PATH = fileURLToPath(new URL("./ratings-cache.json", import.meta.url));

/** Cache key: all inputs that determine a pairing's tally. Games are
 *  deterministic in (versions, seed prefix, count, turn cap), so this is a sound
 *  identity — a different `--games`/`--turns`/`--prefix` is a different key, never
 *  a stale hit. */
function cacheKey(
  prefix: string,
  games: number,
  maxTurns: number,
  a: string,
  b: string,
): string {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `${prefix}|${games.toString()}|${maxTurns.toString()}|${lo}|${hi}`;
}

function loadCache(): Map<string, CacheValue> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- `CACHE_PATH` is this script's own directory joined with the hardcoded filename; no external/user input, so the path-injection this rule guards against cannot occur.
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as {
      pairs?: Record<string, CacheValue>;
    };
    return new Map(Object.entries(parsed.pairs ?? {}));
  } catch {
    // Missing or unreadable cache → start empty; every pairing recomputes.
    return new Map();
  }
}

function saveCache(cache: Map<string, CacheValue>): void {
  // Sort keys so a regeneration produces a minimal, readable diff.
  const pairs = Object.fromEntries([...cache.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- `CACHE_PATH` is this script's own directory joined with the hardcoded filename; no external input.
  writeFileSync(CACHE_PATH, JSON.stringify({ pairs }, null, 2) + "\n");
}

/** Read a pairing from cache, re-oriented to the requested `(a, b)`, or null. */
function getCached(
  cache: Map<string, CacheValue>,
  prefix: string,
  games: number,
  maxTurns: number,
  a: string,
  b: string,
): PairResult | null {
  const cv = cache.get(cacheKey(prefix, games, maxTurns, a, b));
  if (!cv) return null;
  const aIsLo = a < b;
  return {
    a,
    b,
    aWins: aIsLo ? cv.loWins : cv.hiWins,
    bWins: aIsLo ? cv.hiWins : cv.loWins,
  };
}

function setCached(
  cache: Map<string, CacheValue>,
  prefix: string,
  games: number,
  maxTurns: number,
  res: PairResult,
): void {
  const aIsLo = res.a < res.b;
  cache.set(cacheKey(prefix, games, maxTurns, res.a, res.b), {
    loWins: aIsLo ? res.aWins : res.bWins,
    hiWins: aIsLo ? res.bWins : res.aWins,
  });
}

/** Play a fixed round-robin pairing and tally decisive results (draws ignored). */
async function pairing(
  pool: WorkerPool,
  a: string,
  b: string,
  prefix: string,
  games: number,
  maxTurns: number,
): Promise<PairResult> {
  const specs = pairingSpecs(a, b, `${prefix}:${a}-vs-${b}`, 0, games, maxTurns);
  const results = await pool.run(specs);
  let aWins = 0;
  let bWins = 0;
  for (const r of results) {
    if (r.error !== undefined) continue;
    if (r.winnerLabel === a) aWins++;
    else if (r.winnerLabel === b) bWins++;
  }
  return { a, b, aWins, bWins };
}

function renderFile(anchor: string, elo: Record<string, number>): string {
  const sorted = Object.keys(elo).sort((x, y) => elo[y] - elo[x]);
  const body = sorted.map((v) => `  ${JSON.stringify(v)}: ${elo[v].toFixed(1)},`).join("\n");
  return [
    "// GENERATED by 'npm run sim:ratings' — do not edit by hand.",
    "// Bradley–Terry Elo across the rated bot versions, anchored so",
    `// ${anchor} = 0 (the permanent field-floor anchor). Only RELATIVE gaps are`,
    "// meaningful; the friendly display offset lives in roles.ts (ratingFor).",
    "// Regenerate whenever a version is added (or to refresh the whole ladder).",
    "",
    `export const RATING_ANCHOR = ${JSON.stringify(anchor)};`,
    "",
    "export const BOT_RATINGS: Readonly<Partial<Record<string, number>>> = {",
    body,
    "};",
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const known = Object.keys(VERSIONS);
  for (const v of args.versions) {
    if (!known.includes(v)) throw new Error(`unknown version "${v}" (known: ${known.join(", ")})`);
    if (v === "dumb") throw new Error("`dumb` is a null bot and cannot be rated");
    if (RATING_EXCLUDED.has(v) && v !== ANCHOR) {
      throw new Error(`"${v}" is in RATING_EXCLUDED (it stalls the field) and cannot be rated`);
    }
  }
  if (!args.versions.includes(ANCHOR)) {
    throw new Error(`the anchor "${ANCHOR}" must be in the rated set`);
  }
  if (args.versions.length < 2) throw new Error("need at least two versions to rate");

  // Panel mode: the default whole-archive run (unless `--full`) fits over the
  // ANCHOR-PANEL graph rather than a complete round-robin (see the SCALING note).
  const usePanel = args.defaultSet && !args.full;
  const panel = new Set(RATING_PANEL);
  if (usePanel) {
    for (const p of RATING_PANEL) {
      if (!known.includes(p)) throw new Error(`RATING_PANEL member "${p}" is not a known version`);
      if (RATING_EXCLUDED.has(p)) throw new Error(`RATING_PANEL member "${p}" is in RATING_EXCLUDED`);
      if (!args.versions.includes(p)) {
        throw new Error(`RATING_PANEL member "${p}" is not in the rated set`);
      }
    }
    if (!panel.has(ANCHOR)) {
      throw new Error(`RATING_PANEL must include the anchor "${ANCHOR}" (so the graph is anchored)`);
    }
  }

  // The comparison graph. Full mode / explicit lists → every pair. Panel mode →
  // the panel clique + a spoke from each non-panel version to every panel member:
  // a CONNECTED graph at O(N·k) instead of the O(N²) complete round-robin.
  const pairList: [string, string][] = [];
  for (let i = 0; i < args.versions.length; i++) {
    for (let j = i + 1; j < args.versions.length; j++) {
      const a = args.versions[i];
      const b = args.versions[j];
      if (!usePanel || panel.has(a) || panel.has(b)) pairList.push([a, b]);
    }
  }

  const mode = usePanel ? `panel graph (k=${RATING_PANEL.length.toString()})` : "round-robin";
  console.log(
    `\nMonopoly — ratings ladder\n` +
      `Versions (${args.versions.length.toString()}): [${args.versions.join(", ")}]\n` +
      `Anchor: ${ANCHOR} = 0   ${mode}: ${pairList.length.toString()} pairings × ${args.games.toString()} games\n` +
      `Seeds: "${args.prefix}:*"   Workers: ${args.workers.toString()}   Max turns: ${args.maxTurns.toString()}\n`,
  );

  const cache = loadCache();
  const pool = new WorkerPool(args.workers);
  const start = process.hrtime.bigint();
  try {
    const results: PairResult[] = [];
    let done = 0;
    let played = 0;
    let cached = 0;
    for (const [a, b] of pairList) {
      const hit = getCached(cache, args.prefix, args.games, args.maxTurns, a, b);
      let res: PairResult;
      if (hit) {
        res = hit;
        cached++;
      } else {
        res = await pairing(pool, a, b, args.prefix, args.games, args.maxTurns);
        setCached(cache, args.prefix, args.games, args.maxTurns, res);
        // Persist after every newly-played pairing so a long run is resumable.
        saveCache(cache);
        played++;
      }
      results.push(res);
      done++;
      process.stderr.write(
        `\r  ${done.toString()}/${pairList.length.toString()} pairings  (${res.a} ${res.aWins.toString()}–${res.bWins.toString()} ${res.b})${hit ? " [cached]" : ""}`.padEnd(70),
      );
    }
    process.stderr.write("\n");

    const elo = fitElo(args.versions, results, { anchor: ANCHOR });
    const outPath = fileURLToPath(new URL("../ratings.ts", import.meta.url));
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- `outPath` is the parent of this script's own directory joined with the hardcoded filename "ratings.ts"; there is no external/user input, so the path-injection this rule guards against cannot occur.
    writeFileSync(outPath, renderFile(ANCHOR, elo));

    const secs = Number(process.hrtime.bigint() - start) / 1e9;
    const ladder = Object.entries(elo)
      .sort((a, b) => b[1] - a[1])
      .map(([l, e]) => `    ${l.padEnd(12)} ${e >= 0 ? "+" : ""}${e.toFixed(1)}`)
      .join("\n");
    console.log(`\n  Elo ladder (${ANCHOR} = 0):\n${ladder}\n`);
    console.log(`  Wrote ${outPath}`);
    console.log(`  Pairings: ${played.toString()} played, ${cached.toString()} cached`);
    console.log(`\n  (${secs.toFixed(1)}s on ${pool.size.toString()} workers)\n`);
  } finally {
    await pool.close();
  }
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
