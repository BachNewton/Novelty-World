// ---------------------------------------------------------------------------
// The OFFLINE executor: onnxruntime-node, on the shipped graph.
//
// Importing this module installs it (when `PPO_EXECUTOR=ort` is set); importing
// it otherwise does nothing at all and touches no native code. It is imported by
// the eval entry points ONLY — `bots/eval/worker.ts` and the sim CLIs — so
// `onnxruntime-node` is unreachable from anything a browser build can see.
//
// WHY. The shipped interpreter runs this graph at ~18 ms per decision; ORT runs
// it at ~1 ms. A full `sim:ratings` refresh is tens of thousands of games, i.e.
// hours of pure `run()`. Nothing about the bot changes — only who multiplies the
// matrices, and only when a human explicitly asked for it.
//
// ---------------------------------------------------------------------------
// HOW CLOSE THIS IS TO THE SHIPPED BOT — MEASURED, AND NOT EXACT
//
// SAME WEIGHTS. There is one artifact and this reads it: the bundles ship as
// float32, exactly as the rig exported them, so there is no substitute graph and
// nothing to prove about one. (A float16 bundle was tried and REJECTED — it
// diverged from the trained policy on 1 decision in 158 in live play. It would
// also have split this executor from the shipped one, since ORT's f16 CPU kernels
// round each op's output back to half while the interpreter upcasts f16
// initializers and accumulates in fp32. Re-introducing a narrowed bundle brings
// both problems back.)
//
// DIFFERENT SUMMATION ORDER, and that is not free. ORT blocks and vectorises its
// matmuls; the shipped interpreter unrolls by four; fp32 addition is not
// associative. Over the 400 recorded parity cases the two agree to 4.2e-5 with
// ZERO decisive argmax flips — but `landon-exploiter-v1` shows 2/400 RAW flips on
// `trade_cand_logits`, both inside the tie margin. A game reaches those ties: on
// the four default seeds, all four traces FORK (first divergence at intent
// 112-338). An earlier note here claimed byte-identical streams; it does not
// reproduce, and this replaces it.
//
// So an Elo produced under this executor is the ladder's number for a player that
// picks a different NEAR-EQUIVALENT trade offer a fraction of a percent of the
// time — fine against 400-game pairings with SE ~2.5pp, and not a replay tool.
// Anything that must reproduce one specific game runs the shipped interpreter.
//
// `eval/ort-check-cli.ts` is how the above was measured, and how it is
// re-measured whenever a bundle changes.
// ---------------------------------------------------------------------------

import { nodeBuiltins } from "./bundle";
import { OfflineExecutorError, installOfflineHooks, offlineExecutorMode } from "./offline";
import type { ExecTensor, SyncExecutor } from "./session";

/** ORT's own thread count per session. ONE by default: the eval harness already
 *  saturates the machine with worker threads (`eval/parallel.ts`), and a
 *  multi-threaded session inside each of them oversubscribes every core. */
const ORT_THREADS_ENV = "PPO_ORT_THREADS";

// ---------------------------------------------------------------------------
// The native binding
//
// `onnxruntime-node`'s public `InferenceSession.run()` returns a Promise, and a
// `Bot` is synchronous — that is the constraint that put the pure-TS interpreter
// on the shipped path in the first place. But the promise is cosmetic: the
// package's own wrapper is `new Promise(resolve => setImmediate(() =>
// resolve(binding.run(...))))` over a NAPI call that is already synchronous
// ("Binding exports a simple synchronized inference session object wrap").
//
// So the offline path calls that same synchronous binding directly. It costs no
// worker thread, no SharedArrayBuffer and no `Atomics.wait` round trip, and it
// runs exactly the code the public wrapper would have run. The price is a
// dependency on a package-internal path, which fails LOUDLY (module not found)
// rather than subtly if a future ORT rearranges its files.
// ---------------------------------------------------------------------------

interface OrtValueMetadata {
  readonly name: string;
  readonly type: number;
  readonly shape: readonly number[];
}

interface OrtTensor {
  readonly type: string;
  readonly dims: readonly number[];
  readonly data: unknown;
}

interface OrtBindingSession {
  loadModel(buffer: ArrayBuffer, byteOffset: number, byteLength: number, options: Record<string, unknown>): void;
  readonly inputMetadata: readonly OrtValueMetadata[];
  readonly outputMetadata: readonly OrtValueMetadata[];
  run(
    feeds: Record<string, OrtTensor>,
    fetches: Record<string, null>,
    options: Record<string, unknown>,
  ): Record<string, OrtTensor>;
  dispose(): void;
}

type OrtTensorCtor = new (type: string, data: ArrayLike<number>, dims: readonly number[]) => OrtTensor;

interface OrtBinding {
  readonly binding: { readonly InferenceSession: new () => OrtBindingSession };
  initOrt(): void;
}

interface OrtRuntime {
  readonly Session: new () => OrtBindingSession;
  readonly Tensor: OrtTensorCtor;
}

let runtime: OrtRuntime | null = null;

/** Resolve `onnxruntime-node` at call time, so a process that never opts in never
 *  loads a ~200 MB native package — and so a build tool never sees an import
 *  specifier it would try to bundle. */
function ortRuntime(): OrtRuntime {
  if (runtime !== null) return runtime;
  const builtins = nodeBuiltins();
  if (builtins === null) {
    throw new OfflineExecutorError("the ORT offline executor requires Node");
  }
  // Not named `require`: a bundler that recognised the identifier would try to
  // resolve the specifiers below at build time, which is the one thing this whole
  // module is arranged to avoid.
  const nodeRequire = process.getBuiltinModule("node:module").createRequire(import.meta.url);
  let mod: OrtBinding;
  let tensor: OrtTensorCtor;
  try {
    mod = nodeRequire("onnxruntime-node/dist/binding.js") as OrtBinding;
    tensor = (nodeRequire("onnxruntime-node") as { Tensor: OrtTensorCtor }).Tensor;
  } catch (err) {
    throw new OfflineExecutorError(
      `PPO_EXECUTOR=ort needs onnxruntime-node, which is not installed. It is deliberately NOT a ` +
        `package.json dependency (a large native package, used only for offline evaluation): ` +
        `install it locally with \`npm i --no-save onnxruntime-node\`. Underlying error: ${String(err)}`,
    );
  }
  mod.initOrt();
  runtime = { Session: mod.binding.InferenceSession, Tensor: tensor };
  return runtime;
}

/** ONNX TensorProto element types, for the few this graph can carry. Anything
 *  else is refused rather than guessed at. */
const ELEMENT_TYPES: Readonly<Record<number, string | undefined>> = {
  1: "float32",
  2: "uint8",
  9: "bool",
};

function ortDType(type: number, what: string): string {
  const name = ELEMENT_TYPES[type];
  if (name === undefined) {
    throw new OfflineExecutorError(`${what}: unsupported ONNX element type ${String(type)}`);
  }
  return name;
}

/** Our plain-data tensor as the typed array ORT wants for that dtype. Copies only
 *  when the caller did not already hand over the right view. */
function ortData(t: ExecTensor, name: string): ArrayLike<number> {
  if (t.dtype === "float32") {
    return t.data instanceof Float32Array ? t.data : Float32Array.from(t.data);
  }
  if (t.dtype === "uint8" || t.dtype === "bool") {
    return t.data instanceof Uint8Array ? t.data : Uint8Array.from(t.data);
  }
  throw new OfflineExecutorError(`input "${name}": the ORT executor cannot feed dtype ${t.dtype}`);
}

function outData(t: OrtTensor, name: string): ArrayLike<number> {
  const data = t.data;
  if (data instanceof Float32Array || data instanceof Uint8Array || data instanceof Int32Array || data instanceof Float64Array) {
    return data;
  }
  throw new OfflineExecutorError(`output "${name}": the ORT executor cannot read dtype ${t.type}`);
}

/** A loaded graph, run through the synchronous native binding. */
export function ortExecutor(graph: Uint8Array): SyncExecutor {
  const ort = ortRuntime();
  const session = new ort.Session();
  const threads = Number(process.env[ORT_THREADS_ENV] ?? "1");
  if (!Number.isInteger(threads) || threads < 1) {
    throw new OfflineExecutorError(`${ORT_THREADS_ENV}=${String(process.env[ORT_THREADS_ENV])} must be a positive integer`);
  }
  // A fresh ArrayBuffer: `graph` is a view, and `loadModel` is given an offset
  // into whatever buffer it is handed.
  const buffer = graph.buffer.slice(graph.byteOffset, graph.byteOffset + graph.byteLength) as ArrayBuffer;
  session.loadModel(buffer, 0, buffer.byteLength, {
    intraOpNumThreads: threads,
    interOpNumThreads: threads,
  });

  const inputNames = session.inputMetadata.map((m) => m.name);
  const outputNames = session.outputMetadata.map((m) => m.name);
  const inputType = new Map(session.inputMetadata.map((m) => [m.name, ortDType(m.type, `input "${m.name}"`)]));
  // The fetch set is fixed for the life of the session — every output, every run
  // — so it is built once rather than per decision.
  const fetches: Record<string, null> = {};
  for (const name of outputNames) fetches[name] = null;

  return {
    inputNames,
    outputNames,
    run(feeds) {
      const native: Record<string, OrtTensor> = {};
      for (const name of Object.keys(feeds)) {
        const t = feeds[name];
        const declared = inputType.get(name);
        if (declared === undefined) {
          throw new OfflineExecutorError(`input "${name}" is not one of the graph's inputs [${inputNames.join(", ")}]`);
        }
        // The graph's own declared dtype wins over the manifest's: `present` is a
        // uint8 lane the feed builder may hand over as either.
        native[name] = new ort.Tensor(declared, ortData({ ...t, dtype: declared }, name), t.dims);
      }
      const out = session.run(native, fetches, {});
      const result: Record<string, ExecTensor> = {};
      for (const name of Object.keys(out)) {
        const t = out[name];
        result[name] = { dims: t.dims, dtype: t.type, data: outData(t, name) };
      }
      return result;
    },
  };
}

// Self-install, but only when asked. An entry point imports this module
// unconditionally; the flag is what decides whether anything changes.
if (offlineExecutorMode() === "ort") {
  installOfflineHooks({ executor: ortExecutor });
}
