import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { fitElo } from "@/shared/lib/bot-lab/elo";
import { wilsonInterval } from "@/shared/lib/bot-lab/stats";
import { RISK_BOTS } from "../bots";
import { RETIRED_BOTS, SEAT_BOTS, type RowBotId } from "../online/seat-roster";
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
import { checkFrozen } from "./frozen-check";
import { keptFingerprints } from "./frozen-games";
import { readGauntlets } from "./gauntlet-log";
import { provisionalElo, type RatingsFile } from "./provisional";
import { cacheWalk, filledRound, walkFit } from "./ladder-rounds";
import { ladderPrecision, playLadder, walkLadder, type LadderCache, type LadderSpec, type LadderWalk } from "./ratings";
import { carryable, carryRecords, fileLadderCache, staleRecords, type StaleRecord } from "./ratings-cache";
import { formatRoundPlan, remoteGames, writeRoundPlan } from "./remote";
import type { RiskGameSpec } from "./runner";

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
 *    npm run risk:ratings -- --stale                       # the cache's records an edit has made stale
 *    npm run risk:ratings -- --carry                       # keep those of seated bots that still play their frozen games
 *    npm run risk:ratings -- --provisional learned-v3 --as 'net-v1~{"weights":"x"}'  # seat a bot on its gauntlets
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
/** The games a remote round is filled to for each machine: twice the fewest `writeRoundPlan`
 *  gives one, a few for each of a runner's cores. Learned-v2's seatable ladder, replayed on its
 *  own games, needed 37 rounds sized to the evidence, 15 filled to half this and 11 filled to
 *  this, for 7% more games and the same Elo. */
const ROUND_FILL_PER_SHARD = 2 * 4 * os.cpus().length;

/** A bot held to its kept frozen games: a seated bot, or a retired one. */
const isFrozen = (label: string): label is RowBotId => Object.hasOwn(SEAT_BOTS, label) || Object.hasOwn(RETIRED_BOTS, label);

/** The stale records, by what changed, with the games they hold: what a ladder would play again. */
function formatStale(records: readonly StaleRecord[]): string {
  const by = new Map<string, { matchups: number; groups: number; games: number }>();
  for (const r of records) {
    const what = r.game ? "the game's own code" : r.changed.join(" and ");
    const t = by.get(what) ?? { matchups: 0, groups: 0, games: 0 };
    t.matchups++;
    t.groups += r.groups;
    t.games += r.groups * r.players;
    by.set(what, t);
  }
  const lines = [...by].map(([what, t]) => `    ${what}${isFrozen(what) ? " (frozen)" : ""}: ${t.matchups.toString()} matchups, ${t.groups.toString()} groups, ${t.games.toString()} games`);
  return `  The ladder cache holds ${records.length.toString()} matchups whose code has changed since they were played:\n${lines.join("\n")}`;
}

/** An unfinished ladder's fit and its open pairs, each with its gap and that gap's error. */
function formatUnfinished(walk: LadderWalk, labels: readonly string[], anchor: string): string {
  const { elo, variance } = walkFit(labels, walk, anchor);
  const open = new Map<string, { lone: string; rest: string; groups: number }>();
  for (const m of walk.matchups.filter((x) => !x.done)) {
    const key = [m.lone, m.rest].sort().join(" ");
    open.set(key, { lone: m.lone, rest: m.rest, groups: Math.max(open.get(key)?.groups ?? 0, m.groups.length) });
  }
  const lines = [...open.values()].map(
    (p) => `    ${p.lone} – ${p.rest}: gap ${(elo[p.lone] - elo[p.rest]).toFixed(0)} ± ${Math.sqrt(variance(p.lone, p.rest)).toFixed(0)} Elo after ${p.groups.toString()} groups`,
  );
  return `\n  Unfinished. Win Elo so far (${anchor} = 0): ${eloLine(elo)}\n  Open pairs:\n${lines.join("\n")}`;
}

/** `--stale`, `--carry` and `--provisional`: the cache and the ratings file, no games. */
function seatingTool(argv: readonly string[]): void {
  if (argv.includes("--stale")) {
    const stale = staleRecords();
    console.log(stale.length === 0 ? "  Every record in the ladder cache is current." : formatStale(stale));
    return;
  }
  if (argv.includes("--carry")) {
    const bots = [...new Set(carryable(staleRecords(), isFrozen).flatMap((r) => r.changed))].filter(isFrozen);
    const carried = new Set<string>();
    for (const bot of bots) {
      const check = checkFrozen(bot);
      if (check.differs.length === 0) carried.add(bot);
      const where = check.differs.map((d) => `${d.seed} decision ${d.decision.toString()}`).join(", ");
      console.log(`  ${bot}: ${check.decisions.toString()} decisions asked again, ${where === "" ? "all as kept" : `differs at ${where}: it plays otherwise, so its records stay stale`}`);
    }
    console.log(`  Carried ${carryRecords(carried).toString()} records over to the code now.`);
    return;
  }
  const at = argv.indexOf("--provisional");
  const bot = argv[at + 1] as string | undefined;
  if (bot === undefined || !Object.hasOwn(SEAT_BOTS, bot)) throw new Error(`--provisional names a seatable bot (seatable: ${Object.keys(SEAT_BOTS).join(", ")})`);
  const asAt = argv.indexOf("--as");
  const as = asAt === -1 ? bot : argv[asAt + 1];
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the ratings file beside the bots, a fixed path in this repo
  const file = JSON.parse(readFileSync(SEAT_RATINGS, "utf8")) as RatingsFile;
  if (Object.hasOwn(file.elo, bot)) throw new Error(`${bot} already has a measured Elo: a provisional one would only hide it`);
  const own = JSON.stringify(keptFingerprints(bot as RowBotId));
  const records = readGauntlets().filter((g) => g.candidate === as);
  for (const r of records) {
    if (JSON.stringify(r.frozen) !== own) throw new Error(`gauntlet ${r.run} measured "${as}", which played the frozen games otherwise than ${bot}'s kept ones: not the same bot`);
  }
  const { entry, estimates } = provisionalElo(as, records, file.elo);
  for (const e of estimates) console.log(`  gauntlet ${e.run}: ${(e.elo).toFixed(1)} ± ${e.error.toFixed(1)}`);
  console.log(`  ${bot}: provisional Elo ${entry.elo.toFixed(1)} ± ${entry.error.toFixed(1)} from ${estimates.length.toString()} gauntlets of ${as}`);
  const next: RatingsFile = { ...file, provisional: { ...file.provisional, [bot]: entry } };
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the ratings file beside the bots, a fixed path in this repo
  writeFileSync(SEAT_RATINGS, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`  Wrote it to bots/ratings.json; the next seatable ladder replaces it.`);
}

interface Args extends CommonArgs, RemoteArgs {
  labels: string[];
  maxGroups: number;
  margin: number;
  alpha: number;
  anchor?: string;
  seatable: boolean;
  fresh: boolean;
  replayStale: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = {
    ...commonDefaults("ratings"),
    ...remoteDefaults(),
    labels: [],
    maxGroups: 100,
    margin: 30,
    alpha: 0.05,
    seatable: false,
    fresh: false,
    replayStale: false,
  };
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
    else if (argv[i] === "--replay-stale") a.replayStale = true;
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
  // Records an edit made stale, which this ladder would play again: it stops here, so the
  // hours are a choice. Those only seated bots' edits made stale may be kept, when the bots
  // still play their frozen games.
  if (!args.native && !args.fresh && !args.replayStale) {
    const stale = staleRecords(args.labels);
    if (stale.length > 0) {
      const keep = carryable(stale, isFrozen).length > 0 ? "\n  `npm run risk:ratings -- --carry` keeps those of seated bots that still play their frozen games." : "";
      throw new Error(`${formatStale(stale)}${keep}\n  To play them again, pass --replay-stale.`);
    }
  }
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
      // A round's machines start in minutes whatever they play, so a small round is filled
      // to a few games for each of its machines' cores (`filledRound`).
      const played = (spec: RiskGameSpec) => remote.store.get(spec);
      const walk = walkLadder(ladder, played, true);
      show(walk, false);
      const specs = filledRound(ladder, walk, played, args.shards * ROUND_FILL_PER_SHARD);
      const plan = writeRoundPlan(args.plan, remote, specs, await live.handOff(), args.shards);
      console.log(formatRoundPlan(plan, args.plan));
    } catch (e) {
      await live.fail(e);
      throw e;
    }
    return;
  }

  // A remote run whose rounds ran out before the ladder came into focus still reports what
  // its games show, and which pairs are open; it writes no seatable Elo. Its groups are in
  // the cache it brings home, so a run of the same arguments goes on from them.
  if (remote !== null) {
    const walk = walkLadder(ladder, (spec) => remote.store.get(spec), false);
    if (walk.specs.length > 0) {
      cacheWalk(cache, ladder, walk);
      show(walk, true);
      console.log(formatUnfinished(walk, args.labels, anchor));
      const e = new Error(`the run's rounds ended with ${walk.matchups.filter((m) => !m.done).length.toString()} matchups open: no ratings were written`);
      await live.fail(e);
      throw e;
    }
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

const argv = process.argv.slice(2);
const tool = ["--stale", "--carry", "--provisional"].some((flag) => argv.includes(flag));
(tool ? Promise.resolve().then(() => seatingTool(argv)) : main()).catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
