import { describe, expect, it } from "vitest";
import { buildFar, buildNear } from "./body";
import { bakeCrowd } from "./crowd";
import { cyclist, rollFigure, sailor, worker, type FigureSpec, type Hat, type HairStyle, type Outfit } from "./figure";
import { CHILD_POSES, posed, POSES } from "./poses";
import { measure } from "./skeleton";

const OUTFITS: readonly Outfit[] = ["tee-shorts", "shirt-trousers", "jacket-trousers", "summer-dress", "blouse-skirt", "sailing-jacket", "overalls", "cyclist"];
const HAIRS: readonly HairStyle[] = ["short", "receding", "bob", "long", "ponytail", "bun"];
const HATS: readonly Hat[] = ["none", "cap", "sun-hat", "helmet"];

const wardrobe: Partial<FigureSpec>[] = OUTFITS.flatMap((outfit) => HAIRS.flatMap((hair) => HATS.map((hat) => ({ outfit, hair, hat }))));

// The brief's limits, over the heaviest things a person can wear in the heaviest pose: they mustn't creep as the art is worked on.
describe("triangle budgets", () => {
  it("keeps every near figure under 500 and every far one to about 60", () => {
    for (const fixed of wardrobe) {
      for (const pose of POSES) {
        const spec = rollFigure(3, fixed);
        expect(buildNear(spec, pose).triangleCount).toBeLessThan(500);
        expect(buildFar(spec, pose).triangleCount).toBeLessThanOrEqual(62);
      }
    }
  });
});

describe("poses fit the body they're given", () => {
  const shortest = rollFigure(1, { age: "adult", heightM: 1.56 });
  const tallest = rollFigure(2, { age: "adult", heightM: 1.92 });

  it.each([shortest, tallest])("puts the feet of a seated person on the ground and the hand at the cup, tall or short", (spec) => {
    const body = measure(spec);
    for (const name of ["sit-bench", "sit-cafe"] as const) {
      const { legLeft, legRight } = posed(name, body);
      expect(legLeft.end[1]).toBeLessThan(body.ankleY + 0.06);
      expect(legRight.end[1]).toBeLessThan(body.ankleY + 0.06);
    }
    const { armRight, prop } = posed("sit-cafe", body);
    expect(prop).toBeDefined();
    const [cupX, , cupZ] = prop?.from ?? [0, 0, 0];
    expect(Math.hypot(armRight.end[0] - cupX, armRight.end[2] - cupZ)).toBeLessThan(0.2);
  });
});

describe("casting", () => {
  it("is the same person from the same seed", () => {
    expect(rollFigure(17)).toEqual(rollFigure(17));
  });

  it("rolls a spread of ages, frames and outfits, with no children unless asked for", () => {
    const cast = Array.from({ length: 300 }, (_, seed) => rollFigure(seed));
    expect(new Set(cast.map(({ outfit }) => outfit)).size).toBeGreaterThanOrEqual(5);
    expect(cast.some(({ age }) => age === "older")).toBe(true);
    expect(cast.some(({ age }) => age === "child")).toBe(false);
    expect(cast.filter(({ frame }) => frame > 0.5).length).toBeGreaterThan(100);
    expect(cast.filter(({ frame }) => frame < 0.5).length).toBeGreaterThan(100);
    expect(Math.min(...cast.map(({ heightM }) => heightM))).toBeGreaterThan(1.5);
  });

  it("gives the named trades their own clothes", () => {
    expect(sailor(1).outfit).toBe("sailing-jacket");
    expect(worker(1).outfit).toBe("overalls");
    expect(cyclist(1).hat).toBe("helmet");
  });

  it("places a child only in the poses a background figure has", () => {
    const child = { age: "child", heightM: 1.2 } as const;
    for (const pose of POSES) {
      const bake = () => bakeCrowd([{ seed: 1, pose, x: 0, y: 0, z: 0, spec: child }]);
      if (CHILD_POSES.includes(pose)) expect(bake).not.toThrow();
      else expect(bake).toThrow();
    }
  });
});

describe("a crowd", () => {
  it("is one buffer with every vertex carrying its own place", () => {
    const crowd = bakeCrowd([{ seed: 1, pose: "stand", x: 3, y: 1, z: 2 }, { seed: 2, pose: "walk", x: -4, y: 0, z: 9, yaw: 1 }]);
    const place = crowd.near.getAttribute("place");
    expect(place.getX(0)).toBe(3);
    expect(place.getX(place.count - 1)).toBe(-4);
    expect(crowd.shadow.getAttribute("position").count).toBe(8);
  });
});
