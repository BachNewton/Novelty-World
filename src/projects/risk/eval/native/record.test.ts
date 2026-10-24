import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Move } from "../../contract";
import { checkRecord, Divergence } from "./check";
import { decodeMove, encodeMove, readRecords, recordGame, writeRecords, type RecordedGame } from "./record";

const dir = mkdtempSync(join(tmpdir(), "risk-native-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function readAll(file: string): Promise<RecordedGame[]> {
  const records: RecordedGame[] = [];
  for await (const r of readRecords(file)) records.push(r);
  return records;
}

describe("moves as fields", () => {
  const moves: Move[] = [
    { kind: "place", territory: "brazil", armies: 3 },
    { kind: "trade", cards: ["alaska", "peru", "wild-2"] },
    { kind: "trade", cards: ["alaska", "peru", "siam"], bonusTerritory: "peru" },
    { kind: "attack", from: "alaska", to: "kamchatka", dice: 3 },
    { kind: "blitz", from: "alaska", to: "kamchatka", keepAtLeast: 2 },
    { kind: "occupy", armies: 5 },
    { kind: "end-attack" },
    { kind: "fortify", from: "brazil", to: "peru", armies: 4 },
    { kind: "end-turn" },
  ];

  it("round-trips every kind", () => {
    for (const move of moves) expect(decodeMove(encodeMove(move))).toEqual(move);
  });

  it("encodes as the record format fixes, unused fields 0", () => {
    expect(moves.map(encodeMove)).toEqual([
      [0, 11, 3, 0, 0],
      [1, 0, 10, 43, -1],
      [1, 0, 10, 37, 10],
      [2, 0, 29, 3, 0],
      [3, 0, 29, 2, 0],
      [4, 5, 0, 0, 0],
      [5, 0, 0, 0, 0],
      [6, 11, 10, 4, 0],
      [7, 0, 0, 0, 0],
    ]);
  });

  it("refuses a move that isn't one", () => {
    expect(() => decodeMove([8, 0, 0, 0, 0])).toThrow();
    expect(() => decodeMove([2, 0, 29, 4, 0])).toThrow();
    expect(() => decodeMove([0, 42, 1, 0, 0])).toThrow();
  });
});

describe("a recorded game", () => {
  const record = recordGame({ seed: "native-e2e", bots: ["greedy", "greedy", "greedy"], maxTurns: 40 });

  it("keeps a hash for every move", () => {
    expect(record.moves.length).toBe(record.decisions);
    expect(record.stateHashes).toHaveLength(record.moves.length);
    expect(record.optionsHashes).toHaveLength(record.moves.length);
    expect(record.result.places).toHaveLength(3);
  });

  it("writes and reads back the same, plain and gzipped", async () => {
    for (const name of ["games.jsonl", "games.jsonl.gz"]) {
      const file = join(dir, name);
      writeRecords(file, [record, record]);
      expect(await readAll(file)).toEqual([record, record]);
    }
  });

  it("checks on the reference engine, its bots asked every decision", async () => {
    const file = join(dir, "check.jsonl.gz");
    writeRecords(file, [record]);
    const [read] = await readAll(file);
    expect(checkRecord(read, { bots: true })).toEqual({ moves: record.moves.length, compared: record.moves.length });
  });

  it("fails at the first move that differs", () => {
    const tampered = structuredClone(record);
    const at = tampered.moves.findIndex(([, kind]) => kind === 0);
    tampered.moves[at][3] += 1; // one more army placed
    const check = () => checkRecord(tampered, { bots: true });
    expect(check).toThrow(Divergence);
    expect(check).toThrow(/bot "greedy"/);
  });

  it("fails at a state hash that differs", () => {
    const tampered = structuredClone(record);
    tampered.stateHashes[5] = "0000000000000000";
    try {
      checkRecord(tampered, { bots: false });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(Divergence);
      expect((e as Divergence).decision).toBe(5);
    }
  });
});
