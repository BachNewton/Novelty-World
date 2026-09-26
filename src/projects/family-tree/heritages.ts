// The curated heritages a line can come from. The list lives in code rather
// than accepting any name, so every value the tree holds is one the UI can
// give a designed look. Adding a heritage of either kind is one entry here.
//
// Two kinds, told apart by the shape of their code so they can never collide:
// - a country is the present-day country containing the place a line came
//   from, coded ISO 3166-1 alpha-2 ("FI"), or ISO 3166-2 for the nations of
//   Great Britain ("GB-SCT");
// - a people is a people without a country of its own (a Native American
//   nation, the Sámi, the Roma), coded "people:" plus a lowercase slug
//   ("people:sami").

export type HeritageKind = "country" | "people";

export interface Heritage {
  kind: HeritageKind;
  name: string;
}

export const HERITAGES = {
  FI: { kind: "country", name: "Finland" },
  IT: { kind: "country", name: "Italy" },
  // The whole island, Northern Ireland included.
  IE: { kind: "country", name: "Ireland" },
  "GB-ENG": { kind: "country", name: "England" },
  "GB-SCT": { kind: "country", name: "Scotland" },
  "GB-WLS": { kind: "country", name: "Wales" },
  DE: { kind: "country", name: "Germany" },
  SE: { kind: "country", name: "Sweden" },
  PL: { kind: "country", name: "Poland" },
  NL: { kind: "country", name: "Netherlands" },
  FR: { kind: "country", name: "France" },
  NO: { kind: "country", name: "Norway" },
  HU: { kind: "country", name: "Hungary" },
  UA: { kind: "country", name: "Ukraine" },
} as const satisfies Record<string, Heritage>;

export type HeritageCode = keyof typeof HERITAGES;

// The code shape each kind must use; a test holds every entry to it.
export const CODE_SHAPES: Record<HeritageKind, RegExp> = {
  country: /^[A-Z]{2}$|^GB-[A-Z]{3}$/,
  people: /^people:[a-z][a-z-]*$/,
};

// A line whose origin the records don't give. As part of a person's entry it
// keeps that part of their mix unknown.
export const UNKNOWN_HERITAGE = "unknown";

// What a person's heritage entry may list.
export type HeritageEntryCode = HeritageCode | typeof UNKNOWN_HERITAGE;

export function isHeritageCode(value: string): value is HeritageCode {
  return Object.hasOwn(HERITAGES, value);
}

export function isHeritageEntryCode(value: unknown): value is HeritageEntryCode {
  return typeof value === "string" && (value === UNKNOWN_HERITAGE || isHeritageCode(value));
}
