import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { inlineRunner } from "@/shared/lib/bot-lab/pool";
import { readPlan, writeJson } from "@/shared/lib/bot-lab/remote";
import type { RunRecord } from "@/shared/lib/bot-lab/run-log";
import { playShard, remoteGames, writeRoundPlan, type RemoteGames } from "./remote";
import type { RiskGameResult, RiskGameSpec } from "./runner";

// A remote run played on this machine, for tests: the loop GitHub Actions runs
// (`.github/workflows/risk-measure.yml`), through the same files, on one thread.
// Each round is planned from the shards so far, split over machines, and each
// machine's share is played and kept, until a plan needs no games.

/** A shard's record, standing in for what a machine measures of itself. */
function shardRecord(games: number): RunRecord {
  return {
    started: new Date(0).toISOString(),
    tool: "risk:shard",
    args: [],
    bots: [],
    tables: [],
    seeds: "",
    workers: 1,
    wallSeconds: 1,
    commit: "",
    dirty: false,
    games,
    decisions: 0,
    gamesPerSecond: games,
    decisionsPerSecond: 0,
    machine: { cpu: "test", logicalCores: 1, totalMemoryGiB: 1, platform: "test", node: process.version },
    cpu: { mean: 1, peak: 1 },
    machineCpu: { mean: 1, peak: 1 },
    peakMemoryMiB: 1,
  };
}

export interface RemoteResult {
  games: RemoteGames;
  /** Machines that played each round. */
  rounds: number[];
}

/** Plays a run in rounds: `planRound` names the games each round needs from those so
 *  far, each round is split over at most `most` machines of at least `perShard` games,
 *  and `play` plays a game. Resolves with the games of the round that needed none. */
export async function playRemotely(
  planRound: (games: RemoteGames) => RiskGameSpec[],
  play: (spec: RiskGameSpec) => RiskGameResult,
  most: number,
  perShard: number,
): Promise<RemoteResult> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "risk-remote-"));
  const shards = path.join(dir, "games");
  const rounds: number[] = [];
  for (;;) {
    const games = remoteGames(shards);
    const file = path.join(dir, `plan-${(games.rounds + 1).toString()}.json`);
    writeRoundPlan(file, games, planRound(games), null, most, perShard);
    const plan = readPlan<RiskGameSpec>(file);
    if (plan.specs.length === 0) return { games, rounds };
    rounds.push(plan.shards);
    for (let s = 0; s < plan.shards; s++) {
      const shard = await playShard(plan, s, inlineRunner(play), () => shardRecord(0));
      writeJson(path.join(shards, `r${plan.round.toString()}-s${s.toString()}.json`), shard);
    }
  }
}
