import type { Rng } from "@/shared/lib/seeded-random";
import { allele, both, has, pair, weighted, type Pair } from "../animals/genes";

/*
 * A cat's coat from simplified but real cat coat genetics. Each locus holds
 * two alleles drawn from its frequency in a random-bred street population,
 * except orange, which rides on the X chromosome: a tom has one copy, a queen
 * two, so only a queen can carry both orange and not-orange and show the
 * patches of a tortoiseshell or a calico. The genotype decides the phenotype
 * by the usual dominance; the phenotype is what the coat shader draws.
 *
 * Loci (dominant first):
 * - B: black > b chocolate > bl cinnamon, the eumelanin's colour.
 * - D: dense > d dilute (black to blue, chocolate to lilac, cinnamon to fawn, red to cream).
 * - O (X-linked): orange replaces eumelanin with phaeomelanin.
 * - A: agouti, the tabby pattern shown > a non-agouti, a solid coat.
 *   Orange shows its tabby pattern whatever the agouti.
 * - Ta: ticked > ta; Mc: mackerel > mc classic; Sp: mackerel broken into spots.
 * - S: white spotting, incompletely dominant: ss none or a locket, Ss low to
 *   middling white, SS high white to van.
 * - W: dominant white, a white coat over everything (rare).
 * - C: full colour > cs colourpoint, the warm body pale and the cool points dark.
 * - L: short > l long hair.
 */

export type Sex = "female" | "male";

export interface Genotype {
  sex: Sex;
  brown: Pair<"B" | "b" | "bl">;
  dilute: Pair<"D" | "d">;
  /** One allele per X chromosome: one for a tom, two for a queen. */
  orange: readonly ("O" | "o")[];
  agouti: Pair<"A" | "a">;
  ticked: Pair<"Ta" | "ta">;
  mackerel: Pair<"Mc" | "mc">;
  spotted: Pair<"Sp" | "sp">;
  white: Pair<"S" | "s">;
  dominantWhite: Pair<"W" | "w">;
  colourpoint: Pair<"C" | "cs">;
  hair: Pair<"L" | "l">;
}

/** Each locus's alleles with their frequency in the population. */
const FREQUENCIES = {
  brown: [["B", 0.88], ["b", 0.08], ["bl", 0.04]],
  dilute: [["D", 0.68], ["d", 0.32]],
  orange: [["O", 0.2], ["o", 0.8]],
  agouti: [["A", 0.35], ["a", 0.65]],
  ticked: [["Ta", 0.04], ["ta", 0.96]],
  mackerel: [["Mc", 0.55], ["mc", 0.45]],
  spotted: [["Sp", 0.12], ["sp", 0.88]],
  white: [["S", 0.28], ["s", 0.72]],
  dominantWhite: [["W", 0.008], ["w", 0.992]],
  colourpoint: [["C", 0.8], ["cs", 0.2]],
  hair: [["L", 0.6], ["l", 0.4]],
} as const;

export function drawGenotype(rng: Rng): Genotype {
  const sex: Sex = rng.next() < 0.5 ? "female" : "male";
  return {
    sex,
    brown: pair(rng, FREQUENCIES.brown),
    dilute: pair(rng, FREQUENCIES.dilute),
    orange: sex === "female" ? pair(rng, FREQUENCIES.orange) : [allele(rng, FREQUENCIES.orange)],
    agouti: pair(rng, FREQUENCIES.agouti),
    ticked: pair(rng, FREQUENCIES.ticked),
    mackerel: pair(rng, FREQUENCIES.mackerel),
    spotted: pair(rng, FREQUENCIES.spotted),
    white: pair(rng, FREQUENCIES.white),
    dominantWhite: pair(rng, FREQUENCIES.dominantWhite),
    colourpoint: pair(rng, FREQUENCIES.colourpoint),
    hair: pair(rng, FREQUENCIES.hair),
  };
}

/** The eumelanin's colour: black, chocolate or cinnamon, or their dilutes. */
export type Eumelanin = "black" | "chocolate" | "cinnamon" | "blue" | "lilac" | "fawn";
/** The phaeomelanin's colour: red (a ginger cat's orange) or its dilute. */
export type Phaeomelanin = "red" | "cream";
export type TabbyPattern = "mackerel" | "classic" | "spotted" | "ticked";
export type EyeColour = "blue" | "green" | "hazel" | "gold" | "copper";
export type NoseLeather = "pink" | "brick" | "dark" | "rose";

export interface Coat {
  eumelanin: Eumelanin;
  phaeomelanin: Phaeomelanin;
  /** How much of the coat is orange: none, patches (a tortoiseshell or calico), or all. */
  orange: "none" | "patches" | "all";
  /** Whether the eumelanin shows its tabby pattern. Orange always shows it. */
  agouti: boolean;
  pattern: TabbyPattern;
  /** How much of the coat is white, 0 (none) to 1 (a white cat). */
  white: number;
  pointed: boolean;
  longHair: boolean;
  /** For a tortoiseshell, the share of its patches that are orange. */
  orangeShare: number;
  /** How big its patches are: a calico's, with white, are bigger than a tortie's. */
  patchSize: number;
  /** Where its patches and its white edges fall: an offset into the shader's noise, so no two match. */
  marks: readonly [number, number, number];
  eyes: readonly [EyeColour, EyeColour];
  nose: NoseLeather;
}

const DILUTE_OF: Record<"black" | "chocolate" | "cinnamon", Eumelanin> = { black: "blue", chocolate: "lilac", cinnamon: "fawn" };

function whiteGrade(rng: Rng, white: Genotype["white"]): number {
  const copies = white.filter((a) => a === "S").length;
  if (copies === 0) return rng.next() < 0.2 ? 0.03 + rng.next() * 0.07 : 0;
  if (copies === 1) return 0.15 + rng.next() * 0.45;
  return 0.6 + rng.next() * 0.35;
}

/** Eyes follow the coat: points are always blue, high white is often blue or
 *  odd-eyed, and the rest run green to copper, warmer on orange and dilute coats. */
function eyesOf(rng: Rng, coat: Pick<Coat, "pointed" | "white" | "orange" | "eumelanin">): readonly [EyeColour, EyeColour] {
  if (coat.pointed) return ["blue", "blue"];
  const warm = coat.orange === "all" || coat.eumelanin === "blue" || coat.eumelanin === "lilac";
  const table: readonly (readonly [EyeColour, number])[] = warm
    ? [["gold", 45], ["copper", 30], ["hazel", 15], ["green", 10]]
    : [["green", 25], ["hazel", 25], ["gold", 35], ["copper", 15]];
  if (coat.white > 0.8) {
    const roll = rng.next();
    if (roll < 0.25) return ["blue", "blue"];
    if (roll < 0.45) {
      const other = weighted(rng, [["gold", 1], ["copper", 1]] as const);
      return rng.next() < 0.5 ? ["blue", other] : [other, "blue"];
    }
  }
  const colour = weighted(rng, table);
  return [colour, colour];
}

function noseOf(coat: Pick<Coat, "pointed" | "white" | "orange" | "agouti" | "eumelanin">): NoseLeather {
  if (coat.white > 0.55 || coat.orange === "all") return "pink";
  if (coat.agouti) return "brick";
  if (coat.eumelanin === "black" || coat.eumelanin === "blue" || coat.eumelanin === "chocolate") return "dark";
  return "rose";
}

/** What a genotype looks like. The rng draws what genes alone don't fix: how much white, where the patches fall. */
export function coatOf(genotype: Genotype, rng: Rng): Coat {
  const dense = has(genotype.dilute, "D");
  const brown = has(genotype.brown, "B") ? "black" : has(genotype.brown, "b") ? "chocolate" : "cinnamon";
  const eumelanin = dense ? brown : DILUTE_OF[brown];
  const orangeCopies = genotype.orange.filter((a) => a === "O").length;
  const orange = orangeCopies === 0 ? "none" : orangeCopies === genotype.orange.length ? "all" : "patches";
  const pattern: TabbyPattern = has(genotype.ticked, "Ta")
    ? "ticked"
    : has(genotype.mackerel, "Mc")
      ? has(genotype.spotted, "Sp")
        ? "spotted"
        : "mackerel"
      : "classic";
  const white = both(genotype.dominantWhite, "w") ? whiteGrade(rng, genotype.white) : 1;
  const base = {
    eumelanin,
    phaeomelanin: dense ? ("red" as const) : ("cream" as const),
    orange,
    agouti: has(genotype.agouti, "A"),
    pattern,
    white,
    pointed: both(genotype.colourpoint, "cs"),
    longHair: both(genotype.hair, "l"),
    orangeShare: 0.3 + rng.next() * 0.4,
    patchSize: white > 0.3 ? 1.6 + rng.next() * 0.6 : 0.8 + rng.next() * 0.5,
    marks: [rng.next() * 100, rng.next() * 100, rng.next() * 100] as const,
  } satisfies Omit<Coat, "eyes" | "nose">;
  return { ...base, eyes: eyesOf(rng, base), nose: noseOf(base) };
}

const POINT_NAMES: Record<Eumelanin, string> = {
  black: "seal",
  chocolate: "chocolate",
  cinnamon: "cinnamon",
  blue: "blue",
  lilac: "lilac",
  fawn: "fawn",
};

/** A coat's everyday name, as a breeder would say it: "blue mackerel tabby and white", "dilute calico", "seal lynx point". */
export function coatName(coat: Coat): string {
  if (coat.white >= 1) return "white";
  const dilute = coat.phaeomelanin === "cream";
  const tabby = `${coat.pattern} tabby`;
  let name: string;
  if (coat.pointed) {
    const colour = coat.orange === "all" ? (dilute ? "cream" : "flame") : POINT_NAMES[coat.eumelanin];
    const tortie = coat.orange === "patches" ? " tortie" : "";
    const lynx = coat.agouti || coat.orange === "all" ? " lynx" : "";
    name = `${colour}${tortie}${lynx} point`;
  } else if (coat.orange === "all") {
    name = `${dilute ? "cream" : "red"} ${tabby}`;
  } else if (coat.orange === "patches") {
    const kind = coat.white > 0.3 ? "calico" : coat.agouti ? "torbie" : "tortoiseshell";
    name = dilute ? `dilute ${kind}` : kind;
  } else {
    const colour = coat.eumelanin === "black" && coat.agouti ? "brown" : coat.eumelanin;
    name = coat.agouti ? `${colour} ${tabby}` : colour;
  }
  if (coat.white > 0.85) return `${name} van`;
  if (coat.white > 0.15 && !(coat.orange === "patches" && coat.white > 0.3)) return `${name} and white`;
  return name;
}
