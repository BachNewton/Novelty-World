import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CHILD_POSES, POSES } from "../art/people/poses";
import { LOOKS } from "./tile-people";

const tuple = (python: string, name: string) =>
  /^(\w+) = \((.+)\)$/m.exec(python.split("\n").find((line) => line.startsWith(`${name} = `)) ?? "")?.[2].split(",").map((item) => item.trim().replace(/"/g, ""));

// The pipeline checks every figure it writes against its own lists, so a pose or look the game doesn't know fails the
// build, not a tile landing mid-drive.
describe("people's files", () => {
  it("know the poses, a child's poses and the looks the game draws", () => {
    const python = readFileSync(resolve(__dirname, "../pipeline/people.py"), "utf8");
    expect(tuple(python, "POSES")).toEqual([...POSES]);
    expect(tuple(python, "CHILD_POSES")).toEqual([...CHILD_POSES]);
    expect(tuple(python, "LOOKS")).toEqual(Object.keys(LOOKS));
  });
});
