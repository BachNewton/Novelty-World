import os from "node:os";
import path from "node:path";
import type { LiveRowWrite } from "@/shared/lib/bot-lab/live-row";
import {
  GameStore,
  keptGames,
  readShards,
  runOf,
  shardCount,
  writeJson,
  type RemoteRun,
  stripe,
  type RoundPlan,
  type Shard,
} from "@/shared/lib/bot-lab/remote";
import type { GameRunner } from "@/shared/lib/bot-lab/pool";
import type { RemotePlay, RunRecord } from "@/shared/lib/bot-lab/run-log";
import type { RiskGameResult, RiskGameSpec } from "./runner";

// Risk's measuring CLIs played in rounds on other machines (`bot-lab/remote.ts`, and
// the project's docs on running them on GitHub Actions): the games kept so far, and
// the next round's plan.

/** Everything a game depends on but its index. */
export function riskGameKey(spec: RiskGameSpec): string {
  return `${spec.seed}|${spec.labels.join(",")}|${spec.maxTurns.toString()}`;
}

export type RiskStore = GameStore<RiskGameSpec, RiskGameResult>;

/** A remote run's games so far, read from its shards. */
export interface RemoteGames {
  run: RemoteRun;
  shards: Shard<RiskGameResult>[];
  store: RiskStore;
  /** The rounds played so far. */
  rounds: number;
  /** What the shards played, for the run log. */
  play: RemotePlay;
}

export function remoteGames(dir: string): RemoteGames {
  const shards = readShards<RiskGameResult>(dir);
  const run = runOf(shards);
  const rounds = Math.max(0, ...shards.map((s) => s.round));
  return {
    run,
    shards,
    store: new GameStore(riskGameKey, keptGames(shards)),
    rounds,
    play: { started: run.started, shards: shards.map((s) => s.record), rounds },
  };
}

/** Writes the next round's plan: its games split over at most `most` machines, none
 *  with fewer than `perShard` games (by default a few for each of this machine's cores:
 *  the machines of a round are all of one kind). */
export function writeRoundPlan(
  file: string,
  games: RemoteGames,
  specs: RiskGameSpec[],
  live: LiveRowWrite | null,
  most: number,
  perShard = 4 * os.cpus().length,
): RoundPlan<RiskGameSpec> {
  const plan: RoundPlan<RiskGameSpec> = {
    run: games.run,
    round: games.rounds + 1,
    shards: specs.length === 0 ? 0 : shardCount(specs.length, most, perShard),
    specs,
    live,
  };
  writeJson(file, plan);
  return plan;
}

/** Plays shard `shard` of a round on `runner`, its record taken once its games are done. */
export async function playShard(
  plan: RoundPlan<RiskGameSpec>,
  shard: number,
  runner: GameRunner<RiskGameSpec, RiskGameResult>,
  record: () => RunRecord,
): Promise<Shard<RiskGameResult>> {
  // Each game under its position in this shard, so results map back to their specs.
  const specs = stripe(plan.specs, plan.shards, shard).map((spec, index) => ({ ...spec, index }));
  const results = await runner.run(specs);
  return {
    run: plan.run,
    round: plan.round,
    shard,
    record: record(),
    games: results.map((result) => ({ key: riskGameKey(specs[result.index]), result })),
  };
}

/** A console line saying what the plan asks for. */
export function formatRoundPlan(plan: RoundPlan<RiskGameSpec>, file: string): string {
  if (plan.specs.length === 0) return `  Round ${plan.round.toString()}: nothing left to play; the run is ready to report.`;
  return `  Round ${plan.round.toString()}: ${plan.specs.length.toString()} games over ${plan.shards.toString()} machines, planned in ${path.basename(file)}.`;
}
