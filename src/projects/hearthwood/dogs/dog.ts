import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { spread, trait, weighted } from "../animals/genes";
import { coatOf, drawGenotype, type Coat, type GenePool, type Genotype, type Sex } from "./genetics";

/*
 * A generated dog of the north: its parents' types, the genes they give it
 * and the coat they make, its build and its personality, all from one seed,
 * so a dog is the same every time it is drawn.
 *
 * The population is a mix of a few working types, spitz most common of all:
 * each dog has a mother's and a father's type, often the same (a landrace
 * dog), as often not (a mix), and takes its genes one allele from each, and
 * its build halfway between the two, so mixes look like mixes.
 */

export type DogType = "spitz" | "shepherd" | "hound" | "retriever" | "collie" | "terrier";
export type EarType = "prick" | "fold" | "drop";
/** How the tail is carried: curled over the back, a feathered plume, hanging in a sabre's curve, or held straight out. */
export type TailType = "curled" | "plumed" | "sabre" | "straight";

/** Proportions against the dog sculpture's own, each 1 for an average dog except size. */
export interface Build {
  /** The sculpture's scale in the world: about 1 for a small dog (30 cm at the shoulder) to 2 for a big one. */
  size: number;
  /** Width and girth: a lean dog to a stocky one. */
  stockiness: number;
  legs: number;
  /** Length of the back from shoulder to hip. */
  body: number;
  muzzle: number;
  /** Breadth of the skull. */
  skull: number;
  ears: number;
  tail: number;
}

/** Three traits, each from −1 to 1. */
export interface Personality {
  /** Shy (−1) to bold (1): how high it holds its head and tail, how readily it comes. */
  boldness: number;
  /** Calm (−1) to playful (1): how much it bounces, wags and looks about. */
  playfulness: number;
  /** Independent (−1) to cuddly (1): how often it greets, how close it keeps. */
  affection: number;
}

export interface Dog {
  seed: string;
  sex: Sex;
  parents: readonly [DogType, DogType];
  genotype: Genotype;
  coat: Coat;
  build: Build;
  ears: EarType;
  tail: TailType;
  personality: Personality;
}

interface TypeTraits {
  /** How common the type is among the parents of the north's dogs. */
  share: number;
  genes: GenePool;
  build: Build;
  /** 1 pricked, 0.5 folded, 0 dropped: a mix's ears come out between its parents'. */
  erect: number;
  carriage: "curl" | "sabre" | "straight";
  temperament: Personality;
}

const pool = (overrides: Partial<GenePool>): GenePool => ({
  extension: [["Em", 0.05], ["E", 0.8], ["e", 0.15]],
  black: [["KB", 0.16], ["kbr", 0.05], ["ky", 0.79]],
  agouti: [["ay", 0.25], ["aw", 0.2], ["at", 0.45], ["a", 0.1]],
  saddle: [["Sd", 0.3], ["sd", 0.7]],
  brown: [["B", 0.88], ["b", 0.12]],
  dilute: [["D", 0.9], ["d", 0.1]],
  intensity: [["I", 0.55], ["i", 0.45]],
  merle: [["M", 0.01], ["m", 0.99]],
  white: [["S", 0.55], ["si", 0.25], ["sp", 0.2]],
  long: [["L", 0.85], ["l", 0.15]],
  undercoat: [["U", 0.3], ["u", 0.7]],
  ...overrides,
});

export const DOG_TYPES: Record<DogType, TypeTraits> = {
  // Lapphund, Finnish Spitz, elkhound, Karelian: prick ears, a curled tail, a plush coat; red, sable, wolf grey, black with white.
  spitz: {
    share: 0.4,
    genes: pool({
      extension: [["Em", 0.02], ["E", 0.76], ["e", 0.22]],
      black: [["KB", 0.09], ["kbr", 0.01], ["ky", 0.9]],
      agouti: [["ay", 0.38], ["aw", 0.36], ["at", 0.22], ["a", 0.04]],
      white: [["S", 0.62], ["si", 0.3], ["sp", 0.08]],
      long: [["L", 0.65], ["l", 0.35]],
      brown: [["B", 0.88], ["b", 0.12]],
      undercoat: [["U", 0.95], ["u", 0.05]],
      saddle: [["Sd", 0.1], ["sd", 0.9]],
      merle: [["M", 0.004], ["m", 0.996]],
    }),
    build: { size: 1.5, stockiness: 1.05, legs: 0.98, body: 0.98, muzzle: 0.92, skull: 1.06, ears: 1, tail: 1 },
    erect: 1,
    carriage: "curl",
    temperament: { boldness: 0.2, playfulness: 0.1, affection: -0.2 },
  },
  shepherd: {
    share: 0.12,
    genes: pool({
      extension: [["Em", 0.25], ["E", 0.7], ["e", 0.05]],
      black: [["KB", 0.1], ["kbr", 0.08], ["ky", 0.82]],
      agouti: [["ay", 0.22], ["aw", 0.28], ["at", 0.45], ["a", 0.05]],
      white: [["S", 0.9], ["si", 0.07], ["sp", 0.03]],
      undercoat: [["U", 0.7], ["u", 0.3]],
      saddle: [["Sd", 0.8], ["sd", 0.2]],
    }),
    build: { size: 1.85, stockiness: 1, legs: 1.06, body: 1.08, muzzle: 1.15, skull: 1, ears: 1.18, tail: 1.08 },
    erect: 0.95,
    carriage: "sabre",
    temperament: { boldness: 0.3, playfulness: 0, affection: 0.1 },
  },
  // Finnish hound, stövare: drop ears, a long muzzle, tricolour.
  hound: {
    share: 0.12,
    genes: pool({
      extension: [["Em", 0.05], ["E", 0.87], ["e", 0.08]],
      black: [["KB", 0.08], ["kbr", 0.06], ["ky", 0.86]],
      agouti: [["ay", 0.2], ["aw", 0.04], ["at", 0.72], ["a", 0.04]],
      brown: [["B", 0.8], ["b", 0.2]],
      white: [["S", 0.35], ["si", 0.2], ["sp", 0.45]],
      long: [["L", 0.97], ["l", 0.03]],
      undercoat: [["U", 0.08], ["u", 0.92]],
      saddle: [["Sd", 0.5], ["sd", 0.5]],
      merle: [["M", 0], ["m", 1]],
    }),
    build: { size: 1.6, stockiness: 0.94, legs: 1.08, body: 1.06, muzzle: 1.2, skull: 0.95, ears: 1.1, tail: 1.05 },
    erect: 0,
    carriage: "sabre",
    temperament: { boldness: 0.1, playfulness: 0.2, affection: 0.2 },
  },
  retriever: {
    share: 0.12,
    genes: pool({
      extension: [["Em", 0.02], ["E", 0.5], ["e", 0.48]],
      black: [["KB", 0.6], ["kbr", 0], ["ky", 0.4]],
      brown: [["B", 0.7], ["b", 0.3]],
      intensity: [["I", 0.35], ["i", 0.65]],
      white: [["S", 0.88], ["si", 0.08], ["sp", 0.04]],
      long: [["L", 0.75], ["l", 0.25]],
      merle: [["M", 0], ["m", 1]],
    }),
    build: { size: 1.75, stockiness: 1.15, legs: 0.97, body: 1.02, muzzle: 1.04, skull: 1.12, ears: 1, tail: 1 },
    erect: 0.05,
    carriage: "straight",
    temperament: { boldness: 0.2, playfulness: 0.4, affection: 0.5 },
  },
  // Border collie and the herding mixes: semi-pricked ears, a long feathered coat, black and white, merle now and then.
  collie: {
    share: 0.12,
    genes: pool({
      extension: [["Em", 0.02], ["E", 0.9], ["e", 0.08]],
      black: [["KB", 0.4], ["kbr", 0.01], ["ky", 0.59]],
      agouti: [["ay", 0.4], ["aw", 0.05], ["at", 0.5], ["a", 0.05]],
      brown: [["B", 0.8], ["b", 0.2]],
      merle: [["M", 0.1], ["m", 0.9]],
      white: [["S", 0.08], ["si", 0.82], ["sp", 0.1]],
      long: [["L", 0.25], ["l", 0.75]],
      undercoat: [["U", 0.5], ["u", 0.5]],
    }),
    build: { size: 1.5, stockiness: 0.94, legs: 1.02, body: 1.05, muzzle: 1.12, skull: 0.96, ears: 0.95, tail: 1.1 },
    erect: 0.5,
    carriage: "sabre",
    temperament: { boldness: 0, playfulness: 0.5, affection: 0.2 },
  },
  // The small farm dogs: short legs, a busy straight tail.
  terrier: {
    share: 0.12,
    genes: pool({
      black: [["KB", 0.22], ["kbr", 0.14], ["ky", 0.64]],
      agouti: [["ay", 0.3], ["aw", 0.12], ["at", 0.53], ["a", 0.05]],
      white: [["S", 0.4], ["si", 0.2], ["sp", 0.4]],
      undercoat: [["U", 0.12], ["u", 0.88]],
      saddle: [["Sd", 0.6], ["sd", 0.4]],
    }),
    build: { size: 1.05, stockiness: 1.05, legs: 0.8, body: 1.02, muzzle: 0.94, skull: 1.02, ears: 0.95, tail: 0.8 },
    erect: 0.75,
    carriage: "straight",
    temperament: { boldness: 0.4, playfulness: 0.4, affection: 0 },
  },
};

const TYPE_SHARES = (Object.keys(DOG_TYPES) as DogType[]).map((type) => [type, DOG_TYPES[type].share] as const);

function parentsOf(rng: Rng): [DogType, DogType] {
  const mother = weighted(rng, TYPE_SHARES);
  // About a third of the north's dogs are of one type; the rest are mixes, often of a spitz.
  return [mother, rng.next() < 0.35 ? mother : weighted(rng, TYPE_SHARES)];
}

function buildOf(rng: Rng, parents: readonly [DogType, DogType], sex: Sex): Build {
  const [a, b] = parents.map((p) => DOG_TYPES[p].build);
  const mid = (key: keyof Build) => (a[key] + b[key]) / 2;
  const male = sex === "male";
  const vary = (key: keyof Build, by: number) => mid(key) * (1 + spread(rng) * by);
  return {
    size: vary("size", 0.16) * (male ? 1.04 : 0.97),
    stockiness: vary("stockiness", 0.08) + (male ? 0.02 : 0),
    legs: vary("legs", 0.07),
    body: vary("body", 0.07),
    muzzle: vary("muzzle", 0.08),
    skull: vary("skull", 0.05) + (male ? 0.02 : 0),
    ears: vary("ears", 0.12),
    tail: vary("tail", 0.12),
  };
}

function earsOf(rng: Rng, parents: readonly [DogType, DogType]): EarType {
  const erect = (DOG_TYPES[parents[0]].erect + DOG_TYPES[parents[1]].erect) / 2 + spread(rng) * 0.22;
  return erect > 0.7 ? "prick" : erect > 0.3 ? "fold" : "drop";
}

function tailOf(rng: Rng, parents: readonly [DogType, DogType], coat: Coat): TailType {
  const [a, b] = parents.map((p) => DOG_TYPES[p].carriage);
  // A curled tail mostly comes through in a mix.
  const carriage = a === b ? a : a === "curl" || b === "curl" ? (rng.next() < 0.6 ? "curl" : a === "curl" ? b : a) : rng.next() < 0.5 ? a : b;
  if (carriage === "curl") return "curled";
  if (coat.length === "long") return "plumed";
  return carriage;
}

function personalityOf(rng: Rng, parents: readonly [DogType, DogType]): Personality {
  const lean = (key: keyof Personality) => (DOG_TYPES[parents[0]].temperament[key] + DOG_TYPES[parents[1]].temperament[key]) / 2;
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return { boldness: clamp(trait(rng) + lean("boldness")), playfulness: clamp(trait(rng) + lean("playfulness")), affection: clamp(trait(rng) + lean("affection")) };
}

export function generateDog(seed: string): Dog {
  // Each part draws from its own stream, so adding to one never changes another.
  const parents = parentsOf(createRng(`${seed}:parents`));
  const genotype = drawGenotype(createRng(`${seed}:genes`), DOG_TYPES[parents[0]].genes, DOG_TYPES[parents[1]].genes);
  const coat = coatOf(genotype, createRng(`${seed}:coat`));
  const shape = createRng(`${seed}:shape`);
  return {
    seed,
    sex: genotype.sex,
    parents,
    genotype,
    coat,
    build: buildOf(createRng(`${seed}:build`), parents, genotype.sex),
    ears: earsOf(shape, parents),
    tail: tailOf(shape, parents, coat),
    personality: personalityOf(createRng(`${seed}:personality`), parents),
  };
}

/** A dog's kind in a few words: "spitz", "hound mix", "collie and terrier". */
export function kindOf(dog: Dog): string {
  const [a, b] = dog.parents;
  return a === b ? a : `${a} and ${b} mix`;
}
