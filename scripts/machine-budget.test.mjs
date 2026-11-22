import { describe, expect, it } from "vitest";
import { PAGE_MIB, admit, asLedgered, claimOf, demand, egpuIn, resolveClaim } from "./machine-budget.mjs";

const GB = 1024;
const budget = { cores: 14, radeon: 4, egpu: 11 * GB };
const claim = (cores, { radeon = 0, egpu = 0, withoutEgpu } = {}) => ({ cores, radeon, egpu, withoutEgpu });
const running = (id, cores, gpus) => ({ id, state: "running", ...claim(cores, gpus) });
const waiting = (id, cores, gpus) => ({ id, state: "waiting", ...claim(cores, gpus) });
const started = (runs, plugged = true) => admit(runs, { budget, plugged }).start;

const speech = { egpu: 9.2 * GB };
const webgpu = { egpu: 4 * PAGE_MIB, withoutEgpu: 4 };
const bothGpus = { radeon: 4, egpu: 4 * PAGE_MIB };
const tool = { radeon: 2 };

describe("admit", () => {
  it("starts waiting runs in order while they fit beside what's running", () => {
    expect(started([running("a", 6), waiting("b", 4), waiting("c", 4), waiting("d", 2)])).toEqual(["b", "c"]);
  });

  it("never lets a small run slip past a big one waiting for cores", () => {
    expect(started([running("a", 10), waiting("big", 6), waiting("small", 2)])).toEqual([]);
    expect(started([running("a", 12), waiting("e2e", 5, webgpu), waiting("small", 1)])).toEqual([]);
  });

  it("starts a run bigger than all the cores only once it would be alone", () => {
    expect(started([running("a", 1), waiting("huge", 20)])).toEqual([]);
    expect(started([waiting("huge", 20), waiting("next", 1)])).toEqual(["huge"]);
  });

  it("runs work on one GPU while the other is full, either way round", () => {
    expect(started([running("t1", 2, tool), running("t2", 2, tool), waiting("speech", 2, speech)])).toEqual(["speech"]);
    expect(started([running("training", 2, { egpu: 11 * GB }), waiting("tool", 2, tool)])).toEqual(["tool"]);
  });

  it("holds the Radeon to four pages", () => {
    expect(started([running("t1", 2, tool), waiting("t2", 2, tool), waiting("t3", 2, tool)])).toEqual(["t2"]);
  });

  it("holds the eGPU to its memory", () => {
    expect(started([running("speech", 2, speech), waiting("one", 5, { egpu: PAGE_MIB })])).toEqual(["one"]);
    expect(started([running("speech", 2, speech), waiting("four", 5, webgpu)])).toEqual([]);
    expect(started([running("e1", 5, webgpu), waiting("e2", 5, webgpu)])).toEqual(["e2"]);
  });

  it("lets other work past a run waiting for a GPU, which holds no cores", () => {
    const runs = [running("speech", 2, speech), waiting("e1", 5, webgpu), waiting("e2", 5, webgpu), waiting("cpu", 10), waiting("tool", 2, tool)];
    const { start, waitsFor } = admit(runs, { budget });
    expect(start).toEqual(["cpu", "tool"]);
    expect([...waitsFor]).toEqual([["e1", "egpu"], ["e2", "egpu"]]);
  });

  it("holds no Radeon pages for a run still waiting for the eGPU", () => {
    const runs = [running("speech", 2, speech), waiting("e1", 5, bothGpus), waiting("e2", 5, bothGpus), waiting("lod", 5, { radeon: 4 })];
    expect(started(runs)).toEqual(["lod"]);
  });

  it("holds the eGPU for a run that has reached the Radeon's line", () => {
    expect(started([running("tool", 2, tool), waiting("e2e", 5, bothGpus), waiting("speech", 2, speech)])).toEqual([]);
  });

  it("never lets a smaller run slip past on the GPU an earlier one waits for", () => {
    expect(started([running("speech", 2, speech), waiting("big", 5, webgpu), waiting("small", 2, { egpu: GB })])).toEqual([]);
    expect(started([running("tool", 2, tool), waiting("lod", 5, { radeon: 4 }), waiting("small", 1, { radeon: 1 })])).toEqual([]);
  });

  it("gets the whole machine to a run that takes it, under a steady stream of small ones", () => {
    let runs = [running("speech", 2, speech), waiting("all", 1000, { radeon: 4, egpu: 11 * GB })];
    let n = 0;
    const tick = () => {
      runs.push(waiting(`check${n++}`, 2), waiting(`tool${n++}`, 1, { radeon: 1 }));
      const now = started(runs);
      for (const run of runs) if (now.includes(run.id)) run.state = "running";
      return now;
    };
    expect(tick()).toEqual(["check0", "tool1"]);
    // The eGPU frees: `all` holds it and then the Radeon, so no more tools start, and those running drain.
    runs = runs.filter((run) => run.id !== "speech");
    expect(tick()).toEqual(["check2"]);
    // The Radeon frees: now it stops the line for cores as well.
    runs = runs.filter((run) => run.id !== "tool1");
    expect(tick()).toEqual([]);
    runs = runs.filter((run) => run.state !== "running");
    expect(tick()).toEqual(["all"]);
  });

  it("puts a run that can do without the eGPU on the Radeon when it's unplugged", () => {
    expect(started([waiting("e2e", 5, webgpu), waiting("tool", 2, tool)], false)).toEqual(["e2e"]);
  });

  it("passes over a run that needs the unplugged eGPU", () => {
    expect(started([waiting("speech", 2, speech), waiting("cpu", 4)], false)).toEqual(["cpu"]);
  });

  it("counts a running eGPU browser on the Radeon once it's unplugged, and still starts CPU work", () => {
    const runs = [running("e2e", 5, webgpu), running("tool", 2, tool), waiting("small", 2, { radeon: 1 }), waiting("cpu", 2)];
    expect(admit(runs, { budget, plugged: false }).waitsFor.get("small")).toBe("radeon");
    expect(started(runs, false)).toEqual(["cpu"]);
  });
});

describe("demand", () => {
  it("reads the GPUs a job declares", () => {
    expect(demand("cores:2+egpu:7.5")).toEqual(claim(2, { egpu: 7.5 * GB }));
    expect(demand("cores:5+radeon:4")).toEqual(claim(5, { radeon: 4 }));
    expect(demand("cores:3")).toEqual(claim(3));
  });

  it("refuses what a GPU can't hold, and what it can't read", () => {
    for (const kind of ["cores:2+radeon:6", "cores:2+egpu:12", "cores:0", "cores:2+egpu", "cores:2+gpu:4", "cores:2+egpu:1+egpu:1", "cores:2+radeon:1.5"]) {
      expect(() => demand(kind), kind).toThrow();
    }
  });
});

describe("a ledger shared with checkouts that count one pool of pages", () => {
  /** Those checkouts' admission: in order, on cores and one pool of four pages, stopping at the first that doesn't fit. */
  const theyStart = (runs) => {
    const ids = [];
    let cores = 0;
    let gpu = 0;
    for (const run of runs) {
      if (run.state !== "running") continue;
      cores += run.cores;
      gpu += run.gpu;
    }
    for (const run of runs) {
      if (run.state !== "waiting") continue;
      if ((cores > 0 || gpu > 0) && (cores + run.cores > 14 || gpu + run.gpu > 4)) break;
      ids.push(run.id);
      cores += run.cores;
      gpu += run.gpu;
    }
    return ids;
  };
  const ours = (id, state, wants) => asLedgered({ id, state }, wants);
  const theirs = (id, state, kind, cores, gpu) => ({ id, state, kind, cores, gpu });

  it("counts their e2e on both GPUs, and their browsers on the Radeon", () => {
    expect(claimOf(theirs("e", "running", "e2e", 5, 4))).toEqual(claim(5, { ...bothGpus, withoutEgpu: 4 }));
    expect(claimOf(theirs("b", "running", "browser", 2, 2))).toEqual(claim(2, tool));
    expect(claimOf(theirs("c", "running", "cores:4", 4, 0))).toEqual(claim(4));
    expect(started([theirs("e", "running", "e2e", 5, 4), ours("speech", "waiting", claim(2, speech))])).toEqual([]);
  });

  it("keeps their CPU and Radeon work flowing beside a running eGPU job", () => {
    const runs = [ours("speech", "running", claim(2, speech)), theirs("c", "waiting", "check", 2, 0), theirs("b", "waiting", "browser", 2, 2)];
    expect(theyStart(runs)).toEqual(["c", "b"]);
  });

  it("is never started by them on an eGPU they can't see is full", () => {
    expect(theyStart([ours("a", "running", claim(2, speech)), ours("b", "waiting", claim(2, speech))])).toEqual([]);
  });

  it("shows them a run that fell back to the Radeon as pages there", () => {
    expect(asLedgered({ state: "running" }, resolveClaim(claim(5, webgpu), false)).gpu).toBe(4);
  });
});

describe("egpuIn", () => {
  const device = (id, status) => `Instance ID:                PCI\\${id}\r\nClass Name:                 Display\r\nStatus:                     ${status}\r\n`;
  const radeon = device("VEN_1002&DEV_15BF", "Started");

  it("sees the eGPU only listed and started", () => {
    expect(egpuIn(`${radeon}\r\n${device("VEN_10DE&DEV_2786", "Started")}`)).toBe(true);
    expect(egpuIn(radeon)).toBe(false);
    expect(egpuIn(`${radeon}\r\n${device("VEN_10DE&DEV_2786", "Problem")}`)).toBe(false);
  });
});
