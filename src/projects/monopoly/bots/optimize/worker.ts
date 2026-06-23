import { parentPort } from "node:worker_threads";
import { simulateGame, type Contender } from "../simulate";
import { versionBot } from "../versions";
import type { Bot } from "../decision";
import { makeParamBot } from "./bot";
import { unpackParams, type ParamVector } from "./params";
import {
  CANDIDATE,
  type OptBatchMessage,
  type OptGameResult,
  type OptGameSpec,
} from "./protocol";

// ---------------------------------------------------------------------------
// The worker side of the ES fitness evaluator. Unlike the ratings/gauntlet
// worker (which resolves every seat by registry LABEL), this one fields a
// PARAMETERIZED candidate bot built from a serialized vector — the bot the ES is
// optimizing is not (and must not be) in the registry. Panel-opponent seats still
// resolve by label through `versionBot`. Games are the same pure, deterministic
// `simulateGame`, so worker assignment never changes an outcome.
//
// The message protocol (CANDIDATE sentinel + spec/result shapes) lives in
// `protocol.ts` so the MAIN thread can import it without importing this module
// (which would trip the `parentPort` guard below).
// ---------------------------------------------------------------------------

function runBatch(vector: ParamVector, specs: readonly OptGameSpec[]): OptGameResult[] {
  const candidate: Bot = makeParamBot(vector);
  return specs.map((spec) => {
    try {
      const seats: Contender[] = spec.seats.map((s, i) =>
        s === CANDIDATE
          ? { label: `${CANDIDATE}-${i.toString()}`, bot: candidate }
          : { label: s, bot: versionBot(s) },
      );
      const r = simulateGame({ seed: spec.seed, seats, maxTurns: spec.maxTurns });
      const winnerLabel =
        r.winnerId === null
          ? null
          : (r.standings.find((st) => st.id === r.winnerId)?.label ?? null);
      const candidateWon = winnerLabel !== null && winnerLabel.startsWith(CANDIDATE);
      return {
        index: spec.index,
        candidateWon,
        panelWon: winnerLabel !== null && !candidateWon,
        terminated: r.terminated,
      };
    } catch (e) {
      return {
        index: spec.index,
        candidateWon: false,
        panelWon: false,
        terminated: false,
        error: (e as Error).message,
      };
    }
  });
}

if (!parentPort) {
  throw new Error("optimize/worker.ts must run as a worker thread (no parentPort)");
}
const port = parentPort;

port.on("message", (msg: OptBatchMessage) => {
  const results = runBatch(unpackParams(msg.vector), msg.specs);
  port.postMessage({ results });
});
