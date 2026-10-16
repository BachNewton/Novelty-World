import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { resolveBlitz } from "../blitz";
import type { CardId, CardSymbol, GameEvent, GameState, Seat } from "../contract";
import { TERRITORIES, type TerritoryId } from "../map";
import { referenceEngine as engine } from ".";
import { FULL_DECK } from "../cards";
import { inside, play, position, withDice, type Position } from "./test-kit";

const of = (symbol: CardSymbol) => TERRITORIES.filter((t) => t.symbol === symbol).map((t) => t.id as CardId);
const [inf, cav, art] = [of("infantry"), of("cavalry"), of("artillery")];

/** Seat 0 attacks from Japan into Kamchatka (seat 1); seat 2 holds the rest of the board. */
function front(japan: number, kamchatka: number, extra: Position = {}): GameState {
  return position({
    phase: "attack",
    ...extra,
    board: { japan: [0, japan], kamchatka: [1, kamchatka], "new-guinea": [1, 1], ...extra.board },
  });
}

const armies = (state: GameState, t: TerritoryId) => engine.view(state, null).territories[t].armies;
const owner = (state: GameState, t: TerritoryId) => engine.view(state, null).territories[t].owner;
const find = <K extends GameEvent["kind"]>(events: readonly GameEvent[], kind: K) =>
  events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

describe("battles", () => {
  it("COMBAT-1: only from an owned territory with 2+ armies into an adjacent one someone else owns", () => {
    const state = front(5, 3, { board: { mongolia: [0, 1], siam: [0, 4] } });
    const tryAttack = (from: TerritoryId, to: TerritoryId) => engine.apply(state, 0, { kind: "attack", from, to, dice: 1 }).ok;
    expect(tryAttack("japan", "kamchatka")).toBe(true);
    expect(tryAttack("kamchatka", "japan")).toBe(false); // not owned
    expect(tryAttack("japan", "mongolia")).toBe(false); // own territory
    expect(tryAttack("siam", "kamchatka")).toBe(false); // not adjacent
    expect(tryAttack("mongolia", "kamchatka")).toBe(false); // 1 army
  });

  it("COMBAT-2: 1 to 3 dice, fewer than the armies in the attacking territory", () => {
    const three = front(3, 3);
    const options = engine.options(three, 0);
    expect(options?.kind === "attack" && options.attacks).toContainEqual({ from: "japan", to: "kamchatka", maxDice: 2 });
    expect(engine.apply(three, 0, { kind: "attack", from: "japan", to: "kamchatka", dice: 3 }).ok).toBe(false);
    expect(engine.apply(three, 0, { kind: "attack", from: "japan", to: "kamchatka", dice: 2 }).ok).toBe(true);
    const big = front(10, 3);
    expect(engine.apply(big, 0, { kind: "attack", from: "japan", to: "kamchatka", dice: 4 as 3 }).ok).toBe(false);
    expect(engine.apply(big, 0, { kind: "attack", from: "japan", to: "kamchatka", dice: 0 as 1 }).ok).toBe(false);
  });

  it("COMBAT-3: the defender always rolls 2 dice with 2+ armies, else 1", () => {
    for (const [defenders, dice] of [[1, 1], [2, 2], [5, 2]]) {
      const result = play(engine, front(5, defenders), 0, { kind: "attack", from: "japan", to: "kamchatka", dice: 1 });
      expect(find(result.events, "battle")[0].defenderDice).toHaveLength(dice);
    }
  });

  it("COMBAT-4: ties go to the defender", () => {
    // Attacker rolls 5, 3, 1 and the defender 5, 2: 5 v 5 is the defender's, 3 v 2 the attacker's.
    const state = withDice(front(5, 3), [5, 3, 1, 5, 2]);
    const result = play(engine, state, 0, { kind: "attack", from: "japan", to: "kamchatka", dice: 3 });
    expect(find(result.events, "battle")[0]).toMatchObject({
      rule: "COMBAT-4",
      attackerDice: [5, 3, 1],
      defenderDice: [5, 2],
      attackerLosses: 1,
      defenderLosses: 1,
    });
    expect([armies(result.state, "japan"), armies(result.state, "kamchatka")]).toEqual([4, 2]);
  });

  it("COMBAT-4: dice pair highest with highest, and unpaired dice are ignored", () => {
    const state = withDice(front(5, 1), [1, 6, 2, 6]);
    const result = play(engine, state, 0, { kind: "attack", from: "japan", to: "kamchatka", dice: 3 });
    // 6 (attacker's best) v 6: the defender holds; only one army is lost.
    expect(find(result.events, "battle")[0]).toMatchObject({ attackerDice: [6, 2, 1], attackerLosses: 1, defenderLosses: 0 });
  });

  it("COMBAT-5: a lost battle does not end the attack phase", () => {
    const state = withDice(front(5, 3), [1, 6, 6]);
    const result = play(engine, state, 0, { kind: "attack", from: "japan", to: "kamchatka", dice: 1 });
    expect(engine.view(result.state, null).phase).toBe("attack");
    expect(engine.apply(result.state, 0, { kind: "attack", from: "japan", to: "kamchatka", dice: 3 }).ok).toBe(true);
  });
});

describe("capture", () => {
  const capture = (japan: number, dice: 1 | 2 | 3) =>
    play(engine, withDice(front(japan, 1), [...Array<number>(dice).fill(6), 1]), 0, {
      kind: "attack",
      from: "japan",
      to: "kamchatka",
      dice,
    });

  it("COMBAT-6: the territory changes hands at once with the dice's armies moved in, then the attacker picks the total", () => {
    const result = capture(6, 3);
    expect(find(result.events, "captured")[0]).toMatchObject({ seat: 0, territory: "kamchatka", from: 1 });
    expect(owner(result.state, "kamchatka")).toBe(0);
    expect([armies(result.state, "japan"), armies(result.state, "kamchatka")]).toEqual([3, 3]);
    expect(engine.options(result.state, 0)).toEqual({ kind: "occupy", from: "japan", to: "kamchatka", min: 3, max: 5 });
    expect(engine.view(result.state, null).occupying).toEqual({ from: "japan", to: "kamchatka", min: 3, max: 5 });

    expect(engine.apply(result.state, 0, { kind: "end-attack" }).ok).toBe(false);
    expect(engine.apply(result.state, 0, { kind: "attack", from: "japan", to: "kamchatka", dice: 1 }).ok).toBe(false);
    expect(engine.apply(result.state, 0, { kind: "occupy", armies: 2 }).ok).toBe(false);
    expect(engine.apply(result.state, 0, { kind: "occupy", armies: 6 }).ok).toBe(false);
    const moved = play(engine, result.state, 0, { kind: "occupy", armies: 5 });
    expect(find(moved.events, "occupied")[0]).toMatchObject({ armies: 5 });
    expect([armies(moved.state, "japan"), armies(moved.state, "kamchatka")]).toEqual([1, 5]);
  });

  it("COMBAT-6: when the least is also the most, the engine moves in itself", () => {
    const result = capture(4, 3);
    expect(find(result.events, "occupied")[0]).toMatchObject({ from: "japan", to: "kamchatka", armies: 3 });
    expect(engine.view(result.state, null).occupying).toBeNull();
    expect([armies(result.state, "japan"), armies(result.state, "kamchatka")]).toEqual([1, 3]);
  });

  it("COMBAT-7: a captured territory may attack on the same turn", () => {
    const result = capture(8, 3);
    const moved = play(engine, result.state, 0, { kind: "occupy", armies: 7 }).state;
    expect(engine.apply(moved, 0, { kind: "attack", from: "kamchatka", to: "alaska", dice: 3 }).ok).toBe(true);
  });
});

describe("COMBAT-8: blitz", () => {
  it("is resolved at once, rolling no dice", () => {
    const result = play(engine, front(10, 1), 0, { kind: "blitz", from: "japan", to: "kamchatka", keepAtLeast: 1 });
    expect(find(result.events, "battle")).toEqual([]);
    expect(find(result.events, "blitzed")).toHaveLength(1);
    expect(owner(result.state, "kamchatka")).toBe(0);
  });

  it("draws its outcome from the balanced odds with the next random number", () => {
    for (let seed = 0; seed < 30; seed++) {
      const rng = createRng(seed);
      const expected = resolveBlitz(7, 5, rng.next(), rng.next);
      const result = play(engine, front(8, 5, { rng: seed }), 0, { kind: "blitz", from: "japan", to: "kamchatka", keepAtLeast: 1 });
      expect(find(result.events, "blitzed")[0]).toMatchObject({ rule: "COMBAT-8", from: "japan", to: "kamchatka", ...expected });
    }
  });

  it("stops at keepAtLeast, never below it", () => {
    for (let seed = 0; seed < 20; seed++) {
      const result = play(engine, front(6, 40, { rng: seed }), 0, { kind: "blitz", from: "japan", to: "kamchatka", keepAtLeast: 3 });
      expect(armies(result.state, "japan")).toBe(3);
      expect(owner(result.state, "kamchatka")).toBe(1);
    }
  });

  it("never wins a long shot and never loses a sure thing", () => {
    for (let seed = 0; seed < 20; seed++) {
      const longShot = play(engine, front(3, 12, { rng: seed }), 0, { kind: "blitz", from: "japan", to: "kamchatka", keepAtLeast: 1 });
      expect(owner(longShot.state, "kamchatka")).toBe(1);
      const sure = play(engine, front(20, 2, { rng: seed }), 0, { kind: "blitz", from: "japan", to: "kamchatka", keepAtLeast: 1 });
      expect(owner(sure.state, "kamchatka")).toBe(0);
    }
  });

  it("COMBAT-6: a capture by blitz moves in at least 3, or all that can move if fewer", () => {
    const wide = play(engine, front(20, 1), 0, { kind: "blitz", from: "japan", to: "kamchatka", keepAtLeast: 1 });
    expect(engine.options(wide.state, 0)).toMatchObject({ kind: "occupy", min: 3 });
    const narrow = play(engine, front(20, 1), 0, { kind: "blitz", from: "japan", to: "kamchatka", keepAtLeast: 18 });
    expect(engine.options(narrow.state, 0)).toMatchObject({ kind: "occupy", min: 2 });
  });

  it("refuses a floor below 1 or at the territory's armies", () => {
    const state = front(4, 3);
    for (const keepAtLeast of [0, 4, 5, 1.5]) {
      expect(engine.apply(state, 0, { kind: "blitz", from: "japan", to: "kamchatka", keepAtLeast }).ok).toBe(false);
    }
  });
});

describe("cards earned", () => {
  /** Ends seat 0's attack and then its turn, without fortifying. */
  const endTurn = (extra: Position) => {
    const attacked = play(engine, front(5, 3, extra), 0, { kind: "end-attack" });
    if (engine.view(attacked.state, null).phase !== "fortify") return attacked;
    return play(engine, attacked.state, 0, { kind: "end-turn" });
  };

  it("CARDS-1: a turn that captured draws the top card as it ends, after fortifying", () => {
    const result = endTurn({ capturedThisTurn: true, board: { mongolia: [0, 1] } });
    const top = FULL_DECK.find((c) => c !== "wild-1") as CardId;
    expect(find(result.events, "card-drawn")).toEqual([{ rule: "CARDS-1", kind: "card-drawn", seat: 0, card: top }]);
    expect(engine.view(result.state, 0).cards.hand).toEqual([top]);
    const kinds = result.events.map((e) => e.kind);
    expect(kinds.indexOf("card-drawn")).toBeLessThan(kinds.indexOf("turn-started"));
  });

  it("CARDS-1: one card however many captures, none without one", () => {
    expect(find(endTurn({}).events, "card-drawn")).toEqual([]);
    const first = play(engine, withDice(front(10, 1, { board: { "western-australia": [0, 1] } }), [6, 6, 6, 1]), 0, {
      kind: "attack",
      from: "japan",
      to: "kamchatka",
      dice: 3,
    }).state;
    const moved = play(engine, first, 0, { kind: "occupy", armies: 5 }).state;
    const second = play(engine, withDice(moved, [6, 6, 6, 1]), 0, { kind: "attack", from: "japan", to: "mongolia", dice: 3 }).state;
    const settled = engine.options(second, 0)?.kind === "occupy" ? play(engine, second, 0, { kind: "occupy", armies: 3 }).state : second;
    const ended = play(engine, settled, 0, { kind: "end-attack" });
    const turnOver = engine.view(ended.state, null).phase === "fortify" ? play(engine, ended.state, 0, { kind: "end-turn" }) : ended;
    expect(find(turnOver.events, "card-drawn")).toHaveLength(1);
  });

  it("CARDS-8: traded cards go back into the deck, so it runs dry only when every card is held", () => {
    const everyCardHeld = endTurn({ capturedThisTurn: true, deck: [], hands: [[], FULL_DECK.slice(0, 22), FULL_DECK.slice(22)] });
    expect(find(everyCardHeld.events, "card-drawn")).toEqual([]);
  });

  it("ELIM-4: a drawn card that makes 5 waits for the next turn's trade", () => {
    const hand: CardId[] = [inf[0], inf[1], inf[2], cav[0]];
    const result = endTurn({ capturedThisTurn: true, hands: [hand] });
    expect(engine.view(result.state, 0).cards.hand).toHaveLength(5);
    expect(engine.view(result.state, null).active).toBe(1);
  });
});

describe("elimination and winning", () => {
  /** Seat 1's last territory is Kamchatka, holding 1 army; seat 0 captures it. */
  function eliminate(hands: CardId[][], japan = 8) {
    const state = withDice(front(japan, 1, { hands, board: { "new-guinea": [2, 1] } }), [6, 6, 6, 1]);
    return play(engine, state, 0, { kind: "attack", from: "japan", to: "kamchatka", dice: 3 });
  }

  it("ELIM-1, ELIM-2: the capturer takes every card once the move-in is done", () => {
    const captured = eliminate([[inf[0]], [cav[0], art[0]]]);
    expect(find(captured.events, "eliminated")).toEqual([]);
    const moved = play(engine, captured.state, 0, { kind: "occupy", armies: 3 });
    expect(find(moved.events, "eliminated")).toEqual([{ rule: "ELIM-2", kind: "eliminated", seat: 1, by: 0, cardsTaken: 2 }]);
    const v = engine.view(moved.state, 0);
    expect(v.cards.hand).toEqual([inf[0], cav[0], art[0]]);
    expect(v.seats[1]).toMatchObject({ eliminated: true, territories: 0, handSize: 0 });
    expect(v.phase).toBe("attack");
  });

  it("TURN-2: an eliminated player is skipped", () => {
    const moved = play(engine, eliminate([[], []]).state, 0, { kind: "occupy", armies: 3 }).state;
    const ended = play(engine, moved, 0, { kind: "end-attack" }).state;
    const next = engine.view(ended, null).phase === "fortify" ? play(engine, ended, 0, { kind: "end-turn" }).state : ended;
    expect(engine.view(next, null)).toMatchObject({ active: 2, turn: 2 });
  });

  it("ELIM-3: 5 or more cards force trades down to 4 or fewer, placed at once, then the attack goes on", () => {
    const mine: CardId[] = [inf[0], inf[1], inf[2], cav[0]];
    const theirs: CardId[] = [cav[1], cav[2], art[0]];
    const moved = play(engine, eliminate([mine, theirs]).state, 0, { kind: "occupy", armies: 3 });
    const kinds = moved.events.map((e) => e.kind);
    expect(kinds.indexOf("occupied")).toBeLessThan(kinds.indexOf("eliminated"));
    expect(find(moved.events, "phase").at(-1)).toMatchObject({ rule: "ELIM-3", phase: "reinforce" });
    expect(engine.options(moved.state, 0)).toMatchObject({ kind: "reinforce", mustTrade: true, mayPlace: false, armiesToPlace: 0 });
    expect(engine.apply(moved.state, 0, { kind: "attack", from: "kamchatka", to: "alaska", dice: 1 }).ok).toBe(false);

    const traded = play(engine, moved.state, 0, { kind: "trade", cards: [inf[0], inf[1], inf[2]] });
    expect(find(traded.events, "traded")[0].rule).toBe("ELIM-3");
    expect(engine.options(traded.state, 0)).toMatchObject({ mustTrade: false, mayPlace: true, sets: [], armiesToPlace: 4 });
    const placed = play(engine, traded.state, 0, { kind: "place", territory: "kamchatka", armies: 4 }).state;
    expect(engine.view(placed, null).phase).toBe("attack");
    expect(engine.view(placed, 0).cards.hand).toHaveLength(4);
  });

  it("ELIM-3: from 9 cards, two trades before any placing", () => {
    const mine: CardId[] = [inf[0], inf[1], inf[2], cav[0], cav[1]];
    const theirs: CardId[] = [cav[2], art[0], art[1], art[2]];
    const moved = play(engine, eliminate([mine, theirs]).state, 0, { kind: "occupy", armies: 3 }).state;
    const once = play(engine, moved, 0, { kind: "trade", cards: [inf[0], inf[1], inf[2]] }).state;
    expect(engine.options(once, 0)).toMatchObject({ mustTrade: true, mayPlace: false });
    const twice = play(engine, once, 0, { kind: "trade", cards: [art[0], art[1], art[2]] }).state;
    expect(engine.view(twice, 0).cards.hand).toHaveLength(3);
    expect(engine.options(twice, 0)).toMatchObject({ mustTrade: false, sets: [], armiesToPlace: 4 + 8 });
  });

  it("ELIM-3: exactly 5 cards force a trade", () => {
    const moved = play(engine, eliminate([[inf[0], inf[1], inf[2]], [cav[0], cav[1]]]).state, 0, { kind: "occupy", armies: 3 }).state;
    expect(engine.options(moved, 0)).toMatchObject({ kind: "reinforce", mustTrade: true });
    const traded = play(engine, moved, 0, { kind: "trade", cards: [inf[0], inf[1], inf[2]] }).state;
    expect(engine.options(traded, 0)).toMatchObject({ mustTrade: false, sets: [], armiesToPlace: 4 });
  });

  it("ELIM-3: with 4 or fewer cards there is no trade until the next turn", () => {
    const moved = play(engine, eliminate([[inf[0], inf[1]], [inf[2], cav[1]]]).state, 0, { kind: "occupy", armies: 3 }).state;
    expect(engine.view(moved, null).phase).toBe("attack");
    expect(engine.apply(moved, 0, { kind: "trade", cards: [inf[0], inf[1], inf[2]] }).ok).toBe(false);
  });

  it("WIN-1: taking the last opponent's last territory ends the game at once", () => {
    const state = withDice(
      position({ phase: "attack", rest: [0, 1], board: { japan: [0, 5], kamchatka: [1, 1] }, eliminated: [2], capturedThisTurn: true }),
      [6, 6, 6, 1],
    );
    const result = play(engine, state, 0, { kind: "attack", from: "japan", to: "kamchatka", dice: 3 });
    expect(result.events.at(-1)).toEqual({ rule: "WIN-1", kind: "game-over", winner: 0 });
    expect(find(result.events, "card-drawn")).toEqual([]);
    const v = engine.view(result.state, null);
    expect(v).toMatchObject({ phase: "game-over", winner: 0, occupying: null });
    for (const seat of [0, 1, 2] as Seat[]) expect(engine.options(result.state, seat)).toBeNull();
    expect(engine.apply(result.state, 0, { kind: "end-attack" }).ok).toBe(false);
    expect(inside(result.state).hands[1]).toEqual([]);
  });
});
