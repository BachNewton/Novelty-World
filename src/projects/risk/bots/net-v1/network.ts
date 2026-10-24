import { ADJACENCY } from "../../map";
import { ATTACK, COUNT, EDGES, END_ATTACK, END_TURN, FORTIFY, MAIN, OCCUPY, PLACE, TRADE, amountBuckets, IDS, indexOf } from "./actions";
import { GLOBAL, NODE, SEATS, SLOT, type Observation } from "./observe";

// net-v1's network, the trainer's transformer (`gpu/riskgpu/selfplay/net.py`, whose docstring
// explains it) run in plain float64 over its float32 weights. Every sum runs in one fixed order
// (a layer's bias first, then its inputs in order; a mean, a variance and a softmax over their
// entries in order), so the same observation gives the same bits on any machine. The trainer's
// bf16 autocast is training's alone: the weights it exports are float32.

/** A weight set as `python -m riskgpu.selfplay.export` writes it: the net's shape and every
 *  tensor of its PyTorch state dict, by name, as little-endian float32 in base64. */
export interface NetWeights {
  width: number;
  layers: number;
  heads: number;
  /** The feed-forward's width. */
  ff: number;
  tensors: Readonly<Record<string, string>>;
}

const TOKENS = COUNT + SEATS + 1;
const KEY = 64;
const EPS = 1e-5;

interface Linear {
  inputs: number;
  outputs: number;
  weight: Float32Array;
  bias: Float32Array;
}

interface Norm {
  weight: Float32Array;
  bias: Float32Array;
}

interface Block {
  ln1: Norm;
  qkv: Linear;
  out: Linear;
  ln2: Norm;
  ff1: Linear;
  ff2: Linear;
  border: Float32Array;
}

export interface Net {
  width: number;
  heads: number;
  nodeIn: Linear;
  slotIn: Linear;
  globIn: Linear;
  identity: Float32Array;
  blocks: Block[];
  ln: Norm;
  place: Linear;
  globOut: Linear;
  attackSrc: Linear;
  attackDst: Linear;
  edgeBias: Float32Array;
  fortifySrc: Linear;
  fortifyDst: Linear;
  placeAmount: Linear;
  attackAmount: Linear;
  fortifyAmount: Linear;
  value: Linear;
}

/** `[i * 42 + j]`: whether territories i and j share a border (the attention's map). */
const ADJACENT = new Uint8Array(COUNT * COUNT);
IDS.forEach((t, i) => {
  for (const n of ADJACENCY[t]) ADJACENT[i * COUNT + indexOf(n)] = 1;
});

function floats(base64: string): Float32Array {
  const text = atob(base64);
  const raw = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) raw[i] = text.charCodeAt(i);
  const bytes = new DataView(raw.buffer);
  const out = new Float32Array(text.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = bytes.getFloat32(4 * i, true);
  return out;
}

/** The network of a weight set, every tensor checked against the shape its name has in `Net`. */
export function loadNet(w: NetWeights): Net {
  const used = new Set<string>();
  const tensor = (name: string, size: number): Float32Array => {
    if (!Object.hasOwn(w.tensors, name)) throw new Error(`net-v1's weights have no "${name}"`);
    const t = floats(w.tensors[name]);
    if (t.length !== size) throw new Error(`net-v1's "${name}" has ${t.length.toString()} weights, not ${size.toString()}`);
    used.add(name);
    return t;
  };
  const linear = (name: string, inputs: number, outputs: number): Linear => ({
    inputs,
    outputs,
    weight: tensor(`${name}.weight`, inputs * outputs),
    bias: tensor(`${name}.bias`, outputs),
  });
  const norm = (name: string, width: number): Norm => ({ weight: tensor(`${name}.weight`, width), bias: tensor(`${name}.bias`, width) });
  const { width, heads, ff } = w;
  if (width % heads !== 0) throw new Error(`net-v1's width ${width.toString()} doesn't split into ${heads.toString()} heads`);
  const net: Net = {
    width,
    heads,
    nodeIn: linear("node_in", NODE, width),
    slotIn: linear("slot_in", SLOT, width),
    globIn: linear("glob_in", GLOBAL, width),
    identity: tensor("identity", TOKENS * width),
    blocks: Array.from({ length: w.layers }, (_, i) => ({
      ln1: norm(`blocks.${i.toString()}.ln1`, width),
      qkv: linear(`blocks.${i.toString()}.qkv`, width, 3 * width),
      out: linear(`blocks.${i.toString()}.out`, width, width),
      ln2: norm(`blocks.${i.toString()}.ln2`, width),
      ff1: linear(`blocks.${i.toString()}.ff1`, width, ff),
      ff2: linear(`blocks.${i.toString()}.ff2`, ff, width),
      border: tensor(`blocks.${i.toString()}.border`, heads),
    })),
    ln: norm("ln", width),
    place: linear("place", width, 1),
    globOut: linear("glob_out", width, 6),
    attackSrc: linear("attack_src", width, KEY),
    attackDst: linear("attack_dst", width, KEY),
    edgeBias: tensor("edge_bias", EDGES.length),
    fortifySrc: linear("fortify_src", width, KEY),
    fortifyDst: linear("fortify_dst", width, KEY),
    placeAmount: linear("place_amount", width, 3),
    attackAmount: linear("attack_amount", 2 * width, 3),
    fortifyAmount: linear("fortify_amount", 2 * width, 3),
    value: linear("value", width, 1),
  };
  // The auxiliary head is training's alone; it is checked, not kept.
  linear("aux", width, 1);
  const unknown = Object.keys(w.tensors).filter((name) => !used.has(name));
  if (unknown.length > 0) throw new Error(`net-v1 doesn't know the weights ${unknown.join(", ")}`);
  return net;
}

/** `out[outAt + o] = bias[o] + Σ_q weight[o, q] · x[xAt + q]`. */
function apply(l: Linear, x: ArrayLike<number>, xAt: number, out: Float64Array, outAt: number): void {
  const { inputs, outputs, weight, bias } = l;
  for (let o = 0; o < outputs; o++) {
    let s = bias[o];
    const row = o * inputs;
    for (let q = 0; q < inputs; q++) s += weight[row + q] * x[xAt + q];
    out[outAt + o] = s;
  }
}

/** Layer norm of each of `x`'s `width`-wide tokens into `out`. */
function layerNorm(n: Norm, x: Float64Array, out: Float64Array, width: number): void {
  for (let at = 0; at < x.length; at += width) {
    let sum = 0;
    for (let i = 0; i < width; i++) sum += x[at + i];
    const mean = sum / width;
    let sq = 0;
    for (let i = 0; i < width; i++) {
      const d = x[at + i] - mean;
      sq += d * d;
    }
    const inv = 1 / Math.sqrt(sq / width + EPS);
    for (let i = 0; i < width; i++) out[at + i] = (x[at + i] - mean) * inv * n.weight[i] + n.bias[i];
  }
}

/** The trunk: `[49 × width]`, territories, then slots, then the global token, after the last norm. */
export function trunk(net: Net, obs: Observation): Float64Array {
  const { width: w, heads } = net;
  const x = new Float64Array(TOKENS * w);
  for (let t = 0; t < COUNT; t++) apply(net.nodeIn, obs.node, t * NODE, x, t * w);
  for (let k = 0; k < SEATS; k++) apply(net.slotIn, obs.slot, k * SLOT, x, (COUNT + k) * w);
  apply(net.globIn, obs.glob, 0, x, (TOKENS - 1) * w);
  for (let i = 0; i < x.length; i++) x[i] += net.identity[i];

  const h = new Float64Array(TOKENS * w);
  const qkv = new Float64Array(TOKENS * 3 * w);
  const attended = new Float64Array(TOKENS * w);
  const projected = new Float64Array(w);
  const hd = w / heads;
  const scale = 1 / Math.sqrt(hd);
  const scores = new Float64Array(TOKENS);
  for (const block of net.blocks) {
    const ff = block.ff1.outputs;
    const hidden = new Float64Array(ff);
    layerNorm(block.ln1, x, h, w);
    for (let t = 0; t < TOKENS; t++) apply(block.qkv, h, t * w, qkv, t * 3 * w);
    for (let head = 0; head < heads; head++) {
      const border = block.border[head];
      const off = head * hd;
      for (let i = 0; i < TOKENS; i++) {
        const q = i * 3 * w + off;
        let max = -Infinity;
        for (let j = 0; j < TOKENS; j++) {
          const k = j * 3 * w + w + off;
          let s = 0;
          for (let d = 0; d < hd; d++) s += qkv[q + d] * qkv[k + d];
          s = s * scale + (i < COUNT && j < COUNT && ADJACENT[i * COUNT + j] === 1 ? border : 0);
          scores[j] = s;
          if (s > max) max = s;
        }
        let sum = 0;
        for (let j = 0; j < TOKENS; j++) {
          scores[j] = Math.exp(scores[j] - max);
          sum += scores[j];
        }
        const a = i * w + off;
        for (let d = 0; d < hd; d++) attended[a + d] = 0;
        for (let j = 0; j < TOKENS; j++) {
          const p = scores[j] / sum;
          const v = j * 3 * w + 2 * w + off;
          for (let d = 0; d < hd; d++) attended[a + d] += p * qkv[v + d];
        }
      }
    }
    for (let t = 0; t < TOKENS; t++) {
      apply(block.out, attended, t * w, projected, 0);
      for (let i = 0; i < w; i++) x[t * w + i] += projected[i];
    }
    layerNorm(block.ln2, x, h, w);
    for (let t = 0; t < TOKENS; t++) {
      apply(block.ff1, h, t * w, hidden, 0);
      for (let i = 0; i < ff; i++) if (hidden[i] < 0) hidden[i] = 0;
      apply(block.ff2, hidden, 0, projected, 0);
      for (let i = 0; i < w; i++) x[t * w + i] += projected[i];
    }
  }
  const y = new Float64Array(TOKENS * w);
  layerNorm(net.ln, x, y, w);
  return y;
}

function dot(a: Float64Array, aAt: number, b: Float64Array, bAt: number, n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += a[aAt + i] * b[bAt + i];
  return s;
}

/** Each territory token's projection by `l`, `[42 × KEY]`. */
function project(l: Linear, y: Float64Array, width: number): Float64Array {
  const out = new Float64Array(COUNT * KEY);
  for (let t = 0; t < COUNT; t++) apply(l, y, t * width, out, t * KEY);
  return out;
}

/** The main logits (`heads_main`) of the legal choices, −∞ elsewhere: a place logit per
 *  territory, an attack logit per border and a fortify logit per pair (each the scaled dot product
 *  of the source's and the target's projections), the other choices from the global token. */
export function mainLogits(net: Net, y: Float64Array, legal: Uint8Array): Float64Array {
  const w = net.width;
  const z = new Float64Array(MAIN).fill(-Infinity);
  const one = new Float64Array(6);
  apply(net.globOut, y, (TOKENS - 1) * w, one, 0);
  const fromGlobal: readonly (readonly [number, number])[] = [[TRADE, 0], [END_ATTACK, 1], [OCCUPY, 2], [OCCUPY + 1, 3], [OCCUPY + 2, 4], [END_TURN, 5]];
  for (const [choice, k] of fromGlobal) if (legal[choice] === 1) z[choice] = one[k];
  const scalar = new Float64Array(1);
  for (let t = 0; t < COUNT; t++) {
    if (legal[PLACE + t] !== 1) continue;
    apply(net.place, y, t * w, scalar, 0);
    z[PLACE + t] = scalar[0];
  }
  let anyAttack = false;
  for (let e = 0; e < EDGES.length; e++) if (legal[ATTACK + e] === 1) anyAttack = true;
  if (anyAttack) {
    const src = project(net.attackSrc, y, w);
    const dst = project(net.attackDst, y, w);
    EDGES.forEach(([from, to], e) => {
      if (legal[ATTACK + e] === 1) z[ATTACK + e] = dot(src, from * KEY, dst, to * KEY, KEY) / Math.sqrt(KEY) + net.edgeBias[e];
    });
  }
  let anyFortify = false;
  for (let p = FORTIFY; p < END_TURN; p++) if (legal[p] === 1) anyFortify = true;
  if (anyFortify) {
    const src = project(net.fortifySrc, y, w);
    const dst = project(net.fortifyDst, y, w);
    for (let p = 0; p < COUNT * COUNT; p++) {
      if (legal[FORTIFY + p] === 1) z[FORTIFY + p] = dot(src, Math.floor(p / COUNT) * KEY, dst, (p % COUNT) * KEY, KEY) / Math.sqrt(KEY);
    }
  }
  return z;
}

/** The value vector: each slot's expected final score, read from its slot token. */
export function values(net: Net, y: Float64Array): Float64Array {
  const out = new Float64Array(SEATS);
  const scalar = new Float64Array(1);
  for (let k = 0; k < SEATS; k++) {
    apply(net.value, y, (COUNT + k) * net.width, scalar, 0);
    out[k] = scalar[0];
  }
  return out;
}

/** The amount logits of the main choice's buckets (`amount_logits`), read from the chosen
 *  territories' tokens; one zero for a choice without an amount. */
export function amountLogits(net: Net, y: Float64Array, main: number): Float64Array {
  const w = net.width;
  const out = new Float64Array(3);
  const buckets = amountBuckets(main);
  if (buckets === 1) return out.subarray(0, 1);
  if (main < TRADE) {
    apply(net.placeAmount, y, main * w, out, 0);
    return out;
  }
  const [from, to] = main < END_ATTACK ? EDGES[main - ATTACK] : [Math.floor((main - FORTIFY) / COUNT), (main - FORTIFY) % COUNT];
  const pair = new Float64Array(2 * w);
  pair.set(y.subarray(from * w, (from + 1) * w), 0);
  pair.set(y.subarray(to * w, (to + 1) * w), w);
  apply(main < END_ATTACK ? net.attackAmount : net.fortifyAmount, pair, 0, out, 0);
  return out.subarray(0, buckets);
}

/** The first index of the largest entry among the allowed (all of them when `allowed` is absent). */
export function argmax(z: ArrayLike<number>, allowed?: Uint8Array): number {
  let best = -1;
  for (let i = 0; i < z.length; i++) {
    if (allowed && allowed[i] !== 1) continue;
    if (best < 0 || z[i] > z[best]) best = i;
  }
  if (best < 0) throw new Error("net-v1 has no legal choice");
  return best;
}
