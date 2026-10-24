import { describe, expect, it } from "vitest";
import type { GameState, Move, Options, Seat } from "../contract";
import { greedyBot } from "../bots/greedy";
import { referenceEngine } from "../engine";
import { unwrap, wrap } from "../engine/state";
import { CARD_IDS, EDGES, HAND_MAX, canonicalOptions, canonicalState, cardIndex, decodeMove, encodeMove, hashOf } from "./gpu-canonical";
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
  });
});
