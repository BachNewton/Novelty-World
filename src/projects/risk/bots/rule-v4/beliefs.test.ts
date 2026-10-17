import { describe, expect, it } from "vitest";
import type { GameEvent } from "../../contract";
import { readRecord } from "./beliefs";

const turn = (seat: number): GameEvent => ({ kind: "turn-started", seat, turn: 0 });
const took = (seat: number, from: number): GameEvent => ({ kind: "captured", seat, territory: "alaska", from });

describe("the record of whom each opponent takes from", () => {
  it("counts each opponent's captures by victim, its older turns fading", () => {
    const history = [turn(1), took(1, 2), took(1, 2), turn(2), took(2, 1), turn(1), took(1, 0)];
    const { taken } = readRecord(history, 3, 0.5, 0);
    expect(taken[1]).toEqual([1, 0, 1]);
    expect(taken[2]).toEqual([0, 1, 0]);
  });

  it("leaves out my own captures, so it holds still through my turn", () => {
    const history = [turn(0), took(0, 1), took(0, 2)];
    expect(readRecord(history, 3, 0.7, 0).taken[0]).toEqual([0, 0, 0]);
  });
});
