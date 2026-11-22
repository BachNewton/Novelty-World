import { describe, expect, it } from "vitest";
import { audit, formatHistory } from "./machine-history.mjs";

const budget = { cores: 14, radeon: 4, egpu: 11 * 1024 };
const SECOND = 1000;
const start = Date.UTC(2030, 0, 1, 12);
const at = (seconds) => start + seconds * SECOND;

const queued = (id, t, claim, kind = "cores:2") => ({ t: at(t), e: "queued", id, kind, who: "branch (dir)", command: id, claim });
const waits = (id, t, resource) => ({ t: at(t), e: "waits", id, for: resource });
const began = (id, t, claim, { beside = [0, 0, 0], ahead = [] } = {}) => ({ t: at(t), e: "started", id, claim, beside, ahead });
const ended = (id, t) => ({ t: at(t), e: "ended", id, code: 0 });
const sample = (t, over = {}) => ({
  t: at(t),
  e: "sample",
  plugged: true,
  cores: 10,
  radeon: { mib: 900, busy: 40, pages: 2 },
  egpu: { mib: 9300, busy: 70 },
  running: [],
  waiting: [],
  ready: [],
  use: {},
  unclaimed: [],
  ...over,
});
const every5 = (from, to, over) => Array.from({ length: (to - from) / 5 + 1 }, (_, i) => sample(from + i * 5, over));

const RENDER = [2, 0, 9400];
const E2E = [5, 0, 4800];
const TOOL = [2, 2, 0];

/** A render with e2e queued behind it for the 4070, and a tool on the Radeon beside them. */
const healthy = () => [
  queued("render", 0, RENDER),
  began("render", 0, RENDER),
  queued("e2e", 10, E2E, "e2e"),
  waits("e2e", 10, "egpu"),
  queued("tool", 11, TOOL, "browser"),
  began("tool", 11, TOOL, { beside: RENDER, ahead: [["e2e", "egpu"]] }),
  ...every5(5, 10, { running: ["render"], use: { render: [2, 0, 9300] }, radeon: { mib: 800, busy: 5, pages: 0 } }),
  ...every5(15, 595, { running: ["render", "tool"], waiting: [["e2e", "egpu"]], use: { render: [2, 0, 9300], tool: [2, 2, 0] } }),
  ended("tool", 598),
  ended("render", 600),
  began("e2e", 600, E2E),
  ...every5(600, 660, { running: ["e2e"], use: { e2e: [5, 0, 4000] }, egpu: { mib: 4100, busy: 50 } }),
  ended("e2e", 662),
];

const judge = (records) =>
  audit([...records].sort((a, b) => a.t - b.t), { from: at(-60), to: at(700), budget });
const stateOf = (report, name) => report.checks.find((check) => check.name === name).state;
/** The healthy records with every sample between two times changed. */
const changed = (from, to, over) => healthy().map((record) => (record.e === "sample" && record.t >= at(from) && record.t <= at(to) ? { ...record, ...over } : record));

describe("the budget's audit", () => {
  it("passes a queue that worked", () => {
    const report = judge(healthy());
    expect(report.checks.filter((check) => check.state !== "ok")).toEqual([]);
    expect(report.verdicts).toEqual({ queue: "ok", hardware: "ok" });
    expect(report.resources.find(({ resource }) => resource === "egpu").waited).toBe(590 * SECOND);
  });

  it("never passes on no data", () => {
    const report = judge([]);
    expect(report.verdicts).toEqual({ queue: "unknown", hardware: "unknown" });
    expect(report.checks.some((check) => check.state === "ok")).toBe(false);
  });

  it("catches an overbooked GPU", () => {
    const records = healthy().map((record) => (record.e === "started" && record.id === "e2e" ? began("e2e", 20, E2E) : record));
    expect(stateOf(judge(records), "Never overbooked")).toBe("fail");
  });

  it("catches a start on what was already taken, though the runs holding it logged nothing", () => {
    const records = [...healthy(), began("late", 300, TOOL, { beside: [2, 4, 0] }), queued("late", 300, TOOL), ended("late", 301)];
    expect(stateOf(judge(records), "Never overbooked")).toBe("fail");
  });

  it("lets a run bigger than all the cores run alone", () => {
    const records = [queued("all", 0, [1000, 4, 11264], "all"), began("all", 0, [1000, 4, 11264]), ended("all", 30)];
    expect(stateOf(judge(records), "Never overbooked")).toBe("ok");
  });

  it("catches a run jumping the line", () => {
    const small = [1, 0, 1000];
    const records = [...healthy(), queued("small", 20, small), began("small", 20, small, { beside: RENDER, ahead: [["e2e", "egpu"]] }), ended("small", 22)];
    expect(stateOf(judge(records), "No jumping the line")).toBe("fail");
  });

  it("catches a run left waiting with room free", () => {
    expect(stateOf(judge(changed(100, 200, { ready: ["e2e"] })), "Never stuck with room free")).toBe("fail");
    // The wait for the queue's own liveness read is allowed.
    expect(stateOf(judge(changed(100, 130, { ready: ["e2e"] })), "Never stuck with room free")).toBe("ok");
  });

  it("won't vouch for time it didn't record", () => {
    const records = healthy().filter((record) => record.e !== "sample" || record.t < at(100) || record.t > at(400));
    expect(stateOf(judge(records), "Fully recorded")).toBe("fail");
    const died = [...healthy(), { t: at(300), e: "recorder", failed: "boom" }];
    expect(stateOf(judge(died), "Fully recorded")).toBe("fail");
  });

  it("finds a gap in recording however many short runs fill it", () => {
    const short = Array.from({ length: 40 }, (_, i) => `short${i}`).flatMap((id, i) => [queued(id, i * 10, [1, 0, 0]), began(id, i * 10, [1, 0, 0]), ended(id, i * 10 + 10)]);
    expect(stateOf(judge([...short, sample(5, { running: ["short0"] })]), "Fully recorded")).toBe("fail");
  });

  it("catches too many pages really open on the Radeon", () => {
    expect(stateOf(judge(changed(100, 110, { radeon: { mib: 2000, busy: 90, pages: 6 } })), "Radeon within 4 pages")).toBe("fail");
  });

  it("catches the 4070 really full", () => {
    expect(stateOf(judge(changed(100, 100, { egpu: { mib: 11944, busy: 90 } })), "RTX 4070 never full")).toBe("fail");
  });

  it("catches a claim smaller than the use", () => {
    expect(stateOf(judge(changed(100, 110, { use: { render: [2, 0, 10500] } })), "GPU claims are true")).toBe("fail");
    expect(stateOf(judge(changed(100, 110, { use: { tool: [2, 3, 0] } })), "GPU claims are true")).toBe("fail");
    expect(stateOf(judge(changed(15, 595, { use: { tool: [6, 2, 0] } })), "Core claims are true")).toBe("warn");
  });

  it("catches GPU work outside the budget", () => {
    const unclaimed = [{ gpu: "egpu", name: "python.exe", mib: 7000 }];
    expect(stateOf(judge(changed(100, 110, { unclaimed })), "No GPU work outside the budget")).toBe("fail");
  });

  it("warns when runs queue for hardware sitting idle", () => {
    expect(stateOf(judge(changed(15, 595, { egpu: { mib: 0, busy: 0 } })), "No queueing for idle hardware")).toBe("warn");
  });

  it("advises claiming less of a GPU, and never fewer cores, whose measure is only a floor", () => {
    const records = changed(0, 700, { use: { render: [0.1, 0, 1000], tool: [0.1, 2, 0] } });
    const report = judge(records);
    const text = formatHistory(report, { hours: 1, log: "log" }).join("\n");
    const advice = text.slice(text.indexOf("GPU claims furthest above use"), text.indexOf("Longest waits"));
    expect(advice).toContain("RTX 4070: used");
    expect(advice).not.toContain("CPU cores");
  });

  it("warns of an overloaded CPU", () => {
    expect(stateOf(judge(changed(15, 595, { cores: 15.8 })), "CPU not overloaded")).toBe("warn");
  });
});
