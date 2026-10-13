// Each character's portrait, shot from the figure viewer by `tools/portraits.mjs`: their figure, or the pawn in
// their card's colour. Imported, not served from `public/`, so each URL carries a hash of the image and a reshoot
// reaches every browser and image cache on its own. A test holds the map to the catalogue's characters.

import type { StaticImageData } from "next/image";
import brandonJaspers from "../portraits/brandon-jaspers.jpg";
import darrinFlashWilliams from "../portraits/darrin-flash-williams.jpg";
import fatherRhinehardt from "../portraits/father-rhinehardt.jpg";
import heatherGranville from "../portraits/heather-granville.jpg";
import jennyLeclerc from "../portraits/jenny-leclerc.jpg";
import madameZostra from "../portraits/madame-zostra.jpg";
import missyDubourde from "../portraits/missy-dubourde.jpg";
import oxBellows from "../portraits/ox-bellows.jpg";
import peterAkimoto from "../portraits/peter-akimoto.jpg";
import professorLongfellow from "../portraits/professor-longfellow.jpg";
import vivianLopez from "../portraits/vivian-lopez.jpg";
import zoeIngstrom from "../portraits/zoe-ingstrom.jpg";

export const PORTRAITS: Readonly<Record<string, StaticImageData>> = {
  "brandon-jaspers": brandonJaspers,
  "darrin-flash-williams": darrinFlashWilliams,
  "father-rhinehardt": fatherRhinehardt,
  "heather-granville": heatherGranville,
  "jenny-leclerc": jennyLeclerc,
  "madame-zostra": madameZostra,
  "missy-dubourde": missyDubourde,
  "ox-bellows": oxBellows,
  "peter-akimoto": peterAkimoto,
  "professor-longfellow": professorLongfellow,
  "vivian-lopez": vivianLopez,
  "zoe-ingstrom": zoeIngstrom,
};

/** A character's portrait; every character has one. */
export function portraitOf(character: string): StaticImageData {
  if (!Object.hasOwn(PORTRAITS, character)) throw new Error(`No portrait for "${character}": run tools/portraits.mjs`);
  return PORTRAITS[character];
}
