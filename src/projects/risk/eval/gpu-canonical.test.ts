import { describe, expect, it } from "vitest";
import type { GameState, Move, Options, Seat } from "../contract";
import { greedyBot } from "../bots/greedy";
import { referenceEngine } from "../engine";
import { unwrap, wrap, type EngineState } from "../engine/state";
import { CARD_IDS, EDGES, HAND_MAX, canonicalOptions, canonicalState, cardIndex, decodeMove, encodeMove, hashOf, int32s } from "./gpu-canonical";
import { recordMoves } from "./replay";

function started(players: number, seed: string): { state: GameState; options: Options } {
  const { state } = referenceEngine.newGame({ players }, seed);
  const options = referenceEngine.options(state, unwrap(state).active);
  if (!options) throw new Error("a new game waits on its first player");
  return { state, options };
}

/** Greedy's 3-player game `fx-0`, every decision's state and options before its move. */
function greedyGame(): { at: { state: GameState; seat: Seat; options: Options }[]; end: GameState } {
  const { seats, moves } = recordMoves("fx-0", [greedyBot, greedyBot, greedyBot], 600);
  let state = referenceEngine.newGame({ players: 3 }, "fx-0").state;
  const at = moves.map((move, i) => {
    const options = referenceEngine.options(state, seats[i]);
    if (!options) throw new Error("no options at a decision");
    const before = { state, seat: seats[i], options };
    const result = referenceEngine.apply(state, seats[i], move);
    if (!result.ok) throw new Error(result.reason);
    state = result.state;
    return before;
  });
  return { at, end: state };
}

describe("the canonical layout", () => {
  it("numbers the cards by territory, the wilds 42 and 43, and has 166 directed edges", () => {
    expect(cardIndex("alaska")).toBe(0);
    expect(cardIndex("eastern-australia")).toBe(41);
    expect(cardIndex("wild-1")).toBe(42);
    expect(cardIndex("wild-2")).toBe(43);
    expect(CARD_IDS).toHaveLength(44);
    expect(EDGES).toHaveLength(166);
    expect(EDGES.slice(0, 3)).toEqual([
      [0, 1],
      [0, 3],
      [0, 29],
    ]);
  });

  it("writes a state as 238 int32s, whatever the table size", () => {
    expect(canonicalState(started(3, "fx-0").state)).toHaveLength(952);
    expect(canonicalState(started(6, "fx-1").state)).toHaveLength(952);
  });

  // Goldens for the GPU side too: its canonical writer must hash these positions the same.
  it("pins the hashes of fresh games and their first options", () => {
    const three = started(3, "fx-0");
    expect(hashOf(canonicalState(three.state))).toBe("23edeefa2b568fa5");
    expect(hashOf(canonicalOptions(three.options))).toBe("565bb726c402e145");
    const six = started(6, "fx-1");
    expect(hashOf(canonicalState(six.state))).toBe("079f2cc3de10a9dc");
    expect(hashOf(canonicalOptions(six.options))).toBe("cc9cab2757fad1d9");
  });

  it("pins the state a whole greedy game ends on, and sizes each kind of options by its layout", () => {
    const { at, end } = greedyGame();
    expect(at).toHaveLength(279);
    expect(hashOf(canonicalState(end))).toBe("666c43b482ba334b");
    const sizes = new Map<Options["kind"], Set<number>>();
    for (const { options } of at) {
      const set = sizes.get(options.kind) ?? new Set<number>();
      set.add(canonicalOptions(options).length / 4);
      sizes.set(options.kind, set);
    }
    expect(sizes.get("attack")).toEqual(new Set([1 + 166]));
    expect(sizes.get("occupy")).toEqual(new Set([5]));
    expect(sizes.get("fortify")).toEqual(new Set([1 + 42 * 42]));
    // Reinforce: 89 int32s, and three more for each set the hand holds.
    for (const n of sizes.get("reinforce") ?? []) expect((n - 89) % 3).toBe(0);
  });

  it("fails loudly on a hand past HAND_MAX", () => {
    const s = unwrap(started(3, "fx-0").state);
    const crowded = { ...s, hands: [CARD_IDS.slice(0, HAND_MAX + 1), [], []] };
    expect(() => canonicalState(wrap(crowded))).toThrow(/HAND_MAX/);
  });
});

describe("move encoding", () => {
  const moves: Move[] = [
    { kind: "place", territory: "brazil", armies: 7 },
    { kind: "trade", cards: ["alaska", "wild-1", "wild-2"] },
    { kind: "trade", cards: ["peru", "japan", "siam"], bonusTerritory: "japan" },
    { kind: "attack", from: "alaska", to: "kamchatka", dice: 3 },
    { kind: "blitz", from: "ural", to: "china", keepAtLeast: 2 },
    { kind: "occupy", armies: 12 },
    { kind: "end-attack" },
    { kind: "fortify", from: "india", to: "siam", armies: 4 },
    { kind: "end-turn" },
  ];

  it("round-trips every kind", () => {
    for (const move of moves) expect(decodeMove(encodeMove(move))).toEqual(move);
  });

  it("writes the fields the design names, unused ones 0", () => {
    expect(encodeMove(moves[1])).toEqual([1, 0, 42, 43, -1]);
    expect(encodeMove(moves[2])).toEqual([1, 10, 32, 37, 32]);
    expect(encodeMove(moves[3])).toEqual([2, 0, 29, 3, 0]);
    expect(encodeMove(moves[5])).toEqual([4, 12, 0, 0, 0]);
    expect(encodeMove(moves[8])).toEqual([7, 0, 0, 0, 0]);
  });

  it("refuses what names nothing", () => {
    expect(() => decodeMove([8, 0, 0, 0, 0])).toThrow();
    expect(() => decodeMove([0, 42, 1, 0, 0])).toThrow();
    expect(() => decodeMove([2, 0, 29, 4, 0])).toThrow();
    expect(() => decodeMove([7, 0, 0, 0])).toThrow(/5 int32s/);
  });
});

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

describe("the canonical state layout, field by field", () => {
  it("writes every field where the layout puts it", () => {
    const f = int32s(canonicalState(wrap(handBuilt())));
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
    expect(hashOf(canonicalState(wrap(a)))).toBe(hashOf(canonicalState(wrap(b))));
    expect(hashOf(canonicalState(wrap(a)))).toMatch(/^[0-9a-f]{16}$/);
    b.board.brazil.armies += 1;
    expect(hashOf(canonicalState(wrap(a)))).not.toBe(hashOf(canonicalState(wrap(b))));
  });
});

describe("the canonical options layout, field by field", () => {
  it("puts an attack's dice on its canonical border", () => {
    const options: Options = { kind: "attack", attacks: [{ from: "alaska", to: "kamchatka", maxDice: 2 }] };
    const f = int32s(canonicalOptions(options));
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
    const f = int32s(canonicalOptions(options));
    expect(f.slice(0, 4)).toEqual([0, 5, 0, 1]);
    expect(f[4]).toBe(1); // alaska owned
    expect(f[4 + 11]).toBe(1); // brazil owned
    expect(f.slice(46, 50)).toEqual([1, 0, 11, 42]);
    expect(f.slice(50).indexOf(1)).toBe(11); // brazil takes the bonus
    expect(f).toHaveLength(92);
  });

  it("lays a fortify out by [from][to]", () => {
    const options: Options = { kind: "fortify", moves: [{ from: "brazil", to: "alaska", maxArmies: 4 }] };
    const f = int32s(canonicalOptions(options));
    expect(f).toHaveLength(1 + 42 * 42);
    expect(f[1 + 11 * 42 + 0]).toBe(4);
  });
});
