import { describe, expect, it } from "vitest";
import { shareTitle, shownHeritage } from "./heritage-symbols";
import type { HeritageCode } from "./heritages";
import type { HeritageBreakdown } from "./logic";
import { SYMBOL_ART } from "./symbol-art";
import { SYMBOL_ART_URLS } from "./symbol-art-urls";

function breakdown(known: [HeritageCode, number][], unknown = 0): HeritageBreakdown {
  return { known: known.map(([code, share]) => ({ code, share })), unknown, entryInUse: null };
}

describe("shownHeritage", () => {
  it("picks each share's symbol for the birth year, and names its era", () => {
    const [finnish] = shownHeritage(breakdown([["finnish", 1]]), 1899).shares;
    expect(finnish.symbol.src).toBe(SYMBOL_ART_URLS["finland-lion-arms"]);
    expect(finnish.symbol.emblem).toBe(true);
    expect(finnish.era).toBe("Grand Duchy of Finland (Russian Empire), 1809–1918");

    const [modern] = shownHeritage(breakdown([["finnish", 1]]), 1990).shares;
    expect(modern.symbol.src).toBe(SYMBOL_ART_URLS["finland-flag"]);
    expect(modern.symbol.emblem).toBe(false);
    expect(modern.era).toBe("Finland, since 1918");
  });

  it("shows today's symbols without a birth year", () => {
    const [share] = shownHeritage(breakdown([["finnish", 1]]), null).shares;
    expect(share.symbol.src).toBe(SYMBOL_ART_URLS["finland-flag"]);
  });

  it("never splits a people's share by region", () => {
    const shown = shownHeritage(
      breakdown([["german", 0.375], ["italian/sicily", 0.25], ["italian", 0.25]], 0.125),
      1990,
    );
    expect(shown.shares.map((s) => [s.people, s.share])).toEqual([["italian", 0.5], ["german", 0.375]]);
    expect(shown.unknown).toBe(0.125);
  });

  it("shows a region's era only while the whole share came through the region", () => {
    const [mixed] = shownHeritage(breakdown([["italian/sicily", 0.5], ["italian", 0.5]]), 1850).shares;
    expect(mixed.era).toBe("Italy before unification, before 1861");
  });

  it("falls back to the people's flag of today, with no era, where the era's symbol has no art", () => {
    const [share] = shownHeritage(breakdown([["italian/sicily", 1]]), 1850).shares;
    expect(SYMBOL_ART["sicily-trinacria"]).toBeUndefined();
    expect(share.era).toBeNull();
    expect(share.symbol.emblem).toBe(false);
  });
});

describe("shareTitle", () => {
  it("names the people and share, then the era", () => {
    expect(shareTitle({ people: "finnish", era: "Finland, since 1918" }, "25%")).toBe("Finnish 25%\nFinland, since 1918");
    expect(shareTitle({ people: "finnish", era: null }, "25%")).toBe("Finnish 25%");
  });
});

describe("SYMBOL_ART_URLS", () => {
  it("has a file for exactly the symbols with art", () => {
    expect(Object.keys(SYMBOL_ART_URLS).sort()).toEqual(Object.keys(SYMBOL_ART).sort());
  });
});
