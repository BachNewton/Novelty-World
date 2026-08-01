// ---------------------------------------------------------------------------
// Executor-level behaviour, tested on SYNTHETIC graphs built in memory rather
// than on the trained bundles — these are properties of the planner, and they
// must hold for any model, including ones nobody has exported yet.
//
// Each graph here is assembled as an `OnnxModel` and handed to
// `SyncOnnxSession.fromModel`. That is the same seam the mutation tests use,
// and it keeps these cases readable: the interesting part of "an out-of-order
// graph still runs" is the graph, not a hand-rolled protobuf encoder.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { SyncOnnxSession } from "./session";
import type { AttributeValue, OnnxGraph, OnnxModel, OnnxNode } from "./model";
import { Tensor, tensorOf, type DType } from "./tensor";

function node(
  opType: string,
  inputs: string[],
  outputs: string[],
  attributes: Record<string, AttributeValue> = {},
  name = "",
): OnnxNode {
  return { name, opType, domain: "", inputs, outputs, attributes: new Map(Object.entries(attributes)) };
}

function model(init: {
  nodes: OnnxNode[];
  initializers?: Record<string, Tensor>;
  inputs?: { name: string; dtype: DType; dims: (number | undefined)[] }[];
  outputs: { name: string; dtype?: DType; dims?: (number | undefined)[] }[];
  opset?: number;
  domains?: Record<string, number>;
}): OnnxModel {
  const entries = Object.entries(init.initializers ?? {});
  const graph: OnnxGraph = {
    name: "test",
    nodes: init.nodes,
    initializers: entries.map(([, t]) => t),
    initializerNames: entries.map(([n]) => n),
    inputs: (init.inputs ?? []).map((i) => ({ name: i.name, dtype: i.dtype, dims: i.dims })),
    outputs: init.outputs.map((o) => ({ name: o.name, dtype: o.dtype, dims: o.dims ?? [] })),
  };
  const opsetImports = new Map<string, number>([["", init.opset ?? 18]]);
  for (const [d, v] of Object.entries(init.domains ?? {})) opsetImports.set(d, v);
  return { irVersion: 10, producerName: "test", graph, opsetImports };
}

/** y = (x + b) * 2, as three nodes deliberately listed OUT of topological order. */
function scrambledGraph(): OnnxModel {
  return model({
    nodes: [
      node("Mul", ["sum", "two"], ["y"], {}, "scale"),
      node("Add", ["x", "b"], ["sum"], {}, "bias"),
    ],
    initializers: { b: tensorOf([3], [10, 20, 30]), two: tensorOf([], [2]) },
    inputs: [{ name: "x", dtype: "float32", dims: [3] }],
    outputs: [{ name: "y", dtype: "float32", dims: [3] }],
  });
}

describe("SyncOnnxSession planning", () => {
  it("runs a graph whose nodes are listed out of topological order", () => {
    // ONNX requires topological order and most exporters comply, but graph
    // surgery tools do not always. Sorting costs microseconds once and removes
    // a whole class of "input not produced" failures deep in the run.
    const session = SyncOnnxSession.fromModel(scrambledGraph());
    const out = session.run({ x: tensorOf([3], [1, 2, 3]) });
    expect(Array.from(out.y.data)).toEqual([22, 44, 66]);
  });

  it("exposes declared input and output specs, symbolic dims included", () => {
    const session = SyncOnnxSession.fromModel(
      model({
        nodes: [node("Identity", ["x"], ["y"])],
        inputs: [{ name: "x", dtype: "float32", dims: [undefined, 4] }],
        outputs: [{ name: "y", dtype: "float32", dims: [undefined, 4] }],
      }),
    );
    expect(session.inputNames).toEqual(["x"]);
    expect(session.outputNames).toEqual(["y"]);
    // A symbolic batch axis stays `undefined` — the caller chooses it, so the
    // session must not pretend to know it.
    expect(session.inputs[0].dims).toEqual([undefined, 4]);
    expect(session.inputs[0].dtype).toBe("float32");
  });

  it("folds nodes whose inputs are entirely constant", () => {
    // `Shape` of an initializer, then arithmetic on it: all constant, so none
    // of it should survive into the per-call path.
    const folded = SyncOnnxSession.fromModel(
      model({
        nodes: [
          node("Shape", ["w"], ["shape"]),
          node("ReduceSum", ["shape"], ["total"], { keepdims: { kind: "int", value: 0 } }),
          node("Cast", ["total"], ["totalF"], { to: { kind: "int", value: 1 } }),
          node("Add", ["x", "totalF"], ["y"]),
        ],
        initializers: { w: tensorOf([2, 3], [0, 0, 0, 0, 0, 0]) },
        inputs: [{ name: "x", dtype: "float32", dims: [1] }],
        outputs: [{ name: "y", dtype: "float32", dims: [1] }],
      }),
    );
    expect(folded.foldedNodeCount).toBe(3);
    expect(folded.stepCount).toBe(1);
    expect(Array.from(folded.run({ x: tensorOf([1], [7]) }).y.data)).toEqual([12]);

    // Folding is an optimisation, so disabling it must change the step count
    // and nothing else.
    const plain = SyncOnnxSession.fromModel(
      model({
        nodes: [
          node("Shape", ["w"], ["shape"]),
          node("ReduceSum", ["shape"], ["total"], { keepdims: { kind: "int", value: 0 } }),
          node("Cast", ["total"], ["totalF"], { to: { kind: "int", value: 1 } }),
          node("Add", ["x", "totalF"], ["y"]),
        ],
        initializers: { w: tensorOf([2, 3], [0, 0, 0, 0, 0, 0]) },
        inputs: [{ name: "x", dtype: "float32", dims: [1] }],
        outputs: [{ name: "y", dtype: "float32", dims: [1] }],
      }),
      { constantFold: false },
    );
    expect(plain.foldedNodeCount).toBe(0);
    expect(plain.stepCount).toBe(4);
    expect(Array.from(plain.run({ x: tensorOf([1], [7]) }).y.data)).toEqual([12]);
  });

  it("pre-transposes a constant Gemm weight and clears the flag", () => {
    // A = [[1,2,3]], B stored as [out=2, in=3] with transB=1, bias [10,20].
    // Y = A @ B^T + bias = [1*1+2*2+3*3, 1*4+2*5+3*6] + [10,20] = [24, 52].
    const built = model({
      nodes: [
        node("Gemm", ["x", "w", "b"], ["y"], { transB: { kind: "int", value: 1 } }),
      ],
      initializers: {
        w: tensorOf([2, 3], [1, 2, 3, 4, 5, 6]),
        b: tensorOf([2], [10, 20]),
      },
      inputs: [{ name: "x", dtype: "float32", dims: [1, 3] }],
      outputs: [{ name: "y", dtype: "float32", dims: [1, 2] }],
    });
    const session = SyncOnnxSession.fromModel(built);
    expect(session.prepackedWeightCount).toBe(1);
    expect(Array.from(session.run({ x: tensorOf([1, 3], [1, 2, 3]) }).y.data)).toEqual([24, 52]);

    // The rewrite must not leak back into the parsed model — a caller planning
    // two sessions from one model would otherwise transpose it twice.
    expect(built.graph.nodes[0].attributes.get("transB")).toEqual({ kind: "int", value: 1 });
    expect(Array.from(built.graph.initializers[0].data)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("does not pre-transpose a Gemm weight that is a runtime input", () => {
    const session = SyncOnnxSession.fromModel(
      model({
        nodes: [node("Gemm", ["x", "w"], ["y"], { transB: { kind: "int", value: 1 } })],
        inputs: [
          { name: "x", dtype: "float32", dims: [1, 3] },
          { name: "w", dtype: "float32", dims: [2, 3] },
        ],
        outputs: [{ name: "y", dtype: "float32", dims: [1, 2] }],
      }),
    );
    expect(session.prepackedWeightCount).toBe(0);
    const out = session.run({ x: tensorOf([1, 3], [1, 2, 3]), w: tensorOf([2, 3], [1, 2, 3, 4, 5, 6]) });
    expect(Array.from(out.y.data)).toEqual([14, 32]);
  });

  it("gives the same answer on repeated calls despite buffer pooling", () => {
    // The pool hands the same arrays back every call. A kernel that accumulates
    // (`Gemm`, every `Reduce*`) into a buffer it did not zero would produce a
    // different answer the SECOND time — a failure invisible to a single run.
    const session = SyncOnnxSession.fromModel(
      model({
        nodes: [
          node("Gemm", ["x", "w"], ["h"], {}),
          node("ReduceSum", ["h"], ["y"], { keepdims: { kind: "int", value: 0 } }),
        ],
        initializers: { w: tensorOf([3, 2], [1, 2, 3, 4, 5, 6]) },
        inputs: [{ name: "x", dtype: "float32", dims: [1, 3] }],
        outputs: [{ name: "y", dtype: "float32", dims: [] }],
      }),
    );
    const feeds = { x: tensorOf([1, 3], [1, 1, 1]) };
    // h = [1+3+5, 2+4+6] = [9, 12]; sum = 21.
    for (let i = 0; i < 5; i++) {
      expect(Array.from(session.run(feeds).y.data), `call ${i + 1}`).toEqual([21]);
    }
  });

  it("returns outputs the caller can hold across later calls", () => {
    // Outputs are copied out of the pool on the way back. Without that, the
    // next `run()` recycles the buffer under the caller's feet.
    const session = SyncOnnxSession.fromModel(scrambledGraph());
    const first = session.run({ x: tensorOf([3], [1, 2, 3]) });
    session.run({ x: tensorOf([3], [100, 200, 300]) });
    expect(Array.from(first.y.data)).toEqual([22, 44, 66]);
  });

  it("rejects an unsupported operator at load, naming it", () => {
    expect(() =>
      SyncOnnxSession.fromModel(
        model({
          nodes: [node("Conv", ["x", "w"], ["y"], {}, "block1")],
          inputs: [{ name: "x", dtype: "float32", dims: [1] }],
          outputs: [{ name: "y" }],
        }),
      ),
      // Failing at LOAD with the op name is the whole contract: an executor
      // that skipped an op it did not know would emit confident wrong numbers.
    ).toThrow(/Conv\[block1\]/);
  });

  it("rejects an operator from a custom domain", () => {
    expect(() =>
      SyncOnnxSession.fromModel(
        model({
          nodes: [{ ...node("MyOp", ["x"], ["y"]), domain: "com.example" }],
          inputs: [{ name: "x", dtype: "float32", dims: [1] }],
          outputs: [{ name: "y" }],
          domains: { "com.example": 1 },
        }),
      ),
    ).toThrow(/com\.example/);
  });

  it("rejects a graph with a cycle", () => {
    expect(() =>
      SyncOnnxSession.fromModel(
        model({
          nodes: [node("Add", ["x", "b"], ["a"], {}, "n1"), node("Add", ["a", "x"], ["b"], {}, "n2")],
          inputs: [{ name: "x", dtype: "float32", dims: [1] }],
          outputs: [{ name: "b" }],
        }),
      ),
    ).toThrow(/cycle/);
  });

  it("rejects a node reading a value nothing produces", () => {
    expect(() =>
      SyncOnnxSession.fromModel(
        model({
          nodes: [node("Add", ["x", "ghost"], ["y"], {}, "n1")],
          inputs: [{ name: "x", dtype: "float32", dims: [1] }],
          outputs: [{ name: "y" }],
        }),
      ),
    ).toThrow(/ghost/);
  });

  it("rejects a missing feed, a wrong dtype and a wrong static dim", () => {
    const session = SyncOnnxSession.fromModel(
      model({
        nodes: [node("Identity", ["x"], ["y"])],
        inputs: [{ name: "x", dtype: "float32", dims: [undefined, 4] }],
        outputs: [{ name: "y" }],
      }),
    );
    expect(() => session.run({})).toThrow(/missing feed.*"x"/);
    expect(() => session.run({ x: tensorOf([2, 4], [1, 2, 3, 4, 5, 6, 7, 8], "int32") })).toThrow(
      /expects float32, got int32/,
    );
    // The static axis is enforced; the symbolic one is not, because choosing it
    // is the caller's job.
    expect(() => session.run({ x: tensorOf([2, 5], new Array<number>(10).fill(0)) })).toThrow(/axis 1 expects 4/);
    expect(() => session.run({ x: tensorOf([4], [1, 2, 3, 4]) })).toThrow(/rank 2/);
    expect(() => session.run({ x: tensorOf([7, 4], new Array<number>(28).fill(1)) })).not.toThrow();
  });

  it("accepts a uint8 tensor for a bool-declared input", () => {
    // `bool` and `uint8` share a Uint8Array and exporters routinely declare one
    // while the producer emits the other; that interchange is safe because no
    // reinterpretation of bytes is involved.
    const session = SyncOnnxSession.fromModel(
      model({
        nodes: [node("Cast", ["flag"], ["y"], { to: { kind: "int", value: 1 } })],
        inputs: [{ name: "flag", dtype: "bool", dims: [3] }],
        outputs: [{ name: "y" }],
      }),
    );
    const out = session.run({ flag: new Tensor([3], "uint8", Uint8Array.from([1, 0, 1])) });
    expect(Array.from(out.y.data)).toEqual([1, 0, 1]);
  });

  it("treats an empty input name as an omitted optional input", () => {
    // `Clip(x, "", max)` is max-only. Collapsing the empty name instead of
    // keeping its position would shift `max` into the `min` slot.
    const session = SyncOnnxSession.fromModel(
      model({
        nodes: [node("Clip", ["x", "", "hi"], ["y"])],
        initializers: { hi: tensorOf([], [2]) },
        inputs: [{ name: "x", dtype: "float32", dims: [4] }],
        outputs: [{ name: "y" }],
      }),
    );
    expect(Array.from(session.run({ x: tensorOf([4], [-5, 0, 1, 9]) }).y.data)).toEqual([-5, 0, 1, 2]);
  });

  it("treats an initializer that is also listed as a graph input as a constant", () => {
    // The IR ≤ 3 "optional input with a default" form. Reporting it as an input
    // would make the caller responsible for feeding the model its own weights.
    const session = SyncOnnxSession.fromModel(
      model({
        nodes: [node("Add", ["x", "b"], ["y"])],
        initializers: { b: tensorOf([1], [5]) },
        inputs: [
          { name: "x", dtype: "float32", dims: [1] },
          { name: "b", dtype: "float32", dims: [1] },
        ],
        outputs: [{ name: "y" }],
      }),
    );
    expect(session.inputNames).toEqual(["x"]);
    expect(Array.from(session.run({ x: tensorOf([1], [1]) }).y.data)).toEqual([6]);
  });

  it("passes an initializer straight through as a graph output", () => {
    // A graph output that is never written by any node is legal when it is an
    // initializer; the "never produced" check must not fire on it.
    const session = SyncOnnxSession.fromModel(
      model({
        nodes: [node("Identity", ["x"], ["y"])],
        initializers: { k: tensorOf([2], [7, 8]) },
        inputs: [{ name: "x", dtype: "float32", dims: [2] }],
        outputs: [{ name: "y" }, { name: "k" }],
      }),
    );
    const out = session.run({ x: tensorOf([2], [1, 2]) });
    expect(Array.from(out.y.data)).toEqual([1, 2]);
    expect(Array.from(out.k.data)).toEqual([7, 8]);
  });

  it("reports the opset it planned against", () => {
    expect(SyncOnnxSession.fromModel(scrambledGraph()).opset).toBe(18);
  });
});
