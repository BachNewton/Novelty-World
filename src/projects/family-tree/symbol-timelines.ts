// The symbols each people used for itself through the eras
// (ideas/heritage-through-time.md, decisions 2 and 3): a card's symbol for a
// share follows that person's birth year (`heritage-symbols.ts`). Symbols
// represent people, not governments: where a people identified with the
// state they lived under, its symbol serves; where they didn't, the era shows
// the symbol the people used for themselves and would wish to be represented
// by.
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
  "romanian-tricolour": { name: "Romanian tricolour (blue, yellow and red)" },
  "romania-flag": { name: "Flag of Romania" },
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
      "Itsenäisyys 100, \"Historiallinen leijonavaakuna on kestänyt kaikki Suomen valtiolliset vaiheet\" (the lion arms became the Grand Duchy's in 1809; the lion that K. A. Bomansson drew and Ferdinand Tilgmann printed in 1886 at once became general in Finnish-made arms and lion flags)",
      "Finnish Government, \"The Finnish flag turns 100\" (the arms flown on white by students in 1848; the red-and-yellow lion flag with the arms' lion raised on 6 December 1917)",
      "Suomen lipun historia, \"Flags of the Grand Duchy of Finland\" and \"Finnish Flags During the Years of Oppression, 1890-1917\" (Topelius's blue-and-white flag of 1862 bore the lion arms; the red lion flag spread among Finns in 1899-1917 and was banned by the Russian authorities)",
      "Finns identified with the Grand Duchy of Finland, their own state, not with the Russian Empire: its lion arms were Finland's, the one symbol shared by every side of the flag debate, in the form Finns drew themselves rather than the Russian Empire's 1882 drawing",
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
    verified(era(1861, 1946, "Kingdom of Italy", "italy-savoy-flag"), [
      "Law of 17 March 1861, no. 4671: Victor Emmanuel II takes the title of King of Italy",
      "Proclamation of King Charles Albert, 23 March 1848: the Savoy shield on the Italian tricolour, the flag of the Risorgimento, of the Kingdom of Sardinia and from 1861 of Italy",
      "Royal decree-law of 24 September 1923, no. 2072, converted by law of 24 December 1925, no. 2264: the national flag is the tricolour with the Savoy arms uncrowned and bordered azure, the crowned form being the state flag of royal and government buildings",
      "Presidency of the Council of Ministers, \"La Bandiera - Cenni storici e norme per l'esposizione\" (the tricolour the flag of the Kingdom of Sardinia from 1848 and of the Italian state from 1861)",
      "Flags of the World, \"Kingdom of Italy (1848-1946)\"",
      "Italians identified with the Kingdom their Risorgimento made, so its national flag represents them; the uncrowned national flag was the one the people flew, the crowned form the monarchy's buildings'",
    ]),
    verified(era(1946, null, "Italian Republic", "italy-tricolour"), [
      "Institutional referendum of 2 June 1946, which ended the Kingdom",
      "Legislative decree of the provisional head of state, 19 June 1946: the tricolour without the Savoy arms as the flag of the Republic",
      "Constitution of the Italian Republic (1948), article 12",
      "Decree of the President of the Council of Ministers, 14 April 2006, article 31: the flag's Pantone colours",
      "The Republic's flag is the people's own by referendum and Constitution, the flag Italians fly as theirs",
    ]),
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
      "Department of the Taoiseach, \"The National Flag - Guidelines\" (the tricolour accepted as the national flag after the 1916 Rising, adopted by the Irish Free State in 1922, confirmed by the Constitution in 1937): the independence movement's own flag, which the Irish identify with",
    ]),
  ],
  english: [
    verified(era(null, null, "England", "england-flag"), [
      "Flags of the World, \"England\" (the cross of St George an English emblem from 1277, national-flag status from the 16th century, England's own flag as distinct from the Union flag)",
      "Flag Institute, UK Flag Registry, \"England\" (earliest use by an English monarch 1277; established by tradition, not decree)",
      "The English people's own flag rather than the United Kingdom state's, the flag the English fly as theirs",
    ]),
  ],
  scottish: [
    verified(era(null, null, "Scotland", "scotland-flag"), [
      "Flag Institute, UK Flag Registry, \"Scotland\" (the saltire Scotland's emblem from the seal of the Guardians of 1286; recorded by the Lord Lyon in 1672)",
      "Flags of the World, \"Scotland\" (the saltire on blue from about 1542, among the oldest national flags)",
      "Scottish Parliament committee recommendation of 2003 (Pantone 300)",
      "The Scottish people's own flag rather than the United Kingdom state's, the flag the Scots fly as theirs",
    ]),
  ],
  welsh: [
    verified(era(null, null, "Wales", "wales-flag"), [
      "Flags of the World, \"Wales: History of Welsh Flags\" (the red dragon the Britons' symbol in the Historia Brittonum; Henry VII's dragon on white and green, 1485; shown at the Llangollen Eisteddfod of 1858; in 1958 the Gorsedd of Bards asked that the Red Dragon flag be the national flag instead of the 1953 augmented badge, and the 1959 command adopted it)",
      "Flag Institute, UK Flag Registry, \"Wales\" (official flag from February 1959; the dragon Wales's emblem since Cadwaladr, c. 655)",
      "Flags of the World, \"Wales\" (the green-and-white dragon flag shown in 1840 and campaigned for by T. H. Thomas from 1893, in use by 1911, and recognised as the national flag in the first decades of the 20th century)",
      "The Welsh people's own emblem, chosen by the Welsh themselves over the government's badge, rather than the United Kingdom state's flag",
    ]),
  ],
  german: [
    verified(era(null, 1871, "Germany before unification", "germany-black-red-gold", true), [
      "Jena Urburschenschaft (1815) and the Hambach Festival (1832): black-red-gold the colours of the German national movement",
      "Bundesbeschluss über Wappen und Farben des Deutschen Bundes, 9 March 1848: black, red and gold, the colours of the former German imperial banner, declared the colours of the German Confederation",
      "Before 1815 Germans as a whole had no national colours: the Holy Roman Empire's eagle was the emperor's and the territorial arms were their rulers' (Bavaria and Prussia have regional eras of their own); the colours Germans chose in 1848 as the continuation of the old imperial banner are the ones that represent the people, not a government",
    ]),
    era(1871, 1919, "German Empire", "german-empire-flag"),
    verified(era(1919, null, "Germany", "germany-black-red-gold"), [
      "Constitution of the German Reich (Weimar, 11 August 1919), article 3: the Reich colours are black-red-gold",
      "Basic Law for the Federal Republic of Germany (1949), article 22: the federal flag is black-red-gold",
      "Anordnung über die deutschen Flaggen (1996): three equal horizontal stripes, black, red and gold, at 3:5",
      "German lines born 1933-1945 show black-red-gold, the people's own colours of 1848 and 1919, not the regime's (the 1933 decrees replaced it with the swastika and black-white-red flags)",
    ]),
  ],
  swedish: [
    verified(era(null, null, "Sweden", "sweden-flag"), [
      "Proposition 1906:115, on the flag law (the 1844 royal letter put the union mark on the naval and merchant flags and ships' flags; private flags on land were the square-cut blue with a yellow cross since the placard of 1663)",
      "Lag angående rikets flagga (22 June 1906): the plain blue flag with a yellow cross, the union mark gone from 1 November 1905",
      "Lag (1982:269) om Sveriges flagga and Förordning (1983:826) on its colours",
      "Stiftelsen Sveriges Nationaldag, \"Flaggans historia\" (the blue and yellow cross flag since the sixteenth century; Swedish flag day since 1916)",
      "Swedes identified with their own kingdom and its flag; the union mark of 1844-1905 marked the union with Norway on official flags, and the plain cross flag is the one Swedes flew and honour as theirs",
    ]),
  ],
  dutch: [era(null, null, "the Netherlands", "netherlands-flag")],
  polish: [
    verified(era(null, null, "Poland", "poland-flag"), [
      "Resolution of the joined chambers of the Sejm of the Kingdom of Poland, 7 February 1831: the national cockade is white with red, the colours of the arms of the Kingdom of Poland and the Grand Duchy of Lithuania, the emblem under which Poles should unite (Polish State Archives)",
      "Institute of National Remembrance, \"Polska kokarda narodowa\" (white and red as the colours of Polishness and the fight for freedom through the partitions)",
      "Act of 1 August 1919 on the arms and colours of the Republic of Poland",
      "Act of 31 January 1980 on the arms, colours and anthem of the Republic of Poland and on state seals",
      "White and red represent the Poles through the partitions, when they had no state of their own, never the partitioning powers' flags",
    ]),
  ],
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
    verified(era(null, 1943, "Mount Lebanon and the French Mandate", "lebanon-cedar"), [
      "Roman Klimeš, \"The Cedar Tree – The Symbol of a Country\", Proceedings of the 25th International Congress of Vexillology (2013): the cedar a Maronite symbol from the 18th century; by 1848 the central charge of Lebanon's own unofficial flag, white with a green cedar; the flag of the Lebanese emigrants in America from 1913, hoisted at Baabda in November 1918",
      "Flags of the World, \"Lebanon: Cedar Flag 1918\" (the white flag with the cedar, first attested in October 1848 and still in use under the Administrative Council in 1919), after Joseph Nehmé, \"The Flag of Lebanon\", Crux Australis 50 (1996)",
      "Flags of the World, \"French Mandate of Greater Lebanon 1920-1943\" (the mandate's flag, the French tricolour with a cedar, constitution of 23 May 1926, article 5)",
      "The Lebanese did not identify with the Ottoman or French governments: the cedar on white is the flag they used for themselves, at home and in America, and the mandate's tricolour set their cedar on France's colours, which they dropped at independence",
    ]),
    verified(era(1943, null, "Lebanon", "lebanon-flag"), [
      "Constitution of Lebanon, article 5, as amended by the Constitutional Law of 7 December 1943",
      "Roman Klimeš, \"The Cedar Tree – The Symbol of a Country\", Proceedings of the 25th International Congress of Vexillology (2013): the flag adopted by the Lebanese deputies at independence, keeping the cedar and dropping the French colours",
      "Flags of the World, \"Lebanon\"",
      "The flag of independent Lebanon, chosen by its own deputies, which the Lebanese identify with",
    ]),
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
  romanian: [
    era(null, 1989, "The Romanian lands", "romanian-tricolour"),
    era(1989, null, "Romania", "romania-flag"),
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
