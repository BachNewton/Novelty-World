import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HEARTBEAT_MS } from "./live-row";
import { LiveReporter, memorySink, THROTTLE_MS } from "./live";
import { inlineRunner } from "./pool";
import { RunLog } from "./run-log";

let dir: string;
// Every reporter a test starts, ended after it, so none is left to record itself on the process's exit.
let started: LiveReporter[] = [];
const step = (done: boolean) => ({ table: "4p", done });

function reporter() {
  const sink = memorySink();
  const log = new RunLog(path.join(dir, "runs.jsonl"), {
    tool: "test:run",
    args: ["a", "b"],
    bots: ["a", "b"],
    tables: ["4p"],
    seeds: "train",
    workers: 1,
  });
  const live = new LiveReporter(sink, log, "test");
  started.push(live);
  return { sink, live };
}

beforeEach(() => {
  // The clocks the reporter keeps; the inline runner's turns of the event loop stay real.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  dir = mkdtempSync(path.join(os.tmpdir(), "live-test-"));
});

afterEach(async () => {
  await Promise.all(started.map((live) => live.fail("the test is over")));
  started = [];
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

describe("LiveReporter", () => {
  it("writes its row as it starts", async () => {
    const { sink } = reporter();
    await vi.advanceTimersByTimeAsync(0);
    expect(sink.rows).toHaveLength(1);
    expect(sink.rows[0]).toMatchObject({ game: "test", tool: "test:run", status: "running", bots: ["a", "b"], seeds: "train" });
  });

  it("writes a change at once when it has been quiet, then at most once a throttle", async () => {
    const { sink, live } = reporter();
    await vi.advanceTimersByTimeAsync(THROTTLE_MS);
    live.step(0, step(false));
    await vi.advanceTimersByTimeAsync(0);
    expect(sink.rows).toHaveLength(2);
    for (let i = 0; i < 10; i++) live.step(0, { ...step(false), games: i });
    await vi.advanceTimersByTimeAsync(THROTTLE_MS - 1);
    expect(sink.rows).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sink.rows).toHaveLength(3);
    expect(sink.rows[2].progress.steps).toEqual([{ ...step(false), games: 9 }]);
  });

  it("beats while nothing changes", async () => {
    const { sink } = reporter();
    await vi.advanceTimersByTimeAsync(3 * HEARTBEAT_MS);
    expect(sink.rows).toHaveLength(4);
  });

  it("counts the games it plays, reads its progress, and estimates its finish", async () => {
    const { sink, live } = reporter();
    const runner = live.watch(inlineRunner((spec: { index: number }) => spec), () => 3);
    live.setProgress(() => live.counts().games / 8);
    await runner.run([{ index: 0 }, { index: 1 }]);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    const { progress } = sink.rows[sink.rows.length - 1];
    expect(progress).toMatchObject({ games: 2, decisions: 6, fraction: 0.25 });
    // A quarter done after one heartbeat: done after four.
    expect(Date.parse(progress.eta ?? "") - Date.parse(sink.rows[0].started_at)).toBe(4 * HEARTBEAT_MS);
  });

  it("ends with its result and record, and writes nothing after", async () => {
    const { sink, live } = reporter();
    live.step(0, step(true));
    const record = await live.finish({ errors: 0 });
    const last = sink.rows[sink.rows.length - 1];
    expect(last.status).toBe("done");
    expect(last.progress.fraction).toBe(1);
    expect(last.progress.eta).toBeNull();
    expect(last.result).toEqual({ errors: 0, record });
    const written = sink.rows.length;
    live.step(1, step(false));
    await vi.advanceTimersByTimeAsync(3 * HEARTBEAT_MS);
    expect(sink.rows).toHaveLength(written);
  });

  it("ends a run that threw as failed, with why", async () => {
    const { sink, live } = reporter();
    await live.fail(new Error("the engine threw"));
    const last = sink.rows[sink.rows.length - 1];
    expect(last.status).toBe("failed");
    expect(last.result?.error).toBe("the engine threw");
    expect(last.result?.record?.stopped).toBe(true);
  });

  it("keeps the run going when a write fails", async () => {
    const log = new RunLog(path.join(dir, "runs.jsonl"), { tool: "t", args: [], bots: [], tables: [], seeds: "s", workers: 1 });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let calls = 0;
    const live = new LiveReporter({ write: () => (++calls === 1 ? Promise.reject(new Error("offline")) : Promise.resolve()) }, log, "test");
    started.push(live);
    await live.finish({});
    expect(calls).toBe(2);
    expect(errors).toHaveBeenCalledTimes(2);
    errors.mockRestore();
  });
});
