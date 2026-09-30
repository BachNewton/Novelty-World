// Each people's flag on the cards: today's flag of the country the people
// was coded by before heritage named peoples, from the svg-country-flags
// package (Wikimedia Commons artwork, public domain) in each flag's official
// proportions. A region shows its people's flag. Every people in
// heritages.ts needs an entry here. The proportions are repeated here
// because the import is only the file's URL; a test holds them to each
// file's viewBox. The era symbols of ideas/heritage-through-time.md
// (symbol-timelines.ts) are data only: the cards don't use them yet.

import { peopleOf, type HeritageCode, type PeopleCode } from "./heritages";
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
import si from "svg-country-flags/svg/si.svg";
import ua from "svg-country-flags/svg/ua.svg";

export interface Flag {
  src: string;
  // The flag's official proportions, width to height.
  width: number;
  height: number;
  // The country the flag belongs to: the chips' hover text.
  country: string;
}

export const FLAGS: Record<PeopleCode, Flag> = {
  finnish: { src: fi, width: 18, height: 11, country: "Finland" },
  italian: { src: it, width: 3, height: 2, country: "Italy" },
  irish: { src: ie, width: 2, height: 1, country: "Ireland" },
  english: { src: gbEng, width: 5, height: 3, country: "England" },
  scottish: { src: gbSct, width: 5, height: 3, country: "Scotland" },
  welsh: { src: gbWls, width: 5, height: 3, country: "Wales" },
  german: { src: de, width: 5, height: 3, country: "Germany" },
  swedish: { src: se, width: 8, height: 5, country: "Sweden" },
  polish: { src: pl, width: 8, height: 5, country: "Poland" },
  dutch: { src: nl, width: 3, height: 2, country: "Netherlands" },
  french: { src: fr, width: 3, height: 2, country: "France" },
  norwegian: { src: no, width: 11, height: 8, country: "Norway" },
  hungarian: { src: hu, width: 2, height: 1, country: "Hungary" },
  ukrainian: { src: ua, width: 3, height: 2, country: "Ukraine" },
  lebanese: { src: lb, width: 3, height: 2, country: "Lebanon" },
  slovene: { src: si, width: 2, height: 1, country: "Slovenia" },
};

export function flagOf(code: HeritageCode): Flag {
  return FLAGS[peopleOf(code)];
}
