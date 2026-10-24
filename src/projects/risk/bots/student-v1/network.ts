import { FEATURES } from "../rule-v8/features";
import { CANDIDATE_WIDTH } from "./candidates";

// The student's network (`ideas/student-v1.md`): it scores each of a decision's candidates from
// its row, as `bots/rule-v8/train/distill.py` trained it. A row is cut to the columns the student
// reads, read as itself and as its difference from the decision's mean, normalised, and passed
// through the layers (ReLU between them, none after the last). It runs in plain float64 over the
// float32 weights, every sum in one fixed order (bias first, then the inputs in order; a mean over
// the candidates in order), so the same rows give the same bits on any machine.

/** A weight set as `npm run risk:student-weights` writes it, from the trainer's export. */
export interface StudentWeights {
  /** Every column of the row, or each board's breakdown terms with the chance and value. */
  features: "all" | "breakdown";
  /** The columns themselves, their difference from the decision's mean, or both in that order. */
  inputs: "absolute" | "relative" | "both";
  /** One board's features in the row. */
  perBoard: number;
  /** The normalisation of the student's input: (z − mu) / sd. */
  mu: readonly number[];
  sd: readonly number[];
  /** Each layer's width, the input first. */
  dims: readonly number[];
  /** Each layer's weights (row by output, then input) and biases, as little-endian float32 in
   *  base64. */
  layers: readonly { weights: string; biases: string }[];
}

/** How far this float64 pass may sit from the trainer's float32 one on the same rows. */
export const GOLDEN_TOLERANCE = 1e-5;

/** v6's breakdown terms lead each board's features (`rule-v8/features.ts`). */
const BREAKDOWN_TERMS = 11;

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

/** The row's columns a weight set reads. */
function columns(w: StudentWeights): number[] {
  if (w.features === "all") return Array.from({ length: CANDIDATE_WIDTH }, (_, i) => i);
  const terms = Array.from({ length: BREAKDOWN_TERMS }, (_, i) => i);
  return [...terms, ...terms.map((i) => w.perBoard + i), CANDIDATE_WIDTH - 2, CANDIDATE_WIDTH - 1];
}

/** Scores a decision's candidates: `rows` holds one row per candidate, in order. */
export type Scorer = (rows: Float32Array) => number[];

/** The scorer of a weight set, checked against the row it is to read. */
export function scorer(w: StudentWeights): Scorer {
  if (w.perBoard !== FEATURES) throw new Error(`the weights read boards of ${w.perBoard.toString()} features, not ${FEATURES.toString()}`);
  const cols = columns(w);
  const width = w.inputs === "both" ? 2 * cols.length : cols.length;
  if (w.dims[0] !== width || w.mu.length !== width || w.sd.length !== width) throw new Error(`the weights' input isn't ${width.toString()} wide`);
  if (w.dims.at(-1) !== 1) throw new Error("the weights' last layer isn't one score");
  const layers: Layer[] = w.layers.map((l, i) => {
    const layer = { inputs: w.dims[i], outputs: w.dims[i + 1], weights: floats(l.weights), biases: floats(l.biases) };
    if (layer.weights.length !== layer.inputs * layer.outputs || layer.biases.length !== layer.outputs) {
      throw new Error(`the student's layer ${i.toString()} doesn't match its widths`);
    }
    return layer;
  });
  if (layers.length !== w.dims.length - 1) throw new Error("the weights' layers don't match their widths");

  return (rows) => {
    if (rows.length % CANDIDATE_WIDTH !== 0) throw new Error(`a row is ${CANDIDATE_WIDTH.toString()} wide, not a part of ${rows.length.toString()}`);
    const k = rows.length / CANDIDATE_WIDTH;
    const picked = Array.from({ length: k }, (_, c) => Float64Array.from(cols, (j) => rows[c * CANDIDATE_WIDTH + j]));
    const mean = new Float64Array(cols.length);
    for (const x of picked) for (let j = 0; j < cols.length; j++) mean[j] += x[j];
    for (let j = 0; j < cols.length; j++) mean[j] /= k;
    return picked.map((x) => {
      const z = new Float64Array(width);
      for (let j = 0; j < cols.length; j++) {
        if (w.inputs === "relative") z[j] = x[j] - mean[j];
        else {
          z[j] = x[j];
          if (w.inputs === "both") z[cols.length + j] = x[j] - mean[j];
        }
      }
      for (let j = 0; j < width; j++) z[j] = (z[j] - w.mu[j]) / w.sd[j];
      let h: Float64Array = z;
      layers.forEach((layer, i) => {
        const out = new Float64Array(layer.outputs);
        for (let o = 0; o < layer.outputs; o++) {
          let s = layer.biases[o];
          const row = o * layer.inputs;
          for (let q = 0; q < layer.inputs; q++) s += layer.weights[row + q] * h[q];
          out[o] = i < layers.length - 1 && s < 0 ? 0 : s;
        }
        h = out;
      });
      return h[0];
    });
  };
}

/** The first candidate with the highest score: ties go to the earlier, so to v6's own choice. */
export function pick(scores: readonly number[]): number {
  let best = 0;
  for (let c = 1; c < scores.length; c++) if (scores[c] > scores[best]) best = c;
  return best;
}
