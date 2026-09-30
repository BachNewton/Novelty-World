import { LICENSES, type Credit } from "@/shared/lib/credits";

export const POKEMON_CREDITS: readonly Credit[] = [
  {
    work: "Pokémon type icons",
    author: "James Watkins (partywhale)",
    license: LICENSES.mit,
    source: "https://github.com/partywhale/pokemon-type-icons",
    attribution: "Copyright (c) 2022 James Watkins",
  },
  {
    work: "Pokémon names and types",
    author: "Paul Hallett and PokéAPI contributors",
    license: LICENSES["bsd-3-clause"],
    source: "https://pokeapi.co",
    attribution:
      "Copyright (c) 2013–2023 Paul Hallett and PokéAPI contributors. Pokémon and Pokémon character names are trademarks of Nintendo.",
  },
  {
    work: "Pokémon official artwork, loaded from the PokéAPI sprites repository",
    author: "Nintendo, Creatures Inc. and GAME FREAK",
    license: LICENSES["all-rights-reserved"],
    source: "https://github.com/PokeAPI/sprites",
    attribution: "",
  },
];
