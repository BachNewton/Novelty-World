// ---------------------------------------------------------------------------
// `SyncOnnxSession` — load an ONNX graph and execute it SYNCHRONOUSLY.
//
// WHY THIS EXISTS AT ALL. Every onnxruntime JavaScript backend (`onnxruntime-node`,
// `-web`, `-react-native`) returns a Promise from `session.run()`, because all of
// them are wrappers over an async boundary: a native thread pool, a WASM worker,
// or a WebGL/WebGPU command queue. A caller whose own contract is synchronous
// therefore cannot use onnxruntime AT ALL — not with a spin-wait, not with
// Atomics.wait (which cannot run on the main thread), not by pre-resolving
// (the answer depends on the argument). The only way to satisfy a synchronous
// caller is to own the forward pass. Loading stays async-friendly: `load()` takes
// bytes the caller already fetched, so all the I/O lives outside.
//
// THE DESIGN CONSEQUENCE OF "SYNCHRONOUS AND CALLED CONSTANTLY". `run()` is on a
// hot path, so everything that can be decided once is decided at load:
//
//   - the execution ORDER is topologically sorted once, not rediscovered;
//   - initializers are resolved to their slot in the value table once;
//   - CONSTANT FOLDING evaluates, at load, every node whose inputs are all
//     initializers or already-folded constants — torch's exporter emits
//     `Shape` → `Concat` → `Expand` chains to make broadcasts explicit, and
//     whichever links of those do not depend on a runtime shape collapse here;
//   - WEIGHT PRE-PACKING transposes, once, every constant `Gemm` operand whose
//     node sets `transA`/`transB`. Torch emits `transB=1` for every `nn.Linear`,
//     so leaving it alone re-transposes the whole weight set on every call —
//     for this graph more float copies than some of the matmuls they feed;
//   - intermediate buffers come from a POOL keyed by dtype and length, and are
//     returned to it when their last consumer has run, so a warmed session
//     allocates nothing per call.
//
// The pool is why outputs are COPIED on the way out. A pooled buffer handed to
// the caller would be recycled into somebody else's scratch on the next `run()`,
// and the resulting corruption would be intermittent and shape-dependent — the
// worst possible failure mode for a numerical component.
// ---------------------------------------------------------------------------

import { KERNELS, KNOWN_UNIMPLEMENTED, type Allocator, type Kernel, type OpContext } from "./ops";
import { parseModel, type AttributeValue, type OnnxModel, type OnnxNode } from "./model";
import { Tensor, allocData, type DType, type TensorData } from "./tensor";

export interface SessionOptions {
  /** Fold nodes whose inputs are all constant at load. On by default; the
   *  switch exists so a parity test can prove folding changes no numbers. */
  constantFold?: boolean;
  /** Reuse intermediate buffers across calls. On by default; off makes a
   *  suspected aliasing bug reproducible in isolation. */
  poolBuffers?: boolean;
}

/** A graph input or output, as declared by the model. */
export interface IoSpec {
  name: string;
  dtype: DType | undefined;
  /** `undefined` entries are SYMBOLIC (`batch`). A caller assembling feeds must
   *  supply its own value for those and match the rest exactly. */
  dims: (number | undefined)[];
}

/** One node, pre-resolved into integer slots in the value table. Names are gone
 *  by execution time — a string hash per input per call is pure overhead. */
interface Step {
  kernel: Kernel;
  opType: string;
  label: string;
  /** A COPY of the node's attributes, so load-time rewrites (weight pre-packing
   *  flipping `transB` off) cannot leak back into the parsed model. */
  attrs: Map<string, AttributeValue>;
  /** `-1` marks an omitted optional input. */
  inputSlots: number[];
  outputSlots: number[];
  /** Slots whose last consumer is this step, returnable to the pool after it. */
  freeAfter: number[];
}

/**
 * A free-list of typed arrays keyed by `dtype:length`.
 *
 * Exact-length keying rather than a size-class scheme is deliberate: a graph
 * runs the same shapes every call, so the exact-match hit rate is ~100% after
 * one warmup, and size classes would only add slack memory and a search.
 */
class BufferPool implements Allocator {
  private readonly free = new Map<string, TensorData[]>();
  private readonly live: { key: string; buf: TensorData }[] = [];
  enabled = true;

  alloc(dtype: DType, size: number): TensorData {
    if (!this.enabled) return allocData(dtype, size);
    const key = `${dtype}:${size}`;
    const bucket = this.free.get(key);
    const reused = bucket?.pop();
    // A reused buffer must come back ZEROED: `Gemm` and every `Reduce*`
    // accumulate into their output, so stale contents would be added to the
    // result — a bug that only shows up on the SECOND call.
    if (reused !== undefined) {
      reused.fill(0);
      this.live.push({ key, buf: reused });
      return reused;
    }
    const fresh = allocData(dtype, size);
    this.live.push({ key, buf: fresh });
    return fresh;
  }

  /** Hand every buffer allocated since the last reset back to the free list. */
  reset(): void {
    for (const { key, buf } of this.live) {
      let bucket = this.free.get(key);
      if (bucket === undefined) {
        bucket = [];
        this.free.set(key, bucket);
      }
      bucket.push(buf);
    }
    this.live.length = 0;
  }
}

export class SyncOnnxSession {
  readonly inputs: readonly IoSpec[];
  readonly outputs: readonly IoSpec[];
  /** Opset version of the default ONNX domain — the number every kernel
   *  branches on. */
  readonly opset: number;
  readonly producerName: string;

  private readonly steps: readonly Step[];
  /** The value table: one slot per distinct tensor name in the graph. Slots for
   *  initializers and folded constants are populated at load and never cleared. */
  private readonly values: (Tensor | undefined)[];
  private readonly constant: boolean[];
  private readonly slotOf: ReadonlyMap<string, number>;
  private readonly inputSlots: readonly number[];
  private readonly outputSlots: readonly number[];
  private readonly pool: BufferPool;
  /** Number of nodes evaluated at load. Reported so a change in graph shape
   *  that silently disables folding is visible rather than merely slower. */
  readonly foldedNodeCount: number;
  /** Weight matrices transposed at load so `Gemm` need not do it per call. */
  readonly prepackedWeightCount: number;

  private constructor(init: {
    inputs: IoSpec[];
    outputs: IoSpec[];
    opset: number;
    producerName: string;
    steps: Step[];
    values: (Tensor | undefined)[];
    constant: boolean[];
    slotOf: Map<string, number>;
    inputSlots: number[];
    outputSlots: number[];
    pool: BufferPool;
    foldedNodeCount: number;
    prepackedWeightCount: number;
  }) {
    this.inputs = init.inputs;
    this.outputs = init.outputs;
    this.opset = init.opset;
    this.producerName = init.producerName;
    this.steps = init.steps;
    this.values = init.values;
    this.constant = init.constant;
    this.slotOf = init.slotOf;
    this.inputSlots = init.inputSlots;
    this.outputSlots = init.outputSlots;
    this.pool = init.pool;
    this.foldedNodeCount = init.foldedNodeCount;
    this.prepackedWeightCount = init.prepackedWeightCount;
  }

  get inputNames(): string[] {
    return this.inputs.map((i) => i.name);
  }

  get outputNames(): string[] {
    return this.outputs.map((o) => o.name);
  }

  /**
   * Parse, validate, plan and pre-execute. Everything that can fail on a model
   * fails HERE, loudly, naming the node — never mid-`run()` and never as a
   * quietly wrong number.
   */
  static load(bytes: Uint8Array, options: SessionOptions = {}): SyncOnnxSession {
    return SyncOnnxSession.fromModel(parseModel(bytes), options);
  }

  /**
   * Plan a session from an ALREADY-PARSED model.
   *
   * Splitting parse from plan is what makes weight surgery possible without a
   * re-serialise: an `OnnxModel` is plain mutable data, so a caller can perturb
   * an initializer, rewire a node's inputs, or swap a weight for a quantised
   * one and then plan the result. Mutation testing depends on this — a parity
   * pass means nothing unless you can also show the same comparison FAILS on a
   * deliberately broken graph, and byte-patching a protobuf to get there is
   * both fragile and untestable in itself.
   */
  static fromModel(model: OnnxModel, options: SessionOptions = {}): SyncOnnxSession {
    const graph = model.graph;
    const opset = model.opsetImports.get("") ?? 0;

    // A non-default domain means custom ops whose semantics we cannot know.
    for (const [domain, version] of model.opsetImports) {
      if (domain !== "" && domain !== "ai.onnx" && domain !== "ai.onnx.ml") {
        throw new Error(`onnx: model imports operator domain "${domain}" (v${version}), which this executor cannot run`);
      }
    }

    // --- resolve every tensor name to a slot -------------------------------
    const slotOf = new Map<string, number>();
    const slotName: string[] = [];
    const slot = (name: string): number => {
      const existing = slotOf.get(name);
      if (existing !== undefined) return existing;
      const id = slotName.length;
      slotOf.set(name, id);
      slotName.push(name);
      return id;
    };

    const values: (Tensor | undefined)[] = [];
    const constant: boolean[] = [];
    /** Grow the parallel value/constant arrays to cover `id`. */
    const ensureSlot = (id: number): void => {
      while (values.length <= id) {
        values.push(undefined);
        constant.push(false);
      }
    };

    for (let i = 0; i < graph.initializers.length; i++) {
      const id = slot(graph.initializerNames[i]);
      ensureSlot(id);
      values[id] = graph.initializers[i];
      constant[id] = true;
    }

    // Graph inputs that ALSO appear as initializers are optional-with-default
    // (IR ≤ 3 style); they are constants, not feeds, and listing them as inputs
    // would make the caller responsible for weights.
    const initializerNames = new Set(graph.initializerNames);
    const inputSpecs: IoSpec[] = graph.inputs
      .filter((v) => !initializerNames.has(v.name))
      .map((v) => ({ name: v.name, dtype: v.dtype, dims: v.dims }));
    const outputSpecs: IoSpec[] = graph.outputs.map((v) => ({ name: v.name, dtype: v.dtype, dims: v.dims }));

    const inputSlotIds = inputSpecs.map((s) => slot(s.name));
    for (const id of inputSlotIds) ensureSlot(id);

    // --- validate ops before planning --------------------------------------
    for (const node of graph.nodes) {
      if (node.domain !== "" && node.domain !== "ai.onnx") {
        throw new Error(
          `onnx: node "${nodeLabel(node)}" is in domain "${node.domain}"; only the default ONNX domain is supported`,
        );
      }
      if (!KERNELS.has(node.opType)) {
        const why = KNOWN_UNIMPLEMENTED.get(node.opType);
        throw new Error(
          why === undefined
            ? `onnx: unsupported operator "${node.opType}" (node "${nodeLabel(node)}"). ` +
              `This executor implements a fixed op set; add a kernel for it in ops.ts.`
            : `onnx: unsupported operator "${node.opType}" (node "${nodeLabel(node)}") — ${why} is out of scope ` +
              `for this executor. Re-export the model without it, or run it on onnxruntime.`,
        );
      }
    }

    // --- topological sort ---------------------------------------------------
    const order = topoSort(graph.nodes, initializerNames, new Set(inputSpecs.map((s) => s.name)));

    // --- build steps --------------------------------------------------------
    const steps: Step[] = [];
    for (const node of order) {
      const kernel = KERNELS.get(node.opType);
      if (kernel === undefined) throw new Error(`onnx: kernel vanished for ${node.opType}`);
      // An empty input name is an explicitly OMITTED optional input and must
      // keep its position — collapsing it shifts every later input by one.
      const inputSlots = node.inputs.map((n) => (n === "" ? -1 : slot(n)));
      const outputSlots = node.outputs.map((n) => (n === "" ? -1 : slot(n)));
      for (const id of inputSlots) if (id >= 0) ensureSlot(id);
      for (const id of outputSlots) if (id >= 0) ensureSlot(id);
      steps.push({
        kernel,
        opType: node.opType,
        label: nodeLabel(node),
        attrs: new Map(node.attributes),
        inputSlots,
        outputSlots,
        freeAfter: [],
      });
    }

    // --- weight pre-packing -------------------------------------------------
    // `torch.onnx.export` emits every `nn.Linear` as `Gemm(x, W, b)` with
    // `transB=1`, because PyTorch stores W as [out, in] while Gemm wants
    // [in, out]. Left alone that transposes the weight matrix on EVERY call —
    // for this graph roughly 2.5M float copies per forward pass, more work than
    // some of the matmuls it feeds. Transposing once at load and clearing the
    // flag is exact (a permutation, no arithmetic) and removes it entirely.
    // Each rewrite gets a FRESH slot: the same initializer may feed several
    // nodes, not all of which transpose it.
    const prepacked: number[] = [];
    for (const step of steps) {
      if (step.opType !== "Gemm") continue;
      for (const [flag, position] of [["transA", 0], ["transB", 1]] as const) {
        const attr = step.attrs.get(flag);
        if (attr === undefined || attr.kind !== "int" || attr.value === 0) continue;
        const id = step.inputSlots[position];
        if (id < 0 || !constant[id]) continue;
        const source = values[id];
        if (source === undefined || source.rank !== 2) continue;
        const newId = slot(`${slotName[id]}__prepacked_${flag}`);
        ensureSlot(newId);
        values[newId] = transposeMatrix(source);
        constant[newId] = true;
        step.inputSlots[position] = newId;
        step.attrs.set(flag, { kind: "int", value: 0 });
        prepacked.push(newId);
      }
    }

    const pool = new BufferPool();
    pool.enabled = options.poolBuffers !== false;

    // --- constant folding ---------------------------------------------------
    // A node is foldable when every non-omitted input is already constant. The
    // sweep runs in topological order, so one pass propagates through a whole
    // Shape→Slice→Concat→Expand chain.
    let folded = 0;
    const live: Step[] = [];
    if (options.constantFold !== false) {
      for (const step of steps) {
        const foldable = step.inputSlots.every((id) => id < 0 || constant[id]);
        if (!foldable) {
          live.push(step);
          continue;
        }
        // Folded values persist for the session's lifetime, so they must NOT be
        // pool-allocated — the pool would hand their storage out again.
        const results = runStep(step, values, { alloc: allocData }, opset);
        for (let i = 0; i < step.outputSlots.length; i++) {
          const id = step.outputSlots[i];
          if (id < 0) continue;
          values[id] = results[i];
          constant[id] = true;
        }
        folded++;
      }
    } else {
      live.push(...steps);
    }

    // --- last-use analysis for the buffer pool ------------------------------
    // A slot may be released once the last step that reads it has run. Graph
    // outputs and constants are excluded: outputs are read after the loop, and
    // a constant's buffer is shared across calls.
    const outputSlotIds = outputSpecs.map((s) => slot(s.name));
    const isOutput = new Set(outputSlotIds);
    const lastUse = new Map<number, number>();
    for (let i = 0; i < live.length; i++) {
      for (const id of live[i].inputSlots) {
        if (id >= 0 && !constant[id] && !isOutput.has(id)) lastUse.set(id, i);
      }
    }
    for (const [id, at] of lastUse) live[at].freeAfter.push(id);

    // Every graph output must be produced by something.
    for (const spec of outputSpecs) {
      const id = slot(spec.name);
      const produced = live.some((s) => s.outputSlots.includes(id)) || constant[id];
      if (!produced) throw new Error(`onnx: graph output "${spec.name}" is never produced by any node`);
    }

    while (values.length < slotName.length) {
      values.push(undefined);
      constant.push(false);
    }

    return new SyncOnnxSession({
      inputs: inputSpecs,
      outputs: outputSpecs,
      opset,
      producerName: model.producerName,
      steps: live,
      values,
      constant,
      slotOf,
      inputSlots: inputSlotIds,
      outputSlots: outputSlotIds,
      pool,
      foldedNodeCount: folded,
      prepackedWeightCount: prepacked.length,
    });
  }

  /**
   * Execute the graph. Synchronous, allocation-light, and re-entrant-unsafe:
   * one session drives one call at a time, which is exactly what a synchronous
   * caller can produce.
   *
   * `feeds` is typed with `| undefined` values because that is the truth about
   * a JavaScript object lookup — this project does not enable
   * `noUncheckedIndexedAccess`, so a plain `Record<string, Tensor>` would let
   * the compiler insist a missing feed cannot happen while `run()` is handed
   * one. A `Record<string, Tensor>` still assigns to it.
   */
  run(feeds: Readonly<Record<string, Tensor | undefined>>): Record<string, Tensor> {
    const values = this.values;

    for (let i = 0; i < this.inputSlots.length; i++) {
      const spec = this.inputs[i];
      const fed = feeds[spec.name];
      if (fed === undefined) {
        throw new Error(`onnx: missing feed for input "${spec.name}" (expected ${describe(spec)})`);
      }
      checkFeed(spec, fed);
      values[this.inputSlots[i]] = fed;
    }

    for (const step of this.steps) {
      const results = runStep(step, values, this.pool, this.opset);
      for (let i = 0; i < step.outputSlots.length; i++) {
        const id = step.outputSlots[i];
        if (id >= 0) values[id] = results[i];
      }
      // Nothing is actually recycled until `pool.reset()`, so releasing here is
      // only a bookkeeping hint; clearing the slot is what makes a
      // use-after-free surface as a crash instead of stale numbers.
      for (const id of step.freeAfter) values[id] = undefined;
    }

    const out: Record<string, Tensor> = {};
    for (let i = 0; i < this.outputSlots.length; i++) {
      const t = values[this.outputSlots[i]];
      if (t === undefined) throw new Error(`onnx: output "${this.outputs[i].name}" was not produced`);
      // COPY: `t.data` is pool-owned and about to be recycled.
      out[this.outputs[i].name] = t.clone();
    }

    // Clear the non-constant slots so a second `run()` cannot read a stale
    // tensor if the graph ever leaves one unwritten.
    for (let i = 0; i < values.length; i++) if (!this.constant[i]) values[i] = undefined;
    this.pool.reset();
    return out;
  }

  /** Slot count — a cheap structural fingerprint for tests. */
  get valueCount(): number {
    return this.slotOf.size;
  }

  /** Nodes remaining in the per-call path after folding. */
  get stepCount(): number {
    return this.steps.length;
  }
}

function runStep(step: Step, values: (Tensor | undefined)[], alloc: Allocator, opset: number): Tensor[] {
  const inputs = step.inputSlots.map((id) => (id < 0 ? undefined : values[id]));
  for (let i = 0; i < inputs.length; i++) {
    // A required input that is missing means the plan is wrong, not the model —
    // fail with the node and position rather than deep inside a kernel.
    if (inputs[i] === undefined && step.inputSlots[i] >= 0) {
      throw new Error(`onnx: ${step.label} input ${i} was not produced before it was needed`);
    }
  }
  const ctx: OpContext = {
    inputs,
    attrs: step.attrs,
    opset,
    outputCount: step.outputSlots.length,
    alloc,
    label: step.label,
  };
  const results = step.kernel(ctx);
  if (results.length < step.outputSlots.filter((s) => s >= 0).length) {
    throw new Error(`onnx: ${step.label} produced ${results.length} outputs, expected ${step.outputSlots.length}`);
  }
  return results;
}

/** Transpose a 2-D tensor into a fresh buffer. Load-time only — a permutation
 *  of the same floats, so pre-packing cannot change a single output bit. */
function transposeMatrix(t: Tensor): Tensor {
  const [rows, cols] = t.dims;
  const data = allocData(t.dtype, t.size);
  const src = t.data;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) data[j * rows + i] = src[i * cols + j];
  }
  return new Tensor([cols, rows], t.dtype, data);
}

function nodeLabel(node: OnnxNode): string {
  return node.name === "" ? node.opType : `${node.opType}[${node.name}]`;
}

function describe(spec: IoSpec): string {
  const dims = spec.dims.map((d) => (d === undefined ? "?" : String(d))).join(",");
  return `${spec.dtype ?? "unknown"}[${dims}]`;
}

/**
 * Validate a feed against its declared spec.
 *
 * Rank and the STATIC dims are enforced; symbolic dims (`batch`) are not, since
 * choosing them is the caller's job. dtype is enforced with one exception:
 * `bool` and `uint8` share a Uint8Array, and exporters routinely declare one
 * and produce the other, so they are interchangeable at the boundary. Letting a
 * float32 tensor through as int64 would not be leniency, it would be a
 * reinterpretation of every byte.
 */
function checkFeed(spec: IoSpec, t: Tensor): void {
  if (spec.dtype !== undefined) {
    const compatible =
      t.dtype === spec.dtype ||
      (spec.dtype === "bool" && t.dtype === "uint8") ||
      (spec.dtype === "uint8" && t.dtype === "bool");
    if (!compatible) {
      throw new Error(`onnx: input "${spec.name}" expects ${spec.dtype}, got ${t.dtype}`);
    }
  }
  if (spec.dims.length !== t.rank) {
    throw new Error(
      `onnx: input "${spec.name}" expects rank ${spec.dims.length} (${describe(spec)}), got [${t.dims.join(",")}]`,
    );
  }
  for (let i = 0; i < spec.dims.length; i++) {
    const want = spec.dims[i];
    if (want !== undefined && want !== t.dims[i]) {
      throw new Error(
        `onnx: input "${spec.name}" axis ${i} expects ${want}, got ${t.dims[i]} (full shape [${t.dims.join(",")}])`,
      );
    }
  }
}

/**
 * Kahn's algorithm over the node graph.
 *
 * ONNX requires nodes to already be in topological order, and most exporters
 * comply — but graph-surgery tools (constant lifting, node insertion, subgraph
 * inlining) do not always, and a session that trusts the file order fails on
 * exactly those models with a confusing "input not produced" error deep in the
 * run. Sorting costs microseconds once and removes the whole class.
 *
 * A CYCLE is a corrupt model, and the error names the nodes still unresolved so
 * the offending loop is findable.
 */
function topoSort(
  nodes: readonly OnnxNode[],
  initializers: ReadonlySet<string>,
  graphInputs: ReadonlySet<string>,
): OnnxNode[] {
  const producer = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) {
    for (const out of nodes[i].outputs) if (out !== "") producer.set(out, i);
  }

  const pending = new Array<number>(nodes.length).fill(0);
  const dependents: number[][] = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    for (const input of nodes[i].inputs) {
      if (input === "" || initializers.has(input) || graphInputs.has(input)) continue;
      const from = producer.get(input);
      if (from === undefined) {
        throw new Error(
          `onnx: node "${nodeLabel(nodes[i])}" reads "${input}", which is neither a graph input, ` +
            `an initializer, nor the output of any node`,
        );
      }
      pending[i]++;
      dependents[from].push(i);
    }
  }

  const ready: number[] = [];
  for (let i = 0; i < nodes.length; i++) if (pending[i] === 0) ready.push(i);
  const order: OnnxNode[] = [];
  // FIFO rather than LIFO so that, for an already-sorted graph, the output order
  // matches the file order exactly — which keeps folding and last-use analysis
  // reproducible against what a reader sees in Netron.
  let head = 0;
  while (head < ready.length) {
    const i = ready[head++];
    order.push(nodes[i]);
    for (const d of dependents[i]) {
      pending[d]--;
      if (pending[d] === 0) ready.push(d);
    }
  }

  if (order.length !== nodes.length) {
    const stuck = nodes.filter((_, i) => pending[i] > 0).slice(0, 5).map(nodeLabel);
    throw new Error(`onnx: graph has a cycle; unresolved nodes include ${stuck.join(", ")}`);
  }
  return order;
}
