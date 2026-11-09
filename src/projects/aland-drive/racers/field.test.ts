import { describe, expect, it } from "vitest";
import { CARS } from "../sim/cars";
import { FIELD_SIZE, fieldOf } from "./field";

describe("a race's field", () => {
  it("is the race's car first, then cars of the kinds its ground suits, up to the grid", () => {
    const road = fieldOf("skerry-gt", "road");
    expect(road[0]).toBe("skerry-gt");
    expect(road).toHaveLength(FIELD_SIZE);
    expect(new Set(road).size).toBe(road.length);
    for (const car of road.slice(1)) expect(["sports", "road"]).toContain(CARS[car].class);
    const loose = fieldOf("grus", "off-road", 4);
    expect(loose).toHaveLength(4);
    for (const car of loose.slice(1)) expect(["rally", "offroad"]).toContain(CARS[car].class);
  });

  it("draws the cars nearest the race's car in pace, so a hypercar's field isn't a hatchback's", () => {
    expect(fieldOf("aska", "road")).not.toEqual(fieldOf("ljus", "road"));
    expect(fieldOf("aska", "road").slice(1)).toContain("blixt");
  });
});
