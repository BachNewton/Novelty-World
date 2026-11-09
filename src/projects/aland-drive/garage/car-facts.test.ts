import { describe, expect, it } from "vitest";
import { allCarFacts } from "./car-facts";

/*
 * The Cars page reads every car's spec sheet from its files: a car added without a figure the sheet reads (a sprint to
 * 100 km/h on its tier's surface, a corner held at 100 km/h on asphalt and on gravel) would break the page as it opens.
 */

describe("the cars' spec sheets", () => {
  it.each(allCarFacts().map((facts) => [facts.id, facts] as const))("reads %s's from its files, every figure a real one", (_, facts) => {
    const figures = [facts.to100.s, facts.topKmh, facts.stopFrom100M, facts.grip.asphalt, facts.grip.gravel, facts.powerKw, facts.torqueNm, facts.massKg, facts.kwPerTonne, facts.gears];
    expect(figures.every((figure) => Number.isFinite(figure) && figure > 0)).toBe(true);
    expect(facts.engine.length).toBeGreaterThan(0);
  });
});
