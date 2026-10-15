import { parentPort } from "node:worker_threads";
import type { Indexed } from "./pool";

/** The worker side of `WorkerPool`: a game's worker module calls this with its
 *  pure runner, which then plays every batch of specs the pool sends and posts
 *  back the results. The worker holds no state between batches — every game is
 *  independent and deterministic — so worker assignment can never change an
 *  outcome. */
export function serveGames<Spec extends Indexed, Result extends Indexed>(
  runOne: (spec: Spec) => Result,
): void {
  if (!parentPort) {
    throw new Error("a game worker must run as a worker thread (no parentPort)");
  }
  const port = parentPort;
  port.on("message", (msg: { specs: Spec[] }) => {
    port.postMessage({ results: msg.specs.map(runOne) });
  });
}
