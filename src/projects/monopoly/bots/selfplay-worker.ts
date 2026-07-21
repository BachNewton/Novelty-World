import "./tfjs-setup"; // MUST be first: places the Windows tfjs DLL before tfjs loads.
import { parentPort } from "node:worker_threads";
import type { PlayerCount } from "../types";
import { MonoNet, type TrainSample } from "./net";
import { playSelfPlayGame } from "./selfplay";
import { mctsBot } from "./mcts";
import { simulateGame } from "./simulate";
import { botFor } from "./registry"; // safe after tfjs-setup: registry pulls no tfjs.

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
//
// TASK TYPES: the worker now handles TWO task kinds — `selfplay` (MCTS vs MCTS,
// for training data generation) and `eval` (net vs a rule bot, for strength
// measurement). Both are pure functions of (net checkpoint, seed), so the same
// determinism guarantees apply.
// ---------------------------------------------------------------------------

if (!parentPort) {
  throw new Error("selfplay-worker.ts must run as a worker thread (no parentPort)");
}
const port = parentPort;

/** Self-play task: play MCTS-vs-MCTS games and return labelled training samples. */
export interface SelfPlayTask {
  kind: "selfplay";
  /** Checkpoint dir to load the current net from, or null for a fresh net. */
  netDir: string | null;
  /** One self-play game per seed. */
  seeds: string[];
  players: PlayerCount;
  maxTurns: number;
  sims: number;
}

/** Eval task: play net-vs-rule games and return per-game outcomes (win/loss/draw).
 *  Used by the training loop's SPRT-based strength gauge (RL-DESIGN.md §8 #1a/#2). */
export interface EvalTask {
  kind: "eval";
  /** Checkpoint dir to load the net from. Never null for eval (always a real net). */
  netDir: string;
  /** Rule bot label (registry name, e.g. "jane-v20"). Ignored when oppNetDir is set. */
  rule: string;
  /** When set, the opponent is another MCTS net loaded from this dir (self-play eval). */
  oppNetDir?: string;
  /** Label for the opponent seat (defaults to `rule`). */
  oppLabel?: string;
  /** Label for the net's seat — the winner is reported by this label. */
  rlLabel: string;
  seeds: string[];
  players: PlayerCount;
  maxTurns: number;
  sims: number;
}

/** Union of all task types the worker accepts. */
export type WorkerTask = SelfPlayTask | EvalTask;

/** One eval game outcome. `rlWon` is null for draws / caps (no decisive result). */
export interface EvalGameResult {
  seed: string;
  rlWon: boolean | null;
}

port.on("message", (task: WorkerTask) => {
  void (async () => {
    try {
      if (task.kind === "eval") {
        const results = await runEvalTask(task);
        port.postMessage({ results });
      } else {
        const samples = await runSelfPlayTask(task);
        port.postMessage({ samples });
      }
    } catch (e) {
      port.postMessage({
        samples: [],
        results: [],
        error: (e as Error).message,
      });
    }
  })();
});

async function runSelfPlayTask(task: SelfPlayTask): Promise<TrainSample[]> {
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
  return samples;
}

/** Play net-vs-rule games for the eval gauge. The net occupies HALF the seats
 *  (labelled `rlLabel`), the rule bot occupies the other half (labelled `rule`).
 *  This mirrors how the gauntlet fields a Contender — same opponent mix, same
 *  win-share tallying — just inside the worker pool instead of on the main thread. */
async function runEvalTask(task: EvalTask): Promise<EvalGameResult[]> {
  const net = await MonoNet.load(task.netDir);
  const bot = mctsBot(net, { simulations: task.sims });
  let oppNet: MonoNet | null = null;
  let opponent: ReturnType<typeof botFor> | ReturnType<typeof mctsBot>;
  const oppLabel = task.oppLabel ?? task.rule;
  if (task.oppNetDir) {
    oppNet = await MonoNet.load(task.oppNetDir);
    opponent = mctsBot(oppNet, { simulations: task.sims });
  } else {
    opponent = botFor(task.rule);
  }
  const results: EvalGameResult[] = [];
  for (const seed of task.seeds) {
    const result = simulateGame({
      seed,
      seats: [
        { label: task.rlLabel, bot },
        { label: oppLabel, bot: opponent },
      ],
      maxTurns: task.maxTurns,
    });
    const rlId = result.standings.find((s) => s.label === task.rlLabel)?.id ?? null;
    let rlWon: boolean | null;
    if (result.winnerId !== null && result.winnerId === rlId) {
      rlWon = true;
    } else if (result.winnerId !== null) {
      rlWon = false;
    } else {
      rlWon = null; // draw / cap — no decisive result
    }
    results.push({ seed, rlWon });
  }
  net.dispose();
  if (oppNet) oppNet.dispose();
  return results;
}
