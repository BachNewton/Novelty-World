import type { Idea } from "./types";

export type Season = "winter" | "spring" | "summer" | "fall" | "year-round";
export type CostBucket = "free" | "under-30" | "under-100" | "over-100";
export type AccessComplexity = Idea["accessFromHelsinki"]["complexity"];
export type Duration = Idea["duration"];

export interface Filters {
  seasons: Season[];
  costs: CostBucket[];
  durations: Duration[];
  access: AccessComplexity[];
  tags: string[];
  toddlerOnly: boolean;
}

export const EMPTY_FILTERS: Filters = {
  seasons: [],
  costs: [],
  durations: [],
  access: [],
  tags: [],
  toddlerOnly: false,
};

export function collectTags(ideas: Idea[]): string[] {
  const set = new Set<string>();
  for (const idea of ideas) {
    for (const tag of idea.tags) set.add(tag);
  }
  return Array.from(set).sort();
}

export function bucketCost(eur: number): CostBucket {
  if (eur === 0) return "free";
  if (eur < 30) return "under-30";
  if (eur < 100) return "under-100";
  return "over-100";
}

function ideaSeasons(idea: Idea): Season[] {
  return idea.availability.seasons === "year-round"
    ? ["year-round"]
    : idea.availability.seasons;
}

export function applyFilters(ideas: Idea[], filters: Filters): Idea[] {
  return ideas.filter((idea) => {
    if (filters.toddlerOnly && !idea.toddlerFriendly) return false;

    if (filters.seasons.length > 0) {
      const seasons = ideaSeasons(idea);
      // Year-round ideas match any season filter — they're always available.
      const matches =
        seasons.includes("year-round") ||
        filters.seasons.some((s) => seasons.includes(s));
      if (!matches) return false;
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
      if (!filters.access.includes(idea.accessFromHelsinki.complexity)) {
        return false;
      }
    }

    if (filters.tags.length > 0) {
      const hasAny = filters.tags.some((t) => idea.tags.includes(t));
      if (!hasAny) return false;
    }

    return true;
  });
}

export function countActive(filters: Filters): number {
  return (
    filters.seasons.length +
    filters.costs.length +
    filters.durations.length +
    filters.access.length +
    filters.tags.length +
    (filters.toddlerOnly ? 1 : 0)
  );
}
