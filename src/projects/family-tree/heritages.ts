// The curated heritages a line can come from. The list lives in code rather
// than accepting any name, so every value the tree holds is one the UI can
// give a designed look. Adding a people or a region is one entry here.
//
// Every heritage names a people: a culture a line carries, independent of
// borders (Finnish, Hungarian, Lebanese, Sámi, a Native American nation). A
// people with a country of its own and one without are the same kind of
// entry. Its code is a lowercase slug of its English name ("finnish").
//
// A region is an optional, finer homeland within a people (Sicily for an
// Italian line, Bavaria for a German one), for the eras before the
// nation-states, when the region was the homeland. Its code is the people's
// code and the region's slug joined by a slash ("italian/sicily"), so a
// region can never be entered without its people, and the mix treats it as
// a heritage of its own.

export interface People {
  name: string;
}

export const PEOPLES = {
  finnish: { name: "Finnish" },
  italian: { name: "Italian" },
  // The whole island, Northern Ireland included.
  irish: { name: "Irish" },
  english: { name: "English" },
  scottish: { name: "Scottish" },
  welsh: { name: "Welsh" },
  german: { name: "German" },
  swedish: { name: "Swedish" },
  polish: { name: "Polish" },
  dutch: { name: "Dutch" },
  french: { name: "French" },
  norwegian: { name: "Norwegian" },
  hungarian: { name: "Hungarian" },
  ukrainian: { name: "Ukrainian" },
  lebanese: { name: "Lebanese" },
  slovene: { name: "Slovene" },
} as const satisfies Record<string, People>;

export type PeopleCode = keyof typeof PEOPLES;

export interface Region {
  people: PeopleCode;
  // The homeland's own name, as a place ("Sicily").
  name: string;
}

// Region slugs are unique across all peoples, so a region entered under the
// wrong people is caught rather than silently meaning something else.
export const REGIONS = {
  sicily: { people: "italian", name: "Sicily" },
  bavaria: { people: "german", name: "Bavaria" },
  prussia: { people: "german", name: "Prussia" },
} as const satisfies Record<string, Region>;

export type RegionSlug = keyof typeof REGIONS;

export type RegionCode = {
  [Slug in RegionSlug]: `${(typeof REGIONS)[Slug]["people"]}/${Slug}`;
}[RegionSlug];

export type HeritageCode = PeopleCode | RegionCode;

// The shapes codes must have; a test holds every listed entry to them.
export const PEOPLE_CODE_SHAPE = /^[a-z][a-z-]*$/;
export const REGION_CODE_SHAPE = /^[a-z][a-z-]*\/[a-z][a-z-]*$/;

// A line whose origin the records don't give. As part of a person's entry it
// keeps that part of their mix unknown.
export const UNKNOWN_HERITAGE = "unknown";

// What a person's heritage entry may list.
export type HeritageEntryCode = HeritageCode | typeof UNKNOWN_HERITAGE;

// The present-day country codes heritage used before it named peoples, each
// mapped to the people it stood for. normalizeTree migrates stored trees
// with it; the change-file parser uses it to point at the new code.
export const LEGACY_COUNTRY_CODES = {
  FI: "finnish",
  IT: "italian",
  IE: "irish",
  "GB-ENG": "english",
  "GB-SCT": "scottish",
  "GB-WLS": "welsh",
  DE: "german",
  SE: "swedish",
  PL: "polish",
  NL: "dutch",
  FR: "french",
  NO: "norwegian",
  HU: "hungarian",
  UA: "ukrainian",
  LB: "lebanese",
} as const satisfies Record<string, PeopleCode>;

export type LegacyCountryCode = keyof typeof LEGACY_COUNTRY_CODES;

export function isLegacyCountryCode(value: string): value is LegacyCountryCode {
  return Object.hasOwn(LEGACY_COUNTRY_CODES, value);
}

export function isPeopleCode(value: string): value is PeopleCode {
  return Object.hasOwn(PEOPLES, value);
}

function isRegionSlug(value: string): value is RegionSlug {
  return Object.hasOwn(REGIONS, value);
}

// Why `value` isn't a listed heritage code, or null when it is one.
export function heritageCodeProblem(value: string): string | null {
  if (isLegacyCountryCode(value)) {
    return `"${value}" is a present-day country code; heritage names a people now: use "${LEGACY_COUNTRY_CODES[value]}"`;
  }
  const parts = value.split("/");
  const people = parts[0];
  const region = parts.at(1);
  if (parts.length > 2 || !isPeopleCode(people)) return `"${value}" is not a listed people`;
  if (region === undefined) return null;
  if (!isRegionSlug(region)) return `"${value}": ${PEOPLES[people].name} has no listed region "${region}"`;
  const owner = REGIONS[region].people;
  if (owner !== people) {
    return `"${value}": ${REGIONS[region].name} is a region of the ${PEOPLES[owner].name} people, not the ${PEOPLES[people].name}`;
  }
  return null;
}

export function isHeritageCode(value: string): value is HeritageCode {
  return heritageCodeProblem(value) === null;
}

export function isHeritageEntryCode(value: unknown): value is HeritageEntryCode {
  return typeof value === "string" && (value === UNKNOWN_HERITAGE || isHeritageCode(value));
}

// The people and, when the code names one, the region of a heritage.
export function parseHeritage(code: HeritageCode): { people: PeopleCode; region: RegionSlug | null } {
  const parts = code.split("/");
  const people = parts[0];
  const region = parts.at(1);
  if (!isPeopleCode(people) || (region !== undefined && !isRegionSlug(region))) {
    throw new Error(`"${code}" is not a listed heritage`);
  }
  return { people, region: region ?? null };
}

export function peopleOf(code: HeritageCode): PeopleCode {
  return parseHeritage(code).people;
}

// "Italian", or "Italian (Sicily)" for a region.
export function heritageName(code: HeritageCode): string {
  const { people, region } = parseHeritage(code);
  const name = PEOPLES[people].name;
  return region === null ? name : `${name} (${REGIONS[region].name})`;
}

export const REGION_CODES = (Object.keys(REGIONS) as RegionSlug[]).map(
  (slug) => `${REGIONS[slug].people}/${slug}` as RegionCode,
);
