import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { Move } from "../../contract";
import { decodeMove, encodeMove } from "../../eval/gpu-canonical";
import { checkRecord, type GpuGameRecord } from "../../eval/gpu-record";
import { playGame } from "../../eval/runner";
import type { BotInput } from "../bot";
import type { NetWeights } from "../net-v1/network";
import { spread } from "./actions";
import { decide } from "./index";
import { loadNet, type Net } from "./network";

// net-v2 against the trainer's exact-space network (`gpu/riskgpu/selfplay/parity.py --actions
// exact`), as net-v1's parity test holds net-v1 to the bucket space's: each record replays on the
// reference engine, and at every network decision the bot must see the same observation, compute
// the same main logits, values and argument logits of the legal slots (within `TOLERANCE`: the
// trainer's pass is float32, this one float64), choose the same main choice and slot, and play the
// recorded move. The candidates' counts over ranges wider than the slots, which the games seldom
// reach, are held to the trainer's on their own.

const TOLERANCE = 1e-5;
/** Network decisions a test checks: a slice must stay well under a second alone. */
const SLICE = 40;

interface Digest {
  decision: number;
  top: [number, number][];
  value: number[];
  main: number;
  amount: number;
  amountLogits: number[];
  checksum: number;
  obs?: number[];
}

interface Fixture {
  net: { inline: NetWeights };
  records: (GpuGameRecord & { net: Digest[] })[];
  spread: { lo: number; hi: number; slots: number; values: number[] }[];
}

const fixture = JSON.parse(gunzipSync(readFileSync(join(__dirname, "__fixtures__", "parity-tiny.json.gz"))).toString("utf8")) as Fixture;

function close(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= TOLERANCE * Math.max(1, Math.abs(expected));
}

/** The trainer's checksum of an observation: Σ obs[i] · (1 + (i mod 7) / 10 + (i mod 13) / 100). */
function checksum(flat: readonly number[]): number {
  let total = 0;
  flat.forEach((v, i) => {
    total += v * (1 + (i % 7) / 10 + (i % 13) / 100);
  });
  return total;
}

/** Replays a record, calling `at` at each decision in `wanted` with the input the harness builds. */
function replay(record: GpuGameRecord, wanted: ReadonlySet<number>, at: (input: BotInput, decision: number, recorded: number[]) => void): void {
  let next = 0;
  playGame({
    seed: record.seed,
    maxTurns: record.maxTurns,
    bots: Array.from({ length: record.players }, () => (input: BotInput): Move => {
      const decision = next++;
      const [seat, ...encoded] = record.moves[decision];
      if (seat !== input.seat) throw new Error(`seat ${input.seat.toString()} is to move at decision ${decision.toString()}, the record has ${seat.toString()}`);
      if (wanted.has(decision)) at(input, decision, encoded);
      return decodeMove(encoded);
    }),
  });
  if (next !== record.moves.length) throw new Error(`the replay made ${next.toString()} decisions, the record has ${record.moves.length.toString()}`);
}

let net: Net | null = null;
const theNet = (): Net => (net ??= loadNet(fixture.net.inline));

describe("net-v2 against the trainer's network", () => {
  it("spreads a range's counts over the slots as the trainer does", () => {
    for (const { lo, hi, slots, values } of fixture.spread) {
      const got = spread(lo, hi, slots);
      expect(got.values.filter((_, i) => got.legal[i]), `${lo.toString()} to ${hi.toString()} in ${slots.toString()}`).toEqual(values);
    }
  });

  fixture.records.forEach((record, g) => {
    it(`game ${g.toString()} replays exactly on the reference engine`, () => {
      expect(checkRecord(record)).toEqual({ seed: record.seed, decisions: record.moves.length, failure: null });
    });
    for (let start = 0; start < record.net.length; start += SLICE) {
      const slice = record.net.slice(start, start + SLICE);
      it(`game ${g.toString()} (${record.players.toString()} players), network decisions ${start.toString()} to ${(start + slice.length - 1).toString()}`, () => {
        const byDecision = new Map(slice.map((d) => [d.decision, d]));
        let checked = 0;
        replay(record, new Set(byDecision.keys()), (input, decision, recorded) => {
          const digest = byDecision.get(decision);
          if (!digest) throw new Error(`no digest for decision ${decision.toString()}`);
          const d = decide(theNet(), input, "argmax");
          const flat = [...d.obs.node, ...d.obs.slot, ...d.obs.glob];
          if (digest.obs) expect(flat).toEqual(digest.obs.map(Math.fround));
          expect(close(checksum(flat), digest.checksum), `decision ${decision.toString()}: observation checksum`).toBe(true);
          for (const [i, v] of digest.top) expect(close(d.logits[i], v), `decision ${decision.toString()}: logit ${i.toString()}`).toBe(true);
          digest.value.forEach((v, k) => expect(close(d.value[k], v), `decision ${decision.toString()}: value ${k.toString()}`).toBe(true));
          const legalLogits = Array.from(d.argLogits).filter((_, k) => d.argLegal[k] === 1);
          expect(legalLogits).toHaveLength(digest.amountLogits.length);
          digest.amountLogits.forEach((v, k) => expect(close(legalLogits[k], v), `decision ${decision.toString()}: argument logit ${k.toString()}`).toBe(true));
          expect([d.main, d.slot]).toEqual([digest.main, digest.amount]);
          expect(encodeMove(d.move)).toEqual(recorded);
          checked++;
        });
        expect(checked).toBe(slice.length);
      });
    }
  });
});
