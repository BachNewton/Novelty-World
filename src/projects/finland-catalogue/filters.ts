import type { Idea } from "./types";

export type CostBucket = "free" | "under-30" | "under-100" | "over-100";
export type AccessComplexity = Idea["accessFromHelsinki"]["complexity"];
export type Duration = Idea["duration"];

export interface Filters {
  /** Months (1-12) the user is interested in. An idea matches if its
   *  suitableMonths overlaps the selection. Empty = no month filter. */
  months: number[];
  regions: string[];
  costs: CostBucket[];
  durations: Duration[];
  access: AccessComplexity[];
  tags: string[];
}

export const EMPTY_FILTERS: Filters = {
  months: [],
  regions: [],
  costs: [],
  durations: [],
  access: [],
  tags: [],
};

/** Canonical tag vocabulary. The filter renders every value here as a chip,
 *  whether or not any current idea uses it. Grow this list when the
 *  add-finland-idea skill flags a clear new grouping. */
export const KNOWN_TAGS: readonly string[] = ["food"] as const;

/** Canonical region vocabulary. Same policy as KNOWN_TAGS — the filter
 *  always renders these, and new regions get added when an idea genuinely
 *  needs one. */
export const KNOWN_REGIONS: readonly string[] = ["Helsinki"] as const;

export function bucketCost(eur: number): CostBucket {
  if (eur === 0) return "free";
  if (eur < 30) return "under-30";
  if (eur < 100) return "under-100";
  return "over-100";
}

export function applyFilters(ideas: Idea[], filters: Filters): Idea[] {
  return ideas.filter((idea) => {
    if (filters.months.length > 0) {
      const overlap = filters.months.some((m) =>
        idea.availability.suitableMonths.includes(m),
      );
      if (!overlap) return false;
    }

    if (filters.regions.length > 0) {
      if (!filters.regions.includes(idea.location.region)) return false;
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
    filters.months.length +
    filters.regions.length +
    filters.costs.length +
    filters.durations.length +
    filters.access.length +
    filters.tags.length
  );
}
