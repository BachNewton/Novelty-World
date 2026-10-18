import { describe, expect, it } from "vitest";
import type { ForageSpot } from "../engine/forage";
import { basketTotal, emptyForaged } from "./basket";
import { canPick, heartOf, pick, REGROW_DAYS, regrow, spotLook, targetSpot, withinTapReach, type ForageTime, type Viewer } from "./picking";

/** A game day in late August, when bilberries and chanterelles are both ripe, and one in winter. */
const AUGUST: ForageTime = { day: 40, dayOfYear: 230 };
const WINTER: ForageTime = { day: 52, dayOfYear: 20 };
/** Some game days after August, the real year moving on about thirteen days with each. */
const later = (days: number): ForageTime => ({ day: AUGUST.day + days, dayOfYear: AUGUST.dayOfYear + days * 13 });

const spot = (id: string, kind: ForageSpot["kind"], x: number, z: number): ForageSpot => ({ id, kind, x, y: 0, z, size: 1, turn: 0, variant: 0, shift: 0 });
const bilberry = spot("0,0/0", "bilberry", 0, 2);
const chanterelle = spot("0,0/1", "chanterelle", 1.2, 1.4);

/** Elliott's eyes above the origin, looking at a point. */
function lookingAt(at: { x: number; y: number; z: number }): Viewer {
  const eye = { x: 0, y: 1.6, z: 0 };
  const d = Math.hypot(at.x - eye.x, at.y - eye.y, at.z - eye.z);
  return { pointOfView: "first", eye, look: { x: (at.x - eye.x) / d, y: (at.y - eye.y) / d, z: (at.z - eye.z) / d } };
}

describe("picking", () => {
  it("puts one in the basket and remembers the spot as picked that day", () => {
    const after = pick(emptyForaged(), bilberry, AUGUST);
    expect(after.basket.bilberry).toBe(1);
    expect(basketTotal(after.basket)).toBe(1);
    expect(after.picked).toEqual({ [bilberry.id]: AUGUST.day });
    expect(canPick(bilberry, after, { day: AUGUST.day + 0.5, dayOfYear: AUGUST.dayOfYear })).toBe(false);
  });

  it("only picks what is ripe", () => {
    expect(canPick(bilberry, emptyForaged(), WINTER)).toBe(false);
    expect(() => pick(emptyForaged(), bilberry, WINTER)).toThrow();
  });

  it("grows a picked spot back some days on, in season", () => {
    const after = pick(emptyForaged(), bilberry, AUGUST);
    expect(canPick(bilberry, after, { day: AUGUST.day + REGROW_DAYS - 0.1, dayOfYear: AUGUST.dayOfYear })).toBe(false);
    expect(canPick(bilberry, after, { day: AUGUST.day + REGROW_DAYS, dayOfYear: AUGUST.dayOfYear })).toBe(true);
    // Grown back once the season is over is still not ripe.
    expect(canPick(bilberry, after, later(REGROW_DAYS + 3))).toBe(false);
    expect(regrow(after, AUGUST.day + 1)).toBe(after);
    expect(regrow(after, AUGUST.day + REGROW_DAYS).picked).toEqual({});
  });

  it("shows a bush bare and a mushroom cut once picked, and a mushroom not at all out of season", () => {
    const foraged = pick(pick(emptyForaged(), bilberry, AUGUST), chanterelle, AUGUST);
    expect(spotLook(bilberry, emptyForaged(), AUGUST)).toBe("ripe");
    expect(spotLook(bilberry, foraged, AUGUST)).toBe("bare");
    expect(spotLook(bilberry, emptyForaged(), WINTER)).toBe("bare");
    expect(spotLook(chanterelle, foraged, AUGUST)).toBe("cut");
    expect(spotLook(chanterelle, emptyForaged(), WINTER)).toBe("none");
  });
});

describe("what Elliott is looking at", () => {
  const spots = [bilberry, chanterelle];

  it("in first person, is the ripe spot in the middle of the view, within reach", () => {
    expect(targetSpot(spots, lookingAt(heartOf(bilberry)), emptyForaged(), AUGUST)).toBe(bilberry);
    expect(targetSpot(spots, lookingAt(heartOf(chanterelle)), emptyForaged(), AUGUST)).toBe(chanterelle);
    // Looking up at the sky, or at a picked bush, is looking at nothing to pick.
    expect(targetSpot(spots, lookingAt({ x: 0, y: 3, z: 2 }), emptyForaged(), AUGUST)).toBe(null);
    expect(targetSpot(spots, lookingAt(heartOf(bilberry)), pick(emptyForaged(), bilberry, AUGUST), AUGUST)).toBe(null);
    const far = spot("0,0/2", "bilberry", 0, 6);
    expect(targetSpot([far], lookingAt(heartOf(far)), emptyForaged(), AUGUST)).toBe(null);
  });

  it("in third person, is the nearest ripe spot in front of them", () => {
    const facingAhead: Viewer = { pointOfView: "third", x: 0, z: 0, heading: 0 };
    expect(targetSpot(spots, facingAhead, emptyForaged(), AUGUST)).toBe(bilberry);
    const facingBack: Viewer = { pointOfView: "third", x: 0, z: 0, heading: Math.PI };
    expect(targetSpot(spots, facingBack, emptyForaged(), AUGUST)).toBe(null);
    expect(targetSpot(spots, facingAhead, emptyForaged(), WINTER)).toBe(null);
  });

  it("can be tapped from a little further off", () => {
    expect(withinTapReach(bilberry, 0, 0)).toBe(true);
    expect(withinTapReach(bilberry, 0, -3)).toBe(false);
  });
});

describe("keeping the basket", () => {

});
