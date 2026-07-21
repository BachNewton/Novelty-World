import * as tf from "@tensorflow/tfjs-node";

// tfjs-node@4.22 calls `util.isNullOrUndefined`, a Node API removed in Node 24, so
// every tensor op throws there even though the module still imports cleanly. This
// probes one trivial op at load time so the RL test suites can skip (rather than
// hard-fail) on a backend where tf can't run, while still running wherever it can
// (Node <= 22, Linux CI). Gate suites with `describe.skipIf(!tfjsUsable)(...)`.
export const tfjsUsable: boolean = (() => {
  try {
    tf.tidy(() => tf.tensor1d([1]).slice(0, 1).dataSync());
    return true;
  } catch {
    return false;
  }
})();
