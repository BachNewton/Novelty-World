import { describe, expect, it } from "vitest";
import { CAR_TIERS } from "../sim/cars";
import { fieldOf } from "./field";

describe("a race's field", () => {
  it("is the race's car first, then only the other cars of its tier", () => {
    const field = fieldOf("skerry-gt");
    expect(field[0]).toBe("skerry-gt");
    expect(field.length).toBeGreaterThan(1);
    for (const car of field) expect(CAR_TIERS[car]).toBe("A5");
  });

});
