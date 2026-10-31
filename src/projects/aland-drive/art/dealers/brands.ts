import type { Paint } from "./shell";

/*
 * Three invented makers, one for each kind of buyer, who between them sell the six invented cars. Each logo is a badge
 * and a mark, as outlines on a square from -1 to 1, drawn by `Shell.logo`.
 *
 * Tärna is the tern, the sea bird of the skerries: fast, light, for the buyer at the water. Västan is the west wind
 * over the fjärd, the family car from the town. Klippa is the cliff: tools and load, from the village garage.
 */

export type Outline = readonly (readonly [number, number])[];

export const BRAND_IDS = ["klippa", "vastan", "tarna"] as const;
export type BrandId = (typeof BRAND_IDS)[number];

export interface Brand {
  id: BrandId;
  name: string;
  /** The word under the logo, in the local language. */
  line: string;
  colour: Paint;
  ink: Paint;
  badge: Outline;
  marks: readonly Outline[];
  /** The cars it sells, by their `CarSpec` names. */
  cars: readonly string[];
}

const ring = (sides: number, start = 0): Outline => Array.from({ length: sides }, (_, side) => [Math.cos(start + (side * 2 * Math.PI) / sides), Math.sin(start + (side * 2 * Math.PI) / sides)] as const);

const wave = (y: number): Outline => {
  const top: [number, number][] = [[-0.72, y + 0.02], [-0.4, y + 0.2], [-0.08, y + 0.05], [0.26, y + 0.21], [0.72, y + 0.04]];
  const bottom = top.map(([x, h]) => [x, h - 0.17] as const).reverse();
  return [...top, ...bottom];
};

export const BRANDS: Readonly<Record<BrandId, Brand>> = {
  klippa: {
    id: "klippa",
    name: "KLIPPA",
    line: "BILVERKSTAD",
    colour: "dealer-klippa",
    ink: "dealer-klippa-ink",
    badge: [[-1, -0.78], [-0.78, -1], [0.78, -1], [1, -0.78], [1, 0.78], [0.78, 1], [-0.78, 1], [-1, 0.78]],
    marks: [
      [[-0.74, -0.68], [-0.42, 0.06], [-0.22, -0.1], [0.18, 0.72], [0.34, 0.42], [0.74, -0.68]],
    ],
    cars: ["Holm", "Kobb"],
  },
  vastan: {
    id: "vastan",
    name: "VÄSTAN",
    line: "BILAR",
    colour: "dealer-vastan",
    ink: "dealer-vastan-ink",
    badge: ring(6, Math.PI / 6),
    marks: [wave(0.22), wave(-0.08), wave(-0.38)],
    cars: ["Ljus", "Fjärd"],
  },
  tarna: {
    id: "tarna",
    name: "TÄRNA",
    line: "SKÄRGÅRD",
    colour: "dealer-tarna-ink",
    ink: "dealer-tarna",
    badge: ring(20),
    marks: [
      // A tern seen from below: long swept wings, a forked tail.
      [[-0.78, 0.38], [-0.28, 0.2], [0.1, 0.16], [0.36, 0.3], [0.5, 0.2], [0.34, 0.08], [0.72, -0.1], [0.14, -0.08], [-0.02, -0.14], [-0.3, -0.56], [-0.2, -0.16], [-0.46, -0.44], [-0.34, -0.04], [-0.3, 0.06]],
    ],
    cars: ["Skerry GT", "Sund"],
  },
};
