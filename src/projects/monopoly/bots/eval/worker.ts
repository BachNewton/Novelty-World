import { serveGames } from "@/shared/lib/bot-lab/serve";
import { simulateGame, type Contender } from "./simulate";
import { versionBot } from "../versions";
import type { GameResult, GameSpec } from "./parallel";

// ---------------------------------------------------------------------------
// The worker side of Monopoly's pool (see `parallel.ts`). It imports the SAME pure
// `simulateGame` and the SAME version archive as the main thread, and serves
// compact `GameResult`s through the shared `serveGames`.
// ---------------------------------------------------------------------------

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

serveGames(runOne);
