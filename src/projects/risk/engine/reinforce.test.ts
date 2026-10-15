import { describe, expect, it } from "vitest";
import type { CardId, CardSymbol, Seat } from "../contract";
import { CONTINENTS, TERRITORIES, type TerritoryId } from "../map";
import { referenceEngine as engine } from ".";
import { position, play } from "./test-kit";

const of = (symbol: CardSymbol) => TERRITORIES.filter((t) => t.symbol === symbol).map((t) => t.id);
const [inf, cav, art] = [of("infantry"), of("cavalry"), of("artillery")];

/** Territories that never complete a continent however many are taken: each continent's first
 *  territory is left out. */
const NO_CONTINENT = TERRITORIES.filter((t) => CONTINENTS.every((c) => TERRITORIES.find((u) => u.continent === c.id)?.id !== t.id)).map((t) => t.id);

function owning(territories: readonly TerritoryId[], owner: Seat = 0, armies = 1) {
  return Object.fromEntries(territories.map((t) => [t, [owner, armies]])) as Partial<Record<TerritoryId, [Seat, number]>>;
}

const armiesToPlace = (state: ReturnType<typeof position>) => engine.view(state, null).armiesToPlace;
const armiesOn = (state: ReturnType<typeof position>, t: TerritoryId) => engine.view(state, null).territories[t].armies;

describe("reinforcement", () => {
  it("REINF-2: territories / 3, rounded down, at least 3", () => {
    for (const [owned, armies] of [[8, 3], [9, 3], [11, 3], [14, 4], [17, 5], [30, 10]]) {
      expect(armiesToPlace(position({ board: owning(NO_CONTINENT.slice(0, owned)) }))).toBe(armies);
    }
  });

  it("REINF-3: every whole continent owned adds its bonus, and bonuses stack", () => {
    const australia = TERRITORIES.filter((t) => t.continent === "australia").map((t) => t.id);
    const southAmerica = TERRITORIES.filter((t) => t.continent === "south-america").map((t) => t.id);
    const state = position({ board: owning([...australia, ...southAmerica, "japan"]) });
    expect(armiesToPlace(state)).toBe(3 + 2 + 2);
    const v = engine.view(state, null);
    expect(v.phase).toBe("reinforce");
  });

  it("REINF-1: every reinforcement is placed before the first battle", () => {
    const state = position({ board: owning(["japan"], 0, 5) });
    expect(engine.apply(state, 0, { kind: "attack", from: "japan", to: "kamchatka", dice: 3 }).ok).toBe(false);
    expect(engine.apply(state, 0, { kind: "end-attack" }).ok).toBe(false);
    const placed = play(engine, state, 0, { kind: "place", territory: "japan", armies: 2 }).state;
    expect(engine.view(placed, null).phase).toBe("reinforce");
    const done = play(engine, placed, 0, { kind: "place", territory: "japan", armies: 1 }).state;
    expect(engine.view(done, null).phase).toBe("attack");
  });

  it("REINF-5: any split over owned territories, never on another's, never more than earned", () => {
    const state = position({ board: owning(["japan", "siam"]) });
    expect(engine.apply(state, 0, { kind: "place", territory: "china", armies: 1 }).ok).toBe(false);
    expect(engine.apply(state, 0, { kind: "place", territory: "japan", armies: 4 }).ok).toBe(false);
    expect(engine.apply(state, 0, { kind: "place", territory: "japan", armies: 0 }).ok).toBe(false);
    const once = play(engine, state, 0, { kind: "place", territory: "japan", armies: 1 }).state;
    const twice = play(engine, once, 0, { kind: "place", territory: "siam", armies: 2 }).state;
    expect([armiesOn(twice, "japan"), armiesOn(twice, "siam")]).toEqual([2, 3]);
  });
});

describe("trading", () => {
  const set: CardId[] = [inf[0], inf[1], inf[2]];

  it("CARDS-5: 3 or 4 cards may trade one set, before placing, or not at all", () => {
    const state = position({ board: owning(["japan"]), hands: [[...set, cav[0]]] });
    const options = engine.options(state, 0);
    expect(options).toMatchObject({ kind: "reinforce", mustTrade: false, mayPlace: true });
    const traded = play(engine, state, 0, { kind: "trade", cards: [set[0], set[1], set[2]] });
    expect(armiesToPlace(traded.state)).toBe(3 + 4);

    const placedFirst = play(engine, state, 0, { kind: "place", territory: "japan", armies: 1 }).state;
    expect(engine.apply(placedFirst, 0, { kind: "trade", cards: [set[0], set[1], set[2]] }).ok).toBe(false);
  });

  it("CARDS-5: 5 cards must trade before placing", () => {
    const state = position({ board: owning(["japan"]), hands: [[...set, cav[0], art[0]]] });
    expect(engine.options(state, 0)).toMatchObject({ mustTrade: true, mayPlace: false });
    expect(engine.apply(state, 0, { kind: "place", territory: "japan", armies: 1 }).ok).toBe(false);
    const traded = play(engine, state, 0, { kind: "trade", cards: [set[0], set[1], set[2]] }).state;
    expect(engine.options(traded, 0)).toMatchObject({ mustTrade: false, mayPlace: true, sets: [] });
  });

  it("CARDS-5: 6 cards must trade one set and may trade a second", () => {
    const second: CardId[] = [cav[0], cav[1], cav[2]];
    const state = position({ board: owning(["japan"]), hands: [[...set, ...second]] });
    const once = play(engine, state, 0, { kind: "trade", cards: [set[0], set[1], set[2]] }).state;
    expect(engine.options(once, 0)).toMatchObject({ mustTrade: false, mayPlace: true });
    const twice = play(engine, once, 0, { kind: "trade", cards: [second[0], second[1], second[2]] }).state;
    expect(armiesToPlace(twice)).toBe(3 + 4 + 6);
  });

  it("CARDS-5: no trading outside the reinforce phase", () => {
    const state = position({ board: owning(["japan"], 0, 4), hands: [[...set]], phase: "attack" });
    expect(engine.apply(state, 0, { kind: "trade", cards: [set[0], set[1], set[2]] }).ok).toBe(false);
  });

  it("CARDS-3: three cards that are not a set, or not in hand, are refused", () => {
    const state = position({ board: owning(["japan"]), hands: [[inf[0], inf[1], cav[0], art[3]]] });
    expect(engine.apply(state, 0, { kind: "trade", cards: [inf[0], inf[1], cav[0]] }).ok).toBe(false);
    expect(engine.apply(state, 0, { kind: "trade", cards: [inf[0], cav[0], art[0]] }).ok).toBe(false);
    expect(engine.apply(state, 0, { kind: "trade", cards: [inf[0], inf[0], cav[0]] }).ok).toBe(false);
    expect(engine.apply(state, 0, { kind: "trade", cards: [inf[0], cav[0], art[3]] }).ok).toBe(true);
  });

  it("CARDS-6: the value counts every set anyone has traded", () => {
    const state = position({ board: owning(["japan"]), hands: [[...set]], setsTraded: 5 });
    expect(engine.view(state, null).cards.nextSetValue).toBe(15);
    const traded = play(engine, state, 0, { kind: "trade", cards: [set[0], set[1], set[2]] });
    expect(traded.events.find((e) => e.kind === "traded")).toMatchObject({ armies: 15 });
    expect(engine.view(traded.state, null).cards).toMatchObject({ setsTraded: 6, nextSetValue: 20 });
  });

  it("CARDS-8: traded cards go face up on the discard pile", () => {
    const state = position({ board: owning(["japan"]), hands: [[...set]] });
    const traded = play(engine, state, 0, { kind: "trade", cards: [set[0], set[1], set[2]] }).state;
    expect(engine.view(traded, 1).cards.discardPile).toEqual(set);
    expect(engine.view(traded, 0).cards.hand).toEqual([]);
  });
});

describe("CARDS-7: the occupied-territory bonus", () => {
  const set: [CardId, CardId, CardId] = [inf[0], inf[1], inf[2]];
  const [a, b] = [set[0] as TerritoryId, set[1] as TerritoryId];

  it("puts 2 armies on the one owned territory a traded card pictures", () => {
    const state = position({ board: owning(["japan", a]), hands: [[...set]] });
    const traded = play(engine, state, 0, { kind: "trade", cards: set });
    expect(traded.events.find((e) => e.kind === "traded")).toMatchObject({ bonus: { territory: a, armies: 2 } });
    expect(armiesOn(traded.state, a)).toBe(3);
    expect(armiesToPlace(traded.state)).toBe(3 + 4);
  });

  it("lets the player choose when several qualify, and requires the choice", () => {
    const state = position({ board: owning(["japan", a, b]), hands: [[...set]] });
    expect(engine.options(state, 0)).toMatchObject({ bonusTerritories: [a, b] });
    expect(engine.apply(state, 0, { kind: "trade", cards: set }).ok).toBe(false);
    expect(engine.apply(state, 0, { kind: "trade", cards: set, bonusTerritory: "japan" }).ok).toBe(false);
    const traded = play(engine, state, 0, { kind: "trade", cards: set, bonusTerritory: b });
    expect(armiesOn(traded.state, b)).toBe(3);
    expect(armiesOn(traded.state, a)).toBe(1);
  });

  it("gives nothing for territories owned by someone else, and wilds never qualify", () => {
    const state = position({ board: owning(["japan"]), hands: [[set[0], set[1], "wild-1"]] });
    const traded = play(engine, state, 0, { kind: "trade", cards: [set[0], set[1], "wild-1"] });
    expect(traded.events.find((e) => e.kind === "traded")).toMatchObject({ bonus: null });
    expect(engine.apply(state, 0, { kind: "trade", cards: [set[0], set[1], "wild-1"], bonusTerritory: a }).ok).toBe(false);
  });

  it("note territory-bonus: is earned once per set, so two trades in a turn earn it twice", () => {
    const second: [CardId, CardId, CardId] = [cav[0], cav[1], cav[2]];
    const c = second[0] as TerritoryId;
    const state = position({ board: owning(["japan", a, c]), hands: [[...set, ...second]] });
    const once = play(engine, state, 0, { kind: "trade", cards: set }).state;
    const twice = play(engine, once, 0, { kind: "trade", cards: second });
    expect(twice.events.find((e) => e.kind === "traded")).toMatchObject({ bonus: { territory: c, armies: 2 } });
    expect([armiesOn(twice.state, a), armiesOn(twice.state, c)]).toEqual([3, 3]);
  });
});
