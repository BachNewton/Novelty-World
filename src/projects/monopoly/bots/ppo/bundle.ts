// ---------------------------------------------------------------------------
// Bundle loading: fetch, VERIFY, cache.
//
// Verification checksums every entry in `manifest.files[]`, not just the graph.
// That is load-bearing rather than thorough: past the 2 GB protobuf limit an
// export spills its initializers into a sidecar, and `manifest.sha256` then
// covers the GRAPH but not the WEIGHTS. Hashing only the graph would leave the
// numbers that decide every action unverified, which is the one part of the
// bundle a corrupted download would change invisibly.
//
// Three cache backends, each behind a dynamic import so the other two never enter
// a build that cannot use them. Loading is async because fetching and IndexedDB
// are; there is also a SYNCHRONOUS filesystem path, because the gauntlet resolves
// bots inside worker threads with no hook to await a warmup in.
// ---------------------------------------------------------------------------

import { type Manifest, parseManifestJson } from "./manifest";

export class BundleError extends Error {
  /**
   * Whether a LATER attempt at the same load could plausibly succeed.
   *
   * The distinction only matters to a caller that retries, and it is the
   * difference between a property of this ATTEMPT (a 503, a dropped connection)
   * and a property of the BYTES BEING SERVED (a digest mismatch, an unparseable
   * manifest, a 404). Refetching the second kind serves the same broken bundle
   * again, so a retry loop over it is pure noise. Default `false`: a new failure
   * mode is treated as permanent until someone has thought about it, which costs
   * a degraded bot rather than a retry storm.
   */
  readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = "BundleError";
    this.retryable = retryable;
  }
}

export const MANIFEST_NAME = "manifest.json";

// ---------------------------------------------------------------------------
// sha256
// ---------------------------------------------------------------------------

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * sha256 in pure TypeScript.
 *
 * Pure rather than delegated because the verification path must be SYNCHRONOUS
 * (the worker-thread load has nowhere to await) and available in the browser,
 * where the only native digest is async. `sha256HexAsync` still prefers the
 * platform's native implementation where there is one — this is the floor, not
 * the intended fast path.
 */
export function sha256Hex(bytes: Uint8Array): string {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = bytes.length * 8;
  // Pad to a multiple of 64 bytes: 0x80, zeros, then the 64-bit big-endian length.
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  // The high word covers lengths past 2^32 bits (512 MB); a bundle can exceed it.
  view.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296), false);
  view.setUint32(padded.length - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15];
      const b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }
  let hex = "";
  for (let i = 0; i < 8; i++) hex += h[i].toString(16).padStart(8, "0");
  return hex;
}

/** Native digest where the platform has one, falling back to `sha256Hex`. A
 *  13 MB graph is ~10x faster through WebCrypto, which is worth having on the
 *  path that runs while the user waits. */
export async function sha256HexAsync(bytes: Uint8Array): Promise<string> {
  // Through `Partial<typeof globalThis>` because a non-secure browser context and
  // some embedded runtimes have no WebCrypto at all, whatever the ambient types
  // promise.
  const subtle = (globalThis as Partial<typeof globalThis>).crypto?.subtle;
  if (subtle === undefined) return sha256Hex(bytes);
  // A fresh copy: `digest` rejects a view into a SharedArrayBuffer, and a caller
  // may well have handed us one from a worker.
  const digest = await subtle.digest("SHA-256", bytes.slice().buffer);
  let hex = "";
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

/** A content-addressed byte store. Keys are the file's own sha256, which makes a
 *  stale entry impossible by construction: different bytes, different key. */
export interface BundleCache {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array): Promise<void>;
}

export type CacheKind = "indexeddb" | "filesystem" | "memory" | "none";

const memoryStore = new Map<string, Uint8Array>();

function memoryCache(): BundleCache {
  return {
    get(key) {
      const hit = memoryStore.get(key);
      return Promise.resolve(hit === undefined ? null : hit);
    },
    put(key, bytes) {
      memoryStore.set(key, bytes);
      return Promise.resolve();
    },
  };
}

export interface NodeBuiltins {
  readonly fs: typeof import("node:fs");
  readonly path: typeof import("node:path");
  readonly url: typeof import("node:url");
}

/** Node's fs, reached without a static import a browser bundler would have to
 *  resolve. `getBuiltinModule` is synchronous, which is what the worker-thread
 *  load path needs and what a dynamic `import()` cannot give it.
 *
 *  Exported so anything that has to locate a bundle asks the SAME question the
 *  loader asks, rather than reimplementing the runtime sniff below and drifting
 *  from it. */
export function nodeBuiltins(): NodeBuiltins | null {
  const proc = (globalThis as Partial<typeof globalThis>).process;
  if (proc === undefined || typeof proc.getBuiltinModule !== "function") return null;
  return {
    fs: proc.getBuiltinModule("node:fs"),
    path: proc.getBuiltinModule("node:path"),
    url: proc.getBuiltinModule("node:url"),
  };
}

/**
 * Whether this runtime can read a bundle off a real filesystem SYNCHRONOUSLY —
 * i.e. whether `loadBundleSync` can work here at all.
 *
 * The predicate is `process.getBuiltinModule`, and deliberately NOT `typeof
 * process` or `typeof window`:
 *
 *   - `typeof process !== "undefined"` is not a test of the runtime, it is a test
 *     of the bundler's politeness. Webpack — and therefore Next — injects a
 *     `process` shim into client bundles so that a dependency reading
 *     `process.env.X` at module scope does not explode, and this repo's own e2e
 *     harness has to inject the same shim because an archived bot statically
 *     imports `node:process`. That shim carries `env`/`argv`/`platform` and
 *     nothing else.
 *   - `typeof window === "undefined"` gets it wrong in the other direction:
 *     jsdom, an Electron renderer and a Next SSR pass all answer it misleadingly.
 *
 * `getBuiltinModule` is the capability itself rather than a proxy for it: it is
 * the Node-only API that hands back `node:fs` WITHOUT an await, which is exactly
 * what the worker-thread path needs and what no shim provides. Crucially it is
 * also the same call `loadBundleSync` makes, so a caller branching on this can
 * never disagree with the loader about where it is running.
 */
export function hasSyncFilesystem(): boolean {
  return nodeBuiltins() !== null;
}

async function filesystemCache(dir?: string): Promise<BundleCache> {
  const fsp = await import("node:fs/promises");
  const nodePath = await import("node:path");
  const os = await import("node:os");
  const root = dir ?? process.env.PPO_BUNDLE_CACHE ?? nodePath.join(os.tmpdir(), "ppo-bundle-cache");
  await fsp.mkdir(root, { recursive: true });
  const entry = (key: string): string => nodePath.join(root, `${key}.bin`);
  return {
    async get(key) {
      try {
        const buf = await fsp.readFile(entry(key));
        return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      } catch {
        // A miss and an unreadable entry are the same thing to a caller: refetch.
        return null;
      }
    },
    async put(key, bytes) {
      // Write-then-rename so a crash mid-write cannot leave a truncated entry
      // under a key that claims to be a complete file.
      const tmp = `${entry(key)}.${Math.random().toString(36).slice(2)}.tmp`;
      await fsp.writeFile(tmp, bytes);
      await fsp.rename(tmp, entry(key));
    },
  };
}

const IDB_DB = "ppo-bundles";
const IDB_STORE = "files";

async function indexedDbCache(): Promise<BundleCache> {
  const factory = globalThis.indexedDB;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = factory.open(IDB_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(new BundleError(`IndexedDB open failed: ${String(req.error?.message)}`));
    };
  });
  return {
    get(key) {
      return new Promise((resolve) => {
        const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
        req.onsuccess = () => {
          const value: unknown = req.result;
          resolve(value instanceof Uint8Array ? value : null);
        };
        req.onerror = () => {
          resolve(null);
        };
      });
    },
    put(key, bytes) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(bytes, key);
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => {
          reject(new BundleError(`IndexedDB write failed: ${String(tx.error?.message)}`));
        };
      });
    },
  };
}

/** The backend this environment can actually use. Browsers get IndexedDB, Node
 *  gets the filesystem, and anything else gets memory — a cache that survives
 *  nothing is still better than refetching within one process. */
export function detectCacheKind(): CacheKind {
  if (typeof globalThis.indexedDB !== "undefined") return "indexeddb";
  if (nodeBuiltins() !== null) return "filesystem";
  return "memory";
}

export async function openCache(kind: CacheKind = detectCacheKind(), dir?: string): Promise<BundleCache | null> {
  switch (kind) {
    case "none":
      return null;
    case "memory":
      return memoryCache();
    case "filesystem":
      return filesystemCache(dir);
    case "indexeddb":
      return indexedDbCache();
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export interface LoadedBundle {
  readonly name: string;
  readonly manifest: Manifest;
  /** Every payload file, by the name `manifest.files[]` gives it. */
  readonly files: Readonly<Record<string, Uint8Array>>;
  /** `files[manifest.graph]`, hoisted because every caller wants it. */
  readonly graph: Uint8Array;
}

/** Fetches one named entry of a bundle. Kept abstract so the same loader serves
 *  an HTTP origin, a local directory and an in-memory test fixture. */
export type BundleFetch = (entry: string) => Promise<Uint8Array>;

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function checkDigest(entry: string, want: string, got: string, wantBytes: number, gotBytes: number): void {
  if (gotBytes !== wantBytes) {
    throw new BundleError(`${entry}: manifest declares ${wantBytes} bytes, got ${gotBytes}`);
  }
  if (got !== want) {
    throw new BundleError(`${entry}: sha256 mismatch — manifest declares ${want}, content hashes to ${got}`);
  }
}

export interface LoadOptions {
  readonly name?: string;
  readonly cache?: BundleCache | null;
}

/**
 * Fetch, verify and cache a whole bundle.
 *
 * Cache entries are keyed by the manifest's declared digest, so a hit is already
 * known to be the right bytes — but it is re-hashed anyway. A cache is storage
 * like any other, and "the file we stored under this hash still hashes to it" is
 * exactly the property a corrupted cache violates.
 */
export async function loadBundle(fetchEntry: BundleFetch, options: LoadOptions = {}): Promise<LoadedBundle> {
  const manifest = parseManifestJson(decodeUtf8(await fetchEntry(MANIFEST_NAME)), MANIFEST_NAME);
  const cache = options.cache;
  const files: Record<string, Uint8Array> = {};

  for (const spec of manifest.files) {
    let bytes: Uint8Array | null = null;
    if (cache !== undefined && cache !== null) {
      const hit = await cache.get(spec.sha256);
      if (hit !== null && (await sha256HexAsync(hit)) === spec.sha256) bytes = hit;
    }
    if (bytes === null) {
      bytes = await fetchEntry(spec.name);
      checkDigest(spec.name, spec.sha256, await sha256HexAsync(bytes), spec.bytes, bytes.length);
      if (cache !== undefined && cache !== null) await cache.put(spec.sha256, bytes);
    }
    files[spec.name] = bytes;
  }

  if (!(manifest.graph in files)) {
    throw new BundleError(`bundle is missing its graph ${JSON.stringify(manifest.graph)}`);
  }
  return { name: options.name ?? manifest.graph, manifest, files, graph: files[manifest.graph] };
}

/** Fetch and cache without building anything. The point of a warmup is that the
 *  first synchronous consultation later finds the bytes already local. */
export async function warmup(fetchEntry: BundleFetch, options: LoadOptions = {}): Promise<LoadedBundle> {
  const cache = options.cache === undefined ? await openCache() : options.cache;
  return loadBundle(fetchEntry, { ...options, cache });
}

/** A fetcher over an HTTP(S) prefix. `prefix` may or may not end in a slash. */
export function httpFetcher(prefix: string): BundleFetch {
  const base = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return async (entry) => {
    const res = await fetch(`${base}${entry}`);
    // 5xx / 408 / 429 say "ask again"; 404 and the rest say "this origin does not
    // have what your manifest names", which no amount of asking changes.
    if (!res.ok) {
      const retryable = res.status >= 500 || res.status === 408 || res.status === 429;
      throw new BundleError(`${entry}: HTTP ${String(res.status)} ${res.statusText}`, retryable);
    }
    return new Uint8Array(await res.arrayBuffer());
  };
}

/** A fetcher over a local directory. Async, for the warmup path; the synchronous
 *  load below reads the same files without it. */
export function directoryFetcher(dir: string): BundleFetch {
  return async (entry) => {
    const fsp = await import("node:fs/promises");
    const nodePath = await import("node:path");
    const buf = await fsp.readFile(nodePath.join(dir, entry));
    return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  };
}

/**
 * Load and verify a bundle from a directory, SYNCHRONOUSLY.
 *
 * This exists for the gauntlet: it resolves bots inside worker threads, from a
 * registry that hands back a constructed bot with nowhere to await a warmup. A
 * bot that could only be built asynchronously simply could not be entered into
 * that tournament, so the same verification runs on a synchronous path — the
 * digest check is not the part worth dropping for convenience.
 */
export function loadBundleSync(dir: string): LoadedBundle {
  const builtins = nodeBuiltins();
  if (builtins === null) {
    throw new BundleError("loadBundleSync requires Node; use loadBundle() with a fetcher elsewhere");
  }
  const { fs, path } = builtins;
  const read = (entry: string): Uint8Array => {
    // `dir` is chosen by the process that resolved the bot and `entry` comes from
    // the manifest's own files[]; neither is request data.
    const buf = fs.readFileSync(path.join(dir, entry));
    return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  };
  const manifest = parseManifestJson(decodeUtf8(read(MANIFEST_NAME)), MANIFEST_NAME);
  const files: Record<string, Uint8Array> = {};
  for (const spec of manifest.files) {
    const bytes = read(spec.name);
    checkDigest(spec.name, spec.sha256, sha256Hex(bytes), spec.bytes, bytes.length);
    files[spec.name] = bytes;
  }
  if (!(manifest.graph in files)) {
    throw new BundleError(`bundle is missing its graph ${JSON.stringify(manifest.graph)}`);
  }
  return { name: path.basename(dir), manifest, files, graph: files[manifest.graph] };
}
