import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  BundleError,
  type BundleFetch,
  loadBundle,
  loadBundleSync,
  openCache,
  sha256Hex,
  sha256HexAsync,
  warmup,
} from "./bundle";
import { itemProbs } from "./heads";
import { headByName, parseManifest, parseManifestJson } from "./manifest";
import { PolicySession, SessionError, encodeOptionsFromDims } from "./session";
import {
  REEF,
  SYNTHETIC_GRAPH,
  syntheticBundleFiles,
  syntheticExecutor,
  syntheticManifestJson,
  syntheticObservation,
} from "./synthetic";

// ---------------------------------------------------------------------------
// The model-agnosticism control.
//
// Everything below drives the runner with a bundle for a game that does not
// exist: different entities, different head names, one more head than the
// production nets, a gaussian they do not have, and a `select: "one"` grid no
// shipped bundle exercises. A runner that had quietly grown a dependency on the
// game it ships with passes every parity test and fails here.
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempBundleDir(files: Record<string, Uint8Array>): string {
  const dir = mkdtempSync(join(tmpdir(), "ppo-synthetic-"));
  tempDirs.push(dir);
  for (const name of Object.keys(files)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- `dir` came from mkdtempSync and the names are this module's own constants.
    writeFileSync(join(dir, name), files[name]);
  }
  return dir;
}

function memoryFetcher(files: Record<string, Uint8Array>): BundleFetch {
  return (entry) => {
    if (!(entry in files)) return Promise.reject(new BundleError(`no such entry: ${entry}`));
    return Promise.resolve(files[entry]);
  };
}

describe("sha256", () => {
  it("matches the published vectors", () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    // Longer than one block, so the padding and the length word are both exercised.
    expect(sha256Hex(new TextEncoder().encode("a".repeat(1000)))).toBe(
      "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3",
    );
  });

  it("agrees with the platform digest", async () => {
    const bytes = new Uint8Array(4096);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37) & 0xff;
    expect(await sha256HexAsync(bytes)).toBe(sha256Hex(bytes));
  });
});

describe("the synthetic bundle round-trips", () => {
  it("fetches, verifies every declared file, and caches", async () => {
    const files = syntheticBundleFiles();
    const cache = await openCache("memory");
    const bundle = await loadBundle(memoryFetcher(files), { cache });
    expect(bundle.manifest.graph).toBe("policy.onnx");
    expect(bundle.graph).toEqual(SYNTHETIC_GRAPH);

    // A second load must be served from the cache without touching the fetcher —
    // except for the manifest, which is what tells us which files to look for.
    let fetched = 0;
    const counting: BundleFetch = (entry) => {
      fetched++;
      return memoryFetcher(files)(entry);
    };
    await loadBundle(counting, { cache });
    expect(fetched).toBe(1);
  });

  it("refuses a payload whose digest does not match the manifest", async () => {
    // The whole reason files[] is checksummed rather than just the graph: with an
    // external-data export the weights live in a sidecar the graph digest does not
    // cover, and a corrupted download changes only the numbers.
    const files = syntheticBundleFiles();
    const corrupted = new Uint8Array(SYNTHETIC_GRAPH);
    corrupted[100] ^= 0x01;
    await expect(
      loadBundle(memoryFetcher({ ...files, "policy.onnx": corrupted })),
    ).rejects.toThrow(/policy\.onnx: sha256 mismatch/);
  });

  it("refuses a payload of the wrong length before hashing it", async () => {
    const files = syntheticBundleFiles();
    await expect(
      loadBundle(memoryFetcher({ ...files, "policy.onnx": SYNTHETIC_GRAPH.slice(0, 100) })),
    ).rejects.toThrow(/policy\.onnx: manifest declares 256 bytes, got 100/);
  });

  it("loads and verifies SYNCHRONOUSLY from a directory", () => {
    // The gauntlet resolves bots inside worker threads with nowhere to await a
    // warmup, so the same verification has to run on a synchronous path.
    const dir = tempBundleDir(syntheticBundleFiles());
    const bundle = loadBundleSync(dir);
    expect(bundle.graph).toEqual(SYNTHETIC_GRAPH);
    expect(bundle.manifest.contractVersion).toBe(2);
  });

  it("refuses a corrupted directory synchronously too", () => {
    const files = syntheticBundleFiles();
    const corrupted = new Uint8Array(SYNTHETIC_GRAPH);
    corrupted[7] ^= 0xff;
    const dir = tempBundleDir({ ...files, "policy.onnx": corrupted });
    expect(() => loadBundleSync(dir)).toThrow(/sha256 mismatch/);
  });

  it("warms a filesystem cache without building anything", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ppo-cache-"));
    tempDirs.push(dir);
    const cache = await openCache("filesystem", dir);
    const bundle = await warmup(memoryFetcher(syntheticBundleFiles()), { cache });
    expect(bundle.graph.length).toBe(SYNTHETIC_GRAPH.length);
    const hit = await cache?.get(bundle.manifest.sha256);
    expect(hit).not.toBeNull();
    expect(hit === null || hit === undefined ? "" : sha256Hex(hit)).toBe(bundle.manifest.sha256);
  });

  it("drives the whole runner over a game that does not exist", () => {
    const manifest = parseManifest(syntheticManifestJson());
    const session = new PolicySession(manifest, syntheticExecutor());
    const batch = [0, 1, 2, 3, 4].map((seed) => syntheticObservation(seed));
    const out = session.run(batch);

    expect(out.batch).toBe(5);
    expect(Object.keys(out.heads).sort()).toEqual(["crew_orders", "move", "wreck_pick"]);
    expect(Object.keys(out.gaussians)).toEqual(["ballast"]);
    expect(Object.keys(out.values)).toEqual(["value_haul"]);

    for (let item = 0; item < 5; item++) {
      // The joint grid sums to 1 ONCE, not once per crew row.
      const crew = itemProbs(out.heads.crew_orders, item);
      expect(crew).toHaveLength(REEF.crewRows * REEF.crewOps);
      expect([...crew].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);

      const move = itemProbs(out.heads.move, item);
      expect([...move].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);

      const wreck = itemProbs(out.heads.wreck_pick, item);
      expect(wreck).toHaveLength(REEF.wreckSlots + 1);
      expect([...wreck].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    }
    expect(out.gaussians.ballast.mean).toHaveLength(5 * REEF.ballastSlots);
    expect(out.values.value_haul).toHaveLength(5 * REEF.divers);
  });

  it("derives count-mask legality from the wire scalar, not from the padding", () => {
    const manifest = parseManifest(syntheticManifestJson());
    const session = new PolicySession(manifest, syntheticExecutor());
    for (let n = 0; n <= REEF.wreckSlots; n++) {
      const out = session.run([syntheticObservation(11, { wreckCount: n })]);
      const probs = itemProbs(out.heads.wreck_pick, 0);
      // Rows past n carry no mass; the abort column is legal on every row, so the
      // distribution is never all-illegal even at n = 0.
      for (let i = n; i < REEF.wreckSlots; i++) expect(probs[i]).toBe(0);
      expect(probs[REEF.wreckSlots]).toBeGreaterThan(0);
      if (n === 0) expect(probs[REEF.wreckSlots]).toBeCloseTo(1, 10);
    }
  });

  it("collapses the flattened grid when no crew order is legal", () => {
    const manifest = parseManifest(syntheticManifestJson());
    const session = new PolicySession(manifest, syntheticExecutor());
    const cells = REEF.crewRows * REEF.crewOps;
    const out = session.run([syntheticObservation(3, { crewMask: new Array<boolean>(cells).fill(false) })]);
    const crew = itemProbs(out.heads.crew_orders, 0);
    expect(crew[0]).toBeCloseTo(1, 10);
    expect(out.heads.crew_orders.legalCount[0]).toBe(0);
  });

  it("makes the graph bytes matter", () => {
    // The payload is opaque to the runner but not inert: the executor reads its
    // weights out of it, so a single flipped byte moves every distribution. That
    // is what makes the checksum round-trip above worth running.
    const manifest = parseManifest(syntheticManifestJson());
    const observation = syntheticObservation(5);
    const base = new PolicySession(manifest, syntheticExecutor()).run([observation]);
    const tweaked = new Uint8Array(SYNTHETIC_GRAPH);
    tweaked[100] ^= 0x01;
    const other = new PolicySession(manifest, syntheticExecutor(tweaked)).run([observation]);
    expect([...itemProbs(other.heads.move, 0)]).not.toEqual([...itemProbs(base.heads.move, 0)]);
  });
});

describe("feed assembly", () => {
  const manifest = parseManifest(syntheticManifestJson());

  it("slices each input from its own byte offset", () => {
    // Captured through a recording executor: the point is that the runner puts the
    // RIGHT bytes in each feed, which no downstream assertion about probabilities
    // could distinguish from the wrong ones.
    const seen: Record<string, ArrayLike<number>> = {};
    const inner = syntheticExecutor();
    const session = new PolicySession(manifest, {
      inputNames: inner.inputNames,
      outputNames: inner.outputNames,
      run(feeds) {
        for (const name of Object.keys(feeds)) seen[name] = feeds[name].data;
        return inner.run(feeds);
      },
    });
    const observation = syntheticObservation(9);
    session.run([observation]);

    const view = new DataView(observation.feat.buffer);
    expect(seen.env_feat).toHaveLength(REEF.envFeat);
    for (let i = 0; i < REEF.envFeat; i++) expect(seen.env_feat[i]).toBeCloseTo(view.getFloat32(i * 4, true), 6);
    // The crew matrix starts after the env block, and is read ROW-MAJOR — a
    // Fortran-order read has the same shape and the same element multiset, so
    // nothing downstream could detect it.
    const crewOffset = REEF.envFeat * 4;
    expect(seen.crew_feat).toHaveLength(REEF.crewRows * REEF.crewOps);
    for (let i = 0; i < REEF.crewRows * REEF.crewOps; i++) {
      expect(seen.crew_feat[i]).toBeCloseTo(view.getFloat32(crewOffset + i * 4, true), 6);
    }
    // Booleans start after the WHOLE float section.
    expect(seen.alive).toHaveLength(REEF.divers);
  });

  it("zero-pads a short wire matrix to the static width", () => {
    const seen: Record<string, ArrayLike<number>> = {};
    const inner = syntheticExecutor();
    const session = new PolicySession(manifest, {
      inputNames: inner.inputNames,
      outputNames: inner.outputNames,
      run(feeds) {
        for (const name of Object.keys(feeds)) seen[name] = feeds[name].data;
        return inner.run(feeds);
      },
    });
    session.run([syntheticObservation(4, { wreckCount: 2 })]);
    expect(seen.wrecks).toHaveLength(REEF.wreckSlots * REEF.wreckDim);
    for (let i = 2 * REEF.wreckDim; i < REEF.wreckSlots * REEF.wreckDim; i++) expect(seen.wrecks[i]).toBe(0);
  });

  it("refuses a blob of the wrong length", () => {
    const session = new PolicySession(manifest, syntheticExecutor());
    expect(() => session.run([{ feat: new Uint8Array(3), wire: { wrecks: [], wreck_n: 0 } }])).toThrow(
      /carries a 3-byte blob but feat_layout declares/,
    );
  });

  it("refuses a missing wire field, naming it", () => {
    const session = new PolicySession(manifest, syntheticExecutor());
    const obs = syntheticObservation(1);
    expect(() => session.run([{ feat: obs.feat, wire: {} }])).toThrow(
      /observation carries no wire field "wrecks"/,
    );
  });

  it("refuses a manifest whose mask field is the wrong size", () => {
    const json = JSON.parse(JSON.stringify(syntheticManifestJson())) as Record<string, unknown>;
    const head = (json.heads as Record<string, unknown>[])[1];
    ((head.mask as Record<string, unknown>).source as Record<string, unknown>).field = "move_mask";
    expect(() => new PolicySession(parseManifest(json), syntheticExecutor())).toThrow(
      /head "crew_orders": mask field "move_mask" holds 5 entries but the head needs 12/,
    );
  });

  it("refuses a count mask read from the packed blob at construction", () => {
    // `parseManifest` already rejects this; a hand-built manifest that skipped the
    // parser must still not get past the session.
    const manifestObj = parseManifest(syntheticManifestJson());
    const pointer = headByName(manifestObj, "wreck_pick");
    const broken = {
      ...manifestObj,
      heads: manifestObj.heads.map((h) =>
        h.name !== "wreck_pick"
          ? h
          : {
              ...pointer,
              mask: {
                kind: "count" as const,
                source: { kind: "feat_layout" as const, section: "bool_fields" as const, field: "alive" },
                shape: pointer.mask === null ? [] : pointer.mask.shape,
              },
            },
      ),
    };
    expect(() => new PolicySession(broken, syntheticExecutor())).toThrow(
      /head "wreck_pick": count mask reads field "alive" from feat_layout/,
    );
  });

  it("refuses a graph whose inputs the manifest does not describe", () => {
    const inner = syntheticExecutor();
    expect(
      () =>
        new PolicySession(manifest, {
          inputNames: ["env_feat"],
          outputNames: inner.outputNames,
          run: inner.run.bind(inner),
        }),
    ).toThrow(/manifest declares input "crew_feat" but the graph's inputs are \[env_feat\]/);
  });

  it("refuses a graph that omits a declared output", () => {
    const inner = syntheticExecutor();
    const session = new PolicySession(manifest, {
      inputNames: inner.inputNames,
      outputNames: inner.outputNames,
      run(feeds) {
        const out = { ...inner.run(feeds) };
        delete out.wreck_logits;
        return out;
      },
    });
    expect(() => session.run([syntheticObservation(0)])).toThrow(
      /head "wreck_pick": the graph produced no output named "wreck_logits"/,
    );
  });
});

describe("encoder options recovered from dims", () => {
  it("finds the unique combination the production widths imply", () => {
    // The manifest does not record them; the only trace they leave is the
    // observation WIDTHS the net was built for.
    expect(encodeOptionsFromDims({ global_feat: 40, player_feat: 8, asset_feat: 11 })).toEqual({
      obsGlobalV2: true,
      obsNwShare: true,
      obsRentCapacity: true,
    });
    expect(encodeOptionsFromDims({ global_feat: 20, player_feat: 5, asset_feat: 11 })).toEqual({
      obsGlobalV2: false,
      obsNwShare: false,
      obsRentCapacity: false,
    });
  });

  it("throws rather than guess when no combination matches", () => {
    // A wrong guess here yields a bot that runs clean and plays nonsense: every
    // tensor still has the right shape, so no numerical test catches it.
    expect(() => encodeOptionsFromDims({ global_feat: 33, player_feat: 8, asset_feat: 11 })).toThrow(
      /no unique encoder options give global_feat=33, player_feat=8/,
    );
    expect(() => encodeOptionsFromDims({ global_feat: 40, player_feat: 8, asset_feat: 9 })).toThrow(
      /dims\.asset_feat is 9 but this encoder emits 11/,
    );
    expect(() => encodeOptionsFromDims({})).toThrow(SessionError);
  });
});

describe("the manifest is parsed from real bytes the same way", () => {
  it("reads the synthetic manifest back out of its own JSON", () => {
    const files = syntheticBundleFiles();
    const text = new TextDecoder().decode(files["manifest.json"]);
    expect(parseManifestJson(text).heads).toHaveLength(4);
  });
});
