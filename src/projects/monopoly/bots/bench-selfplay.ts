// Throughput benchmark for the learned-bot self-play loop (RL-DESIGN.md §8 "next
// work" #1 — throughput is the gate). Times tfjs init, a single batched predict,
// and a short self-play game, so we know whether the cost is ONE-TIME init
// (amortized over a long run) or PER-MOVE (the real throughput ceiling). Run under
// Node 22: fnm exec --using=22 node node_modules/tsx/dist/cli.mjs <thisfile>
import process from "node:process";
import { FEATURE_COUNT } from "./features";
import { MonoNet } from "./net";
import { playSelfPlayGame } from "./selfplay";

function now(): number {
  return Number(process.hrtime.bigint()) / 1e6; // ms
}

async function main(): Promise<void> {
  const t0 = now();
  const net = MonoNet.create();
  const tInit = now() - t0;
  console.log(`fresh net (tfjs init + build): ${tInit.toFixed(0)} ms`);

  // Warm + time a single-example predict, then a batched one (the batch lever).
  const enc = new Float32Array(FEATURE_COUNT).fill(0.1);
  net.predict([enc]); // warm
  const t1 = now();
  for (let i = 0; i < 50; i++) net.predict([enc]);
  const perSingle = (now() - t1) / 50;
  const batch = Array.from({ length: 64 }, () => enc);
  const t2 = now();
  for (let i = 0; i < 10; i++) net.predict(batch);
  const perBatch64 = (now() - t2) / 10;
  console.log(`predict size-1: ${perSingle.toFixed(2)} ms/call`);
  console.log(
    `predict size-64: ${perBatch64.toFixed(2)} ms/call ` +
      `(${(perBatch64 / 64).toFixed(3)} ms/example — ${(perSingle / (perBatch64 / 64)).toFixed(1)}x batch win)`,
  );

  // One short self-play game at low sims to measure moves/sec end to end.
  const sims = Number(process.argv[2] ?? 20);
  const t3 = now();
  const samples = playSelfPlayGame(net, "bench-1", { players: 4, maxTurns: 80, mcts: { simulations: sims } });
  const gameMs = now() - t3;
  console.log(
    `self-play game (sims=${sims}, cap 80 turns): ${gameMs.toFixed(0)} ms, ` +
      `${samples.length} decisions → ${(gameMs / Math.max(1, samples.length)).toFixed(0)} ms/decision`,
  );
}

main()
  .then(() => process.exit(0)) // tfjs-node keeps the event loop alive; force-exit
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
