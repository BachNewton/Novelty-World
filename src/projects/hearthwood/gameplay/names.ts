import { createRng } from "@/shared/lib/seeded-random";
import type { Species } from "../engine/strays";

/*
 * Names to suggest for a companion: a cozy list for cats and one for dogs,
 * many of them Nordic. A suggestion is seeded by the animal, so the same cat
 * is offered the same names, and never one a companion already has.
 */

export const NAMES: Record<Species, readonly string[]> = {
  cat: [
    "Mirri",
    "Lumi",
    "Sisu",
    "Freya",
    "Tuva",
    "Saga",
    "Embla",
    "Kanel",
    "Smilla",
    "Ronja",
    "Siri",
    "Kisu",
    "Nisse",
    "Ingrid",
    "Pippa",
    "Hazel",
    "Juniper",
    "Bramble",
    "Clover",
    "Sorrel",
    "Maple",
    "Toffee",
    "Biscuit",
    "Pumpkin",
    "Muffin",
    "Pepper",
    "Fig",
    "Wren",
    "Myrtle",
    "Sage",
    "Mossa",
    "Tilda",
    "Bean",
    "Hilla",
  ],
  dog: [
    "Musti",
    "Otso",
    "Toivo",
    "Ruska",
    "Halla",
    "Viggo",
    "Birk",
    "Kaja",
    "Björn",
    "Fenna",
    "Sven",
    "Hilda",
    "Loki",
    "Frost",
    "Tyra",
    "Rekku",
    "Aino",
    "Elsa",
    "Nalle",
    "Sumu",
    "Watson",
    "Bramble",
    "Barley",
    "Pickle",
    "Rowan",
    "Tansy",
    "Pebble",
    "Bilbo",
    "Moss",
    "Ember",
    "Juno",
    "Teddy",
    "Fika",
  ],
};

/** The names to suggest for an animal, in the order offered: its own shuffle of its species' list, less the names taken. */
export function suggestedNames(species: Species, seed: string, taken: readonly string[]): string[] {
  const rng = createRng(`${seed}:names`);
  const names = [...NAMES[species]];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const used = new Set(taken.map((n) => n.toLowerCase()));
  const free = names.filter((n) => !used.has(n.toLowerCase()));
  return free.length > 0 ? free : names;
}

/** The longest name kept, in characters. */
export const NAME_LENGTH = 18;
