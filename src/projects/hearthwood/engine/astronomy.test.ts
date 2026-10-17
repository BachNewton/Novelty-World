import { describe, expect, it } from "vitest";
import { moonAt, sunAt, sunDay, sunLongitude, type Crossing, type Direction } from "./astronomy";
import { realDayOf } from "./calendar";

const HELSINKI = 60.17;
const MIDSUMMER = realDayOf(6, 21);
const MIDWINTER = realDayOf(12, 21);
const SPRING_EQUINOX = realDayOf(3, 20);
const AUTUMN_EQUINOX = realDayOf(9, 22);

function minutes(hours: number): number {
  return hours * 60;
}

function crossed(c: Crossing): { rises: number; sets: number } {
  if (typeof c === "string") throw new Error(`The sun was ${c}`);
  return c;
}

function degreesBetween(a: Direction, b: Direction): number {
  return (Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))) * 180) / Math.PI;
}

describe("the sun", () => {
  it("is up as long as it really is in Helsinki, to within a few minutes", () => {
    // Day lengths from the almanac for Helsinki, sunrise to sunset.
    expect(Math.abs(minutes(sunDay(MIDSUMMER, HELSINKI).dayLength) - minutes(18 + 56 / 60))).toBeLessThan(4);
    expect(Math.abs(minutes(sunDay(MIDWINTER, HELSINKI).dayLength) - minutes(5 + 49 / 60))).toBeLessThan(4);
    expect(Math.abs(minutes(sunDay(SPRING_EQUINOX, HELSINKI).dayLength) - minutes(12 + 12 / 60))).toBeLessThan(6);
    expect(Math.abs(minutes(sunDay(AUTUMN_EQUINOX, HELSINKI).dayLength) - minutes(12 + 11 / 60))).toBeLessThan(6);
  });

  it("reaches the solstices and equinoxes on their real dates", () => {
    const longitude = (day: number) => ((sunLongitude(day) * 180) / Math.PI + 360) % 360;
    expect(Math.abs(longitude(realDayOf(3, 20)) - 0)).toBeLessThan(1.5);
    expect(Math.abs(longitude(realDayOf(6, 21)) - 90)).toBeLessThan(1.5);
    expect(Math.abs(longitude(realDayOf(9, 22)) - 180)).toBeLessThan(1.5);
    expect(Math.abs(longitude(realDayOf(12, 21)) - 270)).toBeLessThan(1.5);
  });

  it("keeps a midsummer night in twilight, never reaching astronomical night", () => {
    const day = sunDay(MIDSUMMER, HELSINKI);
    expect(day.darkest).toBe("nautical");
    expect(day.astronomical).toBe("always-above");
    expect(day.lowest).toBeGreaterThan(-8);
    for (let hour = 0; hour < 24; hour += 0.1) expect(sunAt(MIDSUMMER, hour, HELSINKI).twilight).not.toMatch(/astronomical|night/);
    // Real dark only comes back towards autumn.
    expect(sunDay(realDayOf(8, 15), HELSINKI).darkest).toBe("astronomical");
    expect(sunDay(AUTUMN_EQUINOX, HELSINKI).darkest).toBe("night");
  });

  it("stands low in the south at midwinter noon and high at midsummer's", () => {
    const winter = sunAt(MIDWINTER, 12, HELSINKI);
    expect(winter.elevation).toBeCloseTo(90 - HELSINKI - 23.44, 0);
    expect(winter.azimuth).toBeCloseTo(180);
    expect(winter.direction.z).toBeGreaterThan(0.9);
    expect(sunAt(MIDSUMMER, 12, HELSINKI).elevation).toBeCloseTo(90 - HELSINKI + 23.44, 0);
    expect(sunDay(MIDWINTER, HELSINKI).highest).toBeCloseTo(winter.elevation, 1);
  });

  it("rises in the east at the equinox, the north-east in summer and the south-east in winter", () => {
    const rise = (day: number) => sunAt(day, crossed(sunDay(day, HELSINKI).sun).rises, HELSINKI);
    expect(rise(SPRING_EQUINOX).azimuth).toBeCloseTo(90, -1);
    expect(rise(SPRING_EQUINOX).direction.x).toBeGreaterThan(0.99);
    expect(rise(MIDSUMMER).azimuth).toBeLessThan(40);
    expect(rise(MIDWINTER).azimuth).toBeGreaterThan(135);
    const set = sunAt(SPRING_EQUINOX, crossed(sunDay(SPRING_EQUINOX, HELSINKI).sun).sets, HELSINKI);
    expect(set.azimuth).toBeCloseTo(270, -1);
    expect(set.elevation).toBeCloseTo(-0.833, 1);
  });

  it("is a unit vector in the world's axes, east +x, up +y, south +z", () => {
    for (let hour = 0; hour < 24; hour += 1.7) {
      const { direction } = sunAt(realDayOf(5, 1), hour, HELSINKI);
      expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1);
    }
    expect(sunAt(SPRING_EQUINOX, 9, HELSINKI).direction.x).toBeGreaterThan(0);
    expect(sunAt(SPRING_EQUINOX, 15, HELSINKI).direction.x).toBeLessThan(0);
    // At midsummer midnight the sun is just below the northern horizon.
    expect(sunAt(MIDSUMMER, 0, HELSINKI).direction.z).toBeLessThan(-0.9);
  });

  it("is the same every time", () => {
    expect(sunAt(123.4, 17.25, HELSINKI)).toEqual(sunAt(123.4, 17.25, HELSINKI));
  });
});

describe("the moon", () => {
  it("is lit as the sun lights it: the angle to the sun is its elongation, full opposite, new beside it", () => {
    for (let age = 0; age < 1; age += 0.07) {
      for (const hour of [3, 11, 19]) {
        const moon = moonAt(realDayOf(4, 10), hour, age, HELSINKI);
        const sun = sunAt(realDayOf(4, 10), hour, HELSINKI);
        expect(degreesBetween(moon.direction, sun.direction)).toBeCloseTo((moon.elongation * 180) / Math.PI, 3);
        expect(moon.illuminated).toBeCloseTo((1 - Math.cos(moon.elongation)) / 2);
        expect(moon.phaseAngle).toBeCloseTo(Math.PI - moon.elongation);
      }
    }
    expect(moonAt(SPRING_EQUINOX, 12, 0, HELSINKI).illuminated).toBeLessThan(0.01);
    expect(moonAt(SPRING_EQUINOX, 12, 0.5, HELSINKI).illuminated).toBeGreaterThan(0.99);
    expect(degreesBetween(moonAt(SPRING_EQUINOX, 12, 0, HELSINKI).direction, sunAt(SPRING_EQUINOX, 12, HELSINKI).direction)).toBeLessThan(6);
  });

  it("names its phases and whether it waxes or wanes", () => {
    const at = (age: number) => moonAt(SPRING_EQUINOX, 0, age, HELSINKI);
    expect(at(0).phase).toBe("new");
    expect(at(0.12)).toMatchObject({ phase: "waxing crescent", waxing: true });
    expect(at(0.25).phase).toBe("first quarter");
    expect(at(0.5).phase).toBe("full");
    expect(at(0.62)).toMatchObject({ phase: "waning gibbous", waxing: false });
    expect(at(0.75).phase).toBe("last quarter");
    expect(at(0.98).phase).toBe("new");
  });

  it("rises at sunset when full, and stands south at sunset at first quarter", () => {
    const sets = crossed(sunDay(SPRING_EQUINOX, HELSINKI).sun).sets;
    const full = moonAt(SPRING_EQUINOX, sets, 0.5, HELSINKI);
    expect(Math.abs(full.elevation)).toBeLessThan(2);
    expect(full.azimuth).toBeCloseTo(90, -1);
    expect(moonAt(SPRING_EQUINOX, sets + 0.5, 0.5, HELSINKI).elevation).toBeGreaterThan(full.elevation);
    // At midnight a full moon is highest, in the south.
    expect(moonAt(SPRING_EQUINOX, 0, 0.5, HELSINKI).azimuth).toBeCloseTo(180, -1);
    expect(moonAt(SPRING_EQUINOX, 18, 0.25, HELSINKI).azimuth).toBeCloseTo(180, -1);
    // A new moon is up with the sun, and down at night.
    expect(moonAt(SPRING_EQUINOX, 12, 0, HELSINKI).elevation).toBeGreaterThan(20);
    expect(moonAt(SPRING_EQUINOX, 0, 0, HELSINKI).elevation).toBeLessThan(-20);
  });

  it("rides low on a midsummer night and high on a midwinter one when full, as it does in the north", () => {
    expect(moonAt(MIDSUMMER, 0, 0.5, HELSINKI).elevation).toBeLessThan(15);
    expect(moonAt(MIDSUMMER, 0, 0.5, HELSINKI).elevation).toBeGreaterThan(5);
    expect(moonAt(MIDWINTER, 0, 0.5, HELSINKI).elevation).toBeGreaterThan(40);
  });

  it("is the same every time", () => {
    expect(moonAt(201.5, 2.5, 0.3, HELSINKI)).toEqual(moonAt(201.5, 2.5, 0.3, HELSINKI));
  });
});
