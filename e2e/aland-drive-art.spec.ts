// e2e-covers: src/projects/aland-drive/art/**
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "./test";

/*
 * Every kit's models drawn near and far as the game draws them, compared at the swap (`art/lod-check`): a far version
 * that changes shape or colour is noticed as it swaps, which no still shot of either version shows. The game swaps each
 * at the nearest distance the check measured its change to be unnoticed (`swaps.json`), and this holds that table to
 * the art: each model's swap, and the one before it, are drawn again. It draws on its own page, on the machine's GPU,
 * so it lives with the specs rather than the unit tests.
 */

const run = promisify(execFile);

test("every model swaps where its change is measured not to be noticed", async () => {
  test.setTimeout(1_200_000);
  const out = mkdtempSync(join(tmpdir(), "aland-lod-"));
  try {
    const { stdout } = await run(process.execPath, ["src/projects/aland-drive/art/lod-check/check.mjs", `--out=${out}`], { maxBuffer: 1 << 24 }).catch((failed: { stdout?: string }) => ({ stdout: `failed\n${failed.stdout ?? ""}` }));
    expect(stdout.startsWith("failed") ? stdout : "").toBe("");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
