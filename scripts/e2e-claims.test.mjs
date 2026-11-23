import { describe, expect, it } from "vitest";
import { claimForSpecs, e2eClaim } from "./e2e-claims.mjs";
import { PAGE_MIB } from "./machine-budget.mjs";

const helpers = {
  "e2e/webgpu.ts": 'export const WEBGPU = { args: ["--enable-gpu", "--force-high-performance-gpu"] };',
  "e2e/test.ts": "export const test = base;",
};
const specs = {
  "e2e/drive.spec.ts": 'import { WEBGPU } from "./webgpu";',
  "e2e/drive-online.spec.ts": 'import { WEBGPU } from "./webgpu";\ntest.use({ ...WEBGPU, openPages: 2 });',
  "e2e/drive-coop.spec.ts": 'import { WEBGPU } from "./webgpu";\ntest.use({ ...WEBGPU, openPages: 4 });',
  "e2e/house.spec.ts": 'test.use({ launchOptions: { args: ["--enable-gpu"] } });',
  "e2e/lobby.spec.ts": 'import { test } from "./test";\ntest.use({ openPages: 2 });',
};
const claims = (command, integrated = false) => {
  const { radeon, egpu, withoutEgpu, e2eWorkers } = claimForSpecs(command, { specs, helpers, root: "C:\\repo", integrated });
  return { radeon, pages: egpu / PAGE_MIB, withoutEgpu, e2eWorkers };
};
const run = (...args) => claims(["npx", "playwright", "test", ...args]);

describe("an e2e run's claim", () => {
  // A page drawn on the eGPU is composited on the Radeon, so it is one of the Radeon's pages too.
  it("is every page its specs draw on a GPU on the Radeon, and its eGPU pages there too", () => {
    expect(run("e2e/drive.spec.ts:33")).toMatchObject({ radeon: 2, pages: 2, withoutEgpu: 2 });
    expect(run("e2e\\drive-online.spec.ts")).toMatchObject({ radeon: 4, pages: 4, withoutEgpu: 4 });
    expect(run("e2e/house.spec.ts")).toMatchObject({ radeon: 2, pages: 0, withoutEgpu: undefined });
    expect(run("e2e/lobby.spec.ts")).toMatchObject({ radeon: 0, pages: 0 });
    expect(run("e2e/house.spec.ts", "e2e/drive.spec.ts")).toMatchObject({ radeon: 2, pages: 2, withoutEgpu: 2 });
  });

  // The page gate lets a test bigger than its share run once the others have given theirs back.
  it("is never past the Radeon, and never less than its largest test", () => {
    expect(run("e2e/drive-coop.spec.ts")).toMatchObject({ radeon: 4, pages: 4 });
    expect(run()).toMatchObject({ radeon: 4, pages: 4, withoutEgpu: 4 });
    expect(run("e2e/drive-online.spec.ts", "-j", "3")).toMatchObject({ radeon: 4, pages: 4 });
    expect(run("e2e/house.spec.ts", "--workers", "6")).toMatchObject({ radeon: 4, pages: 0 });
  });

  it("follows the workers it is given", () => {
    expect(run("e2e/drive-online.spec.ts", "--workers=1")).toMatchObject({ radeon: 2, pages: 2, e2eWorkers: 1 });
    expect(run("e2e/drive-coop.spec.ts", "--workers=1")).toMatchObject({ radeon: 4, pages: 4, e2eWorkers: 1 });
    expect(() => run("--workers=50%")).toThrow(/count/);
  });

  it("takes no flag's value for a filter", () => {
    expect(run("-g", "lobby")).toEqual(run());
  });

  it("is the most it could be when the command can't be read", () => {
    expect(run("no-such-file")).toEqual(run());
    expect(claims(["npx playwright test e2e/lobby.spec.ts && npx playwright test"])).toMatchObject({ radeon: 4, pages: 4 });
    expect(claims(["node", "wrapper.mjs"])).toMatchObject({ radeon: 4, pages: 4 });
  });

  it("is the Radeon's alone with E2E_INTEGRATED_GPU", () => {
    expect(claims(["npx", "playwright", "test", "e2e/drive-online.spec.ts"], true)).toMatchObject({ radeon: 4, pages: 0 });
  });

  // The specs pick their GPU by launch flags, and one written another way would be hidden from the budget silently.
  it("finds this repo's WebGPU specs on the eGPU and Betrayal's on the Radeon", () => {
    const real = (spec) => e2eClaim(["npx", "playwright", "test", spec]);
    const drive = real("e2e/aland-drive.spec.ts");
    expect(process.env.E2E_INTEGRATED_GPU === "1" ? drive.radeon : drive.egpu).toBeGreaterThan(0);
    expect(real("e2e/betrayal-house.spec.ts").radeon).toBeGreaterThan(0);
    // The whole suite holds the co-op test's four pages, all there is.
    expect(real("e2e/aland-drive-challenge-coop.spec.ts").radeon).toBe(4);
  });
});
