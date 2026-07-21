import { cliArgv } from "../rl/tfjs-setup"; // shields process.argv from tfjs's nopt; read args from here
import process from "node:process";
import { MonoNet } from "../rl/net";
import { mctsBot } from "../rl/mcts";
import { simulateGame, type Contender } from "./simulate";
import { botFor } from "../registry";

// Quick strength probe for a trained checkpoint: play N games of the net vs a rule
// bot and report the net's win share. Uses the (now stall-guarded) simulateGame, so
// a weak net can't hang it. Heads-up (2 seats) is the most sensitive signal — the
// same shape train-cli's in-loop evaluate uses.
//   node …/tsx … bench-eval.ts <netDir> [games=20] [sims=32] [rule=claude-v2] [players=2]

async function main(): Promise<void> {
  const dir = cliArgv[0];
  const games = Number(cliArgv[1] ?? 20);
  const sims = Number(cliArgv[2] ?? 32);
  const rule = cliArgv[3] ?? "claude-v2";
  const players = Number(cliArgv[4] ?? 2);
  if (!dir) throw new Error("usage: bench-eval <netDir> [games] [sims] [rule] [players]");

  const net = await MonoNet.load(dir);
  const bot = mctsBot(net, { simulations: sims });
  const ruleBot = botFor(rule);

  let wins = 0;
  let decisive = 0;
  let draws = 0;
  let totalTurns = 0;
  for (let g = 0; g < games; g++) {
    const seats: Contender[] = [{ label: "rl", bot }];
    for (let s = 1; s < players; s++) seats.push({ label: rule, bot: ruleBot });
    const r = simulateGame({ seed: `eval-${g.toString()}`, seats, maxTurns: 700 });
    totalTurns += r.turns;
    const rlId = r.standings.find((s) => s.label === "rl")?.id ?? null;
    if (r.winnerId === null) draws++;
    else {
      decisive++;
      if (r.winnerId === rlId) wins++;
    }
    process.stdout.write(`  game ${(g + 1).toString()}/${games.toString()}: ${r.winnerId === rlId ? "RL WIN" : r.winnerId === null ? "draw" : rule + " win"} (${r.turns.toString()}t)\n`);
  }
  const share = decisive > 0 ? (100 * wins) / decisive : 0;
  console.log(
    `\nrl-net vs ${rule} (${players.toString()}p, ${sims.toString()} sims): ` +
      `${wins.toString()}/${decisive.toString()} decisive = ${share.toFixed(1)}% ` +
      `(${draws.toString()} draws, avg ${Math.round(totalTurns / games).toString()} turns)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
