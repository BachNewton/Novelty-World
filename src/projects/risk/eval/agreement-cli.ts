import process from "node:process";
import { riskBot } from "../bots";
import { Agreement, agreementLines } from "./agreement";
import { checkBots, DEFAULT_MAX_TURNS, list, number } from "./cli-args";
import { readOnlineLog, replayOnline } from "./online-log";
import { playGame, type Observer } from "./runner";

/** `npm run risk:agreement` — how often candidate bots decide as a base bot does, by decision kind
 *  (placement, trade, attack, move-in, fortify), over the same positions.
 *
 *  Positions from online games' exported move logs (every seat's decisions, people's included),
 *  `risk:trace -- --online`'s format:
 *    npm run risk:agreement -- --online G4FR.json,9VFL.json,YUY4.json
 *
 *  Positions from the base's own games, the base in every seat, a seed per game (single-threaded:
 *  a 6-player v6 game takes a while):
 *    npm run risk:agreement -- --games 10 --players 5,6 --prefix agree
 *
 *  Only some seats' decisions, an online game's bot seats say (a searching bot takes seconds a
 *  decision):
 *    npm run risk:agreement -- --online CZ7U.json --seats 2,3,4 --base rule-v7.1 --candidate rule-v6.1
 *
 *  The base is rule-v6 and the candidates rule-v6.1 in each border mode unless named:
 *    npm run risk:agreement -- --online a.json --base rule-v6 --candidate 'rule-v6.1~{"border":"mean"}'
 */

interface Args {
  base: string;
  candidates: string[];
  online: string[];
  /** The seats whose decisions are asked; every seat when empty. */
  seats: number[];
  games: number;
  players: number[];
  prefix: string;
  maxTurns: number;
}

const DEFAULT_CANDIDATES = ["sum", "max", "mean"].map((mode) => `rule-v6.1~{"border":"${mode}"}`);

function parseArgs(argv: readonly string[]): Args {
  const a: Args = { base: "rule-v6", candidates: [], online: [], seats: [], games: 0, players: [5, 6], prefix: "agree", maxTurns: DEFAULT_MAX_TURNS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base") a.base = argv[++i];
    // One flag per candidate: a tuned label carries commas.
    else if (arg === "--candidate") a.candidates.push(argv[++i]);
    else if (arg === "--online") a.online = list(argv[++i], arg);
    else if (arg === "--seats") a.seats = list(argv[++i], arg).map((s) => number(s, arg));
    else if (arg === "--games") a.games = number(argv[++i], arg);
    else if (arg === "--players") a.players = list(argv[++i], arg).map((p) => number(p, arg));
    else if (arg === "--prefix") a.prefix = argv[++i];
    else if (arg === "--turns") a.maxTurns = number(argv[++i], arg);
    else throw new Error(`unknown argument "${arg}"`);
  }
  if (a.candidates.length === 0) a.candidates = DEFAULT_CANDIDATES;
  return a;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.seats.length > 0 && args.online.length === 0) throw new Error("--seats picks an online game's seats: name --online <logs>");
  if (args.online.length === 0 && args.games === 0) throw new Error("name --online <logs> or --games <n> for the positions");
  checkBots([args.base, ...args.candidates]);
  const base = riskBot(args.base);
  const candidates = new Map(args.candidates.map((l) => [l, riskBot(l)]));

  if (args.online.length > 0) {
    const agreement = new Agreement(base, candidates);
    const observe: Observer = args.seats.length === 0 ? agreement : {
            decided: (input, move) => {
              if (args.seats.includes(input.seat)) agreement.decided(input, move);
            },
          };
    for (const path of args.online) replayOnline(readOnlineLog(path), observe);
    console.log(`Online games: ${args.online.join(", ")}${args.seats.length === 0 ? "" : `, seats ${args.seats.join(", ")}`}`);
    console.log(agreementLines(args.base, agreement).join("\n"));
  }
  for (const players of args.players) {
    if (args.games === 0) break;
    const agreement = new Agreement(base, candidates, true);
    for (let g = 1; g <= args.games; g++) {
      playGame({ seed: `${args.prefix}-${players.toString()}p-${g.toString()}`, bots: Array.from({ length: players }, () => base), maxTurns: args.maxTurns, observe: agreement });
    }
    console.log(`\n${args.games.toString()} games of ${args.base} in all ${players.toString()} seats, seeds "${args.prefix}-${players.toString()}p-*"`);
    console.log(agreementLines(args.base, agreement).join("\n"));
  }
}

try {
  main();
} catch (e: unknown) {
  console.error((e as Error).message);
  process.exit(1);
}
