import { describe, expect, it } from "vitest";
import { PEOPLES, REGIONS, type PeopleCode, type RegionSlug } from "./heritages";
import {
  PEOPLE_TIMELINES,
  REGION_TIMELINES,
  SYMBOLS,
  isVerified,
  pickSymbol,
  type SymbolEra,
} from "./symbol-timelines";

// Why `timeline` isn't a run of eras from the earliest times to the present,
// in order with no gaps or overlaps, or null when it is.
function timelineProblem(timeline: readonly SymbolEra[]): string | null {
  if (timeline.length === 0) return "is empty";
  if (timeline[0].from !== null) return "doesn't reach back without limit";
  if (timeline[timeline.length - 1].until !== null) return "doesn't run to the present";
  for (const [i, era] of timeline.entries()) {
    if (era.from !== null && era.until !== null && era.from >= era.until) return `era ${i} ends before it starts`;
    if (i > 0 && era.from !== timeline[i - 1].until) return `era ${i} doesn't start where era ${i - 1} ends`;
  }
  return null;
}

// The birth years a people's regional eras cover, as [from, until) spans.
function regionalSpans(people: PeopleCode): [number | null, number | null][] {
  return PEOPLE_TIMELINES[people].filter((era) => era.regional).map((era) => [era.from, era.until]);
}

describe("symbol timelines", () => {
  it("run from the earliest times to the present, in order, with no gaps or overlaps", () => {
    for (const people of Object.keys(PEOPLES) as PeopleCode[]) {
      expect(timelineProblem(PEOPLE_TIMELINES[people]), people).toBeNull();
    }
  });

  it("give each region eras covering exactly its people's regional eras, with no gaps or overlaps", () => {
    for (const region of Object.keys(REGIONS) as RegionSlug[]) {
      const timeline = REGION_TIMELINES[region];
      const [first] = regionalSpans(REGIONS[region].people);
      expect(regionalSpans(REGIONS[region].people), region).toHaveLength(1);
      expect(timeline[0].from, region).toBe(first[0]);
      expect(timeline[timeline.length - 1].until, region).toBe(first[1]);
      for (const [i, era] of timeline.entries()) {
        if (i > 0) expect(era.from, `${region} era ${i}`).toBe(timeline[i - 1].until);
      }
    }
  });

  it("mark regional eras only on peoples with a listed region", () => {
    for (const people of Object.keys(PEOPLES) as PeopleCode[]) {
      if (regionalSpans(people).length === 0) continue;
      const regions = Object.values(REGIONS).filter((region) => region.people === people);
      expect(regions.length, people).toBeGreaterThan(0);
    }
  });

  it("use only listed symbols, and list only safe, unpadded sources", () => {
    const eras = [...Object.values(PEOPLE_TIMELINES).flat(), ...Object.values(REGION_TIMELINES).flat()];
    for (const era of eras) {
      expect(Object.hasOwn(SYMBOLS, era.symbol), era.symbol).toBe(true);
      for (const source of era.sources) {
        expect(source.trim(), era.name).toBe(source);
        expect(source, era.name).not.toBe("");
        expect(source, era.name).not.toMatch(/https?:/);
      }
    }
  });

  it("start unverified, as the design doc's proposal", () => {
    expect(isVerified(PEOPLE_TIMELINES.finnish[0])).toBe(false);
    expect(isVerified({ ...PEOPLE_TIMELINES.finnish[0], sources: ["a source"] })).toBe(true);
  });
});

describe("pickSymbol", () => {
  it("picks the era a birth year falls in, the first year of an era belonging to it", () => {
    expect(pickSymbol("finnish", 1880)).toMatchObject({
      symbol: "finland-lion-arms",
      label: "Finnish, Grand Duchy of Finland (Russian Empire), 1809–1918",
    });
    expect(pickSymbol("finnish", 1917).symbol).toBe("finland-lion-arms");
    expect(pickSymbol("finnish", 1918)).toMatchObject({ symbol: "finland-flag", label: "Finnish, Finland, since 1918" });
    expect(pickSymbol("finnish", 1700).label).toBe("Finnish, Finland under the Swedish crown, before 1809");
  });

  it("names a single-era people without years", () => {
    expect(pickSymbol("english", 1650)).toMatchObject({ symbol: "england-flag", label: "English, England" });
  });

  it("shows a people's own symbol, not a regime's, for German lines born 1933–1945", () => {
    expect(pickSymbol("german", 1940).symbol).toBe("germany-black-red-gold");
  });

  it("shows a region's symbol in its people's regional eras, and the people's outside them", () => {
    expect(pickSymbol("italian/sicily", 1830)).toMatchObject({
      symbol: "sicily-trinacria",
      label: "Italian (Sicily), Kingdom of the Two Sicilies, 1816–1861",
    });
    expect(pickSymbol("italian", 1830)).toMatchObject({
      symbol: "italy-tricolour",
      label: "Italian, Italy before unification, before 1861",
    });
    expect(pickSymbol("italian/sicily", 1900)).toMatchObject({
      symbol: "italy-savoy-flag",
      label: "Italian, Kingdom of Italy, 1861–1946",
    });
  });
});
