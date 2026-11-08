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
// legal logits, and the same seed and position give the same move.

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

describe("net-v1's sampling", () => {
  const all = inputs();
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
