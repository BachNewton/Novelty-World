import { writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { fitElo } from "@/shared/lib/bot-lab/elo";
import { wilsonInterval } from "@/shared/lib/bot-lab/stats";
import { RISK_BOTS } from "../bots";
import { SEAT_BOTS } from "../online/seat-bots";
import { formatRunRecord } from "@/shared/lib/bot-lab/run-log";
import { checkBots, commonDefaults, commonFlag, number, riskRun, type CommonArgs } from "./cli-args";
import { eloLine } from "./gauntlet";
import { riskPool } from "./parallel";
import { playLadder } from "./ratings";
import { fileLadderCache } from "./ratings-cache";

/** `npm run risk:ratings` — a ladder of Risk bots: every pair plays a fixed number
 *  of seed groups at each table size, each bot alone among copies of the other,
 *  and one Bradley–Terry fit over the winners gives the win Elo (the ladder), with
 *  the finishing-order Elo beside it. It measures; the gauntlet decides (see the
 *  project's CLAUDE.md, "Measuring bots").
 *
 *  Usage:
 *    npm run risk:ratings -- greedy random                 # name the bots (random only when named)
 *    npm run risk:ratings -- greedy random --players 6 --groups 100 --anchor random
 *    npm run risk:ratings -- --seatable --groups 100      # every seatable bot that can win; writes bots/ratings.json
 *    npm run risk:ratings -- --seatable --groups 100 --fresh   # play every matchup again, not from the cache
 *
 *  Each matchup's games are kept in `ratings-cache.json` while the code they ran on is
 *  unchanged (`ratings-cache.ts`), so a run plays only the matchups it hasn't seen. */

/** The seatable bots' measured Elo, which the lobby ranks them by (`online/seat-bots.ts`). */
const SEAT_RATINGS = fileURLToPath(new URL("../bots/ratings.json", import.meta.url));
/** The seatable ladder's anchor and the Elo it is shown at. */
const SEAT_ANCHOR = "greedy";
const SEAT_ANCHOR_ELO = 1000;

interface Args extends CommonArgs {
  labels: string[];
  groups: number;
  anchor?: string;
  seatable: boolean;
  fresh: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = { ...commonDefaults("ratings"), labels: [], groups: 50, seatable: false, fresh: false };
  for (let i = 0; i < argv.length; i++) {
    const used = commonFlag(a, argv, i);
    if (used > 0) {
      i += used - 1;
      continue;
    }
    if (argv[i] === "--groups") a.groups = number(argv[++i], "--groups");
    else if (argv[i] === "--anchor") a.anchor = argv[++i];
    else if (argv[i] === "--seatable") a.seatable = true;
    else if (argv[i] === "--fresh") a.fresh = true;
    else if (argv[i].startsWith("--")) throw new Error(`unknown flag "${argv[i]}"`);
    else a.labels.push(argv[i]);
  }
  if (a.seatable) {
    if (a.labels.length > 0 || a.anchor !== undefined) throw new Error("--seatable rates every seatable bot against greedy: name no bots and no anchor");
    // Random never wins, so it has no Elo and isn't rated.
    a.labels = Object.keys(SEAT_BOTS).filter((l) => l !== "random");
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
  console.log(
    `\nRisk — ratings\n` +
      `Bots: [${args.labels.join(", ")}]   Tables: ${args.players.join(", ")} players, each bot alone among the other\n` +
      `${args.groups} seed groups per table   Seeds: "${args.prefix}:*"   Workers: ${args.workers}   Max turns: ${args.maxTurns}\n`,
  );
  const live = riskRun({
    tool: "risk:ratings",
    bots: args.labels,
    tables: args.players.map((n) => `${n.toString()}p one-in`),
    seeds: args.prefix,
    workers: args.workers,
  });
  const playerGames = args.players.reduce((s, n) => s + n, 0);
  const totalGames = args.labels.length * (args.labels.length - 1) * args.groups * playerGames;
  let cachedGames = 0;
  live.setProgress(() => (totalGames === cachedGames ? 1 : live.counts().games / (totalGames - cachedGames)));
  const cache = fileLadderCache();
  const pool = live.watch(riskPool(args.workers), (r) => r.decisions);
  try {
    const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
    const { winPairs, finishPairs, errors, cached } = await playLadder({
      pool,
      labels: args.labels,
      players: args.players,
      groups: args.groups,
      prefix: args.prefix,
      maxTurns: args.maxTurns,
      // Read from the cache's records but, when fresh, written to it all the same.
      cache: args.fresh ? { get: () => null, set: cache.set } : cache,
      // The matchups play at once, so each line is printed as its matchup finishes.
      onMatchup: (step, { lone, rest, players: n }, tally, fromCache) => {
        const matchup = { table: `${n.toString()}p`, pairing: { bot: lone, against: rest, seats: 1, players: n }, games: args.groups * n };
        const { wins, losses, draws } = tally ?? { wins: 0, losses: 0, draws: 0 };
        live.step(step, { ...matchup, record: { wins, losses, draws, par: 1 / n }, done: tally !== null });
        if (tally === null) return;
        if (fromCache) cachedGames += args.groups * n;
        const ci = wilsonInterval(wins, wins + losses);
        console.log(
          `  ${n}p  ${lone} alone among ${rest}: wins ${pct(ci.share)} [${pct(ci.low)}–${pct(ci.high)}] vs par ${pct(1 / n)}` +
            `   (${wins}–${losses}, ${draws} capped)${fromCache ? "  [cached]" : ""}`,
        );
      },
    });
    const matchups = winPairs.length;
    console.log(`
  Matchups: ${(matchups - cached).toString()} played, ${cached.toString()} from the cache`);
    const winElo = fitElo(args.labels, winPairs, { anchor });
    console.log(`
  Win Elo (${anchor} = 0):              ${eloLine(winElo)}`);
    console.log(`  Finishing-order Elo (${anchor} = 0):  ${eloLine(fitElo(args.labels, finishPairs, { anchor }))}`);
    if (args.seatable) {
      if (errors > 0) throw new Error("games threw: the seatable ratings were not written");
      const elo = Object.fromEntries(args.labels.map((l) => [l, Math.round((SEAT_ANCHOR_ELO + winElo[l]) * 10) / 10]));
      const measured =
        `risk:ratings -- --seatable --groups ${args.groups.toString()}, ${new Date().toISOString().slice(0, 10)}: ` +
        `${totalGames.toString()} games at ${args.players.join(", ")} players, each bot alone among each other`;
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
