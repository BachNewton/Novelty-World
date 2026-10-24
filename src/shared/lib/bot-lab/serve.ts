import { parentPort } from "node:worker_threads";
import type { Indexed } from "./pool";

/** The worker side of `WorkerPool`: a game's worker module calls this with its
 *  pure runner, which then plays every batch of specs the pool sends and posts
 *  back the results. The worker holds no state between batches — every game is
 *  independent and deterministic — so worker assignment can never change an
 *  outcome. A runner may answer later (a game whose bots answer from another
 *  process): a batch's games then play one after another, each awaited. */
export function serveGames<Spec extends Indexed, Result extends Indexed>(
  runOne: (spec: Spec) => Result | Promise<Result>,
): void {
  if (!parentPort) {
    throw new Error("a game worker must run as a worker thread (no parentPort)");
  }
  const port = parentPort;
  const play = async (specs: readonly Spec[]) => {
    const results: Result[] = [];
    for (const spec of specs) results.push(await runOne(spec));
    port.postMessage({ results });
  };
  // A runner that rejects leaves the rejection unhandled, which ends the worker with
  // its error: the pool's `error` event, which fails every call in flight.
  port.on("message", (msg: { specs: Spec[] }) => void play(msg.specs));
}
