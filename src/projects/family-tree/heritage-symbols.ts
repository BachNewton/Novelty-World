// What a card and the person panel show of a person's heritage
// (ideas/heritage-through-time.md, "Direction for the visuals"): one share
// per people, however many regions it came through, each with the symbol of
// its era for the person's birth year.

import type { StaticImageData } from "next/image";
import { FLAGS } from "./flags";
import { peopleOf, PEOPLES, type HeritageCode, type PeopleCode } from "./heritages";
import type { HeritageBreakdown } from "./logic";
import { SYMBOL_ART } from "./symbol-art";
import { SYMBOL_ART_URLS } from "./symbol-art-urls";
import { eraYears, pickSymbol, type SymbolId } from "./symbol-timelines";

export interface ShownSymbol {
  src: string | StaticImageData;
  // The symbol's own proportions, width to height.
  width: number;
  height: number;
  // A coat of arms or emblem in its own outline on a transparent background,
  // rather than a rectangular flag.
  emblem: boolean;
}

export interface ShownShare {
  people: PeopleCode;
  share: number;
  symbol: ShownSymbol;
  // The era the symbol belongs to, for the hover text: "Grand Duchy of
  // Finland (Russian Empire), 1809–1918". Null when that era's symbol has no
  // art yet and the people's flag of today stands in for it.
  era: string | null;
}

export interface ShownHeritage {
  // Largest share first; ties keep the mix's surname-line order.
  shares: ShownShare[];
  unknown: number;
}

function symbolFor(symbol: SymbolId): ShownSymbol | null {
  const art = SYMBOL_ART[symbol];
  const src = SYMBOL_ART_URLS[symbol];
  if (art === undefined || src === undefined) return null;
  const { width, height } = art.display ?? art.proportions;
  return { src, width, height, emblem: art.display !== undefined };
}

// A person's heritage as shown, for someone born in `birthYear` (their own,
// or estimated from their relatives); without any year, today's symbols.
export function shownHeritage(breakdown: HeritageBreakdown, birthYear: number | null): ShownHeritage {
  // Each people's share, and the one heritage code it all came through, or
  // the people itself when it came through several.
  const groups = new Map<PeopleCode, { code: HeritageCode; share: number }>();
  for (const { code, share } of breakdown.known) {
    const people = peopleOf(code);
    const group = groups.get(people);
    if (group === undefined) groups.set(people, { code, share });
    else groups.set(people, { code: group.code === code ? code : people, share: group.share + share });
  }
  const year = birthYear ?? Number.POSITIVE_INFINITY;
  const shares = [...groups].map(([people, { code, share }]): ShownShare => {
    // A region's own symbol only while the whole share came through it.
    const picked = pickSymbol(code, year);
    const symbol = symbolFor(picked.symbol);
    if (symbol === null) {
      const flag = FLAGS[people];
      return { people, share, symbol: { src: flag.src, width: flag.width, height: flag.height, emblem: false }, era: null };
    }
    const { era } = picked;
    const years = era.from === null && era.until === null ? "" : `, ${eraYears(era)}`;
    return { people, share, symbol, era: `${era.name}${years}` };
  });
  // Shares reached by different paths can differ in the last bits of the
  // float, so ties are judged on rounded shares; the sort is stable.
  shares.sort((a, b) => Math.round(b.share * 1e9) - Math.round(a.share * 1e9));
  return { shares, unknown: breakdown.unknown };
}

// The hover text of a share: the people and its share, then its era.
export function shareTitle(share: Pick<ShownShare, "people" | "era">, percent: string): string {
  const head = `${PEOPLES[share.people].name} ${percent}`;
  return share.era === null ? head : `${head}\n${share.era}`;
}
