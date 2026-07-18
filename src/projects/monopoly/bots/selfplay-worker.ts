import "./tfjs-setup"; // MUST be first: places the Windows tfjs DLL before tfjs loads.
import { parentPort } from "node:worker_threads";
import type { PlayerCount } from "../types";
import { MonoNet, type TrainSample } from "./net";
import { playSelfPlayGame } from "./selfplay";

// ---------------------------------------------------------------------------
// Worker side of the PARALLEL self-play generator (`selfplay-parallel.ts`). It is
// the throughput lever RL-DESIGN.md §8 names first: self-play games are pure and
// independent, so a pool of workers plays them concurrently across cores instead of
// the trainer's sequential `for g in games` loop.
//
// Each task RELOADS the net from `netDir` — the weights change every training
// iteration, so a long-lived worker must re-read them (then DISPOSE the old model
// to avoid a tfjs tensor leak). Loading is tens of ms; a game is seconds, so the
// reload is negligible. Holds no other state — games are deterministic in (net,
// seed), so worker assignment can never change a result.
// ---------------------------------------------------------------------------

if (!parentPort) {
  throw new Error("selfplay-worker.ts must run as a worker thread (no parentPort)");
}
const port = parentPort;

export interface SelfPlayTask {
  /** Checkpoint dir to load the current net from, or null for a fresh net. */
  netDir: string | null;
  /** One self-play game per seed. */
  seeds: string[];
  players: PlayerCount;
  maxTurns: number;
  sims: number;
}

port.on("message", (task: SelfPlayTask) => {
  void (async () => {
    try {
      const net = task.netDir === null ? MonoNet.create() : await MonoNet.load(task.netDir);
      const samples: TrainSample[] = [];
      for (const seed of task.seeds) {
        samples.push(
          ...playSelfPlayGame(net, seed, {
            players: task.players,
            maxTurns: task.maxTurns,
            mcts: { simulations: task.sims },
          }),
        );
      }
      net.dispose();
      port.postMessage({ samples });
    } catch (e) {
      port.postMessage({ samples: [], error: (e as Error).message });
    }
  })();
});
