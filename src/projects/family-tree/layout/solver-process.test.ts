import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findVenvPython } from "./solver-process";

const PYTHON = process.platform === "win32" ? join("Scripts", "python.exe") : join("bin", "python");

describe("findVenvPython", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "venv-lookup-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function makeVenv(dir: string): string {
    const python = join(dir, ".venv", PYTHON);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a folder inside this test's own temp dir
    mkdirSync(dirname(python), { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a file inside this test's own temp dir
    writeFileSync(python, "");
    return python;
  }

  it("finds a venv in a folder above, as a worktree finds the main checkout's", () => {
    const python = makeVenv(root);
    expect(findVenvPython(join(root, ".claude", "worktrees", "x", "src", "solver"))).toBe(python);
  });

  it("takes the nearest venv first", () => {
    makeVenv(root);
    const worktree = join(root, "worktree");
    const nearest = makeVenv(worktree);
    expect(findVenvPython(join(worktree, "src"))).toBe(nearest);
  });

  it("fails naming the setup script when there is none", () => {
    expect(() => findVenvPython(root)).toThrow(/setup_venv\.py/);
  });
});
