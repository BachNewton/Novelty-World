import { LICENSES, type Credit } from "@/shared/lib/credits";
import { ART_LICENSES, SYMBOL_ART } from "./symbol-art";
import { SYMBOLS, type SymbolId } from "./symbol-timelines";

// Every published art record is credited from the record itself, so new art
// shows up here without a second list. Our own drawings have no source to
// credit.
function symbolArtCredits(): Credit[] {
  return Object.entries(SYMBOL_ART).flatMap(([symbol, art]) =>
    art.kind === "published"
      ? [
          {
            work: SYMBOLS[symbol as SymbolId].name,
            author: art.author,
            license: ART_LICENSES[art.license],
            source: art.source,
            attribution: art.attribution,
          },
        ]
      : [],
  );
}

export const FAMILY_TREE_CREDITS: readonly Credit[] = [
  {
    work: "Country flags on the cards",
    author: "Wikimedia Commons contributors, packaged by Hampus Nilsson (svg-country-flags)",
    license: LICENSES["public-domain"],
    source: "https://github.com/hjnilsson/country-flags",
    attribution: "",
  },
  ...symbolArtCredits(),
];
