import { describe, expect, it } from "vitest";
import { buildFar, buildNear } from "./body";
import { CLEAR, drawHair } from "./head";
import { bakeCrowd } from "./crowd";
import { cyclist, HAIR_STYLES, rollFigure, sailor, worker, type FigureSpec, type Hat, type HairStyle, type Outfit } from "./figure";
import { CHILD_POSES, posed, POSES } from "./poses";
import { dot, measure, sub, type Frame, type V3 } from "./skeleton";
import { Soup, STILL, type Rig } from "./soup";

const OUTFITS: readonly Outfit[] = ["tee-shorts", "shirt-trousers", "jacket-trousers", "summer-dress", "blouse-skirt", "sailing-jacket", "overalls", "cyclist"];
const HAIRS: readonly HairStyle[] = HAIR_STYLES;
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

describe("hair", () => {
  const HEADS: Partial<FigureSpec>[] = [
    { age: "adult", frame: 0.9, build: 0.1, heightM: 1.56 },
    { age: "adult", frame: 0.1, build: 0.95, heightM: 1.92 },
    { age: "older", frame: 0.8, build: 0.6, heightM: 1.6 },
    { age: "child", heightM: 1.15 },
  ];
  const CHEST_RIG: Rig = { ...STILL, drive: "rock-x" };

  /** A figure's hair alone, its points in a frame's own axes, sorted by what holds them. */
  function hairPoints(fixed: Partial<FigureSpec>, pose: (typeof POSES)[number]) {
    const spec = rollFigure(5, { hat: "none", ...fixed });
    const body = measure(spec);
    const posture = posed(pose, body);
    const soup = new Soup();
    drawHair(soup, posture, body, spec, STILL, CHEST_RIG);
    const points = Array.from({ length: soup.vertexCount }, (_, at): V3 => [soup.positions[at * 3], soup.positions[at * 3 + 1], soup.positions[at * 3 + 2]]);
    const onChest = (at: number) => soup.rigs[at * 4] === 5;
    const inside = (frame: Frame, point: V3): V3 => {
      const from = sub(point, frame.at);
      return [dot(from, frame.x), dot(from, frame.y), dot(from, frame.z)];
    };
    return { body, posture, points, onChest, inside };
  }

  it.each(HAIR_STYLES)("leaves the face open and keeps close to the skull: %s", (hair) => {
    for (const head of HEADS) {
      const { body, posture, points, onChest, inside } = hairPoints({ ...head, hair }, "stand");
      const s = body.headScale;
      points.forEach((point, at) => {
        if (onChest(at)) return;
        const [x, y, z] = inside(posture.head, point);
        // The face: between the temples, from the chin to the brow.
        expect(Math.abs(x) < 0.058 * s && y > 0.02 * s && y < 0.155 * s && z > 0).toBe(false);
        // Nothing on the head stands far from it: a spike or a cap sitting off the skull would.
        expect(Math.hypot(x, z)).toBeLessThan(0.17 * s);
        expect(y).toBeLessThan(0.3 * s);
      });
    }
  });

  it("lifts every point of the mass clear of the skull's corners", () => {
    expect(CLEAR * Math.cos(Math.PI / 8)).toBeGreaterThanOrEqual(1);
  });

  it.each(["long", "ponytail"] as const)("lies outside the back in every pose: %s", (hair) => {
    for (const head of HEADS.slice(0, 3)) {
      for (const pose of POSES) {
        const { body, posture, points, onChest, inside } = hairPoints({ ...head, hair }, pose);
        const top = body.shoulderUp - body.waistUp;
        points.forEach((point, at) => {
          if (!onChest(at)) return;
          const [x, y, z] = inside(posture.chest, point);
          expect(z).toBeLessThan(0);
          expect(Math.abs(x)).toBeLessThan(body.shoulderX);
          expect(y).toBeGreaterThan(0);
          const depth = y > top * 0.8 ? body.shoulderZ : body.chestZ - 0.012;
          expect(-z).toBeGreaterThan(depth);
        });
      }
    }
  });

  it("is under a hat, not through it", () => {
    for (const hair of HAIR_STYLES) {
      for (const hat of ["cap", "sun-hat", "helmet"] as const) {
        const { body, posture, points, onChest, inside } = hairPoints({ hair, hat }, "stand");
        points.forEach((point, at) => {
          if (!onChest(at)) expect(inside(posture.head, point)[1]).toBeLessThan(0.18 * body.headScale);
        });
      }
    }
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
