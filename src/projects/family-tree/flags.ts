// Each heritage's flag, from the svg-country-flags package: Wikimedia
// Commons artwork (public domain) in each flag's official proportions. Every
// heritage in heritages.ts needs an entry here. The proportions are repeated
// here because the import is only the file's URL; a test holds them to
// each file's viewBox.

import type { HeritageCode } from "./heritages";
import de from "svg-country-flags/svg/de.svg";
import fi from "svg-country-flags/svg/fi.svg";
import fr from "svg-country-flags/svg/fr.svg";
import gbEng from "svg-country-flags/svg/gb-eng.svg";
import gbSct from "svg-country-flags/svg/gb-sct.svg";
import gbWls from "svg-country-flags/svg/gb-wls.svg";
import hu from "svg-country-flags/svg/hu.svg";
import ie from "svg-country-flags/svg/ie.svg";
import it from "svg-country-flags/svg/it.svg";
import lb from "svg-country-flags/svg/lb.svg";
import nl from "svg-country-flags/svg/nl.svg";
import no from "svg-country-flags/svg/no.svg";
import pl from "svg-country-flags/svg/pl.svg";
import se from "svg-country-flags/svg/se.svg";
import ua from "svg-country-flags/svg/ua.svg";

export interface Flag {
  src: string;
  // The flag's official proportions, width to height.
  width: number;
  height: number;
}

export const FLAGS: Record<HeritageCode, Flag> = {
  FI: { src: fi, width: 18, height: 11 },
  IT: { src: it, width: 3, height: 2 },
  IE: { src: ie, width: 2, height: 1 },
  "GB-ENG": { src: gbEng, width: 5, height: 3 },
  "GB-SCT": { src: gbSct, width: 5, height: 3 },
  "GB-WLS": { src: gbWls, width: 5, height: 3 },
  DE: { src: de, width: 5, height: 3 },
  SE: { src: se, width: 8, height: 5 },
  PL: { src: pl, width: 8, height: 5 },
  NL: { src: nl, width: 3, height: 2 },
  FR: { src: fr, width: 3, height: 2 },
  NO: { src: no, width: 11, height: 8 },
  HU: { src: hu, width: 2, height: 1 },
  UA: { src: ua, width: 3, height: 2 },
  LB: { src: lb, width: 3, height: 2 },
};
