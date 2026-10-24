import { writeFileSync } from "node:fs";
import os from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { fitElo } from "@/shared/lib/bot-lab/elo";
import { wilsonInterval } from "@/shared/lib/bot-lab/stats";
import { RISK_BOTS } from "../bots";
import { SEAT_BOTS } from "../online/seat-roster";
import { formatRunRecord } from "@/shared/lib/bot-lab/run-log";
import {
  checkBots,
  checkLocal,
  commonDefaults,
  commonFlag,
  number,
  remoteDefaults,
  remoteFlag,
  riskRun,
  riskRunner,
  type CommonArgs,
  type RemoteArgs,
} from "./cli-args";
import { eloLine } from "./gauntlet";
import { ladderPrecision, playLadder, walkLadder, type LadderCache, type LadderSpec, type LadderWalk } from "./ratings";
import { fileLadderCache } from "./ratings-cache";
import { formatRoundPlan, remoteGames, writeRoundPlan } from "./remote";

/** `npm run risk:ratings` — a ladder of Risk bots: every pair plays at each table size,
 *  each bot alone among copies of the other, a seed group at a time until the pair's gap
 *  is known to the ladder's precision, and one Bradley–Terry fit over the winners gives
 *  the win Elo (the ladder), with the finishing-order Elo beside it. It measures; the
 *  gauntlet decides (see the project's CLAUDE.md, "Measuring bots").
 *
 *  Usage:
 *    npm run risk:ratings -- greedy rule-v1                # name the bots (random only when named)
 *    npm run risk:ratings -- greedy rule-v1 --players 6 --anchor rule-v1
 *    npm run risk:ratings -- greedy rule-v1 --margin 30 --alpha 0.05 --max-groups 100
 *    npm run risk:ratings -- --seatable                    # every seatable bot; writes bots/ratings.json
 *    npm run risk:ratings -- --seatable --fresh            # play every matchup again, not from the cache
 *    npm run risk:ratings -- greedy gd-stacker native-v1 --native   # every table in the crate
 *    npm run risk:ratings -- greedy gd-stacker --native --parity 5  # and every 5th group in TypeScript too
 *
 *    npm run risk:ratings -- greedy rule-v1 --games-from games --plan plan.json   # plan a remote round
 *    npm run risk:ratings -- greedy rule-v1 --games-from games                    # report a remote run
 *
 *  With `--games-from`, the games come from a remote run's shards (`remote.ts`), as the
 *  gauntlet's do, each round sized to what the ladder's precision is expected to need.
 *
 *  Each matchup's groups are kept in `ratings-cache.json` while the code they ran on is
 *  unchanged (`ratings-cache.ts`), so a run plays only the groups it hasn't seen. */

/** The seatable bots' measured Elo, which the lobby ranks them by (`online/seat-bots.ts`). */
const SEAT_RATINGS = fileURLToPath(new URL("../bots/ratings.json", import.meta.url));
/** The seatable ladder's anchor and the Elo it is shown at. */
const SEAT_ANCHOR = "greedy";
const SEAT_ANCHOR_ELO = 1000;

interface Args extends CommonArgs, RemoteArgs {
  labels: string[];
  maxGroups: number;
  margin: number;
  alpha: number;
  anchor?: string;
  seatable: boolean;
  fresh: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = { ...commonDefaults("ratings"), ...remoteDefaults(), labels: [], maxGroups: 100, margin: 30, alpha: 0.05, seatable: false, fresh: false };
  for (let i = 0; i < argv.length; i++) {
    const used = commonFlag(a, argv, i) || remoteFlag(a, argv, i);
    if (used > 0) {
      i += used - 1;
      continue;
    }
    if (argv[i] === "--max-groups") a.maxGroups = number(argv[++i], "--max-groups");
    else if (argv[i] === "--margin") a.margin = number(argv[++i], "--margin");
    else if (argv[i] === "--alpha") a.alpha = number(argv[++i], "--alpha");
    else if (argv[i] === "--anchor") a.anchor = argv[++i];
    else if (argv[i] === "--seatable") a.seatable = true;
    else if (argv[i] === "--fresh") a.fresh = true;
    else if (argv[i].startsWith("--")) throw new Error(`unknown flag "${argv[i]}"`);
    else a.labels.push(argv[i]);
  }
  if (a.seatable) {
    if (a.labels.length > 0 || a.anchor !== undefined) throw new Error("--seatable rates every seatable bot against greedy: name no bots and no anchor");
    a.labels = Object.keys(SEAT_BOTS);
    a.anchor = SEAT_ANCHOR;
  }
  if (a.labels.length === 0) a.labels = Object.keys(RISK_BOTS).filter((l) => l !== "random");
  if (a.labels.length < 2) throw new Error("a ladder needs at least two bots. Example: npm run risk:ratings -- greedy random");
  checkBots(a.labels);
  return a;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const anchor = args.anchor ?? args.labels[0];
  checkLocal(args, args.gamesFrom);
  const remote = args.gamesFrom === undefined ? null : remoteGames(args.gamesFrom);
  if (args.plan !== undefined && remote === null) {
    throw new Error("--plan needs --games-from: the directory of the games played so far, empty before the first round");
  }
  const workers = remote === null ? args.workers : (remote.shards[0]?.record.workers ?? os.cpus().length);
  console.log(
    `\nRisk — ratings\n` +
      `Bots: [${args.labels.join(", ")}]   Tables: ${args.players.join(", ")} players, each bot alone among the other\n` +
      `Precision: any two bots ${args.margin.toString()} Elo a seat apart ordered right at α=${args.alpha.toString()} (gap SE ≤ ${ladderPrecision(args.margin, args.alpha).toFixed(1)} Elo), at most ${args.maxGroups.toString()} seed groups per table\n` +
      `Seeds: "${args.prefix}:*"   Workers: ${workers}${remote === null ? "" : ` a machine, round ${(remote.rounds + 1).toString()}`}   Max turns: ${args.maxTurns}\n`,
  );
  const live = riskRun({
    tool: "risk:ratings",
    bots: args.labels,
    tables: args.players.map((n) => `${n.toString()}p one-in`),
    seeds: args.prefix,
    workers,
  }, remote === null ? undefined : { id: remote.run.id, play: remote.play });
  const file = fileLadderCache(args.native);
  // Read from the cache's records but, when fresh, written to it all the same.
  const cache: LadderCache = args.fresh ? { get: () => [], set: file.set } : file;
  const ladder: LadderSpec = {
    labels: args.labels,
    players: args.players,
    prefix: args.prefix,
    maxTurns: args.maxTurns,
    margin: args.margin,
    alpha: args.alpha,
    maxGroups: args.maxGroups,
    cache,
  };
  // Each matchup is a step of the run, done once its pair's gap is known; the run is done
  // in the share of its matchups done.
  const printed = new Set<number>();
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  const show = ({ matchups }: LadderWalk, print: boolean) => {
    live.setProgress(() => matchups.filter((m) => m.done).length / Math.max(1, matchups.length));
    matchups.forEach((m, step) => {
      const wins = m.groups.reduce((s, g) => s + g.record.wins, 0);
      const losses = m.groups.reduce((s, g) => s + g.record.losses, 0);
      const draws = m.groups.reduce((s, g) => s + g.record.draws, 0);
      live.step(step, {
        table: `${m.players.toString()}p`,
        pairing: { bot: m.lone, against: m.rest, seats: 1, players: m.players },
        games: m.groups.length * m.players,
        record: { wins, losses, draws, par: 1 / m.players },
        done: m.done,
      });
      if (!print || !m.done || printed.has(step)) return;
      printed.add(step);
      const ci = wilsonInterval(wins, wins + losses);
      console.log(
        `  ${m.players.toString()}p  ${m.lone} alone among ${m.rest}: wins ${pct(ci.share)} [${pct(ci.low)}–${pct(ci.high)}] vs par ${pct(1 / m.players)}` +
          `   (${wins.toString()}–${losses.toString()}, ${draws.toString()} capped, ${m.groups.length.toString()} groups)${m.cached === m.groups.length && m.cached > 0 ? "  [cached]" : ""}`,
      );
    });
  };

  if (args.plan !== undefined && remote !== null) {
    try {
      const walk = walkLadder(ladder, (spec) => remote.store.get(spec), true);
      show(walk, false);
      const specs = walk.specs;
      const plan = writeRoundPlan(args.plan, remote, specs, await live.handOff(), args.shards);
      console.log(formatRoundPlan(plan, args.plan));
    } catch (e) {
      await live.fail(e);
      throw e;
    }
    return;
  }

  const pool = remote === null ? live.watch(riskRunner(args, args.labels), (r) => r.decisions) : remote.store.runner();
  try {
    const { tallies, winPairs, finishPairs, errors, cached } = await playLadder({
      ...ladder,
      pool,
      // A remote run's report reads a group at a time, so it asks for no game past a stop point.
      stepwise: remote !== null,
      // The pairs stop at different points, so each line is printed as its matchup is done.
      onRound: (walk) => {
        show(walk, true);
      },
    });
    const groups = tallies.reduce((s, t) => s + t.groups, 0);
    const games = tallies.reduce((s, t) => s + t.groups * t.players, 0);
    console.log(`
  Games: ${games.toString()} in ${groups.toString()} groups, ${cached.toString()} groups from the cache`);
    const winElo = fitElo(args.labels, winPairs, { anchor });
    console.log(`
  Win Elo (${anchor} = 0):              ${eloLine(winElo)}`);
    console.log(`  Finishing-order Elo (${anchor} = 0):  ${eloLine(fitElo(args.labels, finishPairs, { anchor }))}`);
    if (args.seatable) {
      if (errors > 0) throw new Error("games threw: the seatable ratings were not written");
      const elo = Object.fromEntries(args.labels.map((l) => [l, Math.round((SEAT_ANCHOR_ELO + winElo[l]) * 10) / 10]));
      const measured =
        `risk:ratings -- --seatable --margin ${args.margin.toString()} --alpha ${args.alpha.toString()}, ${new Date().toISOString().slice(0, 10)}: ` +
        `${games.toString()} games at ${args.players.join(", ")} players, each bot alone among each other`;
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- the ratings file beside the bots, a fixed path in this repo
      writeFileSync(SEAT_RATINGS, `${JSON.stringify({ measured, anchor: `${SEAT_ANCHOR} = ${SEAT_ANCHOR_ELO.toString()}`, elo }, null, 2)}\n`);
      console.log(`  Wrote the seatable bots' Elo to bots/ratings.json`);
    }
    if (errors > 0) {
      console.log(`  ⚠ ${errors} games threw and were excluded: a bot or engine bug`);
      process.exitCode = 1;
    }
    const record = await live.finish({ elo: { anchor, ratings: winElo }, errors });
    console.log(`
${formatRunRecord(record)}
`);
  } catch (e) {
    await live.fail(e);
    throw e;
  } finally {
    await pool.close();
  }
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
