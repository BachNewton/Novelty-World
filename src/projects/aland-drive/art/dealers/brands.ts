import type { Maker } from "../../sim/cars/character";
import type { Paint } from "./shell";

/*
 * The badges of the makers the dealerships sell, the cars' own makers (`sim/cars/`). The cars wear no badge, so each
 * badge takes its maker's face: Tärna's tern and its bracket of light, Västan's west wind over the fjärd, Klippa's
 * cliff, Ödmark's square-cut Ö and its rally mouth, Norrsken's three stacked streaks of light, Aurelle's grille framed in
 * bright metal and crossed by one bar. Each logo is a badge and its marks, as outlines on a square from -1 to 1, drawn
 * by `Shell.logo`.
 */

export type Outline = readonly (readonly [number, number])[];

export const BRAND_IDS = ["klippa", "vastan", "odmark", "norrsken", "tarna", "aurelle"] as const;
export type BrandId = (typeof BRAND_IDS)[number];

export interface Brand {
  id: BrandId;
  maker: Maker;
  /** The maker's name in capitals, as lettered on a sign. */
  name: string;
  colour: Paint;
  ink: Paint;
  badge: Outline;
  marks: readonly Outline[];
}

const ring = (sides: number, start = 0, squash = 1): Outline => Array.from({ length: sides }, (_, side) => [Math.cos(start + (side * 2 * Math.PI) / sides), squash * Math.sin(start + (side * 2 * Math.PI) / sides)] as const);

const rectangle = (x0: number, y0: number, x1: number, y1: number): Outline => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

const wave = (y: number): Outline => {
  const top: [number, number][] = [[-0.72, y + 0.02], [-0.4, y + 0.2], [-0.08, y + 0.05], [0.26, y + 0.21], [0.72, y + 0.04]];
  const bottom = top.map(([x, h]) => [x, h - 0.17] as const).reverse();
  return [...top, ...bottom];
};

/** A streak of light leaning up to the right, `out` further right than the one below it. */
const streak = (y: number, out: number): Outline => [[-0.62 + out, y], [0.18 + out, y], [0.34 + out, y + 0.2], [-0.46 + out, y + 0.2]];

export const BRANDS: Readonly<Record<BrandId, Brand>> = {
  klippa: {
    id: "klippa",
    maker: "Klippa",
    name: "KLIPPA",
    colour: "dealer-klippa",
    ink: "dealer-klippa-ink",
    badge: [[-1, -0.78], [-0.78, -1], [0.78, -1], [1, -0.78], [1, 0.78], [0.78, 1], [-0.78, 1], [-1, 0.78]],
    marks: [[[-0.74, -0.68], [-0.42, 0.06], [-0.22, -0.1], [0.18, 0.72], [0.34, 0.42], [0.74, -0.68]]],
  },
  vastan: {
    id: "vastan",
    maker: "Västan",
    name: "VÄSTAN",
    colour: "dealer-vastan",
    ink: "dealer-vastan-ink",
    badge: ring(6, Math.PI / 6),
    marks: [wave(0.22), wave(-0.08), wave(-0.38)],
  },
  odmark: {
    id: "odmark",
    maker: "Ödmark",
    name: "ÖDMARK",
    colour: "dealer-odmark",
    ink: "dealer-odmark-ink",
    badge: [[-1, -0.62], [-0.8, -0.82], [0.8, -0.82], [1, -0.62], [1, 0.62], [0.8, 0.82], [-0.8, 0.82], [-1, 0.62]],
    // A square-cut Ö: four bars round a dark middle, and its two dots.
    marks: [rectangle(-0.5, -0.6, 0.5, -0.4), rectangle(-0.5, 0.2, 0.5, 0.4), rectangle(-0.5, -0.4, -0.3, 0.2), rectangle(0.3, -0.4, 0.5, 0.2), rectangle(-0.42, 0.52, -0.2, 0.7), rectangle(0.2, 0.52, 0.42, 0.7)],
  },
  norrsken: {
    id: "norrsken",
    maker: "Norrsken",
    name: "NORRSKEN",
    colour: "dealer-norrsken",
    ink: "dealer-norrsken-ink",
    badge: [[-1, -0.7], [-0.7, -1], [0.7, -1], [1, -0.7], [1, 0.7], [0.7, 1], [-0.7, 1], [-1, 0.7]],
    marks: [streak(-0.5, -0.12), streak(-0.1, 0), streak(0.3, 0.12)],
  },
  tarna: {
    id: "tarna",
    maker: "Tärna",
    name: "TÄRNA",
    colour: "dealer-tarna-ink",
    ink: "dealer-tarna",
    badge: ring(20),
    marks: [
      // A tern seen from below: long swept wings, a forked tail.
      [[-0.78, 0.38], [-0.28, 0.2], [0.1, 0.16], [0.36, 0.3], [0.5, 0.2], [0.34, 0.08], [0.72, -0.1], [0.14, -0.08], [-0.02, -0.14], [-0.3, -0.56], [-0.2, -0.16], [-0.46, -0.44], [-0.34, -0.04], [-0.3, 0.06]],
    ],
  },
  aurelle: {
    id: "aurelle",
    maker: "Aurelle",
    name: "AURELLE",
    colour: "dealer-aurelle",
    ink: "dealer-aurelle-ink",
    badge: ring(20, 0, 0.72),
    // A low, wide grille framed in bright metal, crossed by one bright bar.
    marks: [rectangle(-0.66, 0.26, 0.66, 0.36), rectangle(-0.66, -0.36, 0.66, -0.26), rectangle(-0.66, -0.26, -0.56, 0.26), rectangle(0.56, -0.26, 0.66, 0.26), rectangle(-0.56, -0.04, 0.56, 0.04)],
  },
};

export const brandOf = (maker: Maker): Brand => {
  const brand = Object.values(BRANDS).find((candidate) => candidate.maker === maker);
  if (brand === undefined) throw new Error(`no badge for ${maker}`);
  return brand;
};
