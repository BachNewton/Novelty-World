import { describe, expect, it } from "vitest";
import type { Options } from "../../contract";
import { referenceEngine } from "../../engine";
import { unwrap, wrap, type EngineState } from "../../engine/state";
import { EDGES, fieldsOf, optionsBytes, stateBytes, stateHash } from "./canonical";

/** A 3-player game straight after setup, with its odd corners filled in by hand. */
function handBuilt(): EngineState {
  const s = structuredClone(unwrap(referenceEngine.newGame({ players: 3 }, "canonical-test").state));
  s.rng = 0xfedcba98;
  s.turnOrder = [2, 0, 1];
  s.board.alaska = { owner: 1, armies: 7 };
  s.hands = [["alaska", "wild-2"], [], ["kamchatka"]];
  s.deck = ["wild-1", "brazil"];
  s.trades = [{ seat: 0, cards: ["peru", "siam", "egypt"] }];
  s.eliminated = [false, true, false];
  s.turn = 9;
  s.round = 2;
  s.active = 2;
  s.phase = "attack";
  s.reinforce = null;
  s.occupying = { from: "alaska", to: "kamchatka", min: 3, max: 6, eliminating: null };
  s.capturedThisTurn = true;
  s.winner = null;
  return s;
}

describe("the canonical state layout", () => {
  it("writes every field where the layout puts it", () => {
    const f = fieldsOf(stateBytes(wrap(handBuilt())));
    expect(f).toHaveLength(238);
    expect(f[0]).toBe(3); // players
    expect(f[1] >>> 0).toBe(0xfedcba98); // rng, unsigned
    expect(f.slice(2, 8)).toEqual([2, 0, 1, -1, -1, -1]); // turn order
    expect(f[8]).toBe(1); // alaska's owner
    expect(f[50]).toBe(7); // alaska's armies
    expect(f.slice(92, 95)).toEqual([2, 0, 43]); // seat 0: 2 cards, alaska and wild-2
    expect(f[96]).toBe(-1);
    expect(f[105]).toBe(0); // seat 1's empty hand
    expect(f.slice(118, 120)).toEqual([1, 29]); // seat 2: kamchatka
    expect(f.slice(131, 144)).toEqual([0, ...new Array<number>(12).fill(-1)]); // seat 3 doesn't exist
    expect(f.slice(170, 174)).toEqual([2, 42, 11, -1]); // the deck: wild-1, brazil
    expect(f[215]).toBe(1); // trades
    expect(f.slice(216, 222)).toEqual([0, 1, 0, 0, 0, 0]); // eliminated
    expect(f.slice(222, 226)).toEqual([9, 2, 2, 1]); // turn, round, active, phase
    expect(f.slice(226, 230)).toEqual([0, 0, 0, 0]); // no reinforce phase
    expect(f.slice(230, 236)).toEqual([1, 0, 29, 3, 6, -1]); // occupying
    expect(f.slice(236)).toEqual([1, -1]); // captured, no winner
  });

  it("hashes equal states equal and a one-army change differently", () => {
    const a = handBuilt();
    const b = handBuilt();
    expect(stateHash(wrap(a))).toBe(stateHash(wrap(b)));
    expect(stateHash(wrap(a))).toMatch(/^[0-9a-f]{16}$/);
    b.board.brazil.armies += 1;
    expect(stateHash(wrap(a))).not.toBe(stateHash(wrap(b)));
  });

  it("fails loudly on a hand past its padding", () => {
    const s = handBuilt();
    s.hands[0] = new Array(13).fill("alaska") as EngineState["hands"][number];
    expect(() => stateBytes(wrap(s))).toThrow(/past its 12/);
  });
});

describe("the canonical options layout", () => {
  it("puts an attack's dice on its canonical border", () => {
    const options: Options = { kind: "attack", attacks: [{ from: "alaska", to: "kamchatka", maxDice: 2 }] };
    const f = fieldsOf(optionsBytes(options));
    expect(f).toHaveLength(167);
    expect(f[0]).toBe(1);
    expect(EDGES[2]).toEqual([0, 29]); // alaska's third neighbour
    expect(f[3]).toBe(2);
    expect(f.filter((v) => v !== 0)).toEqual([1, 2]);
  });

  it("writes a reinforce's sets in order, between its territory flags", () => {
    const options: Options = {
      kind: "reinforce",
      armiesToPlace: 5,
      mayPlace: false,
      ownTerritories: ["alaska", "brazil"],
      mustTrade: true,
      sets: [["alaska", "brazil", "wild-1"]],
      bonusTerritories: ["brazil"],
    };
    const f = fieldsOf(optionsBytes(options));
    expect(f.slice(0, 4)).toEqual([0, 5, 0, 1]);
    expect(f[4]).toBe(1); // alaska owned
    expect(f[4 + 11]).toBe(1); // brazil owned
    expect(f.slice(46, 50)).toEqual([1, 0, 11, 42]);
    expect(f.slice(50).indexOf(1)).toBe(11); // brazil takes the bonus
    expect(f).toHaveLength(92);
  });

  it("lays a fortify out by [from][to]", () => {
    const options: Options = { kind: "fortify", moves: [{ from: "brazil", to: "alaska", maxArmies: 4 }] };
    const f = fieldsOf(optionsBytes(options));
    expect(f).toHaveLength(1 + 42 * 42);
    expect(f[1 + 11 * 42 + 0]).toBe(4);
  });
});
