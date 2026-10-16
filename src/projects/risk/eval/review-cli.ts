import { writeFileSync } from "node:fs";
import process from "node:process";
import { riskBot } from "../bots";
import { checkBots, list, number } from "./cli-args";
import { outcomeFor, riskPool, tableSpecs } from "./parallel";
import { Review } from "./review";
import { playGame } from "./runner";

/** `npm run risk:review` — read how bots play.
 *
 *  Replay one game as a record (each turn's standings, every move, and a rule bot's plans
 *  with their odds and scores):
 *    npm run risk:review -- --seats rule-v1,gd-stacker,gd-stacker,gd-stacker --seed train-3 --out game.txt
 *
 *  List the games a bot lost alone among copies of another, each with the line that replays it:
 *    npm run risk:review -- --find rule-v1 --among gd-continental --players 6 --groups 20
 *
 *  A game is a pure function of its seed and seating, so the same arguments replay the same
 *  game the gauntlet or the ratings played. */

interface Args {
  seats?: string[];
  seed?: string;
  out?: string;
  find?: string;
  among?: string;
  players: number;
  groups: number;
  prefix: string;
  maxTurns: number;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = { players: 4, groups: 10, prefix: "review", maxTurns: 600 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seats") a.seats = list(argv[++i], arg);
    else if (arg === "--seed") a.seed = argv[++i];
    else if (arg === "--out") a.out = argv[++i];
    else if (arg === "--find") a.find = argv[++i];
    else if (arg === "--among") a.among = argv[++i];
    else if (arg === "--players") a.players = number(argv[++i], arg);
    else if (arg === "--groups") a.groups = number(argv[++i], arg);
    else if (arg === "--prefix") a.prefix = argv[++i];
    else if (arg === "--turns") a.maxTurns = number(argv[++i], arg);
    else throw new Error(`unknown argument "${arg}"`);
  }
  return a;
}

async function find(args: Args, lone: string, rest: string): Promise<void> {
  checkBots([lone, rest]);
  const pool = riskPool();
  try {
    const results = await pool.run(tableSpecs(lone, rest, "one-in", args.players, args.prefix, 0, args.groups * args.players, args.maxTurns));
    const lost = results.filter((r) => outcomeFor(r, lone) === "loss");
    const won = results.filter((r) => outcomeFor(r, lone) === "win").length;
    console.log(`\n${lone} alone among ${rest} at ${args.players.toString()} players: won ${won.toString()} of ${results.length.toString()}; the games it lost:\n`);
    for (const r of lost) {
      const seat = r.labels.indexOf(lone);
      console.log(
        `  ${r.seed} seat ${seat.toString()}: winner seat ${String(r.winner)}, ${r.turns.toString()} turns, ${lone} placed ${r.places[seat].toString()}` +
          `   → npm run risk:review -- --seats ${r.labels.join(",")} --seed ${r.seed}`,
      );
    }
  } finally {
    await pool.close();
  }
}

function replay(args: Args, seats: string[], seed: string): void {
  checkBots(seats);
  const review = new Review(seats);
  playGame({ seed, bots: seats.map((l) => riskBot(l)), maxTurns: args.maxTurns, observe: review });
  const text = review.lines.join("\n");
  if (args.out) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the file named on the command line by whoever runs the review
    writeFileSync(args.out, `${text}\n`);
    console.log(`wrote ${review.lines.length.toString()} lines to ${args.out}`);
  } else console.log(text);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.find !== undefined) {
    if (args.among === undefined) throw new Error("--find needs --among <bot>");
    await find(args, args.find, args.among);
  } else if (args.seats && args.seed !== undefined) replay(args, args.seats, args.seed);
  else throw new Error("name --seats and --seed to replay a game, or --find <bot> --among <bot> to list its losses");
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
