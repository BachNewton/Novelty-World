import { isDeepStrictEqual } from "node:util";
import type { GameRunner } from "@/shared/lib/bot-lab/pool";
import { RISK_BOTS } from "../../bots";
import type { RiskGameResult, RiskGameSpec } from "../runner";
import { nativeName } from "./bot";
import { NativeChild } from "./child";

// Whole games in the crate (`ideas/native-port.md`, "How a Rust bot is measured"): a table whose
// every seat is a native bot plays in `risk-native serve`, on its own pool of threads, wrapped as
// the bot-lab `GameRunner` every measuring tool plays on.

/** A spec or result with its labels as the crate names them, `@native` dropped. */
function crateNames<T extends { labels: readonly string[] }>(game: T): T {
  return { ...game, labels: game.labels.map(nativeName) };
}

/** Plays games in one `risk-native serve --workers <workers>` process: each `run` is one batch,
 *  tagged with an id so several may be in flight. Labels go in without their `@native` and come
 *  back as they were given. */
export function nativeRunner(workers: number): GameRunner<RiskGameSpec, RiskGameResult> {
  const child = new NativeChild(["serve", "--workers", workers.toString()]);
  return {
    size: workers,
    run: async (specs) => {
      if (specs.length === 0) return [];
      const { results } = (await child.ask({ specs: specs.map(crateNames) })) as { results: RiskGameResult[] };
      if (results.length !== specs.length || results.some((r, i) => r.index !== specs[i].index)) {
        throw new Error(`risk-native serve answered a batch of ${specs.length.toString()} games with ${results.length.toString()} results out of order`);
      }
      return results.map((r, i) => ({ ...r, labels: specs[i].labels })).sort((p, q) => p.index - q.index);
    },
    close: () => child.close(),
  };
}

/** A seed group's number: the `-<n>` every measuring tool ends a group's seed with. */
function seedGroup(seed: string): number {
  const match = /-(\d+)$/.exec(seed);
  if (match === null) throw new Error(`--parity samples seed groups by their number, and "${seed}" has none`);
  return Number(match[1]);
}

/** Whether `--parity` can check a table: the TypeScript side must have every seat's bot. */
export function checkParity(seated: readonly string[]): void {
  const missing = seated.filter((label) => !Object.hasOwn(RISK_BOTS, nativeName(label)));
  if (missing.length > 0) throw new Error(`--parity plays the games in TypeScript too, which has no ${missing.join(", ")}`);
}

/** The native runner, with every `every`-th seed group (the 1st, the (every + 1)-th, …) of every
 *  batch also played on `typescript` (the TypeScript pool, every seat its TypeScript bot), and the
 *  two results required identical: a difference fails the run loudly, printing both. For bots
 *  that are exact on both sides, so the crate's games are the TypeScript games. */
export function parityRunner(
  native: GameRunner<RiskGameSpec, RiskGameResult>,
  typescript: GameRunner<RiskGameSpec, RiskGameResult>,
  every: number,
): GameRunner<RiskGameSpec, RiskGameResult> {
  if (!(Number.isInteger(every) && every >= 1)) throw new Error(`--parity takes a whole number of seed groups, 1 or more, not ${every.toString()}`);
  return {
    size: native.size,
    run: async (specs) => {
      const sampled = specs.filter((spec) => (seedGroup(spec.seed) - 1) % every === 0);
      const [results, checks] = await Promise.all([native.run(specs), typescript.run(sampled.map(crateNames))]);
      // Both compared under the crate's names, as the TypeScript side was given them.
      const byIndex = new Map(results.map((r) => [r.index, crateNames(r)]));
      for (const ts of checks) {
        const crate = byIndex.get(ts.index);
        if (!isDeepStrictEqual(crate, ts)) {
          throw new Error(`--parity: game ${ts.seed} [${ts.labels.join(", ")}] differs\n  native:     ${JSON.stringify(crate)}\n  TypeScript: ${JSON.stringify(ts)}`);
        }
      }
      return results;
    },
    close: async () => {
      await Promise.all([native.close(), typescript.close()]);
    },
  };
}
