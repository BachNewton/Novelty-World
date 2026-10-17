import { describe, expect, it } from "vitest";
import type { Options } from "../contract";
import type { TerritoryId } from "../map";
import { alsoPickable, back, NO_SELECTION, nextSelection, phaseEnd, pick, stepOf } from "./selection";

const attack: Options = {
  kind: "attack",
  attacks: [
    { from: "brazil", to: "north-africa", maxDice: 3 },
    { from: "brazil", to: "peru", maxDice: 3 },
    { from: "venezuela", to: "central-america", maxDice: 1 },
  ],
};
const reinforce = (patch: Partial<Extract<Options, { kind: "reinforce" }>> = {}): Options => ({
  kind: "reinforce",
  armiesToPlace: 5,
  mayPlace: true,
  ownTerritories: ["brazil", "venezuela"],
  mustTrade: false,
  sets: [],
  bonusTerritories: [],
  ...patch,
});
const fortify: Options = {
  kind: "fortify",
  moves: [
    { from: "brazil", to: "venezuela", maxArmies: 6 },
    { from: "brazil", to: "argentina", maxArmies: 6 },
    { from: "venezuela", to: "brazil", maxArmies: 2 },
  ],
};

describe("stepOf", () => {
  it("waits with no options", () => {
    expect(stepOf(null, NO_SELECTION)).toEqual({ kind: "wait" });
  });

  it("offers each attacking territory once, then its targets, then the dice", () => {
    expect(stepOf(attack, NO_SELECTION)).toEqual({ kind: "pick", purpose: "attack-from", choices: ["brazil", "venezuela"] });
    expect(stepOf(attack, { from: "brazil", to: null })).toEqual({ kind: "pick", purpose: "attack-to", choices: ["north-africa", "peru"] });
    expect(stepOf(attack, { from: "brazil", to: "peru" })).toEqual({ kind: "battle", from: "brazil", to: "peru", maxDice: 3 });
  });

  it("asks for a trade before anything while one is required", () => {
    expect(stepOf(reinforce({ mustTrade: true, mayPlace: false }), NO_SELECTION)).toEqual({ kind: "must-trade" });
  });

  it("asks how many to place once a territory is picked, up to all of them", () => {
    expect(stepOf(reinforce(), NO_SELECTION)).toMatchObject({ kind: "pick", purpose: "place" });
    expect(stepOf(reinforce(), { from: "venezuela", to: null })).toEqual({ kind: "place", territory: "venezuela", max: 5 });
  });

  it("asks how many hold a capture, within the options' bounds", () => {
    expect(stepOf({ kind: "occupy", from: "brazil", to: "peru", min: 3, max: 8 }, NO_SELECTION)).toEqual({ kind: "occupy", from: "brazil", to: "peru", min: 3, max: 8 });
  });

  it("fortifies from a source to any destination the options reach", () => {
    expect(stepOf(fortify, { from: "brazil", to: null })).toEqual({ kind: "pick", purpose: "fortify-to", choices: ["venezuela", "argentina"] });
    expect(stepOf(fortify, { from: "brazil", to: "argentina" })).toEqual({ kind: "fortify-amount", from: "brazil", to: "argentina", max: 6 });
  });
});

describe("pick", () => {
  it("ignores territories the options don't offer", () => {
    expect(pick(attack, NO_SELECTION, "peru")).toBeNull();
    expect(pick(reinforce(), NO_SELECTION, "peru")).toBeNull();
    expect(pick(reinforce({ mustTrade: true, mayPlace: false }), NO_SELECTION, "brazil")).toBeNull();
  });

  it("switches source on picking another, and unpicks on picking the same one", () => {
    expect(pick(attack, { from: "brazil", to: null }, "venezuela")).toEqual({ selection: { from: "venezuela", to: null } });
    expect(pick(attack, { from: "brazil", to: null }, "brazil")).toEqual({ selection: NO_SELECTION });
  });

  it("prefers a destination over a new source when fortifying", () => {
    expect(pick(fortify, { from: "venezuela", to: null }, "brazil")).toEqual({ selection: { from: "venezuela", to: "brazil" } });
  });
});

describe("the rest of a selection", () => {
  it("backs out a step at a time", () => {
    expect(back({ from: "brazil", to: "peru" })).toEqual({ from: "brazil", to: null });
    expect(back({ from: "brazil", to: null })).toEqual(NO_SELECTION);
    expect(back(NO_SELECTION)).toBeNull();
  });

  it("lights other sources faintly while a target is chosen", () => {
    expect(alsoPickable(attack, { from: "brazil", to: null })).toEqual(["venezuela"]);
    expect(alsoPickable(attack, NO_SELECTION)).toEqual([]);
  });


  it("ends the attack or the turn only where the options are those phases", () => {
    expect(phaseEnd(attack)).toEqual({ kind: "end-attack" });
    expect(phaseEnd(fortify)).toEqual({ kind: "end-turn" });
    expect(phaseEnd(reinforce())).toBeNull();
  });
});

describe("the selection after a move", () => {
  const occupy = (from: TerritoryId, to: TerritoryId): Options => ({ kind: "occupy", from, to, min: 3, max: 8 });
  const attacks = (...pairs: (readonly [TerritoryId, TerritoryId])[]): Options => ({ kind: "attack", attacks: pairs.map(([from, to]) => ({ from, to, maxDice: 3 as const })) });

  it("keeps attacking the same target after a battle that didn't take it", () => {
    expect(nextSelection(attack, attack, { from: "brazil", to: "peru" })).toEqual({ from: "brazil", to: "peru" });
    expect(nextSelection(attack, attack, { from: "argentina", to: "peru" })).toEqual(NO_SELECTION);
  });

  it("keeps the source when its target is gone but it can still attack", () => {
    expect(nextSelection(attack, attacks(["brazil", "north-africa"]), { from: "brazil", to: "peru" })).toEqual({ from: "brazil", to: null });
  });

  it("keeps placing on the same territory while armies are left", () => {
    expect(nextSelection(reinforce(), reinforce({ armiesToPlace: 2 }), { from: "brazil", to: null })).toEqual({ from: "brazil", to: null });
  });

  it("starts the attack from the territory last placed on", () => {
    const next = nextSelection(reinforce(), attack, { from: "brazil", to: null });
    expect(next).toEqual({ from: "brazil", to: null });
    expect(stepOf(attack, next)).toMatchObject({ kind: "pick", purpose: "attack-to" });
  });

  it("starts the attack with nothing picked when the last placement can't attack", () => {
    expect(nextSelection(reinforce({ ownTerritories: ["brazil", "argentina"] }), attack, { from: "argentina", to: null })).toEqual(NO_SELECTION);
  });

  it("attacks on from a capture just moved into", () => {
    expect(nextSelection(occupy("brazil", "peru"), attacks(["peru", "argentina"], ["brazil", "north-africa"]), NO_SELECTION)).toEqual({ from: "peru", to: null });
  });

  it("attacks on from a capture whose move-in the rules made", () => {
    expect(nextSelection(attack, attacks(["peru", "argentina"]), { from: "brazil", to: "peru" })).toEqual({ from: "peru", to: null });
  });

  it("falls back to the source a capture came from, then to nothing", () => {
    expect(nextSelection(occupy("brazil", "peru"), attacks(["brazil", "north-africa"]), NO_SELECTION)).toEqual({ from: "brazil", to: null });
    expect(nextSelection(occupy("brazil", "peru"), attacks(["venezuela", "central-america"]), NO_SELECTION)).toEqual(NO_SELECTION);
  });

  it("drops the selection into any other phase", () => {
    expect(nextSelection(attack, fortify, { from: "brazil", to: "peru" })).toEqual(NO_SELECTION);
    expect(nextSelection(null, attack, { from: "brazil", to: null })).toEqual(NO_SELECTION);
  });

  it("backs out of a preselected source to picking one", () => {
    const next = nextSelection(occupy("brazil", "peru"), attacks(["peru", "argentina"]), NO_SELECTION);
    const backed = back(next);
    expect(backed).toEqual(NO_SELECTION);
    expect(stepOf(attack, backed ?? next)).toMatchObject({ kind: "pick", purpose: "attack-from" });
  });
});

