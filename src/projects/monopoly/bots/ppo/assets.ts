// ---------------------------------------------------------------------------
// The one place the test suite touches the filesystem.
//
// Both kinds of asset the suite needs are IN THE REPO, so a fresh clone runs
// everything:
//
//   * the policy bundles, under `public/bundles/<name>/` — the same directory the
//     browser fetches over HTTP, located through `landon.ts` itself so a test can
//     never read a bundle from somewhere the bot would not;
//   * the parity fixtures, GZIPPED, beside this module. Uncompressed they are
//     2.5 MB each of base64 observations and reference distributions; gzipped the
//     pair is 121 KB, which is a reasonable thing to keep in a git history and
//     4.9 MB is not.
//
// Every read funnels through here for two reasons:
//
//   * the eslint path-injection suppression is a single line in a single file
//     rather than a line above every `readFileSync` in the suite, and
//   * a missing or unreadable asset has ONE place to be detected, so the suite can
//     fail loudly instead of quietly skipping. A suite that skips when its inputs
//     are absent passes while proving nothing.
//
// Node-only by construction. Nothing in the shipped runner imports this — the
// runner is handed bytes, and where those bytes came from is the caller's problem.
// ---------------------------------------------------------------------------

/* eslint-disable security/detect-non-literal-fs-filename -- Every path here is a
   repo directory joined with a bundle or fixture name chosen by a test, or the
   developer's own PPO_ASSETS_DIR. They are test inputs, never request data.
   Routing all asset reads through this module is what keeps the suppression to
   one file instead of one per call site. */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { bundleDir } from "./landon";

/** The bundles this repo ships, and therefore the ones every test may assume are
 *  present. Named here rather than per test file so the parity suite, the ONNX
 *  reference suite and the presence guard cannot disagree about what exists;
 *  `assets.test.ts` pins it against the registry's own `LEARNED_BUNDLES`. */
export const SHIPPED_BUNDLES = ["landon-v1", "landon-exploiter-v1"] as const;

/** The committed fixtures, beside this module. */
const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

/** An out-of-repo fixture tree, `""` when unset. Read once: a suite that re-read
 *  it per call could observe a different value in different tests and produce a
 *  confusing partial run.
 *
 *  It is no longer needed for a normal run — that is the point of committing the
 *  fixtures — and survives only so the recorder's own output tree can be pointed
 *  at directly, which is how a REPLACEMENT fixture gets checked before it is
 *  compressed and committed. Hence the uncompressed layout below is still
 *  accepted. */
export const ASSETS_DIR: string = process.env.PPO_ASSETS_DIR ?? "";

/** Path to a bundle directory, or to one entry inside it. Delegates to the
 *  loader's own resolution (`PPO_BUNDLE_DIR`, else `public/bundles`), because a
 *  test that read the bundle from a different place than the bot does would be
 *  measuring a file nobody plays. */
export function bundlePath(name: string, entry?: string): string {
  const dir = bundleDir(name);
  return entry === undefined ? dir : join(dir, entry);
}

/**
 * Path to a parity fixture — `.json.gz` or `.json`, whichever is actually there.
 *
 * `name` may be given with or without an extension, so a caller can write the
 * bundle's own name and get its fixture. The committed form is gzipped; an
 * uncompressed file wins only where one exists, which is what keeps
 * `PPO_ASSETS_DIR` pointing at a raw recorder output tree working.
 */
export function fixturePath(name: string): string {
  const root = ASSETS_DIR === "" ? FIXTURE_DIR : join(ASSETS_DIR, "fixtures");
  const stem = name.replace(/\.json(\.gz)?$/, "");
  const plain = join(root, `${stem}.json`);
  return existsSync(plain) ? plain : join(root, `${stem}.json.gz`);
}

export function assetExists(path: string): boolean {
  return existsSync(path);
}

export function readAsset(path: string): Uint8Array {
  if (!existsSync(path)) throw new Error(`asset not found: ${path}`);
  const buf = readFileSync(path);
  // A fresh view rather than the Buffer itself: Buffer is a view into a POOLED
  // ArrayBuffer, so handing `.buffer` to a DataView would address the pool, not
  // the file. Copying once here is cheaper than that class of bug.
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

export function readAssetText(path: string): string {
  if (!existsSync(path)) throw new Error(`asset not found: ${path}`);
  return readFileSync(path, "utf8");
}

/**
 * A fixture's JSON text, decompressed if it is stored that way.
 *
 * SYNCHRONOUS, and it has to stay that way: the fixture loader is called from
 * module scope and from plain `it()` bodies that measure parity without an await
 * anywhere. `gunzipSync` on 2.5 MB is a few milliseconds against a run that spends
 * minutes in the executor.
 */
export function readFixtureText(name: string): string {
  const path = fixturePath(name);
  if (!path.endsWith(".gz")) return readAssetText(path);
  return gunzipSync(readAsset(path)).toString("utf8");
}

/** Why the assets are unusable, or `null` when they are fine. Returned rather
 *  than thrown so one guard test can report it and every other test can use it
 *  as a precondition. */
export function assetsProblem(): string | null {
  for (const name of SHIPPED_BUNDLES) {
    const manifest = bundlePath(name, "manifest.json");
    if (!existsSync(manifest)) return `bundle ${name} has no manifest at ${manifest}`;
    const fixture = fixturePath(`parity-${name}`);
    if (!existsSync(fixture)) return `bundle ${name} has no parity fixture at ${fixture}`;
  }
  return null;
}
