import type { Bot } from "../decision";
import { ppoBot } from "./bot";
import {
  BundleError,
  type LoadedBundle,
  type NodeBuiltins,
  hasSyncFilesystem,
  httpFetcher,
  loadBundleSync,
  nodeBuiltins,
  warmup,
} from "./bundle";
import { offlineHooks } from "./offline";
import { SyncOnnxSession } from "./onnx/session";
import { type DType, Tensor, type TensorData } from "./onnx/tensor";
import {
  type PolicyRunner,
  type SyncExecutor,
  adaptSyncSession,
  createPolicyRunner,
} from "./session";

// ---------------------------------------------------------------------------
// The shipped learned bots: policy weights + runtime + `Bot` in one place.
//
// The layers below are deliberately runtime-agnostic — `session.ts` never
// imports an ONNX implementation, it takes an `ExecutorFactory` — so exactly one
// module has to know that the executor is the pure-TypeScript one. This is that
// module.
//
// Why pure TypeScript rather than onnxruntime: `Bot` is synchronous and
// `bots/versions/conformance.test.ts` asserts it, while every ORT JavaScript
// backend's `run()` returns a Promise. ORT is ~20x faster and remains the right
// choice for offline batch work, but it cannot sit on this path at all.
//
// OFFLINE EVALUATION can opt out of that, and only that: with `PPO_EXECUTOR=ort`
// set AND an implementation imported at the entry point, `executorFor` below
// routes through `bots/ppo/offline.ts` instead. A different executor on the SAME
// bytes — the shipped bundle, in every mode. It is not bit-identical to this path
// and does not claim to be; `offline-ort.ts` has the measurement and the bounds.
// Unset, nothing here is reachable: no worker, no native module, no change to a
// browser bundle.
//
// WHERE THE WEIGHTS COME FROM
//
// One copy, in the repo, under `public/bundles/<name>/`. Two runtimes read it two
// ways, and there is still only ONE `Bot`. Node (sim CLIs, gauntlet workers,
// tests) reads that directory off the filesystem synchronously at the first
// consultation. A browser cannot do that at all, so it starts an HTTP fetch of
// the same directory — Next serves `public/` statically — and answers `null` (the
// contract's phase-default escape hatch) until the bytes land, after which the
// SAME closure plays the learned policy.
//
// The registry entry (`bots/versions/landon-v1/index.ts`) is a plain `Bot`
// constructed at module scope, and the pacer resolves it synchronously inside
// `botFor`, so there is no seam anywhere to await a load in. That constraint is
// what shapes everything below.
// ---------------------------------------------------------------------------

function executorFor(graph: Uint8Array): SyncExecutor {
  const offline = offlineHooks();
  if (offline !== null) return offline.executor(graph);
  return adaptSyncSession(SyncOnnxSession.load(graph), (dims, dtype, data) =>
    new Tensor(dims, dtype as DType, data as TensorData),
  );
}

function runnerFor(bundle: LoadedBundle): PolicyRunner {
  return createPolicyRunner(bundle.manifest, executorFor(bundle.graph));
}

/**
 * The bundle root the Node paths read from: `PPO_BUNDLE_DIR`, else the repo's own
 * `public/bundles`.
 *
 * That default is the SAME directory the browser fetches over HTTP
 * (`DEFAULT_BUNDLE_PREFIX` below is `/bundles`, which Next serves out of
 * `public/`), so there is one copy of the weights in the repo, served two ways.
 *
 * Resolved relative to THIS MODULE rather than to `process.cwd()`. The gauntlet
 * resolves bots inside `worker_threads` and the sim CLIs are run from wherever
 * the operator happens to be standing; a cwd-relative default would degrade to
 * "no weights, plays the phase default" in both, silently, because a bundle that
 * is not there is a legal state for this bot.
 */
function defaultBundleRoot(builtins: NodeBuiltins): string {
  const { fs, path, url } = builtins;
  // `../../../../..` climbs ppo -> bots -> monopoly -> projects -> src.
  const fromSource = path.resolve(
    path.dirname(url.fileURLToPath(import.meta.url)),
    "../../../../../public/bundles",
  );
  if (fs.existsSync(fromSource)) return fromSource;
  // A bundled server has moved this module out of the source tree (`.next/server/…`),
  // so the climb above lands nowhere. `public/` is still beside the server's
  // working directory there, which is the one case cwd is the right answer.
  return path.resolve(process.cwd(), "public/bundles");
}

/** Where a bundle lives on disk for the Node paths (sim CLIs, gauntlet workers,
 *  tests). Only ever called behind `hasSyncFilesystem()`, which is what makes the
 *  bare `process.env` read safe. */
export function bundleDir(name: string): string {
  const builtins = nodeBuiltins();
  const override = process.env["PPO_BUNDLE_DIR"];
  if (builtins === null) return `${override ?? "public/bundles"}/${name}`;
  return builtins.path.join(override ?? defaultBundleRoot(builtins), name);
}

/**
 * Where a BROWSER fetches bundles from, by default.
 *
 * Origin-relative, and it names `public/bundles/<name>/…` — the same shape every
 * other static asset in this app is served under (`/shipwright/…`,
 * `/pokemon-types/…`). Relative on purpose: one string that is correct on
 * localhost, on a preview deploy and in production, with no host baked into a
 * client bundle.
 */
export const DEFAULT_BUNDLE_PREFIX = "/bundles";

let defaultPrefix = DEFAULT_BUNDLE_PREFIX;

/** Point the browser loader somewhere else — a CDN, a content-hashed path, a
 *  test server. Applies to every bot that did not name its own `prefix`, and
 *  only affects loads that have not started yet. */
export function setBundlePrefix(prefix: string): void {
  defaultPrefix = prefix;
}

// ---------------------------------------------------------------------------
// The process-wide bundle cache.
//
// Keyed by SOURCE (`fs:<dir>` / `http:<prefix>/<name>`) rather than by bundle
// name, so a changed `PPO_BUNDLE_DIR` or prefix is a different entry rather than
// a stale hit. A bundle is ~13.6 MB of weights and a fresh `SyncOnnxSession` per
// consultation would be absurd, so this is also what keeps two bots pointed at
// the same bundle from paying for it twice.
// ---------------------------------------------------------------------------

interface Slot {
  /** The weights, once resident. The only state that makes a bot play. */
  bundle: LoadedBundle | null;
  /** A load that can never succeed: a missing directory under Node, a 404 or a
   *  digest mismatch over HTTP, or a transient failure that has exhausted its
   *  attempts. Latched so a broken bundle is not re-read (or re-fetched) on every
   *  single decision — a bot is consulted several times per second per seat. */
  fatal: boolean;
  /** The in-flight HTTP load, so concurrent consultations join it instead of
   *  starting a second download of the same 13.6 MB. Resolves to what landed, or
   *  `null`; it never rejects, because most of its awaiters are fire-and-forget. */
  pending: Promise<LoadedBundle | null> | null;
  attempts: number;
  /** Epoch ms before which no new attempt is started (backoff). */
  nextAttempt: number;
}

const slots = new Map<string, Slot>();

function slotFor(key: string): Slot {
  let slot = slots.get(key);
  if (slot === undefined) {
    slot = { bundle: null, fatal: false, pending: null, attempts: 0, nextAttempt: 0 };
    slots.set(key, slot);
  }
  return slot;
}

/** Retry schedule for a load that failed for a reason a later attempt could fix
 *  (offline, 503, a dropped connection). Bounded on BOTH axes: a delay so the
 *  retries are not a flood, and a hard attempt cap so a permanently unreachable
 *  origin eventually stops being asked. */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;
const MAX_ATTEMPTS = 5;

/** Whether a rejected load is worth another attempt. A `BundleError` says which
 *  it is (see its `retryable`); anything else — a `TypeError` from `fetch` on a
 *  dead network is the common one — is transport, and transport comes back. */
function isRetryable(err: unknown): boolean {
  return err instanceof BundleError ? err.retryable : true;
}

/**
 * Start (or join) the browser load for a slot.
 *
 * Fire-and-forget by design: the caller is a synchronous `Bot` that has already
 * decided to answer `null` for this decision. The promise is retained only so a
 * second consultation — or an explicit prefetch — can join it rather than
 * duplicate it.
 */
function beginLoad(slot: Slot, prefix: string, name: string): Promise<LoadedBundle | null> {
  if (slot.pending !== null) return slot.pending;
  slot.attempts++;
  const pending = warmup(httpFetcher(`${prefix}/${name}`), { name }).then(
    (bundle) => {
      slot.bundle = bundle;
      slot.pending = null;
      // A success clears any earlier backoff: the point of not latching a
      // recoverable failure is that this is the state it recovers INTO.
      slot.attempts = 0;
      slot.nextAttempt = 0;
      return bundle;
    },
    (err: unknown) => {
      slot.pending = null;
      if (!isRetryable(err) || slot.attempts >= MAX_ATTEMPTS) {
        slot.fatal = true;
        return null;
      }
      slot.nextAttempt = Date.now() + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (slot.attempts - 1));
      return null;
    },
  );
  slot.pending = pending;
  return pending;
}

/** The HTTP slot a set of options resolves to, and the prefix it was keyed on. */
function httpSlot(options: LandonBotOptions): { slot: Slot; prefix: string } {
  const prefix = options.prefix ?? defaultPrefix;
  return { slot: slotFor(`http:${prefix}/${options.bundle}`), prefix };
}

/**
 * The weights for these options if they are resident RIGHT NOW, else `null` —
 * having made sure something is on its way.
 *
 * Under Node that "something" is the synchronous read itself, so the first call
 * already returns a bundle. In a browser it is a background fetch, and `null`
 * means "not yet", never "not ever": nothing here latches a failure that a later
 * successful load would resolve, and the loads that CANNOT succeed are the only
 * ones latched.
 */
function residentBundle(options: LandonBotOptions): LoadedBundle | null {
  if (hasSyncFilesystem()) {
    const dir = bundleDir(options.bundle);
    const slot = slotFor(`fs:${dir}`);
    if (slot.bundle !== null) return slot.bundle;
    if (slot.fatal) return null;
    try {
      slot.bundle = loadBundleSync(dir);
    } catch (err) {
      // OFFLINE EVALUATION STOPS. A ladder that cannot get the weights must
      // fail, not latch `fatal` and quietly rate a bot answering `null` to every
      // decision — the degrade-to-phase-defaults behaviour is right for a browser
      // mid-game and catastrophic for a measurement.
      if (offlineHooks() !== null) throw err;
      // A directory that is not there at the first consultation will not appear
      // by the second, and this path has no network to blame; latch it.
      slot.fatal = true;
    }
    return slot.bundle;
  }

  const { slot, prefix } = httpSlot(options);
  if (slot.bundle !== null) return slot.bundle;
  if (slot.fatal || slot.pending !== null || Date.now() < slot.nextAttempt) return null;
  void beginLoad(slot, prefix, options.bundle);
  return null;
}

export interface LandonBotOptions {
  /** Bundle directory name. */
  readonly bundle: string;
  /** HTTP prefix for the browser load, overriding `setBundlePrefix`. Ignored
   *  under Node, which reads the filesystem. */
  readonly prefix?: string;
}

/**
 * A learned bot that loads its weights on FIRST CONSULTATION and then plays
 * synchronously forever after.
 *
 * UNDER NODE the load is a synchronous filesystem read, and that is what makes
 * the evaluation harness work untouched: `sim:gauntlet` resolves bots inside
 * `worker_threads` through `versionBot(label)` and has nowhere to await a warmup.
 * Reading ~13.6 MB once, at the first decision, costs less than the plumbing to
 * hoist it would.
 *
 * IN A BROWSER there is no synchronous read to make, so the first consultation
 * instead starts a background fetch (verified per manifest entry, cached in
 * IndexedDB) and returns `null`. `null` is the contract's own answer for "no
 * improvement on the default" — the pacer substitutes the phase default — so the
 * seat plays defaults for the first few decisions of the game and the learned
 * policy from then on. Under a synchronous `Bot` and a 13.6 MB bundle that is the
 * only shape available; `prefetchLandonBundle` exists to spend those decisions
 * during lobby time instead of during play.
 *
 * WHAT IS AND IS NOT LATCHED. A load that cannot succeed — a missing directory, a
 * 404, a digest mismatch — is remembered, so a broken bundle is not re-read on
 * every decision. A load that merely has not finished, or failed for a reason a
 * retry could fix, is NOT: the closure keeps checking the shared cache, so any
 * later success (this bot's own retry, another bot's load of the same bundle, or
 * an explicit prefetch) starts being played by every closure pointed at it. The
 * failure this bot shipped with was exactly the opposite — one browser-doomed
 * synchronous attempt latched `failed`, and the seat then played phase defaults
 * for the rest of the session with nothing in the logs to say so.
 *
 * Purity is unaffected either way. Repeated calls on one board agree, because
 * both are answered from the same resident-or-not cache, and the decode is the
 * argmax of a forward pass over that board — nothing carries between calls.
 */
export function landonBot(options: LandonBotOptions): Bot {
  let bot: Bot | null = null;

  return (state, playerId) => {
    if (bot === null) {
      const bundle = residentBundle(options);
      if (bundle === null) return null;
      bot = ppoBot({ runner: runnerFor(bundle) });
    }
    return bot(state, playerId);
  };
}

/**
 * Download a bundle NOW, so the first decisions of a browser game are played by
 * the policy rather than by the phase defaults.
 *
 * Call it when a seat is set to a learned bot — seat selection, lobby — and the
 * 13.6 MB overlaps with the time a player spends getting into the game instead of
 * with the game. Resolves `true` once the weights are resident (which every
 * `landonBot` closure on the same bundle then picks up), `false` if they are not.
 *
 * It does NOT reject. A lobby has nothing useful to do with the failure, the bot
 * degrades to phase defaults on its own, and an unhandled rejection out of a
 * fire-and-forget call in a UI is a worse outcome than a `false` nobody reads.
 */
export async function prefetchLandonBundle(options: LandonBotOptions): Promise<boolean> {
  if (hasSyncFilesystem()) return residentBundle(options) !== null;
  const { slot, prefix } = httpSlot(options);
  if (slot.bundle !== null) return true;
  if (slot.fatal) return false;
  // Deliberately not gated on the backoff clock: this is a user-initiated
  // retry, and making someone who just picked the seat wait out a timer set by
  // a background attempt would be the wrong trade. It still counts against the
  // attempt cap.
  return (await beginLoad(slot, prefix, options.bundle)) !== null;
}

/**
 * The browser path with an await available: fetch the bundle over HTTP, verify
 * every file against `manifest.files[]`, cache it in IndexedDB, and return a bot
 * bound to it.
 *
 * Distinct from `landonBot` in one respect only — it can promise you a bot that
 * is ALREADY playing, so a caller that has somewhere to await gives up no
 * decisions to phase defaults. It shares the process-wide cache in both
 * directions: a prefetched bundle is used rather than refetched, and a bundle
 * loaded here starts being played by every `landonBot` closure pointed at the
 * same prefix.
 *
 * Failures propagate to the caller here, rather than degrading: a caller that
 * asked for a bot and awaited it can be told it did not get one.
 */
export async function landonBotAsync(
  prefix: string,
  options: LandonBotOptions,
): Promise<Bot> {
  const slot = slotFor(`http:${prefix}/${options.bundle}`);
  // Join a load already in flight rather than starting a second download of the
  // same 13.6 MB. If that one failed it resolves `null`, and this call's own
  // attempt then runs and reports why — a caller that awaited a bot is owed the
  // error rather than a silent degradation.
  const joined = slot.pending === null ? slot.bundle : await slot.pending;
  const bundle =
    joined ?? (await warmup(httpFetcher(`${prefix}/${options.bundle}`), { name: options.bundle }));
  // A load that worked un-latches whatever an earlier one concluded.
  slot.bundle = bundle;
  slot.fatal = false;
  slot.attempts = 0;
  slot.nextAttempt = 0;
  return ppoBot({ runner: runnerFor(bundle) });
}
