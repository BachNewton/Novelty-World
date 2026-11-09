import { describe, expect, it } from "vitest";
import { limitsOn } from "../../sim/car-limits";
import { CAR_IDS, CARS as TUNINGS } from "../../sim/cars";
import { buildDistant } from "./body";
import { axleY, buildCarParts, groundY, lampCentres, type CarSpec } from "./build";
import { SURFACES, type Soup, type Surface } from "./mesh";
import { CARS, WORLD_CARS } from "./specs";

const HERO_BUDGET = 25000;
const FAR_BUDGET = 2000;
const DISTANT_BUDGET = 160;

/** What a tyre rising through would show through: the body's paint and trim that look up, not its wells, cabin or glass. */
const HIDES_TYRE = (surface: Surface) => !["under", "interior", "seat", "seatTan", "glass"].includes(surface);

/**
 * The least room, per axle, between the top of a tyre at rest and the body straight over it: rays up from the axle's
 * height across the tread's width and most of its length, each meeting the lowest face over it that looks up.
 */
function roomOverTyres(car: CarSpec, trackM: number, axleZ: readonly number[]): number[] {
  const { positions: p, surfaces, triangles } = buildCarParts(car, "hero").body;
  const { radiusM: r, widthM } = car.wheel;
  const axle = axleY(car);
  const inner = trackM / 2 - widthM / 2;
  const faces: number[] = [];
  for (let face = 0; face < triangles; face++) {
    const at = face * 9;
    const [ux, uy, uz] = [p[at + 3] - p[at], p[at + 4] - p[at + 1], p[at + 5] - p[at + 2]];
    const [vx, vy, vz] = [p[at + 6] - p[at], p[at + 7] - p[at + 1], p[at + 8] - p[at + 2]];
    const [nx, ny, nz] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    if (HIDES_TYRE(SURFACES[surfaces[face * 3]]) && ny / Math.hypot(nx, ny, nz) > 0.3) faces.push(at);
  }
  return axleZ.map((wheelZ) => {
    const near = faces.filter((at) => {
      const [xs, zs] = [[p[at], p[at + 3], p[at + 6]], [p[at + 2], p[at + 5], p[at + 8]]];
      return Math.max(...xs) >= inner && Math.min(...xs) <= inner + widthM && Math.max(...zs) >= wheelZ - r && Math.min(...zs) <= wheelZ + r;
    });
    let least = Infinity;
    for (let across = 0; across <= 6; across++) {
      for (let along = -8; along <= 8; along++) {
        const [x, z] = [inner + (widthM * across) / 6, wheelZ + (0.9 * r * along) / 8];
        let over = Infinity;
        for (const at of near) {
          const [ax, ay, az, bx, by, bz, cx, cy, cz] = p.subarray(at, at + 9);
          const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
          const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
          const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
          const y = u * ay + v * by + (1 - u - v) * cy;
          if (u >= 0 && v >= 0 && u + v <= 1 && y > axle) over = Math.min(over, y);
        }
        least = Math.min(least, over - axle - Math.sqrt(r * r - (z - wheelZ) ** 2));
      }
    }
    return least;
  });
}

const total = ({ body, glass, wheel }: { body: Soup; glass: Soup | null; wheel: Soup }) => body.triangles + (glass?.triangles ?? 0) + wheel.triangles * 4;

/** Six times the volume a shell encloses: positive when its faces point outwards. */
function signedVolume({ positions }: Soup) {
  let sum = 0;
  for (let at = 0; at < positions.length; at += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.subarray(at, at + 9);
    sum += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return sum;
}

describe("the cars", () => {
  it.each(CARS.map((car) => [car.name, car] as const))("%s stays in its triangle budget at both details, its faces outwards and its normals whole", (_, car) => {
    const hero = buildCarParts(car, "hero");
    const far = buildCarParts(car, "far");
    expect(total(hero)).toBeLessThan(HERO_BUDGET);
    expect(total(far)).toBeLessThan(FAR_BUDGET);
    expect(signedVolume(far.body)).toBeGreaterThan(0);
    expect(signedVolume(hero.wheel)).toBeGreaterThan(0);
    expect(hero.body.normals.every(Number.isFinite)).toBe(true);
  });

  it.each(WORLD_CARS.map((car) => [car.name, car] as const))("%s, a world car, stays under the world budget", (_, car) => {
    const far = buildCarParts(car, "far", true);
    expect(total(far)).toBeLessThan(FAR_BUDGET);
    expect(signedVolume(far.body)).toBeGreaterThan(0);
  });

  it.each([...CARS, ...WORLD_CARS].map((car) => [car.name, car] as const))("%s has a stand-in of its near version simplified, in its budget and facing out", (_, car) => {
    const distant = buildDistant(car.body, groundY(car), buildCarParts(car, "far").body);
    expect(distant.triangles).toBeLessThan(DISTANT_BUDGET);
    expect(signedVolume(distant)).toBeGreaterThan(0);
  });

  it("has art for every car a player can drive, once each", () => {
    expect(CARS.map(({ id }) => id)).toEqual(CAR_IDS);
  });

  it.each(CARS.map((car) => [car.name, car] as const))("%s collides as the box it's drawn as, above its sills and under its roof", (_, car) => {
    if (!car.id) throw new Error(`${car.name} has no simulation`);
    const { halfSize, boxUpM } = TUNINGS[car.id].car;
    const { positions } = buildCarParts(car, "far").body;
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    for (let at = 0; at < positions.length; at++) {
      low[at % 3] = Math.min(low[at % 3], positions[at]);
      high[at % 3] = Math.max(high[at % 3], positions[at]);
    }
    // The drawn width takes in the mirrors.
    expect(Math.abs(halfSize[0] - (high[0] - low[0]) / 2)).toBeLessThan(0.15);
    expect(Math.abs(halfSize[2] - (high[2] - low[2]) / 2)).toBeLessThan(0.12);
    expect(boxUpM - halfSize[1]).toBeGreaterThan(low[1] + 0.15);
    expect(boxUpM + halfSize[1]).toBeLessThan(high[1]);
  });

  // Downforce sinks the body onto its wheels at speed, and from above a tyre rising in its arch must stay under the paint.
  it.each(CARS.filter((car) => car.body.openWheels !== true).map((car) => [car.name, car] as const))("%s has room over its tyres for how far they rise at its top speed", (_, car) => {
    if (!car.id) throw new Error(`${car.name} has no simulation`);
    const { car: body, power, suspension } = TUNINGS[car.id];
    const top = limitsOn(car.id, "dry", "asphalt").reachedKmh / 3.6;
    const rise = (power.downforcePerMS2 * top * top) / 4 / (suspension.springNPerM + (suspension.heaveNPerM ?? 0));
    for (const room of roomOverTyres(car, body.trackM, body.axleZ)) expect(room).toBeGreaterThan(rise);
  });

  it.each(CARS.map((car) => [car.name, car] as const))("%s has its lamps on its ends, where its lenses are, not off the body", (_, car) => {
    const { body } = buildCarParts(car, "hero");
    const { head, tail } = lampCentres(body);
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    for (let at = 0; at < body.positions.length; at++) {
      low[at % 3] = Math.min(low[at % 3], body.positions[at]);
      high[at % 3] = Math.max(high[at % 3], body.positions[at]);
    }
    for (const [lamp, end] of [[head, low[2]], [tail, high[2]]] as const) {
      expect(Math.abs(lamp[2] - end)).toBeLessThan(0.4);
      expect(lamp[0]).toBeGreaterThan(0.2);
      expect(lamp[0]).toBeLessThan(high[0]);
      expect(lamp[1] - groundY(car)).toBeGreaterThan(0.3);
      expect(lamp[1]).toBeLessThan(high[1] - 0.3);
    }
  });
});
