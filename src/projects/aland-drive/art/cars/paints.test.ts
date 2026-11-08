import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCarParts } from "./build";
import { SURFACES } from "./mesh";
import { paintAsked, paintAt, paintIndex, paintName, paintsOf, type CarPaint } from "./paints";
import { CARS } from "./specs";

const globals = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const isToken = (name: string) => globals.includes(`--color-aland-drive-${name}:`);

describe("a drivable car's paints", () => {
  it.each(CARS.map((car) => [car.name, car] as const))("%s has 4 to 8, the first its default, each a real token and told apart by name", (_, car) => {
    const paints = car.paints ?? [];
    expect(paints.length).toBeGreaterThanOrEqual(4);
    expect(paints.length).toBeLessThanOrEqual(8);
    expect(paints[0].colour).toBe(car.paint);
    for (const { colour, stripe, flip } of paints) for (const token of [colour, stripe, flip]) if (token !== undefined) expect(isToken(token), token).toBe(true);
    expect(new Set(paints.map(paintName)).size).toBe(paints.length);
  });

  it.each(CARS.map((car) => [car.name, car] as const))("%s names a stripe colour only if it has stripes, and a flip only on a pearl", (_, car) => {
    const striped = buildCarParts(car, "far").body.surfaces.includes(SURFACES.indexOf("stripe"));
    for (const paint of paintsOf(car)) {
      if (paint.stripe !== undefined) expect(striped, paintName(paint)).toBe(true);
      expect(paint.flip !== undefined, paintName(paint)).toBe(paint.finish === "pearl");
    }
  });
});

describe("a paint by its index", () => {
  const paints: CarPaint[] = [{ colour: "car-paint-white", finish: "solid" }, { colour: "car-paint-teal", finish: "metallic" }];

  it("is the car's default for an index that isn't one of its own, as from another version of the game or none", () => {
    for (const index of [undefined, -1, 2, 99, 0.5, Number.NaN]) {
      expect(paintAt(paints, index)).toBe(paints[0]);
      expect(paintIndex(paints, index)).toBe(0);
    }
    expect(paintAt(paints, 1)).toBe(paints[1]);
  });

  it("is asked for by a link by its index or its colour", () => {
    expect(paintAsked("?paint=1", paints)).toBe(1);
    expect(paintAsked("?paint=teal", paints)).toBe(1);
    expect(paintAsked("?car=grus", paints)).toBeNull();
    expect(() => paintAsked("?paint=7", paints)).toThrow();
    expect(() => paintAsked("?paint=mauve", paints)).toThrow();
  });
});
