/* eslint-disable security/detect-non-literal-fs-filename -- this is a local
   developer training CLI; every fs path is the operator's own checkpoint --dir
   joined with a hardcoded filename, not untrusted input, so the path-traversal
   this rule guards against doesn't apply (the operator can already write anywhere). */
import { cliArgv } from "./tfjs-setup"; // MUST be first: places the Windows tfjs DLL and shields our argv before tfjs loads.
import process from "node:process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PlayerCount } from "../types";
import { MonoNet, type TrainSample } from "./net";
import { collectRuleGame } from "./selfplay";
import { SelfPlayPool } from "./selfplay-parallel";
import { walkGauntletSprt, type GauntletSprtConfig, type GauntletWalk } from "./sprt";

// ---------------------------------------------------------------------------
// `npm run train:rl` — the SELF-PLAY TRAINING LOOP (RL-DESIGN.md §3.4 / §5 step
// 6). The "turn it on and walk away" entry point: it plays games against itself,
// learns from who won, checkpoints to disk, and repeats — indefinitely or for a
// fixed number of iterations. Stop with Ctrl-C (it saves first); re-run to RESUME
// from the last checkpoint (the learning lives in the net weights). All-CPU via
// tfjs-node; the eGPU is an optional later accelerator (CPU self-play is the
// bottleneck, not the net).
//
// Each ITERATION: generate N self-play games (MCTS over the current net, with
// exploration) → append to a recent-experience replay buffer → one training pass
// → save checkpoint. Gen-0 is WARM-STARTED ("bootstrap") on rule-bot games so the
// value head isn't random against the SPRT-tuned archive. Periodically it plays
// the net vs a rule bot and logs the win rate so you can watch it climb.
//
// Usage:
//   npm run train:rl                              # default: bootstrap, then loop
//   npm run train:rl -- --dir rl-checkpoints/run1 # where to checkpoint / resume
//   npm run train:rl -- --iterations 50 --games 8 --sims 48
//   npm run train:rl -- --bootstrap 40 --rule claude-v2
//   npm run train:rl -- --eval-every 5 --eval-games 20
// ---------------------------------------------------------------------------

interface Args {
  dir: string;
  iterations: number;
  games: number;
  sims: number;
  players: PlayerCount;
  maxTurns: number;
  bootstrapGames: number;
  rule: string;
  evalEvery: number;
  evalGames: number;
  /** SPRT indifference margin E (Elo). 0 disables SPRT and falls back to fixed-N
   *  win-rate eval. When >0, the eval uses the dual one-sided SPRT (same test the
   *  gauntlet uses) for a statistically meaningful better/even/worse verdict. */
  evalMargin: number;
  /** Max decisive games for the SPRT eval before declaring inconclusive. */
  evalMaxDecisive: number;
  bufferCap: number;
  seed: string;
  workers: number;
}

interface Meta {
  iteration: number;
  totalSelfPlayGames: number;
  /** KEEP-BEST (RL-DESIGN.md §8 review #1b): the highest eval win-rate seen so far
   *  and the iteration that produced it. The net that scored it is saved under
   *  `<dir>/best`. RL is non-monotone — a bad training cycle must not destroy a good
   *  net, so we retain the best-by-eval separately from the always-overwritten
   *  latest. Optional so an older checkpoint's meta.json still loads. */
  bestScore?: number;
  bestIteration?: number;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = {
    dir: "rl-checkpoints/default",
    iterations: Number.POSITIVE_INFINITY,
    games: 6,
    sims: 40,
    players: 4,
    maxTurns: 800,
    bootstrapGames: 30,
    rule: "claude-v2",
    evalEvery: 5,
    evalGames: 12,
    evalMargin: 30, // SPRT Elo margin (0 = fixed win-rate eval)
    evalMaxDecisive: 100,
    bufferCap: 60_000,
    seed: "rl",
    workers: 0, // 0 ⇒ pool default (cores − 2)
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string => argv[++i];
    switch (arg) {
      case "--dir": a.dir = next(); break;
      case "--iterations": a.iterations = Number(next()); break;
      case "--games": a.games = Number(next()); break;
      case "--sims": a.sims = Number(next()); break;
      case "--players": {
        const n = Number(next());
        if (n !== 2 && n !== 4 && n !== 8) throw new Error("--players must be 2, 4, or 8");
        a.players = n;
        break;
      }
      case "--turns": a.maxTurns = Number(next()); break;
      case "--bootstrap": a.bootstrapGames = Number(next()); break;
      case "--rule": a.rule = next(); break;
      case "--eval-every": a.evalEvery = Number(next()); break;
      case "--eval-games": a.evalGames = Number(next()); break;
      case "--eval-margin": a.evalMargin = Number(next()); break;
      case "--eval-max-decisive": a.evalMaxDecisive = Number(next()); break;
      case "--buffer": a.bufferCap = Number(next()); break;
      case "--seed": a.seed = next(); break;
      case "--workers": a.workers = Number(next()); break;
      default:
        throw new Error(`unknown argument "${arg}"`);
    }
  }
  return a;
}

// A wall-clock millisecond stamp. Date is fine here — this is a side-effecting
// CLI orchestrator, not the pure engine (whose determinism forbids Date).
const now = (): number => Date.now();
const secs = (ms: number): string => (ms / 1000).toFixed(1) + "s";

function readMeta(dir: string): Meta | null {
  const f = join(dir, "meta.json");
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, "utf8")) as Meta;
}

function writeMeta(dir: string, meta: Meta): void {
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
}

/** The result of an SPRT evaluation (RL-DESIGN.md §8 #1a/#2). Replaces the old
 *  raw win-rate number with a statistically meaningful verdict. */
interface EvalResult {
  /** "better" / "even" / "worse" / "inconclusive" from the dual one-sided SPRT,
   *  or "fixed" when SPRT is disabled (evalMargin=0) and raw win-rate is used. */
  verdict: string;
  /** Win rate over decisive games — the keep-best signal. Higher is better. */
  winRate: number;
  /** Candidate wins in decisive games. */
  wins: number;
  /** Candidate losses in decisive games. */
  losses: number;
  /** Decisive game count (draws/caps excluded). */
  decisive: number;
  /** LLR of the improvement test (0 if SPRT disabled). */
  llrImprove: number;
  /** LLR of the regression test (0 if SPRT disabled). */
  llrRegress: number;
}

const RL_LABEL = "rl";

/** Evaluate the net's strength vs a rule bot using the parallel worker pool.
 *
 *  Two modes (RL-DESIGN.md §8 #2):
 *  - SPRT mode (evalMargin > 0): plays games in batches, feeding each decisive
 *    outcome into `walkGauntletSprt`. Stops the instant the dual one-sided test
 *    crosses a boundary (better/even/worse) or hits evalMaxDecisive. This is the
 *    same statistical test the gauntlet uses — the finer judge the expert review
 *    called for (#1a).
 *  - Fixed mode (evalMargin = 0): plays exactly evalGames and returns the raw
 *    win rate (the legacy behavior, kept as a fallback).
 *
 *  Parallelization (#2): eval games run across the SelfPlayPool workers instead
 *  of sequentially on the main thread. Determinism is preserved — each game is a
 *  pure function of (net checkpoint, seed), so worker assignment never changes a
 *  result, only the wall-clock. */
async function evaluate(netDir: string, pool: SelfPlayPool, a: Args): Promise<EvalResult> {
  const players: PlayerCount = 2; // head-to-head: 1 net seat vs 1 rule seat

  if (a.evalMargin > 0) {
    // SPRT mode: batched generation feeding the dual one-sided test.
    const cfg: GauntletSprtConfig = {
      margin: a.evalMargin,
      alpha: 0.05,
      beta: 0.05,
    };
    const aWon: boolean[] = [];
    let generated = 0;
    const hardCap = a.evalMaxDecisive * 3 + 100; // safety net for all-draws
    let walk: GauntletWalk = walkGauntletSprt(aWon, cfg, a.evalMaxDecisive);

    while (walk.verdict === "need-more") {
      const batchSize = Math.min(a.evalGames, hardCap - generated);
      if (batchSize <= 0) break;
      const seeds = Array.from({ length: batchSize }, (_, i) => `${a.seed}-eval-${generated + i}`);
      generated += batchSize;
      const results = await pool.evalGames({
        netDir,
        rule: a.rule,
        rlLabel: RL_LABEL,
        seeds,
        players,
        maxTurns: a.maxTurns,
        sims: a.sims,
      });
      for (const r of results) {
        if (r.rlWon === true) aWon.push(true);
        else if (r.rlWon === false) aWon.push(false);
        // null (draw/cap) is discarded — no SPRT information
      }
      walk = walkGauntletSprt(aWon, cfg, a.evalMaxDecisive);
      if (walk.verdict === "need-more" && generated >= hardCap) break;
    }

    return {
      verdict: walk.verdict,
      winRate: walk.decisive > 0 ? walk.wins / walk.decisive : 0,
      wins: walk.wins,
      losses: walk.losses,
      decisive: walk.decisive,
      llrImprove: walk.llrImprove,
      llrRegress: walk.llrRegress,
    };
  }

  // Fixed mode: legacy raw win-rate over a fixed number of games (still parallel).
  const seeds = Array.from({ length: a.evalGames }, (_, i) => `${a.seed}-eval-${i}`);
  const results = await pool.evalGames({
    netDir,
    rule: a.rule,
    rlLabel: RL_LABEL,
    seeds,
    players,
    maxTurns: a.maxTurns,
    sims: a.sims,
  });
  let wins = 0;
  let losses = 0;
  for (const r of results) {
    if (r.rlWon === true) wins++;
    else if (r.rlWon === false) losses++;
  }
  const decisive = wins + losses;
  return {
    verdict: "fixed",
    winRate: decisive > 0 ? wins / decisive : 0,
    wins,
    losses,
    decisive,
    llrImprove: 0,
    llrRegress: 0,
  };
}

async function main(): Promise<void> {
  const a = parseArgs(cliArgv);
  mkdirSync(a.dir, { recursive: true });
  const netDir = join(a.dir, "net");

  const bestDir = join(a.dir, "best");
  let net: MonoNet;
  let iteration = 0;
  let totalGames = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestIteration = 0;

  // The latest (iteration, totals) plus the retained keep-best, written together so
  // no writer drops the best fields (they persist across a resume).
  const saveMeta = (): void =>
    writeMeta(a.dir, { iteration, totalSelfPlayGames: totalGames, bestScore, bestIteration });

  if (existsSync(join(netDir, "model.json"))) {
    net = await MonoNet.load(netDir);
    const meta = readMeta(a.dir);
    iteration = meta?.iteration ?? 0;
    totalGames = meta?.totalSelfPlayGames ?? 0;
    // A never-yet-evaluated bestScore is NEGATIVE_INFINITY, which JSON writes as
    // `null` — so `?? ` wouldn't restore the sentinel (null is not undefined).
    // Treat any non-finite/absent value as "no best yet".
    bestScore =
      typeof meta?.bestScore === "number" && Number.isFinite(meta.bestScore)
        ? meta.bestScore
        : Number.NEGATIVE_INFINITY;
    bestIteration = meta?.bestIteration ?? 0;
    console.log(`Resumed from ${netDir} at iteration ${iteration} (${totalGames} self-play games).`);
  } else {
    net = MonoNet.create();
    console.log(`New net. Bootstrapping the value head on ${a.bootstrapGames} ${a.rule} games…`);
    const boot: TrainSample[] = [];
    for (let g = 0; g < a.bootstrapGames; g++) {
      boot.push(...collectRuleGame(`${a.seed}-boot-${g}`, a.rule, { players: a.players, maxTurns: a.maxTurns }));
    }
    if (boot.length > 0) {
      // A few passes so the value head actually fits the bootstrap outcomes.
      for (let e = 0; e < 5; e++) {
        const loss = await net.train(boot);
        console.log(`  bootstrap epoch ${e + 1}/5 — ${boot.length} samples, loss ${loss.toFixed(4)}`);
      }
    }
    await net.save(netDir);
    saveMeta();
    console.log(`Bootstrapped net saved to ${netDir}.`);
  }

  // Read the stop flag through a function so the loop guard isn't narrowed to
  // "always truthy": the SIGINT handler mutates `stopping` via closure, which TS's
  // flow analysis can't track, but a function's `boolean` return type defeats the
  // narrowing cleanly.
  let stopping = false;
  const stopRequested = (): boolean => stopping;
  process.on("SIGINT", () => {
    console.log("\nStopping after this iteration… (Ctrl-C again to force-quit)");
    stopping = true;
  });

  // Parallel self-play pool (RL-DESIGN.md §8 #1 — the throughput gate). Workers
  // each reload the latest net from `netDir` (saved at the end of every iteration)
  // and play their share of the games concurrently. Spawned once and reused so tfjs
  // loads per worker only on first task.
  const pool = new SelfPlayPool(a.workers > 0 ? a.workers : undefined);
  console.log(`Self-play pool: ${pool.size} workers.`);

  const buffer: TrainSample[] = [];
  try {
    while (iteration < a.iterations && !stopRequested()) {
      iteration += 1;
      const t0 = now();

      // netDir holds the net from the previous iteration's training (or the
      // bootstrap), so the pool self-plays the current weights — identical to the
      // old sequential loop, just spread across cores.
      const seeds = Array.from({ length: a.games }, (_, g) => `${a.seed}-${iteration}-${g}`);
      const tGen = now();
      const samples = await pool.generate({
        netDir,
        seeds,
        players: a.players,
        maxTurns: a.maxTurns,
        sims: a.sims,
      });
      const genMs = now() - tGen;
      buffer.push(...samples);
      totalGames += a.games;
      if (buffer.length > a.bufferCap) buffer.splice(0, buffer.length - a.bufferCap);

      const loss = await net.train(buffer);
      await net.save(netDir);
      saveMeta();

      console.log(
        `iter ${iteration} — ${a.games} games (${totalGames} total) in ${secs(genMs)} self-play, ` +
          `buffer ${buffer.length}, loss ${loss.toFixed(4)}, ${secs(now() - t0)}`,
      );

      if (a.evalEvery > 0 && iteration % a.evalEvery === 0) {
        const t1 = now();
        const er = await evaluate(netDir, pool, a);
        let tag = "";
        // KEEP-BEST: retain the highest-eval net under `<dir>/best`. `>=` so the
        // most RECENT net wins ties — later nets have seen more experience.
        if (er.winRate >= bestScore) {
          bestScore = er.winRate;
          bestIteration = iteration;
          await net.save(bestDir);
          saveMeta();
          tag = "  ← new best (saved to best/)";
        }
        console.log(
          `  eval — net vs ${a.rule}: ${(er.winRate * 100).toFixed(1)}% (${er.wins}W/${er.losses}L of ${er.decisive} decisive) ` +
            `SPRT=${er.verdict} [LLR +${er.llrImprove.toFixed(2)}/${er.llrRegress.toFixed(2)}] ` +
            `(${secs(now() - t1)})${tag}`,
        );
      }
    }
  } finally {
    await pool.close();
  }

  await net.save(netDir);
  saveMeta();
  const bestNote =
    bestIteration > 0
      ? ` Best eval ${(bestScore * 100).toFixed(1)}% at iter ${bestIteration} (in best/).`
      : "";
  console.log(`Saved. Stopped at iteration ${iteration}. Re-run to resume.${bestNote}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
