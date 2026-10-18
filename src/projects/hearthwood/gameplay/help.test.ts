import { describe, expect, it } from "vitest";
import { emptyBasket } from "./basket";
import { addBrew, emptySatchel, takeBrew, type Satchel } from "./brewing";
import type { BrewId } from "./brews";
import { emptyLarder } from "./cooking";
import { answerable, canFulfil, takingFor, type Means } from "./help";

const holding = (...brews: BrewId[]): Means => ({
  basket: emptyBasket(),
  larder: emptyLarder(),
  satchel: brews.reduce<Satchel>((s, b) => addBrew(s, b, 0, false).satchel, emptySatchel()),
  petHere: false,
  delivered: false,
});

describe("helping with a brew", () => {
  it("answers a particular brew only with that brew", () => {
    const salve = { kind: "brew", brew: "yarrow-salve" } as const;
    expect(canFulfil(salve, holding())).toBe(false);
    expect(canFulfil(salve, holding("fly-agaric-rub", "yarrow-tea"))).toBe(false);
    expect(takingFor(salve, holding("yarrow-tea", "yarrow-salve"))).toEqual({ kind: "brew", brew: "yarrow-salve" });
    expect(() => takingFor(salve, holding("yarrow-tea"))).toThrow();
  });

  it("answers any of a way with the first of that way in the brew book's order, a recipe's before a humble one", () => {
    const tea = { kind: "brew", brew: "tea" } as const;
    expect(canFulfil(tea, holding("yarrow-salve"))).toBe(false);
    expect(takingFor(tea, holding("humble-tea-bilberry"))).toEqual({ kind: "brew", brew: "humble-tea-bilberry" });
    expect(takingFor(tea, holding("humble-tea-bilberry", "meadowsweet-tea", "yarrow-salve"))).toEqual({ kind: "brew", brew: "meadowsweet-tea" });
    expect(takingFor({ kind: "brew", brew: "salve" }, holding("yarrow-tea", "humble-salve-juniper"))).toEqual({ kind: "brew", brew: "humble-salve-juniper" });
  });

  it("takes one brew out of the satchel, leaving the rest", () => {
    const two = holding("yarrow-salve", "yarrow-salve").satchel;
    expect(takeBrew(two, "yarrow-salve").brews).toEqual({ "yarrow-salve": 1 });
    expect(takeBrew(takeBrew(two, "yarrow-salve"), "yarrow-salve").brews).toEqual({});
    expect(() => takeBrew(emptySatchel(), "yarrow-salve")).toThrow();
  });

  it("can ask for any tea or salve, and for every tea and salve whose forest things ripen together some time of the year, never a charm", () => {
    for (const brew of ["yarrow-tea", "meadowsweet-tea", "winter-tea", "yarrow-salve", "fly-agaric-rub", "tea", "salve"] as const) expect(answerable({ kind: "brew", brew }), brew).toBe(true);
    expect(answerable({ kind: "brew", brew: "garland-charm" })).toBe(false);
  });
});
