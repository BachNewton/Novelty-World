import { apply, loadCore, weightReader, type Core, type Linear, type NetWeights } from "../net-v1/network";
import { FEATURES, GLOBAL_TOKEN, SLOTS, type Candidates } from "./actions";

export type { NetWeights } from "../net-v1/network";

// net-v2's network: net-v1's trunk, main and value heads (`../net-v1/network.ts`), with the exact
// space's argument head in place of the amount buckets (`arg_logits` in
// `gpu/riskgpu/selfplay/net.py`), in the same fixed order of sums.

const ARG = 128;

export interface Net extends Core {
  argCtx: Linear;
  argCand: Linear;
  argTok: Linear;
  argHidden: Linear;
  argOut: Linear;
}

/** The network of an exact-space weight set, every tensor checked against its shape. */
export function loadNet(w: NetWeights): Net {
  const r = weightReader(w, "net-v2");
  const core = loadCore(w, r, "net-v2");
  const net: Net = {
    ...core,
    argCtx: r.linear("arg_ctx", 3 * w.width, ARG),
    argCand: r.linear("arg_cand", FEATURES, ARG),
    argTok: r.linear("arg_tok", w.width, ARG),
    argHidden: r.linear("arg_hidden", ARG, ARG),
    argOut: r.linear("arg_out", ARG, 1),
  };
  r.done();
  return net;
}

/** The argument logits over the candidates, −∞ where a slot isn't legal: one small network of the
 *  chosen tokens, the global token, each candidate's features and, for a trade, its bonus
 *  territory's token. */
export function argLogits(net: Net, y: Float64Array, c: Candidates): Float64Array {
  const w = net.width;
  const z = new Float64Array(SLOTS).fill(-Infinity);
  const read = new Float64Array(3 * w);
  read.set(y.subarray(c.context[0] * w, (c.context[0] + 1) * w), 0);
  read.set(y.subarray(c.context[1] * w, (c.context[1] + 1) * w), w);
  read.set(y.subarray(GLOBAL_TOKEN * w, (GLOBAL_TOKEN + 1) * w), 2 * w);
  const ctx = new Float64Array(ARG);
  apply(net.argCtx, read, 0, ctx, 0);
  const cand = new Float64Array(ARG);
  const tok = new Float64Array(ARG);
  const h = new Float64Array(ARG);
  const h2 = new Float64Array(ARG);
  const out = new Float64Array(1);
  for (let k = 0; k < SLOTS; k++) {
    if (c.legal[k] !== 1) continue;
    apply(net.argCand, c.features, k * FEATURES, cand, 0);
    if (c.token[k] >= 0) apply(net.argTok, y, c.token[k] * w, tok, 0);
    else tok.fill(0);
    for (let i = 0; i < ARG; i++) h[i] = Math.max(ctx[i] + cand[i] + tok[i], 0);
    apply(net.argHidden, h, 0, h2, 0);
    for (let i = 0; i < ARG; i++) h2[i] = Math.max(h2[i], 0);
    apply(net.argOut, h2, 0, out, 0);
    z[k] = out[0];
  }
  return z;
}
