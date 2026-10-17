import type { Rng } from "@/shared/lib/seeded-random";
import { allele, both, has, weighted, type Frequencies, type Pair } from "../animals/genes";

/*
 * A dog's coat from simplified but real dog coat genetics. A dog has two
 * parents' types (see `dog.ts`), and at every locus one allele comes from
 * each: drawn at the frequency of the mother's type and of the father's, so a
 * mix inherits as a mix does. The genotype decides the phenotype by the usual
 * dominance; the phenotype is what the coat shader draws.
 *
 * Loci (dominant first):
 * - E: Em melanistic mask > E > e. A dog with e/e makes no eumelanin in its
 *   coat at all, whatever else it carries: a clear red, fawn or cream.
 * - K: KB dominant black (a solid coat) > kbr brindle > ky, which lets A show.
 * - A: ay sable > aw wild grey > at tan points > a recessive black.
 *   Saddle (Sd) turns tan points into a black saddle on a tan dog.
 * - B: black > b liver; D: dense > d dilute (black to blue, liver to isabella).
 * - I: the phaeomelanin's intensity, I/I red, I/i fawn, i/i cream.
 * - M: merle, dominant and rare, which thins the eumelanin into a torn
 *   patchwork of full colour on pale.
 * - S: S solid (a chest star at most) > si Irish white (collar, chest, legs,
 *   blaze, tail tip) > sp piebald, more white with each step down.
 * - L: short > l long coat; U: a plush stand-off double coat (a spitz's), dominant.
 */

export type Sex = "female" | "male";

export interface Genotype {
  sex: Sex;
  extension: Pair<"Em" | "E" | "e">;
  black: Pair<"KB" | "kbr" | "ky">;
  agouti: Pair<"ay" | "aw" | "at" | "a">;
  saddle: Pair<"Sd" | "sd">;
  brown: Pair<"B" | "b">;
  dilute: Pair<"D" | "d">;
  intensity: Pair<"I" | "i">;
  merle: Pair<"M" | "m">;
  white: Pair<"S" | "si" | "sp">;
  long: Pair<"L" | "l">;
  undercoat: Pair<"U" | "u">;
}

export type Locus = Exclude<keyof Genotype, "sex">;
/** Each locus's alleles with their frequency in one type of dog. */
export type GenePool = { [L in Locus]: Frequencies<Genotype[L][number]> };

/** One allele from each parent's pool at every locus. */
export function drawGenotype(rng: Rng, mother: GenePool, father: GenePool): Genotype {
  const from = <L extends Locus>(locus: L): Pair<Genotype[L][number]> => [allele(rng, mother[locus]), allele(rng, father[locus])];
  return {
    sex: rng.next() < 0.5 ? "female" : "male",
    extension: from("extension"),
    black: from("black"),
    agouti: from("agouti"),
    saddle: from("saddle"),
    brown: from("brown"),
    dilute: from("dilute"),
    intensity: from("intensity"),
    merle: from("merle"),
    white: from("white"),
    long: from("long"),
    undercoat: from("undercoat"),
  };
}

export type Eumelanin = "black" | "liver" | "blue" | "isabella";
export type Phaeomelanin = "red" | "fawn" | "cream";
/**
 * Where the eumelanin lies: all over (solid), nowhere (clear), shading the
 * top of a red coat (sable), banding a grey one (agouti, a wolf's), all but
 * the tan points (tan), or only a saddle (saddle).
 */
export type Pattern = "solid" | "clear" | "sable" | "agouti" | "tan" | "saddle";
export type CoatLength = "short" | "medium" | "long";
export type EyeColour = "dark" | "brown" | "amber" | "blue";

export interface Coat {
  eumelanin: Eumelanin;
  phaeomelanin: Phaeomelanin;
  pattern: Pattern;
  /** Brindle stripes of eumelanin over the phaeomelanin. */
  brindle: boolean;
  /** A dark mask over the muzzle. */
  mask: boolean;
  merle: boolean;
  /** How much of the coat is white, 0 to 1. */
  white: number;
  /** How dark a sable's shading runs, 0 to 1. */
  shading: number;
  length: CoatLength;
  /** Where its patches and its white edges fall: an offset into the shader's noise, so no two match. */
  marks: readonly [number, number, number];
  eyes: readonly [EyeColour, EyeColour];
  /** The nose leather is always the eumelanin's colour, even on a clear red dog. */
  nose: Eumelanin;
}

function whiteGrade(rng: Rng, white: Genotype["white"]): number {
  const steps = white.reduce((sum, a) => sum + (a === "S" ? 0 : a === "si" ? 1 : 2), 0);
  switch (steps) {
    case 0:
      return rng.next() < 0.35 ? 0.03 + rng.next() * 0.05 : 0;
    case 1:
      return 0.07 + rng.next() * 0.12;
    case 2:
      return has(white, "S") ? 0.12 + rng.next() * 0.15 : 0.22 + rng.next() * 0.14;
    case 3:
      return 0.32 + rng.next() * 0.2;
    default:
      return 0.58 + rng.next() * 0.3;
  }
}

function patternOf(genotype: Genotype): Pattern {
  if (both(genotype.extension, "e")) return "clear";
  if (has(genotype.black, "KB")) return "solid";
  const a = genotype.agouti;
  if (has(a, "ay")) return "sable";
  if (has(a, "aw")) return "agouti";
  if (has(a, "at")) return has(genotype.saddle, "Sd") ? "saddle" : "tan";
  return "solid";
}

/** Eyes follow the coat: dark on most dogs, amber on liver and the dilutes, and sometimes blue with merle or much white. */
function eyesOf(rng: Rng, coat: Pick<Coat, "eumelanin" | "merle" | "white">): readonly [EyeColour, EyeColour] {
  const own: EyeColour = coat.eumelanin === "black" ? weighted(rng, [["dark", 3], ["brown", 2]] as const) : coat.eumelanin === "blue" ? weighted(rng, [["brown", 1], ["amber", 2]] as const) : "amber";
  const blueChance = coat.merle ? 0.45 : coat.white > 0.6 ? 0.12 : 0;
  if (rng.next() < blueChance) {
    const roll = rng.next();
    if (roll < 0.5) return ["blue", "blue"];
    return roll < 0.75 ? ["blue", own] : [own, "blue"];
  }
  return [own, own];
}

/** What a genotype looks like. The rng draws what genes alone don't fix: how much white, where the patches fall. */
export function coatOf(genotype: Genotype, rng: Rng): Coat {
  const dense = has(genotype.dilute, "D");
  const liver = both(genotype.brown, "b");
  const eumelanin: Eumelanin = liver ? (dense ? "liver" : "isabella") : dense ? "black" : "blue";
  const intensity = genotype.intensity.filter((a) => a === "I").length;
  const pattern = patternOf(genotype);
  const showsEumelanin = pattern !== "clear";
  const base = {
    eumelanin,
    phaeomelanin: intensity === 2 ? ("red" as const) : intensity === 1 ? ("fawn" as const) : ("cream" as const),
    pattern,
    brindle: showsEumelanin && pattern !== "solid" && has(genotype.black, "kbr"),
    // A mask shows on a coat with red to darken: a sable's, a grey's or a brindle's.
    mask: has(genotype.extension, "Em") && (pattern === "sable" || pattern === "agouti" || (pattern !== "solid" && pattern !== "clear" && has(genotype.black, "kbr"))),
    merle: showsEumelanin && has(genotype.merle, "M"),
    white: whiteGrade(rng, genotype.white),
    shading: 0.1 + rng.next() * 0.75,
    length: both(genotype.long, "l") ? ("long" as const) : has(genotype.undercoat, "U") ? ("medium" as const) : ("short" as const),
    marks: [rng.next() * 100, rng.next() * 100, rng.next() * 100] as const,
  } satisfies Omit<Coat, "eyes" | "nose">;
  return { ...base, eyes: eyesOf(rng, base), nose: eumelanin };
}

const MERLE: Record<Eumelanin, string> = { black: "blue merle", liver: "red merle", blue: "slate merle", isabella: "isabella merle" };

/** A coat's everyday name, as a breeder would say it: "black and tan", "red sable", "blue merle and white", "tricolour". */
export function coatName(coat: Coat): string {
  const eu = coat.eumelanin;
  const tricolour = (coat.pattern === "tan" || coat.pattern === "saddle") && coat.white >= 0.12;
  let name: string;
  if (coat.pattern === "clear") name = coat.phaeomelanin;
  // A sable with little shading is called by its red, as a Finnish Spitz is.
  else if (coat.pattern === "sable") name = coat.merle ? "sable merle" : coat.brindle ? `${coat.phaeomelanin} brindle` : coat.shading < 0.3 ? coat.phaeomelanin : `${coat.phaeomelanin} sable`;
  else if (coat.pattern === "agouti") name = coat.brindle ? "grey brindle" : eu === "black" ? "wolf grey" : `${eu} grey`;
  else if (coat.pattern === "solid") name = coat.merle ? MERLE[eu] : eu;
  else {
    const colour = coat.merle ? MERLE[eu] : eu;
    if (tricolour) name = eu === "black" && !coat.merle ? "tricolour" : `${colour} tricolour`;
    else name = coat.brindle ? `${colour} and brindle` : `${colour} and tan`;
  }
  if (coat.mask) name += ` with ${eu === "black" ? "black" : eu} mask`;
  if (tricolour || coat.white < 0.12) return name;
  return coat.white > 0.55 ? `white and ${name}` : `${name} and white`;
}
