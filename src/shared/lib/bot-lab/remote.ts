import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LiveRowWrite } from "./live-row";
import type { GameRunner, Indexed } from "./pool";
import type { RunRecord } from "./run-log";

// A measuring run played on other machines (GitHub Actions' runners), round by
// round. Each round, a PLAN names the games the run still needs; SHARDS, one a
// machine, each play their share of them and keep the results; and the next plan
// reads every result so far. Once a plan needs no games, the run's own CLI is run
// once more over the kept results, answering every game from them instead of
// playing it. A game is a pure function of its spec, so that last run reports
// exactly what the CLI reports when it plays the games itself: the same code reads
// the same results in the same order.

/** The run a round belongs to: its live row's id and when its first round was planned. */
export interface RemoteRun {
  id: string;
  started: string;
}

export function newRemoteRun(): RemoteRun {
  return { id: randomUUID(), started: new Date().toISOString() };
}

/** One round's games, and how many machines play them. */
export interface RoundPlan<Spec> {
  run: RemoteRun;
  round: number;
  shards: number;
  specs: Spec[];
  /** The run's live row as of this plan, which the shards keep beating while they
   *  play; null when the run isn't published. */
  live: LiveRowWrite | null;
}

/** A played game: its result, under the key of the spec that played it. */
export interface KeptGame<Result> {
  key: string;
  result: Result;
}

/** What one machine played in a round: its games and its run-log record. */
export interface Shard<Result> {
  run: RemoteRun;
  round: number;
  shard: number;
  record: RunRecord;
  games: KeptGame<Result>[];
}

/** The specs machine `shard` of `shards` plays: every `shards`-th, so each machine gets
 *  the same mix of tables, and of cheap and costly games. */
export function stripe<Spec>(specs: readonly Spec[], shards: number, shard: number): Spec[] {
  if (!(Number.isInteger(shard) && shard >= 0 && shard < shards)) throw new Error(`no shard ${shard} of ${shards}`);
  return specs.filter((_, i) => i % shards === shard);
}

/** Machines for a round of `games`: enough that none plays fewer than `perShard`, at most `most`. */
export function shardCount(games: number, most: number, perShard: number): number {
  return Math.max(1, Math.min(most, Math.ceil(games / perShard)));
}

export function writeJson(file: string, value: unknown): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a path the run's own workflow names
  mkdirSync(path.dirname(file), { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a path the run's own workflow names
  writeFileSync(file, `${JSON.stringify(value)}\n`);
}

export function readPlan<Spec>(file: string): RoundPlan<Spec> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a path the run's own workflow names
  return JSON.parse(readFileSync(file, "utf8")) as RoundPlan<Spec>;
}

/** Every shard kept in `dir`, all of one run; none when the directory is missing. */
export function readShards<Result>(dir: string): Shard<Result>[] {
  let files: string[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a path the run's own workflow names
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a file in the directory the workflow names
  const shards = files.sort().map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Shard<Result>);
  const ids = new Set(shards.map((s) => s.run.id));
  if (ids.size > 1) throw new Error(`the shards in ${dir} come from ${ids.size.toString()} different runs`);
  return shards;
}

/** The run the shards belong to, or a new one before any has played. */
export function runOf(shards: readonly Shard<unknown>[]): RemoteRun {
  return shards.length === 0 ? newRemoteRun() : shards[0].run;
}

/** Every game the shards played. */
export function keptGames<Result>(shards: readonly Shard<Result>[]): KeptGame<Result>[] {
  return shards.flatMap((s) => s.games);
}

/** Results kept from earlier rounds, found by the spec that played them. */
export class GameStore<Spec extends Indexed, Result extends Indexed> {
  private readonly byKey = new Map<string, Result>();

  /** `keyOf` names a spec by everything its game depends on, never its index. */
  constructor(
    private readonly keyOf: (spec: Spec) => string,
    games: Iterable<KeptGame<Result>> = [],
  ) {
    for (const g of games) this.add(g);
  }

  add({ key, result }: KeptGame<Result>): void {
    this.byKey.set(key, result);
  }


  get size(): number {
    return this.byKey.size;
  }

  /** The kept result of `spec`, under the spec's own index. */
  get(spec: Spec): Result | undefined {
    const found = this.byKey.get(this.keyOf(spec));
    return found === undefined ? undefined : { ...found, index: spec.index };
  }

  /** A runner that answers every game from the store and plays none. A game it
   *  doesn't hold is a run its plans didn't finish, so it throws. */
  runner(): GameRunner<Spec, Result> {
    return {
      size: 1,
      run: (specs) => {
        const results = specs.map((spec) => {
          const found = this.get(spec);
          if (found === undefined) {
            throw new Error(`game ${this.keyOf(spec)} was never played: the run's rounds didn't finish it`);
          }
          return found;
        });
        return Promise.resolve(results);
      },
      close: () => Promise.resolve(),
    };
  }
}
