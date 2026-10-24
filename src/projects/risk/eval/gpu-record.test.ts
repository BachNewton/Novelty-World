import { describe, expect, it } from "vitest";
import { checkRecord, recordGame, type GpuGameRecord } from "./gpu-record";

function recorded(dump = false): GpuGameRecord {
  return recordGame({ seed: "gpu-record-test", bots: ["greedy", "greedy", "greedy"], maxTurns: 600, dump });
}

describe("game records", () => {
  it("records a game that replays exactly on the reference engine", () => {
    const record = recorded();
    expect(record.moves.length).toBeGreaterThan(50);
    expect(record.stateHashes).toHaveLength(record.moves.length);
    expect(record.optionsHashes).toHaveLength(record.moves.length);
    expect(record.result.capped).toBe(false);
    expect(checkRecord(record)).toEqual({ seed: record.seed, decisions: record.moves.length, failure: null });
  });

  it("records a capped game as a draw at the cap", () => {
    const record = recordGame({ seed: "gpu-record-cap", bots: ["random", "random", "random"], maxTurns: 6 });
    expect(record.result).toMatchObject({ winner: -1, turns: 6, capped: true });
    expect(checkRecord(record).failure).toBeNull();
  });

  it("dumps the layouts behind the hashes", () => {
    const record = recorded(true);
    expect(record.initialState).toHaveLength(238);
    expect(record.states).toHaveLength(record.moves.length);
    expect(record.options).toHaveLength(record.moves.length);
  });

  it("names the decision whose state hash differs", () => {
    const record = recorded();
    const hashes = [...(record.stateHashes ?? [])];
    hashes[40] = "0000000000000000";
    const { failure } = checkRecord({ ...record, stateHashes: hashes });
    expect(failure?.decision).toBe(40);
    expect(failure?.message).toMatch(/state hash/);
  });

  it("names the decision whose options hash differs", () => {
    const record = recorded();
    const hashes = [...(record.optionsHashes ?? [])];
    hashes[7] = "0000000000000000";
    const { failure } = checkRecord({ ...record, optionsHashes: hashes });
    expect(failure?.decision).toBe(7);
    expect(failure?.message).toMatch(/options hash/);
  });

  it("fails on an illegal move, the wrong seat, a short record, a changed result or start", () => {
    const record = recorded();
    const at = record.moves.findIndex((m) => m[1] === 0);
    const illegal = record.moves.map((m, i) => (i === at ? [m[0], 0, m[2], 10_000, 0, 0] : m));
    const { failure } = checkRecord({ ...record, moves: illegal });
    expect(failure?.decision).toBe(at);
    expect(failure?.message).toMatch(/illegal move/);

    const wrongSeat = record.moves.map((m, i) => (i === 3 ? [(m[0] + 1) % 3, ...m.slice(1)] : m));
    expect(checkRecord({ ...record, moves: wrongSeat }).failure?.decision).toBe(3);

    expect(checkRecord({ ...record, moves: record.moves.slice(0, -1) }).failure?.message).toMatch(/goes on/);
    expect(checkRecord({ ...record, result: { ...record.result, turns: record.result.turns + 1 } }).failure?.message).toMatch(/result/);
    expect(checkRecord({ ...record, initialHash: "0000000000000000" }).failure?.message).toMatch(/initial/);
  });
});
