// The verified art of each heritage symbol (ideas/heritage-through-time.md,
// "Symbols"): real art only, never drawn or approximated by us. A symbol
// with a record here has a file in `symbol-art/`, named by its symbol id,
// stored byte for byte as its source published it; a symbol without one has
// no verified art and isn't shown. The `heritage-symbol-art` skill is how
// records get here. Nothing renders this art yet.

import type { SymbolId } from "./symbol-timelines";

// The licences art may carry. Public domain and CC0 need no credit; the CC BY
// licences need the record's attribution shown wherever the art is.
export const ART_LICENSES = {
  "public-domain": { name: "Public domain", url: null, attribution: false },
  "cc0-1.0": { name: "CC0 1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: false },
  "cc-by-4.0": { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/", attribution: true },
  "cc-by-sa-3.0": { name: "CC BY-SA 3.0", url: "https://creativecommons.org/licenses/by-sa/3.0/", attribution: true },
  "cc-by-sa-4.0": { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/", attribution: true },
} as const satisfies Record<string, { name: string; url: string | null; attribution: boolean }>;

export type ArtLicenseId = keyof typeof ART_LICENSES;

export interface SymbolArt {
  // SVG wherever a faithful one exists; PNG only when the source is raster.
  format: "svg" | "png";
  // The SHA-1 of the file as its source published it (Commons gives each
  // upload's), so a test can prove the stored file was never edited.
  sha1: string;
  // Where the file came from: its Wikimedia Commons file page, or the
  // official page it was downloaded from.
  source: string;
  author: string;
  license: ArtLicenseId;
  // Why that licence applies, as the source states it: the Commons licence
  // templates, or the official terms of use.
  licenseBasis: string;
  // The credit line the licence requires, or empty when it requires none.
  attribution: string;
  // The symbol's official proportions, width to height, from the
  // specification; for a symbol with none (most coats of arms), those of the
  // reference image it was checked against. A test holds the file to them.
  proportions: { width: number; height: number };
  // The specification or historical sources the art was checked against,
  // most authoritative first. URLs are welcome.
  checkedAgainst: readonly string[];
  // What was checked, and what was found: proportions, colours, details.
  checked: string;
}

export const SYMBOL_ART: Partial<Record<SymbolId, SymbolArt>> = {
  "finland-flag": {
    format: "svg",
    sha1: "4ba6e5300c3ddd64f581df014e3aea3ad7254882",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_Finland.svg",
    author: "Unknown (design of the Act on the Flag of Finland, 1918)",
    license: "public-domain",
    licenseBasis: "Commons: PD-shape, PD-FinlandGov",
    attribution: "",
    proportions: { width: 18, height: 11 },
    checkedAgainst: [
      "Act on the Flag of Finland, 29 May 1918 (Suomen asetuskokoelma 40/1918), section 2",
      "Act on the Flag of Finland (380/1978), section 1",
      "Government decision 827/1993 on the flag's colours",
      "https://intermin.fi/en/flag-and-arms/about-the-flag",
    ],
    checked:
      "Proportions 11:18, cross arms 3, fields 4:3:4 high and 5:3:10 long: the file draws exactly that (viewBox 18 by 11), as the 1918 act already set them. " +
      "Blue #002F6C is Pantone's sRGB value for PMS 294 C, the blue of decision 827/1993; white #FFFFFF. " +
      "The 1918 act's blue was an unspecified ultramarine until 1993, so earlier flags varied in shade.",
  },
  "german-empire-flag": {
    format: "svg",
    sha1: "59fe0e22197ef0fa883aeb99f3122f686633d350",
    source: "https://commons.wikimedia.org/wiki/File:Flag_of_Germany_(1867%E2%80%931918).svg",
    author: "Vectorized by B1mbo and Madden (Wikimedia Commons)",
    license: "public-domain",
    licenseBasis: "Commons: PD-shape",
    attribution: "",
    proportions: { width: 3, height: 2 },
    checkedAgainst: [
      "Constitution of the German Empire, 16 April 1871, article 55 (the flag of the navy and merchant fleet is black-white-red)",
      "Ordinance on the federal flag for merchant ships, 25 October 1867 (Bundesgesetzblatt des Norddeutschen Bundes 1867, no. 5, p. 39): three equal horizontal stripes, black, white, red, height to length 2:3",
      "Flags of the World, \"German Empire 1871-1918\": https://www.fotw.info/flags/de1871.html",
    ],
    checked:
      "Three equal horizontal bands, black over white over red, at 2:3, as the 1867 ordinance sets them and the Empire kept them: the file is 900 by 600 with bands of 200. " +
      "Neither law gives shades, so any true black, white and red is faithful; the file's red is #DD0000. " +
      "The Commons page's colour table says crimson #DC143C, which is not what the file draws; the file itself was checked. " +
      "The plain tricolour was the merchant flag from 1867 and the national flag from 8 November 1892.",
  },
};

// The art's file name inside `symbol-art/`.
export function symbolArtFile(symbol: SymbolId, art: SymbolArt): string {
  return `${symbol}.${art.format}`;
}
