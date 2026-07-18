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
import { mctsBot } from "./mcts";
import { simulateGame } from "./simulate";
import { botFor } from "./registry"; // safe after tfjs-setup: registry pulls no tfjs.

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
  bufferCap: number;
  seed: string;
  workers: number;
}

interface Meta {
  iteration: number;
  totalSelfPlayGames: number;
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

/** Play `evalGames` net-vs-rule games and return the net's win rate (the net is
 *  the "rl"-labelled seat; the other seat is the rule bot). A quick, noisy
 *  strength gauge logged each eval — the rigorous measure is the existing Elo/SPRT
 *  gauntlet (phase 7). */
function evaluate(net: MonoNet, a: Args): number {
  const bot = mctsBot(net, { simulations: a.sims });
  const rule = botFor(a.rule);
  let wins = 0;
  for (let g = 0; g < a.evalGames; g++) {
    const result = simulateGame({
      seed: `${a.seed}-eval-${g}`,
      seats: [
        { label: "rl", bot },
        { label: a.rule, bot: rule },
      ],
      maxTurns: a.maxTurns,
    });
    const rlId = result.standings.find((s) => s.name === "rl")?.id ?? null;
    if (result.winnerId !== null && result.winnerId === rlId) wins += 1;
  }
  return wins / Math.max(1, a.evalGames);
}

async function main(): Promise<void> {
  const a = parseArgs(cliArgv);
  mkdirSync(a.dir, { recursive: true });
  const netDir = join(a.dir, "net");

  let net: MonoNet;
  let iteration = 0;
  let totalGames = 0;

  if (existsSync(join(netDir, "model.json"))) {
    net = await MonoNet.load(netDir);
    const meta = readMeta(a.dir);
    iteration = meta?.iteration ?? 0;
    totalGames = meta?.totalSelfPlayGames ?? 0;
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
    writeMeta(a.dir, { iteration, totalSelfPlayGames: totalGames });
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
      writeMeta(a.dir, { iteration, totalSelfPlayGames: totalGames });

      console.log(
        `iter ${iteration} — ${a.games} games (${totalGames} total) in ${secs(genMs)} self-play, ` +
          `buffer ${buffer.length}, loss ${loss.toFixed(4)}, ${secs(now() - t0)}`,
      );

      if (a.evalEvery > 0 && iteration % a.evalEvery === 0) {
        const t1 = now();
        const winRate = evaluate(net, a);
        console.log(
          `  eval — net vs ${a.rule}: ${(winRate * 100).toFixed(1)}% over ${a.evalGames} games (${secs(now() - t1)})`,
        );
      }
    }
  } finally {
    await pool.close();
  }

  await net.save(netDir);
  writeMeta(a.dir, { iteration, totalSelfPlayGames: totalGames });
  console.log(`Saved. Stopped at iteration ${iteration}. Re-run to resume.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
