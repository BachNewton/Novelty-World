import { describe, expect, it } from "vitest";
import type { Options } from "../contract";
import { alsoPickable, back, keepSelection, NO_SELECTION, phaseEnd, pick, stepOf } from "./selection";

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

  it("keeps attacking the same target after a battle that didn't take it", () => {
    expect(keepSelection(attack, { from: "brazil", to: "peru" })).toEqual({ from: "brazil", to: "peru" });
    expect(keepSelection(attack, { from: "argentina", to: "peru" })).toEqual(NO_SELECTION);
  });

  it("ends the attack or the turn only where the options are those phases", () => {
    expect(phaseEnd(attack)).toEqual({ kind: "end-attack" });
    expect(phaseEnd(fortify)).toEqual({ kind: "end-turn" });
    expect(phaseEnd(reinforce())).toBeNull();
  });
});
