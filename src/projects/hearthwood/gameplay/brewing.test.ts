import { describe, expect, it } from "vitest";
import { HERB_KINDS } from "../engine/regions";
import { emptyBasket } from "./basket";
import {
  addBrew,
  beginBrewing,
  brewAgain,
  brewCount,
  brewedSoFar,
  BREWING_SECONDS,
  brewsIn,
  canBrew,
  charmsAtWork,
  charmStrength,
  charmUntil,
  chooseForm,
  emptySatchel,
  hushOf,
  parseSatchel,
  serializeSatchel,
  startBrewing,
  stepBrewing,
  toggleBrewIngredient,
  underFullMoon,
  workCharm,
} from "./brewing";
import { ALL_BREWS, BREW_STAPLES, BREWS, brewOf, charmOf, CHARMS, checkBrewChoice, humbleBrewOf, isBrew } from "./brews";

const basket = { ...emptyBasket(), yarrow: 2, meadowsweet: 1, juniper: 1, "fly-agaric": 2, cloudberry: 1, bilberry: 1, lingonberry: 1 };

describe("the brews", () => {
  it("each come from their own things, in any order, made their own way", () => {
    for (const brew of BREWS) {
      expect(brewOf([...brew.ingredients].reverse(), brew.form)).toBe(brew.id);
      for (const other of BREWS) if (other !== brew) expect(other.form === brew.form && [...other.ingredients].sort().join() === [...brew.ingredients].sort().join()).toBe(false);
    }
  });

  it("use every herb, the fly agaric and every staple, and work every charm", () => {
    const used = new Set<string>(BREWS.flatMap((b) => b.ingredients));
    for (const thing of [...HERB_KINDS, "fly-agaric", ...BREW_STAPLES]) expect(used.has(thing), thing).toBe(true);
    for (const charm of CHARMS) expect(BREWS.filter((b) => charmOf(b.id) === charm)).toHaveLength(1);
  });

  it("never fail: an unknown mix is a humble brew of its first thing from the forest", () => {
    const humble = brewOf(["honey", "bilberry", "yarrow"], "tea");
    expect(humble).toBe("humble-tea-bilberry");
    expect(isBrew(humble)).toBe(true);
    expect(humbleBrewOf(humble)).toEqual({ form: "tea", main: "bilberry" });
    expect(brewOf(["wild-strawberry"], "charm")).toBe("humble-charm-wild-strawberry");
    expect(charmOf("humble-charm-wild-strawberry")).toBeNull();
    expect(new Set(ALL_BREWS).size).toBe(ALL_BREWS.length);
  });

  it("never put the fly agaric in a tea, and need something from the forest", () => {
    expect(() => {
      checkBrewChoice(["fly-agaric", "honey"], "tea");
    }).toThrow();
    expect(() => {
      checkBrewChoice(["honey", "salt"], "charm");
    }).toThrow();
    expect(ALL_BREWS).not.toContain("humble-tea-fly-agaric");
  });
});

describe("a turn at the cauldron", () => {
  it("chooses, brews for a while, and makes the brew from the moment it starts", () => {
    let session = beginBrewing("salve");
    session = toggleBrewIngredient(session, "yarrow", basket);
    session = toggleBrewIngredient(session, "beeswax", basket);
    expect(canBrew(session, basket)).toBe(true);
    const started = startBrewing(session, basket, emptySatchel(), 10, 4.5, false);
    expect(started.session.phase).toBe("brewing");
    expect(brewCount(started.satchel, "yarrow-salve")).toBe(1);
    expect(started.satchel.known).toEqual(["yarrow-salve"]);
    expect(brewedSoFar(started.session, 10 + BREWING_SECONDS / 2)).toBeCloseTo(0.5);
    const made = stepBrewing(started.session, 10 + BREWING_SECONDS + 0.01);
    expect(made.phase).toBe("brewed");
    expect(brewAgain(made, { ...basket, yarrow: 0 }).chosen).toEqual(["beeswax"]);
  });

  it("keeps the fly agaric out of a tea, putting it back when the way turns to tea", () => {
    const tea = toggleBrewIngredient(beginBrewing("tea"), "fly-agaric", basket);
    expect(tea.chosen).toEqual([]);
    const charm = toggleBrewIngredient(beginBrewing("charm"), "fly-agaric", basket);
    expect(charm.chosen).toEqual(["fly-agaric"]);
    expect(chooseForm(charm, "tea").chosen).toEqual([]);
  });

  it("offers only what the basket holds, and the staples always", () => {
    const session = toggleBrewIngredient(toggleBrewIngredient(beginBrewing("charm"), "porcini", basket), "salt", basket);
    expect(session.chosen).toEqual(["salt"]);
    expect(canBrew(session, basket)).toBe(false);
  });
});

describe("the charms", () => {
  it("are worked as they are made, not kept in the basket", () => {
    const { satchel } = addBrew(emptySatchel(), "garland-charm", 3.5, false);
    expect(brewsIn(satchel)).toEqual([]);
    expect(charmsAtWork(satchel, 3.6)).toEqual(["bloom"]);
    expect(charmsAtWork(satchel, 7)).toEqual([]);
  });

  it("come on softly and fade softly at their end", () => {
    const satchel = workCharm(emptySatchel(), "hush", 2, false);
    expect(charmStrength(satchel, "hush", 2)).toBe(0);
    expect(charmStrength(satchel, "hush", 2.5)).toBe(1);
    expect(charmStrength(satchel, "hush", 2.95)).toBeGreaterThan(0);
    expect(charmStrength(satchel, "hush", 2.95)).toBeLessThan(1);
    expect(charmStrength(satchel, "hush", 3)).toBe(0);
    expect(hushOf(satchel, 2.5)).toBeCloseTo(2.5);
    expect(hushOf(emptySatchel(), 2.5)).toBe(1);
  });

  it("call the fireflies for tonight, whenever in the day they are made", () => {
    expect(charmUntil("fireflies", 10.5, false)).toBeCloseTo(11.25);
    expect(charmUntil("fireflies", 10.9, false)).toBeCloseTo(11.25);
    expect(charmUntil("fireflies", 11.1, false)).toBeCloseTo(11.25);
  });

  it("work twice as long made under a full moon, and lasts on from when one is made again", () => {
    expect(charmUntil("bloom", 1, true) - 1).toBeCloseTo(2 * (charmUntil("bloom", 1, false) - 1));
    expect(charmUntil("fireflies", 10.9, true)).toBeCloseTo(12.25);
    const again = workCharm(workCharm(emptySatchel(), "clearing", 1, false), "clearing", 1.3, false);
    expect(again.charms.clearing).toEqual({ from: 1, until: 1.8, moonlit: false });
  });
});

describe("the full moon", () => {
  it("is a full moon up in a night sky", () => {
    expect(underFullMoon({ illuminated: 0.98, elevation: 20 }, { elevation: -12 })).toBe(true);
    expect(underFullMoon({ illuminated: 0.98, elevation: -5 }, { elevation: -12 })).toBe(false);
    expect(underFullMoon({ illuminated: 0.6, elevation: 20 }, { elevation: -12 })).toBe(false);
    expect(underFullMoon({ illuminated: 0.98, elevation: 20 }, { elevation: 10 })).toBe(false);
    expect(underFullMoon({ illuminated: 0.98, elevation: 20 }, { elevation: -2 })).toBe(false);
  });

  it("marks what is brewed under it in the book", () => {
    const { satchel } = addBrew(emptySatchel(), "yarrow-tea", 1, true);
    expect(satchel.moonlit).toEqual(["yarrow-tea"]);
    expect(addBrew(satchel, "yarrow-tea", 2, false).satchel.moonlit).toEqual(["yarrow-tea"]);
  });
});

describe("keeping the brewing", () => {
  it("reads back exactly what it wrote", () => {
    let satchel = addBrew(emptySatchel(), "yarrow-tea", 1, true).satchel;
    satchel = addBrew(satchel, "lantern-charm", 1.5, false).satchel;
    satchel = addBrew(satchel, "humble-salve-bilberry", 1.6, false).satchel;
    expect(parseSatchel(serializeSatchel(satchel))).toEqual(satchel);
  });

  it("says so when what was kept isn't brewing", () => {
    expect(() => parseSatchel(JSON.stringify({ brews: { tea: 1 }, known: [], moonlit: [], charms: {} }))).toThrow();
    expect(() => parseSatchel(JSON.stringify({ brews: {}, known: [], moonlit: [], charms: { bloom: { from: 1 } } }))).toThrow();
    expect(() => parseSatchel(JSON.stringify({ brews: {}, known: [] }))).toThrow();
  });
});
