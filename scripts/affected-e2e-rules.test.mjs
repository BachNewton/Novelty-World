import { describe, expect, it } from "vitest";
import { globToRegExp, readSpec, select } from "./affected-e2e-rules.mjs";

const projects = new Set(["aland-drive", "frogmino"]);
const SPEC = `import { test } from "./test";
// e2e-covers: src/projects/aland-drive/map/**

// e2e-covers: src/projects/aland-drive/garage/** src/projects/aland-drive/components/game-menu.tsx
test("tyres", async () => {});

test("map", async () => {});
`;

describe("readSpec", () => {
  it("gives a test its own covers, and the rest the spec's", () => {
    expect(readSpec(SPEC)).toEqual([
      { line: 5, covers: ["src/projects/aland-drive/garage/**", "src/projects/aland-drive/components/game-menu.tsx"] },
      { line: 7, covers: ["src/projects/aland-drive/map/**"] },
    ]);
  });
});

describe("select", () => {
  const specs = { "e2e/aland-drive.spec.ts": SPEC, "e2e/frogmino-local.spec.ts": 'test("plays", async () => {});\n' };

  it("runs only the tests whose covers the change touches", () => {
    expect(select(["src/projects/aland-drive/garage/tyres.ts"], specs, projects)).toEqual({
      runs: [{ spec: "e2e/aland-drive.spec.ts", lines: [5], why: "src/projects/aland-drive/garage/tyres.ts changed" }],
    });
  });

  it("runs nothing for a change no test covers, even in the project, nor for unit tests and notes", () => {
    expect(select(["src/projects/aland-drive/art/boats/hull.ts"], specs, projects)).toEqual({ runs: [] });
    expect(select(["src/projects/frogmino/logic.test.ts", "src/projects/frogmino/CLAUDE.md"], specs, projects)).toEqual({ runs: [] });
  });

  it("falls back to the whole project for a spec that names no covers", () => {
    expect(select(["src/projects/frogmino/logic.ts"], specs, projects).runs.map((run) => run.spec)).toEqual(["e2e/frogmino-local.spec.ts"]);
  });

  it("runs a spec whole when the spec itself changed, and everything for shared code", () => {
    expect(select(["e2e/aland-drive.spec.ts"], specs, projects).runs[0]).toMatchObject({ lines: null });
    expect(select(["src/shared/lib/peer/room.ts"], specs, projects)).toEqual({ all: "src/shared/lib/peer/room.ts changed" });
  });
});

describe("globToRegExp", () => {
  it("reads **, * and braces", () => {
    expect(globToRegExp("src/**/*.ts").test("src/a/b/c.ts")).toBe(true);
    expect(globToRegExp("src/**/*.ts").test("src/c.ts")).toBe(true);
    expect(globToRegExp("render/tree-*.ts").test("render/tree-place.ts")).toBe(true);
    expect(globToRegExp("render/tree-*.ts").test("render/a/tree-place.ts")).toBe(false);
    expect(globToRegExp("x/{a,b}.ts").test("x/b.ts")).toBe(true);
  });
});
