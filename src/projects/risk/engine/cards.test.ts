import { describe, expect, it } from "vitest";
import type { CardId, CardSymbol } from "../contract";
import { TERRITORIES } from "../map";
import { FULL_DECK, isValidSet, setsIn, setValue, symbolOf } from "./cards";

const of = (symbol: CardSymbol) => TERRITORIES.filter((t) => t.symbol === symbol).map((t) => t.id as CardId);
const [inf, cav, art] = [of("infantry"), of("cavalry"), of("artillery")];

describe("the deck", () => {
  it("DECK-1: 44 cards, one per territory and two wilds", () => {
    expect(FULL_DECK).toHaveLength(44);
    expect(new Set(FULL_DECK).size).toBe(44);
    expect(FULL_DECK.filter((c) => symbolOf(c) === null)).toEqual(["wild-1", "wild-2"]);
  });
});

describe("CARDS-3: valid sets", () => {
  it("three of one symbol", () => {
    expect(isValidSet([inf[0], inf[1], inf[2]])).toBe(true);
    expect(isValidSet([art[0], art[1], art[2]])).toBe(true);
  });
  it("one of each symbol", () => {
    expect(isValidSet([inf[0], cav[0], art[0]])).toBe(true);
  });
  it("any two plus a wild", () => {
    expect(isValidSet([inf[0], cav[0], "wild-1"])).toBe(true);
    expect(isValidSet([art[0], art[1], "wild-2"])).toBe(true);
  });
  it("note two-wilds: both wilds may be in one set", () => {
    expect(isValidSet([inf[0], "wild-1", "wild-2"])).toBe(true);
  });
  it("two of one symbol and one of another is not a set", () => {
    expect(isValidSet([inf[0], inf[1], cav[0]])).toBe(false);
    expect(isValidSet([inf[0], cav[0]])).toBe(false);
  });
});

describe("CARDS-4: every hand of five holds a set", () => {
  it("holds for every hand of five cards drawn from the deck's symbols", () => {
    // Every multiset of 5 over {infantry, cavalry, artillery, wild}, with at most 2 wilds and
    // at most 14 of a symbol: realised as actual cards and checked by the engine's own search.
    let hands = 0;
    for (let i = 0; i <= 5; i++) {
      for (let c = 0; c <= 5 - i; c++) {
        for (let w = 0; w <= Math.min(2, 5 - i - c); w++) {
          const a = 5 - i - c - w;
          const hand: CardId[] = [...inf.slice(0, i), ...cav.slice(0, c), ...art.slice(0, a), ...(["wild-1", "wild-2"] as const).slice(0, w)];
          expect(hand).toHaveLength(5);
          expect(setsIn(hand).length, hand.join()).toBeGreaterThan(0);
          hands++;
        }
      }
    }
    expect(hands).toBe(46);
  });
});

describe("CARDS-6: set values escalate game-wide", () => {
  it("4, 6, 8, 10, 12, 15, then 5 more each", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(setValue)).toEqual([4, 6, 8, 10, 12, 15, 20, 25, 30, 35]);
  });
});
