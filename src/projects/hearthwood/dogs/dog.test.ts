import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { DOG_TYPES, generateDog, type Dog } from "./dog";
import { coatName, coatOf, drawGenotype, type Genotype } from "./genetics";

const POPULATION = Array.from({ length: 3000 }, (_, i) => generateDog(`dog-${i}`));
const share = (test: (dog: Dog) => boolean, among = POPULATION) => among.filter(test).length / among.length;

describe("a generated dog", () => {
  it("is the same dog every time from its seed", () => {
    expect(generateDog("rekku")).toEqual(generateDog("rekku"));
    expect(generateDog("rekku")).not.toEqual(generateDog("musti"));
  });

  it("keeps its build and personality in range", () => {
    for (const dog of POPULATION) {
      expect(dog.build.size).toBeGreaterThan(0.75);
      expect(dog.build.size).toBeLessThan(2.4);
      for (const key of ["stockiness", "legs", "body", "muzzle", "skull", "ears", "tail"] as const) {
        expect(dog.build[key]).toBeGreaterThan(0.6);
        expect(dog.build[key]).toBeLessThan(1.45);
      }
      for (const value of Object.values(dog.personality)) expect(Math.abs(value)).toBeLessThanOrEqual(1);
    }
  });

  it("varies in build far more than a cat", () => {
    const sizes = POPULATION.map((dog) => dog.build.size);
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThan(1.8);
    expect(share((dog) => dog.build.legs < 0.88)).toBeGreaterThan(0.03);
    expect(share((dog) => dog.build.muzzle > 1.15)).toBeGreaterThan(0.05);
  });
});

describe("the north's population", () => {
  it("is mostly spitz types and their mixes", () => {
    expect(share((dog) => dog.parents.includes("spitz"))).toBeGreaterThan(0.5);
    expect(share((dog) => dog.parents[0] !== dog.parents[1])).toBeGreaterThan(0.5);
  });

  it("is mostly prick-eared with curled tails, among every kind of ear, tail and coat", () => {
    expect(share((dog) => dog.ears === "prick")).toBeGreaterThan(0.4);
    expect(share((dog) => dog.tail === "curled")).toBeGreaterThan(0.3);
    for (const ears of ["prick", "fold", "drop"]) expect(share((dog) => dog.ears === ears)).toBeGreaterThan(0.08);
    for (const tail of ["curled", "plumed", "sabre", "straight"]) expect(share((dog) => dog.tail === tail)).toBeGreaterThan(0.03);
    for (const length of ["short", "medium", "long"]) expect(share((dog) => dog.coat.length === length)).toBeGreaterThan(0.05);
    expect(share((dog) => dog.coat.length === "medium")).toBeGreaterThan(0.4);
  });

  it("shows every pattern, merle rarely, and every name reads", () => {
    for (const pattern of ["solid", "clear", "sable", "agouti", "tan", "saddle"]) expect(share((dog) => dog.coat.pattern === pattern)).toBeGreaterThan(0.02);
    expect(share((dog) => dog.coat.brindle)).toBeGreaterThan(0.01);
    expect(share((dog) => dog.coat.merle)).toBeGreaterThan(0.003);
    expect(share((dog) => dog.coat.merle)).toBeLessThan(0.05);
    expect(share((dog) => dog.coat.pattern === "solid")).toBeLessThan(0.45);
    for (const dog of POPULATION) expect(coatName(dog.coat)).toMatch(/^[a-z ]+$/);
  });

  it("makes white markings from none to piebald", () => {
    expect(share((dog) => dog.coat.white === 0)).toBeGreaterThan(0.15);
    expect(share((dog) => dog.coat.white > 0.55)).toBeGreaterThan(0.02);
    expect(share((dog) => dog.coat.white > 0.55)).toBeLessThan(0.15);
  });
});

describe("a coat", () => {
  const base = drawGenotype(createRng("base"), DOG_TYPES.spitz.genes, DOG_TYPES.spitz.genes);
  const coat = (changes: Partial<Genotype>, seed = "c") => coatOf({ ...base, merle: ["m", "m"], white: ["S", "S"], ...changes }, createRng(seed));

  it("is clear red whatever else it carries when it has two copies of e, its nose still dark", () => {
    const red = coat({ extension: ["e", "e"], black: ["KB", "KB"], intensity: ["I", "I"], brown: ["B", "B"] });
    expect(red.pattern).toBe("clear");
    expect(red.nose).toBe("black");
    expect(coatName(red)).toBe("red");
  });

  it("is solid with dominant black, and shows the agouti series without it", () => {
    expect(coat({ extension: ["E", "E"], black: ["KB", "ky"] }).pattern).toBe("solid");
    const ky = { extension: ["E", "E"] as const, black: ["ky", "ky"] as const };
    expect(coat({ ...ky, agouti: ["ay", "at"] }).pattern).toBe("sable");
    expect(coat({ ...ky, agouti: ["aw", "at"] }).pattern).toBe("agouti");
    expect(coat({ ...ky, agouti: ["at", "a"], saddle: ["sd", "sd"] }).pattern).toBe("tan");
    expect(coat({ ...ky, agouti: ["at", "at"], saddle: ["Sd", "sd"] }).pattern).toBe("saddle");
    expect(coat({ ...ky, agouti: ["a", "a"] }).pattern).toBe("solid");
  });

  it("turns black to liver, blue and isabella, with eyes to match", () => {
    const solid = { extension: ["E", "E"] as const, black: ["KB", "KB"] as const };
    expect(coat({ ...solid, brown: ["b", "b"], dilute: ["D", "d"] }).eumelanin).toBe("liver");
    expect(coat({ ...solid, brown: ["B", "b"], dilute: ["d", "d"] }).eumelanin).toBe("blue");
    const isabella = coat({ ...solid, brown: ["b", "b"], dilute: ["d", "d"] });
    expect(isabella.eumelanin).toBe("isabella");
    expect(isabella.eyes).toEqual(["amber", "amber"]);
  });

  it("names the coats as breeders do", () => {
    const tan = { extension: ["E", "E"] as const, black: ["ky", "ky"] as const, agouti: ["at", "at"] as const, saddle: ["sd", "sd"] as const, brown: ["B", "B"] as const, dilute: ["D", "D"] as const };
    expect(coatName(coat(tan))).toBe("black and tan");
    expect(coatName(coat({ ...tan, white: ["si", "si"] }))).toBe("tricolour");
    const merle = coat({ extension: ["E", "E"], black: ["KB", "KB"], brown: ["B", "B"], dilute: ["D", "D"], merle: ["M", "m"] });
    expect(coatName(merle)).toBe("blue merle");
  });

  it("hides merle on a clear red, where there is no eumelanin to thin", () => {
    expect(coat({ extension: ["e", "e"], merle: ["M", "m"] }).merle).toBe(false);
  });

  it("sometimes gives merle blue eyes", () => {
    const blue = Array.from({ length: 200 }, (_, i) => coat({ extension: ["E", "E"], black: ["KB", "KB"], merle: ["M", "m"] }, `m${i}`)).filter((c) => c.eyes.includes("blue"));
    expect(blue.length).toBeGreaterThan(40);
    expect(blue.length).toBeLessThan(160);
  });
});
