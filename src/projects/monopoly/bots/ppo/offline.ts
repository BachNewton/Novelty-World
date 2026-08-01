// ---------------------------------------------------------------------------
// The OFFLINE executor seam.
//
// The bot that ships runs its graph through the pure-TypeScript interpreter, and
// nothing here changes that. This module exists for one job the shipped path is
// the wrong tool for: the evaluation ladder, which plays tens of thousands of
// games and spends essentially all of its wall clock inside `run()`.
//
// It is a SEAM, not an implementation. It holds an opt-in flag and a pair of
// hooks, and it never imports an inference runtime — the implementation lives in
// `offline-ort.ts`, which is imported ONLY by offline entry points (the eval
// worker and the sim CLIs). That split is what keeps `onnxruntime-node` — a
// ~200 MB native package that is not even a declared dependency — out of every
// build that could reach a browser, and it is checkable: nothing under
// `bots/eval/` is statically reachable from `bots/versions/index.ts`.
//
// WHY AN INSTALL SEAM RATHER THAN A LAZY IMPORT. A `Bot` is synchronous, so the
// module that supplies an executor cannot be `await import()`ed at the moment it
// is needed; and a synchronous `require()` of a TypeScript module only works
// under one particular runner. Installing at the entry point is boring, typed,
// and cannot silently resolve to the wrong thing.
//
// WHY IT REFUSES TO FALL BACK. `offlineHooks` throws when the mode is requested
// and nothing was installed. The alternative — quietly using the shipped
// interpreter — costs an operator eight hours of waiting for a run they believed
// was eighteen times faster, with nothing on the console to say otherwise.
// ---------------------------------------------------------------------------

import { nodeBuiltins } from "./bundle";
import type { ExecutorFactory } from "./session";

export class OfflineExecutorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineExecutorError";
  }
}

/** The env var that opts in, and the only value it accepts. Named in the same
 *  family as `PPO_BUNDLE_DIR` / `PPO_ASSETS_DIR`. */
export const OFFLINE_EXECUTOR_ENV = "PPO_EXECUTOR";

const OFFLINE_MODES = ["ort"] as const;
export type OfflineMode = (typeof OFFLINE_MODES)[number];

/**
 * What an offline mode replaces, and all it replaces: WHO MULTIPLIES THE
 * MATRICES. The weights are the shipped bundle in every mode — there is one
 * artifact, it is the one the trainer exported, and a fast mode that ran some
 * other bytes would rate a player nobody plays.
 */
export interface OfflineHooks {
  /** How the graph is executed. */
  readonly executor: ExecutorFactory;
}

/**
 * The offline mode this process was started in, or `null` for the shipped path.
 *
 * Guarded on `nodeBuiltins()` — the same capability probe the loader itself uses
 * — because a client bundle carries a `process.env` shim that would happily
 * answer this question in a browser, and the answer must be "no" there whatever
 * the shim contains.
 */
export function offlineExecutorMode(): OfflineMode | null {
  if (nodeBuiltins() === null) return null;
  const raw = process.env[OFFLINE_EXECUTOR_ENV];
  if (raw === undefined || raw === "") return null;
  if (!(OFFLINE_MODES as readonly string[]).includes(raw)) {
    throw new OfflineExecutorError(
      `${OFFLINE_EXECUTOR_ENV}=${raw} is not a known offline executor; expected one of ${OFFLINE_MODES.join(", ")}`,
    );
  }
  return raw as OfflineMode;
}

let installed: OfflineHooks | null = null;

/** Called by an offline implementation module at import time. Idempotent by
 *  overwrite: importing the same implementation twice is not an error. */
export function installOfflineHooks(hooks: OfflineHooks): void {
  installed = hooks;
}

/**
 * The installed hooks, or `null` when this process is on the shipped path.
 *
 * Throws — loudly, with the fix in the message — when a mode was requested but no
 * implementation was imported. That is a wiring bug at an entry point, and the
 * only outcome worse than failing here is not failing here.
 */
export function offlineHooks(): OfflineHooks | null {
  const mode = offlineExecutorMode();
  if (mode === null) return null;
  if (installed === null) {
    throw new OfflineExecutorError(
      `${OFFLINE_EXECUTOR_ENV}=${mode} is set but no offline executor was installed. ` +
        `The entry point must import the implementation for its side effect, e.g. ` +
        `import "../ppo/offline-ort"; — see bots/ppo/offline.ts.`,
    );
  }
  return installed;
}
