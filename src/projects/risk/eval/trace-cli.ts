import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import type { Move, Seat } from "../contract";
import { riskBot } from "../bots";
import type { Bot } from "../bots/bot";
import { checkBots, DEFAULT_MAX_TURNS, list, number } from "./cli-args";
import { riskPool } from "./parallel";
import { playGame, type RiskGameSpec } from "./runner";
import { Trace, traceLines } from "./trace";

/** `npm run risk:trace` — why a game runs long: its trajectory, turn by turn.
 *
 *  Trace one game (each window of player-turns: attacks, captures, trades, losses, the armies on
 *  the board and the biggest stack, and every seat's standing):
 *    npm run risk:trace -- --seats rule-v6,rule-v6,rule-v6,rule-v6,rule-v6,rule-v6 --seed stall-3
 *
 *  Trace an online game from its move log, exported as {seed, players, labels, moves: [{seat, move}]}:
 *    npm run risk:trace -- --online game.json
 *
 *  Survey a seating's game lengths, a seed per game and the seating rotated a seat each game, and list
 *  the capped games with the line that traces each:
 *    npm run risk:trace -- --survey --seats rule-v6,rule-v6,rule-v6,rule-v6,rule-v6,rule-v6 --games 60
 *
 *  `--mirror <label> <players>` seats one bot in every seat, for a tuned label, whose commas
 *  --seats would split:
 *    npm run risk:trace -- --survey --mirror 'rule-v6~{"vulnerabilityWeight":0.5}' 6
 */

interface Args {
  seats?: string[];
  seed?: string;
  online?: string;
  survey: boolean;
  games: number;
  prefix: string;
  maxTurns: number;
  window: number;
  detail: boolean;
  workers?: number;
  out?: string;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = { survey: false, games: 30, prefix: "trace", maxTurns: DEFAULT_MAX_TURNS, window: 50, detail: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seats") a.seats = list(argv[++i], arg);
    else if (arg === "--mirror") {
      // One bot in every seat: a tuned label carries commas, which --seats would split.
      const label = argv[++i];
      const players = number(argv[++i], arg);
      a.seats = Array.from({ length: players }, () => label);
    } else if (arg === "--seed") a.seed = argv[++i];
    else if (arg === "--online") a.online = argv[++i];
    else if (arg === "--survey") a.survey = true;
    else if (arg === "--games") a.games = number(argv[++i], arg);
    else if (arg === "--prefix") a.prefix = argv[++i];
    else if (arg === "--turns") a.maxTurns = number(argv[++i], arg);
    else if (arg === "--window") a.window = number(argv[++i], arg);
    else if (arg === "--detail") a.detail = true;
    else if (arg === "--workers") a.workers = number(argv[++i], arg);
    else if (arg === "--out") a.out = argv[++i];
    else throw new Error(`unknown argument "${arg}"`);
  }
  return a;
}

function emit(args: Args, lines: string[]): void {
  const text = lines.join("\n");
  if (args.out) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the file named on the command line by whoever runs the trace
    writeFileSync(args.out, `${text}\n`);
    console.log(`wrote ${lines.length.toString()} lines to ${args.out}`);
  } else console.log(text);
}

function traceOne(args: Args, seats: string[], seed: string): void {
  checkBots(seats);
  const trace = new Trace();
  playGame({ seed, bots: seats.map((l) => riskBot(l)), maxTurns: args.maxTurns, observe: trace });
  emit(args, traceLines(trace, seats, args.window, args.detail));
}

interface OnlineLog {
  seed: string;
  players: number;
  labels: string[];
  moves: { seat: Seat; move: Move }[];
}

function traceOnline(args: Args, path: string): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the log named on the command line
  const log = JSON.parse(readFileSync(path, "utf8")) as OnlineLog;
  let next = 0;
  const replay: Bot = (input) => {
    const logged = log.moves[next++] as OnlineLog["moves"][number] | undefined;
    if (!logged) throw new Error(`the log ends at decision ${(next - 1).toString()}, and the game goes on`);
    if (logged.seat !== input.seat) throw new Error(`seat ${input.seat.toString()} is to move at decision ${(next - 1).toString()}, and the log has seat ${logged.seat.toString()}`);
    return logged.move;
  };
  const trace = new Trace();
  // An online game has no cap: the log is played to its end.
  playGame({ seed: log.seed, bots: Array.from({ length: log.players }, () => replay), maxTurns: Number.MAX_SAFE_INTEGER, observe: trace });
  if (next !== log.moves.length) throw new Error(`the game ended at decision ${next.toString()}, and the log has ${log.moves.length.toString()}`);
  emit(args, traceLines(trace, log.labels, args.window, args.detail));
}

async function survey(args: Args, seats: string[]): Promise<void> {
  checkBots(seats);
  const n = seats.length;
  const specs: RiskGameSpec[] = Array.from({ length: args.games }, (_, index) => ({
    index,
    seed: `${args.prefix}-${(index + 1).toString()}`,
    labels: seats.map((_, s) => seats[(s + index) % n]),
    maxTurns: args.maxTurns,
  }));
  const pool = riskPool(args.workers);
  try {
    const results = await pool.run(specs);
    const errors = results.filter((r) => r.error !== undefined);
    const played = results.filter((r) => r.error === undefined);
    const capped = played.filter((r) => r.winner === null);
    const turns = played.map((r) => r.turns).sort((a, b) => a - b);
    const decided = played.filter((r) => r.winner !== null).map((r) => r.turns);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const q = (p: number) => turns[Math.min(turns.length - 1, Math.floor(p * turns.length))];
    const wins = new Map<string, number>();
    for (const r of played) if (r.winner !== null) wins.set(r.labels[r.winner], (wins.get(r.labels[r.winner]) ?? 0) + 1);
    const lines = [
      `Seating ${seats.join(",")} rotated, ${played.length.toString()} games, cap ${args.maxTurns.toString()} player-turns${errors.length > 0 ? `, ${errors.length.toString()} ERRORS` : ""}`,
      `  capped ${capped.length.toString()} (${((100 * capped.length) / Math.max(1, played.length)).toFixed(1)}%), decided games' mean ${mean(decided).toFixed(0)} turns`,
      `  turns: mean ${mean(turns).toFixed(0)}, quartiles ${q(0.25).toString()} / ${q(0.5).toString()} / ${q(0.75).toString()}, 90th ${q(0.9).toString()}`,
      `  wins: ${[...wins].map(([l, w]) => `${l} ${w.toString()}`).join(", ")}`,
      ...capped.map((r) => {
        const alive = r.places.filter((p) => p === 1).length;
        const seating = r.labels.every((l) => l === r.labels[0]) ? `--mirror '${r.labels[0]}' ${n.toString()}` : `--seats ${r.labels.join(",")}`;
        return `  capped ${r.seed} with ${alive.toString()} alive → npm run risk:trace -- ${seating} --seed ${r.seed}`;
      }),
      ...errors.map((r) => `  ERROR ${r.seed} ${r.labels.join(",")}: ${r.error ?? ""}`),
    ];
    emit(args, lines);
  } finally {
    await pool.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.online !== undefined) traceOnline(args, args.online);
  else if (args.survey && args.seats) await survey(args, args.seats);
  else if (args.seats && args.seed !== undefined) traceOne(args, args.seats, args.seed);
  else throw new Error("name --seats and --seed to trace a game, --online <log.json> for an online game, or --survey --seats to survey a seating");
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
