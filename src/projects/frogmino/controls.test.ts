import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JUMP_KEYS, KEY_ACTIONS, KEY_LEGEND } from "./controls";

const PROJECT = join(process.cwd(), "src/projects/frogmino");

function sources(dir: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the project's own directory, and folders listed from it
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("the controls", () => {
  it("map each key to one action, with nothing on C", () => {
    expect(KEY_ACTIONS.has("KeyC")).toBe(false);
    expect(JUMP_KEYS.has("KeyC")).toBe(false);
    for (const key of JUMP_KEYS.keys()) expect(KEY_ACTIONS.has(key)).toBe(false);
  });

  it("list every key in the legend, and no C", () => {
    const legend = KEY_LEGEND.map(([keys]) => keys).join(" ");
    expect(legend.split(/[\s/]+/)).not.toContain("C");
    for (const [, action] of KEY_LEGEND) expect(action).not.toMatch(/swap|pull-off/i);
  });
});

describe("the pull-offs", () => {
  it("are gone from play: no module, and nothing imports one or offers a swap", () => {
    expect(existsSync(join(PROJECT, "pull-off.ts"))).toBe(false);
    expect(existsSync(join(PROJECT, "components/pull-offs.tsx"))).toBe(false);
    for (const file of sources(PROJECT)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- a source file listed from the project's own directory
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/from "[./]*\/?pull-offs?"/);
      expect(text, file).not.toMatch(/\bswap\b|SwapButton|pullOff/i);
    }
  });
});
