import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { freshGame } from "../mocks";
import { encode, FEATURE_COUNT, MAX_SEATS } from "./features";
import { ACTION_COUNT, legalActions } from "./actions";
import { MonoNet, maskPolicy, type TrainSample } from "./net";

const close = (x: number, target: number, eps = 1e-3): boolean =>
  Math.abs(x - target) < eps;
const sum = (a: Float32Array): number => a.reduce((s, v) => s + v, 0);

describe("policy+value net", () => {
  it("predicts well-formed policy + value heads, batched", () => {
    const net = MonoNet.create();
    const state = freshGame("net-1", undefined, 4);
    const encs = state.players.map((p) => encode(state, p.id));
    const preds = net.predict(encs);
    expect(preds.length).toBe(encs.length);
    for (const pred of preds) {
      expect(pred.policy.length).toBe(ACTION_COUNT);
      expect(pred.value.length).toBe(MAX_SEATS);
      expect(close(sum(pred.policy), 1)).toBe(true); // softmax
      expect(close(sum(pred.value), 1)).toBe(true);
    }
  });

  it("maskPolicy keeps only legal tokens and renormalizes", () => {
    const net = MonoNet.create();
    const state = freshGame("net-2", undefined, 4);
    const me = state.turn.playerId;
    const [pred] = net.predict([encode(state, me)]);
    const legal = legalActions(state, me).map((a) => a.token);
    const masked = maskPolicy(pred.policy, legal);
    expect(close(sum(masked), 1)).toBe(true);
    const legalSet = new Set(legal);
    for (let t = 0; t < ACTION_COUNT; t++) {
      if (!legalSet.has(t)) expect(masked[t]).toBe(0);
    }
  });

  it("trains a step without error and returns a finite loss", async () => {
    const net = MonoNet.create();
    const state = freshGame("net-3", undefined, 4);
    const samples: TrainSample[] = state.players.map((p, i) => {
      const policyTarget = new Float32Array(ACTION_COUNT);
      policyTarget[i % ACTION_COUNT] = 1; // a degenerate one-hot target
      const valueTarget = new Float32Array(MAX_SEATS);
      valueTarget[0] = 1;
      return { encoding: encode(state, p.id), policyTarget, valueTarget };
    });
    const loss = await net.train(samples);
    expect(Number.isFinite(loss)).toBe(true);
    expect(loss).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it("save + load round-trips to identical predictions", async () => {
    const net = MonoNet.create();
    const state = freshGame("net-4", undefined, 4);
    const enc = encode(state, state.turn.playerId);
    const before = net.predict([enc])[0];

    const dir = mkdtempSync(join(tmpdir(), "mononet-"));
    try {
      await net.save(dir);
      const loaded = await MonoNet.load(dir);
      const after = loaded.predict([enc])[0];
      for (let i = 0; i < FEATURE_COUNT && i < before.policy.length; i++) {
        expect(close(after.policy[i], before.policy[i], 1e-5)).toBe(true);
      }
      for (let i = 0; i < MAX_SEATS; i++) {
        expect(close(after.value[i], before.value[i], 1e-5)).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
