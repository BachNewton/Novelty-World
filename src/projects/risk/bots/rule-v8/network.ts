import { DIMS, LAYERS } from "./weights";

// v8's network, a small multilayer perceptron (ReLU between layers, a logistic at the end),
// computed in plain float64 over its float32 weights. Every sum runs in one fixed order, bias
// first and then the inputs in order, so the same features give the same bits on any machine.

interface Layer {
  inputs: number;
  outputs: number;
  weights: Float32Array;
  biases: Float32Array;
}

function floats(base64: string): Float32Array {
  const text = atob(base64);
  const bytes = new DataView(Uint8Array.from(text, (c) => c.charCodeAt(0)).buffer);
  const out = new Float32Array(text.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = bytes.getFloat32(4 * i, true);
  return out;
}

const NETWORK: readonly Layer[] = LAYERS.map((l, i) => {
  const layer = { inputs: DIMS[i], outputs: DIMS[i + 1], weights: floats(l.weights), biases: floats(l.biases) };
  if (layer.weights.length !== layer.inputs * layer.outputs || layer.biases.length !== layer.outputs) {
    throw new Error(`v8's layer ${i.toString()} doesn't match its widths`);
  }
  return layer;
});

/** The width of the network's input: its features. */
export const INPUTS = DIMS[0];

/** The network's probability for one feature vector. */
export function predict(x: Float32Array): number {
  if (x.length !== INPUTS) throw new Error(`v8's network reads ${INPUTS.toString()} features, not ${x.length.toString()}`);
  let h: ArrayLike<number> = x;
  NETWORK.forEach((layer, i) => {
    const out = new Float64Array(layer.outputs);
    for (let o = 0; o < layer.outputs; o++) {
      let s = layer.biases[o];
      const row = o * layer.inputs;
      for (let k = 0; k < layer.inputs; k++) s += layer.weights[row + k] * h[k];
      out[o] = i < NETWORK.length - 1 && s < 0 ? 0 : s;
    }
    h = out;
  });
  return 1 / (1 + Math.exp(-h[0]));
}
