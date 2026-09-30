// The symbols each people used for itself through the eras
// (ideas/heritage-through-time.md, decisions 2 and 3): a card's symbol for a
// share will follow that person's birth year. A people's own symbol in each
// era, never a regime's imposed on it. This is data only for now: the UI
// doesn't use it until the owner approves the era symbols and their art.
//
// Every era starts out as the design doc's proposal, unverified: an era is
// verified once research lists the sources that settle its years and its
// symbol. The CLI's `peoples` command lists what is left to verify.

import {
  PEOPLES,
  REGIONS,
  parseHeritage,
  type HeritageCode,
  type PeopleCode,
  type RegionSlug,
} from "./heritages";

// A symbol a people or region used for itself: an id and a name research
// can find it by. Its verified art, when it has some, is in symbol-art.ts.
export const SYMBOLS = {
  "finland-lion-arms": { name: "Coat of arms of Finland (the crowned lion)" },
  "finland-flag": { name: "Flag of Finland (the blue cross)" },
  "italy-tricolour": { name: "Italian tricolour (green, white and red)" },
  "italy-savoy-flag": { name: "Flag of the Kingdom of Italy (the tricolour with the Savoy shield)" },
  "ireland-harp-flag": { name: "The green harp flag" },
  "ireland-flag": { name: "Flag of Ireland (green, white and orange)" },
  "england-flag": { name: "St George's cross" },
  "scotland-flag": { name: "The saltire" },
  "wales-flag": { name: "The red dragon" },
  "germany-black-red-gold": { name: "Black, red and gold (the colors of 1848 and 1919)" },
  "german-empire-flag": { name: "Black, white and red (the German Empire)" },
  "sweden-flag": { name: "Flag of Sweden" },
  "poland-flag": { name: "Flag of Poland (white and red)" },
  "netherlands-flag": { name: "Flag of the Netherlands" },
  "france-fleur-de-lis": { name: "The royal fleur-de-lis" },
  "france-tricolour": { name: "French tricolour" },
  "norway-lion-arms": { name: "Coat of arms of Norway (the Norwegian lion)" },
  "norway-flag": { name: "Flag of Norway (the Norwegian cross)" },
  "hungary-kingdom-flag": { name: "Flag of the Kingdom of Hungary (the tricolour with the crowned arms)" },
  "hungary-flag": { name: "Flag of Hungary (red, white and green)" },
  "ukraine-flag": { name: "Flag of Ukraine (blue and yellow)" },
  "lebanon-cedar": { name: "The cedar of Lebanon" },
  "lebanon-flag": { name: "Flag of Lebanon" },
  "slovene-tricolour": { name: "Slovene tricolour (white, blue and red)" },
  "slovenia-flag": { name: "Flag of Slovenia" },
  "sicily-trinacria": { name: "The Trinacria of Sicily" },
  "bavaria-lozenges": { name: "The white and blue lozenges of Bavaria" },
  "prussia-flag": { name: "Black and white of Prussia (the Prussian eagle)" },
} as const satisfies Record<string, { name: string }>;

export type SymbolId = keyof typeof SYMBOLS;

// One era of a timeline. Eras run in order, each starting where the one
// before it ends: the first reaches back without limit and the last runs to
// the present. A test holds every timeline to that.
export interface SymbolEra {
  // The first birth year the era covers, or null for the first era.
  from: number | null;
  // The first birth year after it, or null for the last era.
  until: number | null;
  // What the homeland was in these years, for the hover text: "Grand Duchy
  // of Finland (Russian Empire)".
  name: string;
  symbol: SymbolId;
  // The sources that settle the era's years and symbol, safe to publish;
  // empty until research verifies it.
  sources: readonly string[];
}

// An era of a people's timeline. In a regional era the homeland was a
// region rather than the people's own state: a share with a region shows
// its region's symbol for those years, and a share without one shows the
// people's `symbol`.
export interface PeopleEra extends SymbolEra {
  regional: boolean;
}

const UNVERIFIED: readonly string[] = [];

function era(
  from: number | null,
  until: number | null,
  name: string,
  symbol: SymbolId,
  regional = false,
): PeopleEra {
  return { from, until, name, symbol, regional, sources: UNVERIFIED };
}

function verified<E extends SymbolEra>(unverified: E, sources: readonly string[]): E {
  return { ...unverified, sources };
}

function regionEra(from: number | null, until: number | null, name: string, symbol: SymbolId): SymbolEra {
  return { from, until, name, symbol, sources: UNVERIFIED };
}

export const PEOPLE_TIMELINES: Record<PeopleCode, readonly PeopleEra[]> = {
  finnish: [
    era(null, 1809, "Finland under the Swedish crown", "finland-lion-arms"),
    verified(era(1809, 1918, "Grand Duchy of Finland (Russian Empire)", "finland-lion-arms"), [
      "Finnish Ministry of the Interior, \"Coat of arms of Finland\" (the lion arms, shown since the 1580s, were the arms of the Grand Duchy of Finland from 1809)",
      "Imperial decree of 26 October 1809 confirming the arms of the Grand Duchy of Finland (Polnoe sobranie zakonov Rossiiskoi imperii)",
      "K. A. Bomansson, \"Storfurstendömet Finlands vapen\", Historiallinen Arkisto IX (1886): the arms as Finland used them",
      "Act on the Flag of Finland, 29 May 1918 (Suomen asetuskokoelma 40/1918): the flag that replaced the arms as Finland's symbol",
    ]),
    verified(era(1918, null, "Finland", "finland-flag"), [
      "Act on the Flag of Finland, 29 May 1918 (Suomen asetuskokoelma 40/1918)",
      "Act on the Flag of Finland (380/1978)",
      "Finnish Ministry of the Interior, \"About the flag\"",
    ]),
  ],
  hungarian: [
    era(null, 1848, "Kingdom of Hungary", "hungary-kingdom-flag"),
    verified(era(1848, 1918, "Kingdom of Hungary", "hungary-flag"), [
      "Act XXI of 1848 on the national colours and the arms of the country: red, white and green",
      "Flags of the World, \"Hungary - Historical Flags (1848)\" (the flag of 1848 was the plain red-white-green)",
      "Flags of the World, \"Hungary - Historical flags (1867-1918)\" (the national flag of 1882-1918 was the plain tricolour; the arms flags were state variants whose arms changed in 1874 and 1915)",
    ]),
    verified(era(1918, null, "Hungary", "hungary-flag"), [
      "Fundamental Law of Hungary (2011), article I: red, white and green horizontal stripes of equal width",
      "Act LXXXIII of 1995 on the use of the arms and the flag of the Republic of Hungary",
      "Government decree 132/2000 (VII. 14.): the national flag's 1:2 ratio",
    ]),
  ],
  italian: [
    era(null, 1861, "Italy before unification", "italy-tricolour", true),
    era(1861, 1946, "Kingdom of Italy", "italy-savoy-flag"),
    era(1946, null, "Italian Republic", "italy-tricolour"),
  ],
  irish: [
    era(null, 1798, "Kingdom of Ireland", "ireland-harp-flag"),
    verified(era(1798, 1919, "Ireland under British rule", "ireland-harp-flag"), [
      "G. A. Hayes-McCoy, A History of Irish Flags from Earliest Times (1979): green generally accepted as the Irish colour from the rebellion of 1798; the harp of the 18th and 19th centuries a winged maiden",
      "Flags of the World, \"Ireland: Green Flag\" (a gold harp on green, carried in 1798 and 1803, the national flag in popular use until Sinn Féin's victory in the December 1918 election)",
    ]),
    verified(era(1919, null, "Ireland", "ireland-flag"), [
      "Flags of the World, \"Ireland: Green Flag\" (after the December 1918 election the tricolour replaced the green flag as the national flag)",
      "Bunreacht na hÉireann (1937), article 7: the national flag is the tricolour of green, white and orange",
    ]),
  ],
  english: [era(null, null, "England", "england-flag")],
  scottish: [era(null, null, "Scotland", "scotland-flag")],
  welsh: [era(null, null, "Wales", "wales-flag")],
  german: [
    era(null, 1871, "Germany before unification", "germany-black-red-gold", true),
    era(1871, 1919, "German Empire", "german-empire-flag"),
    era(1919, null, "Germany", "germany-black-red-gold"),
  ],
  swedish: [era(null, null, "Sweden", "sweden-flag")],
  dutch: [era(null, null, "the Netherlands", "netherlands-flag")],
  polish: [era(null, null, "Poland", "poland-flag")],
  ukrainian: [era(null, null, "Ukraine", "ukraine-flag")],
  norwegian: [
    era(null, 1821, "Norway before its own flag", "norway-lion-arms"),
    era(1821, null, "Norway", "norway-flag"),
  ],
  french: [
    era(null, 1790, "Kingdom of France", "france-fleur-de-lis"),
    era(1790, null, "France", "france-tricolour"),
  ],
  lebanese: [
    era(null, 1943, "Mount Lebanon and the French Mandate", "lebanon-cedar"),
    era(1943, null, "Lebanon", "lebanon-flag"),
  ],
  slovene: [
    verified(era(null, 1991, "The Slovene lands", "slovene-tricolour"), [
      "National Assembly of Slovenia, \"Državni simboli\" (the Slovene national flag since 1848, in the colours of the arms of Carniola)",
      "Flags of the World, \"Slovenia\" (the plain tricolour from 1848, and among Slovenes abroad after 1945)",
      "Flags of the World, \"Republic of Slovenia (Socialist Yugoslavia)\" (the red-star flag of 1947, a Yugoslav republic's flag)",
      "Act on the Coat of Arms, Flag and Anthem of the Republic of Slovenia and on the Slovene National Flag (Uradni list RS 67/1994), article 3",
    ]),
    verified(era(1991, null, "Slovenia", "slovenia-flag"), [
      "Constitutional Amendment C, 24 June 1991 (Uradni list RS 1/1991)",
      "Act on the Coat of Arms, Flag and Anthem of the Republic of Slovenia and on the Slovene National Flag (Uradni list RS 67/1994)",
      "National Assembly of Slovenia, \"Državni simboli\"",
    ]),
  ],
};

// A region's timeline covers exactly its people's regional eras; outside
// them a region's share shows its people's symbol.
export const REGION_TIMELINES: Record<RegionSlug, readonly SymbolEra[]> = {
  sicily: [
    regionEra(null, 1816, "Kingdom of Sicily", "sicily-trinacria"),
    regionEra(1816, 1861, "Kingdom of the Two Sicilies", "sicily-trinacria"),
  ],
  bavaria: [
    regionEra(null, 1806, "Electorate of Bavaria", "bavaria-lozenges"),
    regionEra(1806, 1871, "Kingdom of Bavaria", "bavaria-lozenges"),
  ],
  prussia: [regionEra(null, 1871, "Kingdom of Prussia", "prussia-flag")],
};

export function isVerified(era: SymbolEra): boolean {
  return era.sources.length > 0;
}

export function eraYears(era: Pick<SymbolEra, "from" | "until">): string {
  if (era.from === null && era.until === null) return "all eras";
  if (era.from === null) return `before ${era.until}`;
  if (era.until === null) return `since ${era.from}`;
  return `${era.from}–${era.until}`;
}

function eraAt<E extends SymbolEra>(timeline: readonly E[], year: number): E | undefined {
  return timeline.find(
    (candidate) =>
      (candidate.from === null || year >= candidate.from) &&
      (candidate.until === null || year < candidate.until),
  );
}

export interface PickedSymbol {
  symbol: SymbolId;
  // The hover text naming the era: "Finnish, Grand Duchy of Finland
  // (Russian Empire), 1809–1918".
  label: string;
  era: SymbolEra;
}

// The symbol a share of heritage `code` shows for someone born in
// `birthYear`: its people's era for that year, or its region's when the era
// is regional and the share names a region.
export function pickSymbol(code: HeritageCode, birthYear: number): PickedSymbol {
  const { people, region } = parseHeritage(code);
  const peopleEra = eraAt(PEOPLE_TIMELINES[people], birthYear);
  if (peopleEra === undefined) throw new Error(`${people}'s timeline doesn't cover ${birthYear}`);
  let picked: SymbolEra = peopleEra;
  let who: string = PEOPLES[people].name;
  if (peopleEra.regional && region !== null) {
    const regional = eraAt(REGION_TIMELINES[region], birthYear);
    if (regional === undefined) throw new Error(`${region}'s timeline doesn't cover ${birthYear}`);
    picked = regional;
    who = `${who} (${REGIONS[region].name})`;
  }
  const parts = [who, picked.name];
  if (picked.from !== null || picked.until !== null) parts.push(eraYears(picked));
  return { symbol: picked.symbol, label: parts.join(", "), era: picked };
}
