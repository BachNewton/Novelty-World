import { createRng } from "@/shared/lib/seeded-random";
import type { LostPet } from "../engine/people";
import { suggestedNames } from "./names";

/*
 * Who a person is, beyond where they stand: their name, from Nordic names of
 * every kind (Finnish, Swedish, Norwegian, Danish, Icelandic), seeded by the
 * person so they are always called the same; and the name they gave the
 * animal they lost, from the companions' own lists, which is the name the
 * naming card offers first when Elliott wins it over.
 */

export const FOLK_NAMES = [
  "Aino",
  "Aili",
  "Eira",
  "Helmi",
  "Ilmari",
  "Kaisa",
  "Lauri",
  "Liisa",
  "Mikko",
  "Oona",
  "Pekka",
  "Ritva",
  "Sanni",
  "Tuuli",
  "Veikko",
  "Astrid",
  "Björn",
  "Dagny",
  "Elin",
  "Frode",
  "Gunnar",
  "Halvor",
  "Ingeborg",
  "Jorunn",
  "Kari",
  "Leif",
  "Maren",
  "Nils",
  "Ragnhild",
  "Sigrid",
  "Solveig",
  "Torvald",
  "Ulla",
  "Viggo",
  "Yrsa",
  "Åsa",
  "Birgit",
  "Einar",
  "Gudrun",
  "Ivar",
  "Karin",
  "Linnea",
  "Magnus",
  "Signe",
  "Stina",
  "Tove",
  "Arvid",
  "Märta",
  "Sune",
  "Hekla",
] as const;

/** The longest name a person can have, in characters. */
export const FOLK_NAME_LENGTH = Math.max(...FOLK_NAMES.map((n) => n.length));

export function folkName(seed: string): string {
  const rng = createRng(`${seed}:name`);
  return FOLK_NAMES[Math.floor(rng.next() * FOLK_NAMES.length)];
}

/** What a person called the animal they lost. */
export function petName(pet: Pick<LostPet, "species" | "seed">): string {
  return suggestedNames(pet.species, pet.seed, [])[0];
}
