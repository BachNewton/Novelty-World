import { describe, expect, it } from "vitest";

import { LEARNED_BUNDLES } from "../versions/index";
import {
  SHIPPED_BUNDLES,
  assetsProblem,
  bundlePath,
  fixturePath,
  readAsset,
  readAssetText,
  readFixtureText,
} from "./assets";
import { sha256Hex } from "./bundle";
import { parseManifestJson } from "./manifest";

// ---------------------------------------------------------------------------
// The assets guard.
//
// The parity suite is the only thing that proves this runner reproduces the
// trained policy, and it needs the bundles and fixtures to be readable. Those are
// COMMITTED, so on a fresh clone this simply passes — nothing to configure, no
// bypass to remember, and no lane where the interesting tests quietly skip.
//
// It is still worth asserting, because the failure it guards against did not go
// away: if an asset were missing or corrupt, the parity suite would be the thing
// that stopped running, and a suite that skips its only meaningful test reports
// green while proving nothing. So this fails LOUDLY and first, naming the file.
// ---------------------------------------------------------------------------

describe("assets", () => {
  it("are present and readable", () => {
    const problem = assetsProblem();
    if (problem !== null) {
      throw new Error(
        `${problem}\n\n` +
          `The bundles live in public/bundles/<name>/{manifest.json,policy.onnx} and the parity\n` +
          `fixtures in bots/ppo/fixtures/parity-<name>.json.gz; both are committed. Restore them\n` +
          `(or point PPO_BUNDLE_DIR / PPO_ASSETS_DIR at a tree that has them) — without them the\n` +
          `parity suite cannot run, and a suite that cannot run still reports green.`,
      );
    }
    expect(problem).toBeNull();
  });

  it("ship a bundle for every learned bot the registry can field", () => {
    // The drift this catches is a new learned version whose weights nobody
    // committed: it would be registered, resolvable, and answer `null` forever.
    expect([...SHIPPED_BUNDLES].sort()).toEqual(Object.values(LEARNED_BUNDLES).sort());
  });

  it("hold a bundle whose every file matches its manifest digest", () => {
    for (const name of SHIPPED_BUNDLES) {
      const manifest = parseManifestJson(readAssetText(bundlePath(name, "manifest.json")), `${name}/manifest.json`);
      for (const spec of manifest.files) {
        const bytes = readAsset(bundlePath(name, spec.name));
        expect(bytes.length, `${name}/${spec.name} byte length`).toBe(spec.bytes);
        expect(sha256Hex(bytes), `${name}/${spec.name} sha256`).toBe(spec.sha256);
      }
    }
  });

  it("hold a parity fixture that decompresses to readable JSON", () => {
    for (const name of SHIPPED_BUNDLES) {
      // Committed gzipped, so "the file is there" is not the same claim as "the
      // file is usable" — a truncated or mis-committed blob fails HERE, with the
      // zlib error, rather than as a confusing parse failure inside parity.
      const text = readFixtureText(`parity-${name}`);
      const parsed = JSON.parse(text) as { format?: unknown; cases?: unknown[] };
      expect(parsed.format, `parity-${name} format`).toBe("landon-onnx-parity-fixture");
      expect(Array.isArray(parsed.cases) && parsed.cases.length > 0, `parity-${name} has cases`).toBe(true);
    }
  });

  it("resolve fixture paths with or without an extension", () => {
    // A fixture may be named with or without its extension, so a caller can pass
    // the bundle's own name straight through.
    const name = SHIPPED_BUNDLES[0];
    expect(fixturePath(`parity-${name}`)).toBe(fixturePath(`parity-${name}.json`));
    expect(fixturePath(`parity-${name}`)).toBe(fixturePath(`parity-${name}.json.gz`));
  });
});
