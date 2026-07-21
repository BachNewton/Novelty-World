import * as tf from "@tensorflow/tfjs-node";
import { FEATURE_COUNT, MAX_SEATS } from "./features";
import { ACTION_COUNT } from "./actions";

// ---------------------------------------------------------------------------
// Phase 4 of the learned-bot path (RL-DESIGN.md §3.3 / §5 step 4): the NETWORK
// + batched inference. An all-TypeScript policy + value net on tfjs-node (CPU by
// default; tfjs-node-gpu is a drop-in later). It reads `encode(state, me)`
// (`features.ts`) and emits two heads:
//   - POLICY: a probability over the fixed atomic vocabulary (`actions.ts`,
//     ACTION_COUNT). Softmax over ALL tokens; the caller MASKS to legal tokens and
//     renormalizes (`maskPolicy`). Illegal tokens carry target 0 in training, so
//     the net learns to starve them — masking at inference just enforces it.
//   - VALUE: a softmax win-probability vector over the MAX_SEATS seat-relative
//     players (slot 0 = the player to move). This handles N-player credit (not a
//     2-player scalar); MCTS backup reads each node's acting-player component.
//
// BATCHED INFERENCE IS THE LOAD-BEARING REQUIREMENT: a search calls the net
// thousands of times per move, so `predict` takes a BATCH of encodings and runs
// ONE forward pass. Everything is wrapped in `tf.tidy` so intermediate tensors
// are freed (no GPU/CPU memory leak across a long self-play run).
//
// PURITY NOTE: the net is the ONE stateful, non-deterministic-by-construction
// piece (its weights change as it trains). Determinism of a PLAYED move is
// restored at the search layer (MCTS seeds its RNG from `state.rngState` and plays
// greedily at inference), so a fixed net + state still yields a fixed move.
// ---------------------------------------------------------------------------

/** Hidden-layer widths of the shared trunk (a small MLP). Tunable; wider/deeper
 *  trades inference speed for capacity. */
const DEFAULT_HIDDEN: readonly number[] = [256, 256];

/** One net evaluation: the (unmasked) policy probabilities over the vocabulary
 *  and the per-seat win-probability vector. */
export interface Prediction {
  /** Softmax over the full action vocabulary (length `ACTION_COUNT`). */
  policy: Float32Array;
  /** Softmax win-probabilities over seat-relative players (length `MAX_SEATS`). */
  value: Float32Array;
}

/** One training example: an encoded state, the MCTS visit distribution as the
 *  policy target (length `ACTION_COUNT`, sums to 1 over legal tokens), and the
 *  seat-relative outcome as the value target (length `MAX_SEATS`, one-hot on the
 *  winning slot from this state's mover's point of view). */
export interface TrainSample {
  encoding: Float32Array;
  policyTarget: Float32Array;
  valueTarget: Float32Array;
}

/** Build the functional model: shared MLP trunk → softmax policy head + softmax
 *  value head. Both heads use softmax so the natural loss is categorical
 *  cross-entropy against the visit distribution / outcome one-hot. */
function buildModel(hidden: readonly number[], learningRate: number): tf.LayersModel {
  const input = tf.input({ shape: [FEATURE_COUNT] });
  let trunk: tf.SymbolicTensor = input;
  hidden.forEach((units, i) => {
    trunk = tf.layers
      .dense({ units, activation: "relu", name: `trunk${i}` })
      .apply(trunk) as tf.SymbolicTensor;
  });
  const policy = tf.layers
    .dense({ units: ACTION_COUNT, activation: "softmax", name: "policy" })
    .apply(trunk) as tf.SymbolicTensor;
  const value = tf.layers
    .dense({ units: MAX_SEATS, activation: "softmax", name: "value" })
    .apply(trunk) as tf.SymbolicTensor;
  const model = tf.model({ inputs: input, outputs: [policy, value] });
  model.compile({
    optimizer: tf.train.adam(learningRate),
    loss: { policy: "categoricalCrossentropy", value: "categoricalCrossentropy" },
  });
  return model;
}

/** The policy + value network. Wraps a tfjs `LayersModel` with batched inference,
 *  a training step, and disk save/load — the only stateful piece of the learner. */
export class MonoNet {
  private constructor(private readonly model: tf.LayersModel) {}

  /** A fresh, randomly-initialized net. */
  static create(opts?: { hidden?: readonly number[]; learningRate?: number }): MonoNet {
    return new MonoNet(
      buildModel(opts?.hidden ?? DEFAULT_HIDDEN, opts?.learningRate ?? 1e-3),
    );
  }

  /** Load a net previously written by `save`. Recompiles for further training. */
  static async load(dir: string, learningRate = 1e-3): Promise<MonoNet> {
    const model = await tf.loadLayersModel(`file://${dir}/model.json`);
    model.compile({
      optimizer: tf.train.adam(learningRate),
      loss: { policy: "categoricalCrossentropy", value: "categoricalCrossentropy" },
    });
    return new MonoNet(model);
  }

  /** Persist the net to `dir` (writes `model.json` + weights). */
  async save(dir: string): Promise<void> {
    await this.model.save(`file://${dir}`);
  }

  /** Free the underlying tfjs model + its weight tensors. Needed when a long-lived
   *  worker RELOADS the net each training iteration (the weights change on disk) —
   *  without this the old model's tensors leak across reloads. */
  dispose(): void {
    this.model.dispose();
  }

  /** Run ONE batched forward pass over `encodings`. Returns one `Prediction` per
   *  input, in order. All tensors are freed via `tf.tidy`. */
  predict(encodings: readonly Float32Array[]): Prediction[] {
    if (encodings.length === 0) return [];
    const flat = new Float32Array(encodings.length * FEATURE_COUNT);
    encodings.forEach((e, i) => flat.set(e, i * FEATURE_COUNT));
    const x = tf.tensor2d(flat, [encodings.length, FEATURE_COUNT]);
    const [policyT, valueT] = this.model.predict(x) as tf.Tensor[];
    // dataSync copies to a host typed array, so the tensors are safe to dispose.
    const policy = policyT.dataSync() as Float32Array;
    const value = valueT.dataSync() as Float32Array;
    tf.dispose([x, policyT, valueT]);
    const out: Prediction[] = [];
    for (let i = 0; i < encodings.length; i++) {
      out.push({
        policy: policy.slice(i * ACTION_COUNT, (i + 1) * ACTION_COUNT),
        value: value.slice(i * MAX_SEATS, (i + 1) * MAX_SEATS),
      });
    }
    return out;
  }

  /** One gradient step over a batch of samples. Returns the mean total loss. */
  async train(samples: readonly TrainSample[], batchSize = 256): Promise<number> {
    if (samples.length === 0) return 0;
    const xs = new Float32Array(samples.length * FEATURE_COUNT);
    const ps = new Float32Array(samples.length * ACTION_COUNT);
    const vs = new Float32Array(samples.length * MAX_SEATS);
    samples.forEach((s, i) => {
      xs.set(s.encoding, i * FEATURE_COUNT);
      ps.set(s.policyTarget, i * ACTION_COUNT);
      vs.set(s.valueTarget, i * MAX_SEATS);
    });
    const x = tf.tensor2d(xs, [samples.length, FEATURE_COUNT]);
    const pT = tf.tensor2d(ps, [samples.length, ACTION_COUNT]);
    const vT = tf.tensor2d(vs, [samples.length, MAX_SEATS]);
    const history = await this.model.fit(x, { policy: pT, value: vT }, {
      batchSize: Math.min(batchSize, samples.length),
      epochs: 1,
      shuffle: true,
      verbose: 0,
    });
    tf.dispose([x, pT, vT]);
    const loss = history.history.loss;
    const last = loss[loss.length - 1];
    return typeof last === "number" ? last : 0;
  }
}

/** Apply a legality mask to a raw policy vector and renormalize over the legal
 *  tokens — the inference-time enforcement of the mask. If (degenerately) no legal
 *  token has positive probability, fall back to a UNIFORM distribution over the
 *  legal tokens so search always has a usable prior. */
export function maskPolicy(policy: Float32Array, legalTokens: readonly number[]): Float32Array {
  const out = new Float32Array(policy.length);
  let sum = 0;
  for (const t of legalTokens) {
    out[t] = policy[t];
    sum += policy[t];
  }
  if (sum > 0) {
    for (const t of legalTokens) out[t] /= sum;
  } else if (legalTokens.length > 0) {
    const u = 1 / legalTokens.length;
    for (const t of legalTokens) out[t] = u;
  }
  return out;
}
