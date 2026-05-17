import { IDEAS } from "./ideas";
import type { Idea, Topic } from "./types";

export type CostBucket = "free" | "under-30" | "under-100" | "over-100";
export type AccessComplexity = Idea["accessFromLauttasaari"]["complexity"];
export type Duration = Idea["duration"];
export type IndoorOutdoor = Idea["indoorOutdoor"];

export interface Filters {
  /** Months (1-12) the user is interested in. An idea matches if its
   *  suitableMonths overlaps the selection. Empty = no month filter. */
  months: number[];
  regions: string[];
  costs: CostBucket[];
  durations: Duration[];
  access: AccessComplexity[];
  indoorOutdoor: IndoorOutdoor[];
  tags: string[];
}

export const EMPTY_FILTERS: Filters = {
  months: [],
  regions: [],
  costs: [],
  durations: [],
  access: [],
  indoorOutdoor: [],
  tags: [],
};

/** Tag vocabulary, derived from whatever values appear in IDEAS. The filter
 *  renders one chip per unique tag — adding a new tag to an idea makes its
 *  chip appear automatically. The catalogue is the source of truth. */
export const KNOWN_TAGS: readonly string[] = [
  ...new Set(IDEAS.flatMap((i) => i.tags)),
].sort();

/** Region vocabulary, derived from whatever values appear in IDEAS. Same
 *  pattern as KNOWN_TAGS — adding a new region to an idea grows the list. */
export const KNOWN_REGIONS: readonly string[] = [
  ...new Set(IDEAS.flatMap((i) => i.location.region)),
].sort();

export function bucketCost(eur: number): CostBucket {
  if (eur === 0) return "free";
  if (eur < 30) return "under-30";
  if (eur < 100) return "under-100";
  return "over-100";
}

export function applyFilters(ideas: readonly Idea[], filters: Filters): Idea[] {
  return ideas.filter((idea) => {
    if (filters.months.length > 0) {
      const overlap = filters.months.some((m) =>
        idea.availability.suitableMonths.includes(m),
      );
      if (!overlap) return false;
    }

    if (filters.regions.length > 0) {
      const overlap = idea.location.region.some((r) =>
        filters.regions.includes(r),
      );
      if (!overlap) return false;
    }

    if (filters.costs.length > 0) {
      if (!filters.costs.includes(bucketCost(idea.cost.perPersonEur))) {
        return false;
      }
    }

    if (filters.durations.length > 0) {
      if (!filters.durations.includes(idea.duration)) return false;
    }

    if (filters.access.length > 0) {
      if (!filters.access.includes(idea.accessFromLauttasaari.complexity)) {
        return false;
      }
    }

    if (filters.indoorOutdoor.length > 0) {
      if (!filters.indoorOutdoor.includes(idea.indoorOutdoor)) return false;
    }

    if (filters.tags.length > 0) {
      const hasAny = filters.tags.some((t) => idea.tags.includes(t));
      if (!hasAny) return false;
    }

    return true;
  });
}

/** Free-text search over arbitrary catalogue items. The caller provides a
 *  haystack-builder so the same token-matching logic can search Ideas
 *  (title + descriptions + tags + regions) and Topics (title + descriptions
 *  + aliases) without duplicating the matcher. Whitespace-tokenised so
 *  "punavuori cafe" matches an idea whose title contains "cafe" and whose
 *  region contains "Punavuori". */
export function applySearch<T>(
  items: readonly T[],
  query: string,
  getHaystack: (item: T) => readonly string[],
): T[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...items];
  return items.filter((item) => {
    const haystack = getHaystack(item).join(" ").toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}

/** Haystack for Idea search — title, card hook, detail prose, tags, regions. */
export function ideaHaystack(idea: Idea): string[] {
  return [
    idea.title,
    idea.shortDescription,
    ...idea.longDescription,
    ...idea.tags,
    ...idea.location.region,
  ];
}

/** Haystack for Topic search — title, card hook, detail prose, and the
 *  aliases that double as natural-language synonyms a user might type. */
export function topicHaystack(topic: Topic): string[] {
  return [
    topic.title,
    topic.shortDescription,
    ...topic.longDescription,
    ...topic.aliases,
  ];
}

export function countActive(filters: Filters): number {
  return (
    filters.months.length +
    filters.regions.length +
    filters.costs.length +
    filters.durations.length +
    filters.access.length +
    filters.indoorOutdoor.length +
    filters.tags.length
  );
}
