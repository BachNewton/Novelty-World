import { parentPort } from "node:worker_threads";
import { simulateGame, type Contender } from "./simulate";
import { versionBot } from "../versions";
import type { GameResult, GameSpec } from "./parallel";

// ---------------------------------------------------------------------------
// The worker side of the parallel evaluator (see `parallel.ts`). It imports the
// SAME pure `simulateGame` and the SAME version archive as the main thread, runs
// the games it's handed, and posts back compact `GameResult`s. It holds no state
// between batches — every game is independent and deterministic — so worker
// assignment can never change an outcome.
// ---------------------------------------------------------------------------

if (!parentPort) {
  throw new Error("worker.ts must run as a worker thread (no parentPort)");
}
const port = parentPort;

function runOne(spec: GameSpec): GameResult {
  const base = {
    index: spec.index,
    seed: spec.seed,
    labels: spec.labels,
  };
  try {
    const seats: Contender[] = spec.labels.map((label) => ({
      label,
      bot: versionBot(label),
    }));
    const r = simulateGame({ seed: spec.seed, seats, maxTurns: spec.maxTurns });
    const winnerLabel =
      r.winnerId === null
        ? null
        : (r.standings.find((s) => s.id === r.winnerId)?.label ?? null);
    return {
      ...base,
      winnerLabel,
      terminated: r.terminated,
      turns: r.turns,
      trades: r.eventCounts["trade"] ?? 0,
      declines: r.eventCounts["trade-declined"] ?? 0,
      bankruptcies: r.eventCounts["bankrupt"] ?? 0,
    };
  } catch (e) {
    // One pathological game must not poison the batch — report it as an error so
    // the aggregator excludes it and surfaces the red flag.
    return {
      ...base,
      winnerLabel: null,
      terminated: false,
      turns: 0,
      trades: 0,
      declines: 0,
      bankruptcies: 0,
      error: (e as Error).message,
    };
  }
}

port.on("message", (msg: { specs: GameSpec[] }) => {
  const results = msg.specs.map(runOne);
  port.postMessage({ results });
});
