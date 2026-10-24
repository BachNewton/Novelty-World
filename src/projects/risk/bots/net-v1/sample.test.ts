import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import type { Move } from "../../contract";
import { decodeMove } from "../../eval/gpu-canonical";
import type { GpuGameRecord } from "../../eval/gpu-record";
import { playGame } from "../../eval/runner";
import type { BotInput } from "../bot";
import { decide } from "./index";
import { loadNet, sampleIndex, type NetWeights } from "./network";

// net-v1 samples its choices as it was trained: draws from its own seed follow the softmax of the
// legal logits, never land on an illegal choice, and the same seed and position give the same move.

const DRAWS = 20000;

interface Fixture {
  net: { inline: NetWeights };
  records: (GpuGameRecord & { net: { decision: number }[] })[];
}

const fixture = JSON.parse(gunzipSync(readFileSync(join(__dirname, "__fixtures__", "parity-tiny.json.gz"))).toString("utf8")) as Fixture;
const net = loadNet(fixture.net.inline);

/** The inputs of the first game's network decisions, from its record. */
function inputs(): BotInput[] {
  const record = fixture.records[0];
  const wanted = new Set(record.net.map((d) => d.decision));
  const found: BotInput[] = [];
  let next = 0;
  playGame({
    seed: record.seed,
    maxTurns: record.maxTurns,
    bots: Array.from({ length: record.players }, () => (input: BotInput): Move => {
      const decision = next++;
      if (wanted.has(decision)) found.push(input);
      return decodeMove(record.moves[decision].slice(1));
    }),
  });
  return found;
}

function softmax(z: Float64Array, legal: Uint8Array): Float64Array {
  let max = -Infinity;
  for (let i = 0; i < z.length; i++) if (legal[i] === 1 && z[i] > max) max = z[i];
  const p = new Float64Array(z.length);
  let sum = 0;
  for (let i = 0; i < z.length; i++) if (legal[i] === 1) sum += p[i] = Math.exp(z[i] - max);
  return p.map((x) => x / sum);
}

describe("net-v1's sampling", () => {
  const all = inputs();
  // The position whose choice is most spread out: the most legal choices with a share of 2% or more.
  const spread = (input: BotInput) => {
    const d = decide(net, input, "argmax");
    return softmax(d.logits, d.legal).filter((p) => p >= 0.02).length;
  };
  const input = all.reduce((best, x) => (spread(x) > spread(best) ? x : best));
  const { logits, legal } = decide(net, input, "argmax");
  const p = softmax(logits, legal);

  it("draws main choices at the softmax's frequencies, never an illegal one", () => {
    expect(p.filter((x) => x >= 0.02).length).toBeGreaterThanOrEqual(4);
    const counts = new Float64Array(p.length);
    for (let k = 0; k < DRAWS; k++) counts[sampleIndex(logits, createRng(`draw-${k.toString()}`).next(), legal)]++;
    for (let i = 0; i < p.length; i++) {
      if (legal[i] !== 1) expect(counts[i]).toBe(0);
      // Five standard errors of a frequency over DRAWS draws: the seeds are fixed, so this never flakes.
      else expect(Math.abs(counts[i] / DRAWS - p[i])).toBeLessThanOrEqual(5 * Math.sqrt((p[i] * (1 - p[i])) / DRAWS) + 1e-9);
    }
  });

  it("takes each draw by inverse CDF, the first choice whose running total passes it", () => {
    const z = Float64Array.from([0, 0, 5, 0, 0]);
    const allowed = Uint8Array.from([1, 1, 0, 1, 1]);
    expect([0, 0.24, 0.25, 0.5, 0.74, 0.75, 0.9999].map((u) => sampleIndex(z, u, allowed))).toEqual([0, 0, 1, 3, 3, 4, 4]);
  });

  it("plays the same move from the same seed and position, its draws from that seed", () => {
    for (const x of all.slice(0, 10)) {
      const a = decide(net, x, "sample");
      expect(decide(net, x, "sample").move).toEqual(a.move);
      const rng = createRng(x.seed);
      expect(a.main).toBe(sampleIndex(a.logits, rng.next(), a.legal));
      expect(a.amount).toBe(sampleIndex(a.amountLogits, rng.next()));
      expect(a.legal[a.main]).toBe(1);
    }
  });
});
