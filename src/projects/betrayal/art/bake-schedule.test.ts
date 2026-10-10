import { describe, expect, it } from "vitest";
import { bakeScene, type Gathered, type LightLayout, type Pass, type RoomLight, type Samples } from "./bake";
import { createBakeScheduler, type BakeJob, type BakeScheduler, type Lane, type PassPlan } from "./bake-schedule";

/** Work sent to a fake lane, held until the test lets it land. */
interface Call {
  lane: number;
  /** Its room, pass and step, as `room:pass:gather` or `room:pass:finish`. */
  label: string;
  samples: number;
  landed: boolean;
  land: () => Promise<unknown>;
}

/** A lane per worker that holds each piece of work until the test lands it. */
function fakeLanes(count: number) {
  const calls: Call[] = [];
  const hold = <T>(lane: number, label: string, samples: number, result: T): Promise<T> => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((yes) => {
      resolve = yes;
    });
    // Resolving and then awaiting the same promise runs the scheduler's handler, registered first, before the test goes on.
    const call: Call = {
      lane,
      label,
      samples,
      landed: false,
      land: () => {
        call.landed = true;
        resolve(result);
        return promise;
      },
    };
    calls.push(call);
    return promise;
  };
  const lanes: Lane[] = Array.from({ length: count }, (_, lane) => ({
    run: ({ pass, room, samples }) => {
      // A chunk's light is its samples' first coordinate, so joining can be checked.
      const n = samples.position.length / 3;
      const light = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) light[i * 3] = samples.position[i * 3];
      return hold<Gathered>(lane, `${room}:${pass}:gather`, n, { light, weights: new Float32Array(n * 5) });
    },
    // The finished light carries the joined light in its probes, so what is shown can be checked.
    finish: ({ pass, room, work }) =>
      hold<RoomLight>(lane, `${room}:${pass}:finish`, 0, { irradiance: new Uint16Array(0), flicker: new Uint8Array(0), probes: work.kind === "direct" ? work.light.light : work.coarse.light }),
    dispose: () => undefined,
  }));
  return { lanes, calls };
}

/** Lands what the lanes were sent and is still out, in the order sent, until nothing is left. */
async function drain(bakes: BakeScheduler, calls: Call[]): Promise<void> {
  await started();
  while (bakes.status().pending) {
    const out = calls.find(({ landed }) => !landed);
    if (!out) throw new Error("Work is pending, but none is out on a lane");
    await out.land();
  }
}

/** Lets the scheduler start what was submitted: it starts once the submitting code has run, so a task's submits are all in first. */
const started = () => Promise.resolve();

/** `count` samples, numbered by their first coordinate. */
function samples(count: number): Samples {
  const position = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) position[i * 3] = i;
  return { position, normal: new Float32Array(count * 3), within: new Float32Array(count * 6).fill(NaN) };
}

const scene = bakeScene([]);
const layout: LightLayout = { texels: { width: 0, height: 0, index: new Uint32Array(0), charts: new Uint32Array(0) }, probes: { all: [] } };

/** A pass of `count` samples that records what it shows into `shown`, as `room:pass:samples`. */
function plan(room: string, pass: Pass, count: number, shown: string[], { cost = 1, progress = pass === "bounce" } = {}): PassPlan {
  return {
    pass,
    samples: samples(count),
    cost,
    progress,
    finish: (light) => ({ kind: "direct", layout, light }),
    show: (light) => {
      shown.push(`${room}:${pass}:${light.probes.length / 3}`);
    },
  };
}

function job(room: string, passes: Pass[], count: number, shown: string[]): BakeJob {
  return { key: room, floor: "ground", room, scene, sceneId: 1, passes: passes.map((pass) => plan(room, pass, count, shown)) };
}

describe("the bake scheduler", () => {
  it("finishes what is in first, then runs earlier passes, then the room wanted most, then the oldest", async () => {
    const { lanes, calls } = fakeLanes(1);
    const bakes = createBakeScheduler(() => lanes);
    const shown: string[] = [];
    bakes.setPriority(({ room }) => (room === "wanted" ? 2 : room === "seen" ? 1 : 0));
    for (const room of ["far", "seen", "wanted"]) bakes.submit(job(room, ["direct", "bounce"], 100, shown));
    await drain(bakes, calls);
    // Everything submitted together is in before the first lane starts, so the wanted rooms come first within each pass.
    expect(calls.map(({ label }) => label)).toEqual([
      "wanted:direct:gather",
      "wanted:direct:finish",
      "seen:direct:gather",
      "seen:direct:finish",
      "far:direct:gather",
      "far:direct:finish",
      "wanted:bounce:gather",
      "wanted:bounce:finish",
      "seen:bounce:gather",
      "seen:bounce:finish",
      "far:bounce:gather",
      "far:bounce:finish",
    ]);
    expect(shown).toEqual(["wanted:direct:100", "seen:direct:100", "far:direct:100", "wanted:bounce:100", "seen:bounce:100", "far:bounce:100"]);
    expect(bakes.status().pending).toBe(false);
  });

  it("shows a job's passes in order, even when a later one is finished first", async () => {
    const { lanes, calls } = fakeLanes(2);
    const bakes = createBakeScheduler(() => lanes);
    const shown: string[] = [];
    const { passes, done } = bakes.submit(job("hall", ["direct", "bounce"], 100, shown));
    await started();
    expect(calls.map(({ label }) => label)).toEqual(["hall:direct:gather", "hall:bounce:gather"]);
    await calls[1].land();
    await calls[2].land();
    expect(calls[2].label).toBe("hall:bounce:finish");
    expect(shown).toEqual([]);
    await calls[0].land();
    await calls[3].land();
    await passes[0];
    await done;
    expect(shown).toEqual(["hall:direct:100", "hall:bounce:100"]);
  });

  it("joins a pass's chunks back in order before finishing it", async () => {
    const { lanes, calls } = fakeLanes(2);
    const bakes = createBakeScheduler(() => lanes);
    let joined: Float32Array | null = null;
    const { done } = bakes.submit({ ...job("hall", [], 0, []), passes: [{ ...plan("hall", "direct", 10_000, []), show: (light) => (joined = light.probes) }] });
    await started();
    // Three chunks of at least the least chunk, two lanes: the last waits for a lane, and they land out of order.
    expect(calls.map(({ samples: n }) => n)).toEqual([4096, 4096]);
    await calls[1].land();
    await calls[0].land();
    expect(calls[2].samples).toBe(1808);
    await drain(bakes, calls);
    await done;
    const light = joined as Float32Array | null;
    expect(light?.length).toBe(30_000);
    expect([light?.[0], light?.[4095 * 3], light?.[4096 * 3], light?.[8192 * 3], light?.[9999 * 3]]).toEqual([0, 4095, 4096, 8192, 9999]);
  });

  it("drops a room's stale work when a newer bake of it arrives, and follows the newer", async () => {
    const { lanes, calls } = fakeLanes(1);
    const bakes = createBakeScheduler(() => lanes);
    const shown: string[] = [];
    const old = bakes.submit(job("hall", ["direct", "bounce"], 100, shown));
    await started();
    const fresh = bakes.submit(job("hall", ["direct", "bounce"], 50, shown));
    let oldDone = false;
    void old.done.then(() => (oldDone = true));
    // The old direct chunk was already running: it lands, and is thrown away, never finished.
    await calls[0].land();
    expect(calls[1].label).toBe("hall:direct:gather");
    expect(calls[1].samples).toBe(50);
    await calls[1].land();
    await calls[2].land();
    expect(shown).toEqual(["hall:direct:50"]);
    expect(oldDone).toBe(false);
    await drain(bakes, calls);
    await fresh.done;
    await old.done;
    expect(shown).toEqual(["hall:direct:50", "hall:bounce:50"]);
    expect(calls.map(({ label }) => label)).toEqual(["hall:direct:gather", "hall:direct:gather", "hall:direct:finish", "hall:bounce:gather", "hall:bounce:finish"]);
  });

  it("drops a cancelled room's work, and settles its promises", async () => {
    const { lanes, calls } = fakeLanes(1);
    const bakes = createBakeScheduler(() => lanes);
    const shown: string[] = [];
    bakes.submit(job("hall", ["direct"], 100, shown));
    const gone = bakes.submit(job("cellar", ["direct", "bounce"], 100, shown));
    bakes.cancel("cellar");
    await gone.done;
    await drain(bakes, calls);
    expect(calls.map(({ label }) => label)).toEqual(["hall:direct:gather", "hall:direct:finish"]);
    expect(shown).toEqual(["hall:direct:100"]);
  });

  it("counts progress in work across every pass, and starts afresh after idle", async () => {
    const { lanes, calls } = fakeLanes(1);
    const bakes = createBakeScheduler(() => lanes);
    const seen: { done: number; total: number }[] = [];
    bakes.subscribe(() => {
      const { done, total } = bakes.status();
      seen.push({ done, total });
    });
    expect(bakes.status()).toMatchObject({ pending: false, since: null });
    bakes.submit(job("hall", ["direct", "bounce"], 100, []));
    await started();
    const { since } = bakes.status();
    expect(since).not.toBeNull();
    expect(bakes.status()).toMatchObject({ pending: true, passes: ["direct", "bounce"], done: 0, total: 200 });
    // A bake of another room adds its work; superseding it takes the old's unbaked work away.
    bakes.submit(job("cellar", ["direct", "bounce"], 300, []));
    expect(bakes.status().total).toBe(800);
    await started();
    await calls[0].land();
    expect(bakes.status()).toMatchObject({ done: 100, total: 800, since });
    bakes.submit(job("cellar", ["direct"], 40, []));
    expect(bakes.status()).toMatchObject({ done: 100, total: 240 });
    await drain(bakes, calls);
    expect(bakes.status()).toEqual({ pending: false, progress: false, passes: [], done: 0, total: 0, since: null });
    expect(seen.every(({ done, total }) => done <= total)).toBe(true);
    bakes.submit(job("hall", ["direct"], 10, []));
    expect(bakes.status()).toMatchObject({ done: 0, total: 10 });
  });

  it("weighs each pass's work by its cost, and cuts a costly pass finer", async () => {
    const { lanes, calls } = fakeLanes(1);
    const bakes = createBakeScheduler(() => lanes);
    bakes.submit({ ...job("hall", [], 0, []), passes: [plan("hall", "direct", 100, []), plan("hall", "bounce", 200, [], { cost: 32 })] });
    expect(bakes.status().total).toBe(100 + 200 * 32);
    await started();
    await calls[0].land();
    await calls[1].land();
    // 4096 samples' work a chunk at least: 128 bounce samples.
    expect(calls[2].samples).toBe(128);
    await calls[2].land();
    expect(bakes.status().done).toBe(100 + 128 * 32);
  });

  it("shows progress while work of a kind that shows it is in hand, and not otherwise", async () => {
    const { lanes, calls } = fakeLanes(1);
    const bakes = createBakeScheduler(() => lanes);
    bakes.submit(job("hall", ["direct"], 100, []));
    expect(bakes.status()).toMatchObject({ pending: true, progress: false });
    bakes.submit(job("cellar", ["direct", "bounce"], 100, []));
    expect(bakes.status()).toMatchObject({ pending: true, progress: true });
    await drain(bakes, calls);
    expect(bakes.status().progress).toBe(false);
  });

  it("keeps no trace until asked, then records each piece of work's lane, step, pass and room", async () => {
    const { lanes, calls } = fakeLanes(2);
    const bakes = createBakeScheduler(() => lanes);
    bakes.submit(job("hall", ["direct"], 100, []));
    await started();
    const trace = bakes.trace();
    expect(trace.chunks).toEqual([]);
    bakes.submit(job("cellar", ["direct"], 100, []));
    await started();
    expect(trace.chunks).toMatchObject([{ lane: 1, step: "gather", pass: "direct", room: "cellar", samples: 100, end: null }]);
    await calls[1].land();
    expect(trace.chunks[0].end).not.toBeNull();
    expect(trace.chunks[1]).toMatchObject({ lane: 1, step: "finish", room: "cellar" });
    expect(trace.passes.direct?.samples).toBe(100);
    await drain(bakes, calls);
    expect(trace.applies.map(({ room }) => room).sort()).toEqual(["cellar", "hall"]);
    expect(trace.batch?.end).not.toBeNull();
  });
});
