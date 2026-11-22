import { describe, expect, it } from "vitest";
import { measure, parseCounters } from "./machine-sample.mjs";

const RADEON = "luid_0x00000000_0x000124a8_phys_0";
const EGPU = "luid_0x00000000_0x15d4202c_phys_0";
const GB = 1024 ** 3;
const ADAPTERS = ["a\t74920\t4098", `a\t${0x15d4202c}\t4318`, "a\t123526\t5140"];
const process = (pid, parent, name, { role = "-", born = pid, time = 0 } = {}) => `p\t${pid}\t${parent}\t${born}\t${time}\t${name}\t${role}`;
const read = (...lines) => parseCounters([...ADAPTERS, ...lines]);
const measured = (after, runs, before = read()) => measure({ before, after, seconds: 5, cores: 4, runs });
const running = (id, pid, claim = {}) => ({ id, pid, state: "running", command: id, radeon: 0, egpu: 0, ...claim });

/** A browser under a slot (pid 100) on one GPU, with these renderers. */
const browser = (adapter, renderers, bytes = GB, exe = "chrome.exe") => [
  process(100, 1, "node.exe"),
  process(110, 100, "cmd.exe"),
  process(120, 110, "chrome.exe", { role: "b" }),
  process(130, 120, exe, { role: "g" }),
  ...Array.from({ length: renderers }, (_, i) => process(140 + i, 120, "chrome.exe", { role: "r" })),
  `g\tpid_130_${adapter}\t${bytes}`,
];

describe("a sample", () => {
  it("tells the GPUs apart by their LUIDs", () => {
    const after = read(`m\t${RADEON}\t${GB}`, `m\t${EGPU}\t${9 * GB}`, `m\tluid_0x00000000_0x0001e286_phys_0\t${GB}`);
    expect(measured(after, [])).toMatchObject({ radeon: { mib: 1024 }, egpu: { mib: 9216 } });
  });

  it("gives a slot its browser's pages, less Chrome's spare renderer", () => {
    const sample = measured(read(...browser(RADEON, 3)), [running("tool", 100, { radeon: 2 })]);
    expect(sample.use.tool).toEqual([0, 2, 0]);
    expect(sample.unclaimed).toEqual([]);
  });

  it("counts every renderer of the headless shell, which keeps no spare", () => {
    const sample = measured(read(...browser(RADEON, 2, GB, "chrome-headless-shell.exe")), [running("tool", 100, { radeon: 2 })]);
    expect(sample.use.tool).toEqual([0, 2, 0]);
  });

  it("counts no page for a browser drawing in software", () => {
    expect(measured(read(...browser(RADEON, 3, 4 * 1024 ** 2)), [running("check", 100)]).radeon.pages).toBe(0);
  });

  it("names a run on a GPU it didn't claim", () => {
    const sample = measured(read(...browser(EGPU, 2)), [running("tool", 100, { radeon: 2 })]);
    expect(sample.unclaimed).toMatchObject([{ gpu: "egpu", id: "tool", mib: 1024 }]);
  });

  it("gives WSL's memory to the wsl run, and names it when that run didn't claim it", () => {
    const after = read(process(50, 4, "vmwp.exe"), `g\tpid_50_${EGPU}\t${9 * GB}`);
    const render = running("render", 100, { command: "wsl -d Ubuntu -- bash run_breeze.sh" });
    expect(measured(after, [render]).unclaimed).toMatchObject([{ gpu: "egpu", id: "render", mib: 9216 }]);
    expect(measured(after, [{ ...render, egpu: 9421 }]).unclaimed).toEqual([]);
  });

  it("isn't fooled by a dead parent's process id, reused", () => {
    const after = read(process(100, 1, "node.exe", { born: 900 }), process(200, 100, "python.exe", { born: 10 }), `g\tpid_200_${EGPU}\t${GB}`);
    expect(measured(after, [running("job", 100, { egpu: 2000 })]).unclaimed).toMatchObject([{ name: "python.exe" }]);
  });

  it("measures cores and the Radeon's busiest engine over the interval", () => {
    const second = 1e7;
    const engine = (time) => `u\tpid_200_${RADEON}_eng_0_engtype_3d\t${time}`;
    const tree = (time) => [process(100, 1, "node.exe"), process(200, 100, "python.exe", { time })];
    const sample = measured(read(...tree(17 * second), engine(6 * second)), [running("job", 100)], read(...tree(7 * second), engine(3 * second)));
    expect(sample.use.job[0]).toBe(2);
    expect(sample.radeon.busy).toBe(60);
    // Windows' engines don't see CUDA in WSL, so without nvidia-smi's reading the eGPU's use is unknown, never idle.
    expect(sample.egpu.busy).toBe(null);
  });
});
