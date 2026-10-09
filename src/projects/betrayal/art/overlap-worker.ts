import { parentPort } from "node:worker_threads";
import { stubCanvas } from "./headless";
import { checkRoom, type OverlapReport } from "./overlap";
import { BENCH_ROOMS } from "./rooms";

/*
 * The overlap check of one room at a time, in a worker thread, so a room
 * whose build never ends (an endless loop) can be stopped from outside and
 * fail on its own, rather than hang the test for every room. The test runs
 * it (see `overlap.test.ts`).
 */

export type CheckReply = { id: string; report: OverlapReport } | { id: string; error: string };

const port = parentPort;
if (!port) throw new Error("The overlap worker runs in a worker thread");
stubCanvas();
port.on("message", (id: string) => {
  try {
    const room = BENCH_ROOMS.find((candidate) => candidate.id === id);
    if (!room) throw new Error(`No bench room "${id}"`);
    port.postMessage({ id, report: checkRoom(room) } satisfies CheckReply);
  } catch (error) {
    port.postMessage({ id, error: error instanceof Error ? (error.stack ?? error.message) : String(error) } satisfies CheckReply);
  }
});
port.postMessage("ready");
