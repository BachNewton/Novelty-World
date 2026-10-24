import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { Move } from "../../contract";
import { decodeMove, encodeMove } from "../../eval/gpu-canonical";
import { checkRecord, type GpuGameRecord } from "../../eval/gpu-record";
import { playGame } from "../../eval/runner";
import type { BotInput } from "../bot";
import { decide } from "./index";
import { loadNet, type Net, type NetWeights } from "./network";
import { WEIGHT_SETS } from "./weights";

// net-v1 against the trainer's network (`gpu/riskgpu/selfplay/parity.py`): GPU-engine games with
// the network in some seats, kept as game records with a digest of every network decision. Each
// record replays on the reference engine, and at every network decision the TypeScript bot, given
// the input the harness builds, must see the same observation (exactly, as float32), compute the
// same logits, values and amount logits (within `TOLERANCE`: the trainer's pass is float32, this
// one float64) and play the recorded move. Each game is checked a slice of decisions at a time.

/** How far a logit or value may sit from the trainer's float32 pass: absolute, or relative past 1. The
 *  measured gap is about 2e-6 on the trained net, 5e-7 on the tiny one. */
const TOLERANCE = 1e-5;
/** Network decisions a test checks: a slice must stay well under a second alone. */
const SLICE: Record<string, number> = { "parity-tiny.json.gz": 20, "parity-m1a-25.json.gz": 3 };

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
  net: { inline: NetWeights } | { weights: string };
  records: (GpuGameRecord & { net: Digest[] })[];
}

function read(file: string): Fixture {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the test's own fixtures, fixed names in this folder
  return JSON.parse(gunzipSync(readFileSync(join(__dirname, "__fixtures__", file))).toString("utf8")) as Fixture;
}

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

for (const file of Object.keys(SLICE)) {
  const fixture = read(file);
  let net: Net | null = null;
  const theNet = (): Net => (net ??= loadNet("inline" in fixture.net ? fixture.net.inline : WEIGHT_SETS[fixture.net.weights]));

  describe(`net-v1 against the trainer's network: ${file}`, () => {
    fixture.records.forEach((record, g) => {
      const seats = record.bots ?? [];
      it(`game ${g.toString()} replays exactly on the reference engine`, () => {
        expect(checkRecord(record)).toEqual({ seed: record.seed, decisions: record.moves.length, failure: null });
      });
      for (let start = 0; start < record.net.length; start += SLICE[file]) {
        const slice = record.net.slice(start, start + SLICE[file]);
        it(`game ${g.toString()} (${record.players.toString()} players), network decisions ${start.toString()} to ${(start + slice.length - 1).toString()}`, () => {
          const byDecision = new Map(slice.map((d) => [d.decision, d]));
          let checked = 0;
          replay(record, new Set(byDecision.keys()), (input, decision, recorded) => {
            const digest = byDecision.get(decision);
            if (!digest) throw new Error(`no digest for decision ${decision.toString()}`);
            expect(seats[input.seat]).not.toBe("greedy");
            const d = decide(theNet(), input, "argmax");
            const flat = [...d.obs.node, ...d.obs.slot, ...d.obs.glob];
            if (digest.obs) expect(flat).toEqual(digest.obs.map(Math.fround));
            expect(close(checksum(flat), digest.checksum), `decision ${decision.toString()}: observation checksum`).toBe(true);
            for (const [i, v] of digest.top) expect(close(d.logits[i], v), `decision ${decision.toString()}: logit ${i.toString()} is ${d.logits[i].toString()}, the trainer's ${v.toString()}`).toBe(true);
            digest.value.forEach((v, k) => expect(close(d.value[k], v), `decision ${decision.toString()}: value ${k.toString()}`).toBe(true));
            expect(d.amountLogits).toHaveLength(digest.amountLogits.length);
            digest.amountLogits.forEach((v, k) => expect(close(d.amountLogits[k], v), `decision ${decision.toString()}: amount logit ${k.toString()}`).toBe(true));
            expect([d.main, d.amount]).toEqual([digest.main, digest.amount]);
            expect(encodeMove(d.move)).toEqual(recorded);
            checked++;
          });
          expect(checked).toBe(slice.length);
        });
      }
    });
  });
}
