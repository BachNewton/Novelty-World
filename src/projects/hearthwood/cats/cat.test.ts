import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { generateCat } from "./cat";
import { coatName, coatOf, drawGenotype, type Genotype } from "./genetics";

const POPULATION = Array.from({ length: 3000 }, (_, i) => generateCat(`cat-${i}`));
const share = (test: (cat: (typeof POPULATION)[number]) => boolean, among = POPULATION) => among.filter(test).length / among.length;
const toms = POPULATION.filter((cat) => cat.sex === "male");
const queens = POPULATION.filter((cat) => cat.sex === "female");

describe("a generated cat", () => {
  it("is the same cat every time from its seed", () => {
    expect(generateCat("whiskers")).toEqual(generateCat("whiskers"));
    expect(generateCat("whiskers")).not.toEqual(generateCat("mittens"));
  });

  it("keeps its build and personality in range", () => {
    for (const cat of POPULATION) {
      for (const value of Object.values(cat.build)) {
        expect(value).toBeGreaterThan(0.7);
        expect(value).toBeLessThan(1.35);
      }
      for (const value of Object.values(cat.personality)) expect(Math.abs(value)).toBeLessThanOrEqual(1);
    }
  });
});

describe("the orange gene", () => {
  it("is carried once by a tom and twice by a queen", () => {
    for (const cat of toms) expect(cat.genotype.orange).toHaveLength(1);
    for (const cat of queens) expect(cat.genotype.orange).toHaveLength(2);
  });

  it("makes tortoiseshells and calicos only of queens", () => {
    expect(toms.some((cat) => cat.coat.orange === "patches")).toBe(false);
    expect(share((cat) => cat.coat.orange === "patches", queens)).toBeGreaterThan(0.25);
  });

  it("makes most orange cats toms", () => {
    const orange = POPULATION.filter((cat) => cat.coat.orange === "all");
    expect(share((cat) => cat.sex === "male", orange)).toBeGreaterThan(0.75);
  });
});

describe("a population", () => {
  it("looks like a street population's mix", () => {
    expect(share((cat) => cat.coat.longHair)).toBeGreaterThan(0.1);
    expect(share((cat) => cat.coat.longHair)).toBeLessThan(0.25);
    expect(share((cat) => cat.coat.pointed)).toBeGreaterThan(0.02);
    expect(share((cat) => cat.coat.pointed)).toBeLessThan(0.07);
    expect(share((cat) => cat.coat.white === 0)).toBeGreaterThan(0.35);
    expect(share((cat) => cat.coat.white > 0.85)).toBeLessThan(0.1);
    expect(share((cat) => cat.coat.white >= 1)).toBeLessThan(0.04);
    // Black, its tabby and their dilutes are the commonest coats.
    expect(share((cat) => cat.coat.eumelanin === "black" || cat.coat.eumelanin === "blue")).toBeGreaterThan(0.75);
  });

  it("shows every pattern, and every name reads", () => {
    for (const pattern of ["mackerel", "classic", "spotted", "ticked"]) {
      expect(POPULATION.some((cat) => cat.coat.agouti && cat.coat.pattern === pattern)).toBe(true);
    }
    for (const cat of POPULATION) expect(coatName(cat.coat)).toMatch(/^[a-z ]+$/);
  });
});

describe("a coat", () => {
  const genotype = (changes: Partial<Genotype>): Genotype => ({ ...drawGenotype(createRng("base")), dominantWhite: ["w", "w"], ...changes });

  it("gives a colourpoint blue eyes", () => {
    for (const cat of POPULATION.filter((c) => c.coat.pointed)) expect(cat.coat.eyes).toEqual(["blue", "blue"]);
  });

  it("dilutes black to blue and red to cream", () => {
    const coat = coatOf(genotype({ brown: ["B", "b"], dilute: ["d", "d"], orange: ["O", "o"], sex: "female" }), createRng("c"));
    expect(coat.eumelanin).toBe("blue");
    expect(coat.phaeomelanin).toBe("cream");
    expect(coat.orange).toBe("patches");
  });

  it("hides the tabby pattern of non-agouti eumelanin, but names it for an agouti one", () => {
    const solid = coatOf(genotype({ agouti: ["a", "a"], orange: ["o"], sex: "male", white: ["s", "s"], brown: ["B", "B"], dilute: ["D", "D"], colourpoint: ["C", "C"] }), createRng("s"));
    expect(solid.agouti).toBe(false);
    expect(coatName(solid)).toMatch(/^black/);
    const tabby = coatOf(genotype({ agouti: ["A", "a"], ticked: ["ta", "ta"], mackerel: ["mc", "mc"], orange: ["o"], sex: "male", brown: ["B", "B"], dilute: ["D", "D"], colourpoint: ["C", "C"] }), createRng("t"));
    expect(coatName(tabby)).toMatch(/^brown classic tabby/);
  });

  it("turns dominant white into a white cat", () => {
    expect(coatOf(genotype({ dominantWhite: ["W", "w"] }), createRng("w")).white).toBe(1);
  });
});
