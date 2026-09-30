// The URL of each symbol's art on the page, for every symbol with a record
// in `symbol-art.ts`: its display file where a scan has one, else the art
// itself. A test holds this list to the records.

import type { StaticImageData } from "next/image";
import type { SymbolId } from "./symbol-timelines";
import englandFlag from "@/projects/family-tree/symbol-art/england-flag.svg";
import finlandFlag from "@/projects/family-tree/symbol-art/finland-flag.svg";
import finlandLionArms from "@/projects/family-tree/symbol-art/finland-lion-arms.display.png";
import germanEmpireFlag from "@/projects/family-tree/symbol-art/german-empire-flag.svg";
import germanyBlackRedGold from "@/projects/family-tree/symbol-art/germany-black-red-gold.svg";
import hungaryFlag from "@/projects/family-tree/symbol-art/hungary-flag.svg";
import irelandFlag from "@/projects/family-tree/symbol-art/ireland-flag.svg";
import irelandHarpFlag from "@/projects/family-tree/symbol-art/ireland-harp-flag.svg";
import italySavoyFlag from "@/projects/family-tree/symbol-art/italy-savoy-flag.svg";
import italyTricolour from "@/projects/family-tree/symbol-art/italy-tricolour.svg";
import lebanonCedar from "@/projects/family-tree/symbol-art/lebanon-cedar.svg";
import lebanonFlag from "@/projects/family-tree/symbol-art/lebanon-flag.svg";
import polandFlag from "@/projects/family-tree/symbol-art/poland-flag.svg";
import scotlandFlag from "@/projects/family-tree/symbol-art/scotland-flag.svg";
import sloveneTricolour from "@/projects/family-tree/symbol-art/slovene-tricolour.svg";
import sloveniaFlag from "@/projects/family-tree/symbol-art/slovenia-flag.svg";
import swedenFlag from "@/projects/family-tree/symbol-art/sweden-flag.svg";
import walesFlag from "@/projects/family-tree/symbol-art/wales-flag.svg";

export const SYMBOL_ART_URLS: Partial<Record<SymbolId, string | StaticImageData>> = {
  "england-flag": englandFlag,
  "finland-flag": finlandFlag,
  "finland-lion-arms": finlandLionArms,
  "german-empire-flag": germanEmpireFlag,
  "germany-black-red-gold": germanyBlackRedGold,
  "hungary-flag": hungaryFlag,
  "ireland-flag": irelandFlag,
  "ireland-harp-flag": irelandHarpFlag,
  "italy-savoy-flag": italySavoyFlag,
  "italy-tricolour": italyTricolour,
  "lebanon-cedar": lebanonCedar,
  "lebanon-flag": lebanonFlag,
  "poland-flag": polandFlag,
  "scotland-flag": scotlandFlag,
  "slovene-tricolour": sloveneTricolour,
  "slovenia-flag": sloveniaFlag,
  "sweden-flag": swedenFlag,
  "wales-flag": walesFlag,
};
