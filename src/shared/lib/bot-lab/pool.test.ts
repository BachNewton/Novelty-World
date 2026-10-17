import { afterEach, describe, expect, it } from "vitest";
import { WorkerPool } from "./pool";

// The pool on real worker threads, running a stand-in game: a worker module inlined
// as a data URL, so the test needs no TypeScript loader in its workers. A spec's
// `spin` sets how long its "game" runs, and `boom` makes the worker throw.

interface Spec {
  index: number;
  tag: string;
  spin: number;
  boom?: true;
}

interface Result {
  index: number;
  tag: string;
}

const WORKER = `
import { parentPort } from "node:worker_threads";
parentPort.on("message", ({ specs }) => {
  const results = specs.map((spec) => {
    if (spec.boom) throw new Error("the game threw");
    let x = 0;
    for (let i = 0; i < spec.spin; i++) x += i % 7;
    return { index: spec.index, tag: spec.tag + (x < 0 ? "?" : "") };
  });
  parentPort.postMessage({ results });
});
`;

const specs = (tag: string, count: number, spin: (i: number) => number): Spec[] =>
  Array.from({ length: count }, (_, index) => ({ index, tag, spin: spin(index) }));

let pool: WorkerPool<Spec, Result> | null = null;
const open = (size: number) => {
  pool = new WorkerPool<Spec, Result>(new URL(`data:text/javascript,${encodeURIComponent(WORKER)}`), size);
  return pool;
};

afterEach(async () => {
  await pool?.close();
  pool = null;
});

describe("WorkerPool", () => {
  it("gives every call in flight its own results, sorted by index", async () => {
    const p = open(3);
    // The same indices in every call, games of uneven length, and an empty call among them.
    const [a, b, none, c] = await Promise.all([
      p.run(specs("a", 50, (i) => (i % 5) * 20_000)),
      p.run(specs("b", 7, (i) => (7 - i) * 50_000)),
      p.run([]),
      p.run(specs("c", 1, () => 0)),
    ]);
    expect(a).toEqual(specs("a", 50, () => 0).map(({ index, tag }) => ({ index, tag })));
    expect(b).toEqual(specs("b", 7, () => 0).map(({ index, tag }) => ({ index, tag })));
    expect(none).toEqual([]);
    expect(c).toEqual([{ index: 0, tag: "c" }]);
    // And it is still ready for more once they are all done.
    expect(await p.run(specs("d", 4, () => 0))).toHaveLength(4);
  });

  it("fails every call in flight, and every later one, when a game throws", async () => {
    // One worker takes the chunks in the order they were queued, so the throw comes
    // while the second call's games are all still waiting.
    const p = open(1);
    const bad = specs("bad", 4, () => 0);
    bad[2] = { ...bad[2], boom: true };
    const runs = [p.run(bad), p.run(specs("waiting", 4, () => 0))];
    for (const r of await Promise.allSettled(runs)) expect(r.status).toBe("rejected");
    await expect(p.run(specs("after", 2, () => 0))).rejects.toThrow("the game threw");
  });
});
