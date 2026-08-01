import { afterEach, describe, expect, it } from "vitest";

import {
  OFFLINE_EXECUTOR_ENV,
  OfflineExecutorError,
  installOfflineHooks,
  offlineExecutorMode,
  offlineHooks,
} from "./offline";

// ---------------------------------------------------------------------------
// The offline seam's two invariants, both of which are about what does NOT
// happen:
//
//   * unset, it is invisible — `landon.ts` takes the shipped path and no offline
//     module is consulted at all. Every other suite here runs under exactly that
//     condition, so this only has to pin the predicate they all depend on;
//   * set-but-unwired, it STOPS. A silent fall back to the pure-TS interpreter
//     would leave an operator waiting eight hours for a run they believed was
//     eighteen times faster, and no output anywhere would say so.
// ---------------------------------------------------------------------------

const saved = process.env[OFFLINE_EXECUTOR_ENV];

afterEach(() => {
  if (saved === undefined) delete process.env[OFFLINE_EXECUTOR_ENV];
  else process.env[OFFLINE_EXECUTOR_ENV] = saved;
});

describe("the offline executor seam", () => {
  it("is inert with the env unset — the suite's own condition", () => {
    delete process.env[OFFLINE_EXECUTOR_ENV];
    expect(offlineExecutorMode()).toBeNull();
    expect(offlineHooks()).toBeNull();
  });

  it("refuses an unknown mode instead of ignoring it", () => {
    process.env[OFFLINE_EXECUTOR_ENV] = "onnxruntime";
    expect(() => offlineExecutorMode()).toThrow(OfflineExecutorError);
  });

  it("refuses to run when opted in but nothing was installed", () => {
    process.env[OFFLINE_EXECUTOR_ENV] = "ort";
    // No implementation imported: the entry point forgot to wire it. The failure
    // this must never be is a quiet `null`.
    expect(() => offlineHooks()).toThrow(/no offline executor was installed/);
  });

  it("hands back what was installed, and only while opted in", () => {
    const hooks = {
      executor: () => {
        throw new Error("not called");
      },
    };
    installOfflineHooks(hooks);
    process.env[OFFLINE_EXECUTOR_ENV] = "ort";
    expect(offlineHooks()).toBe(hooks);
    // Installing an implementation is not opting in: the env flag alone decides,
    // so an entry point may import the module unconditionally.
    delete process.env[OFFLINE_EXECUTOR_ENV];
    expect(offlineHooks()).toBeNull();
  });
});
