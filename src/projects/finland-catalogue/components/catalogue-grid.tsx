"use client";

import { useDeferredValue, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, SlidersHorizontal, Star } from "lucide-react";
import { cn, shuffleArray } from "@/shared/lib/utils";
import { IDEAS } from "../ideas";
import type { Idea } from "../types";
import {
  applyFilters,
  applySearch,
  countActive,
  EMPTY_FILTERS,
  ideaHaystack,
  type Filters,
} from "../filters";
import { useFavorites } from "../store";
import { FilterPanel } from "./filter-panel";
import { IdeaCard } from "./idea-card";
import { LoadingSpinner } from "./loading-spinner";
import { PageHeader } from "./page-header";
import { SearchBar } from "./search-bar";

type GridMode = "all" | "favorites";

// Shuffled once per JS session and reused across mounts so the catalogue
// looks fresh each visit, while staying on a stable order as the user
// drills into a detail page and back. The list is only rendered after
// hydration (see isHydrated below) so users see the shuffled order on
// first paint — never the source order.
let clientShuffledIdeas: readonly Idea[] | null = null;
const getClientIdeas = (): readonly Idea[] => {
  if (clientShuffledIdeas === null) clientShuffledIdeas = shuffleArray(IDEAS);
  return clientShuffledIdeas;
};
const getServerIdeas = (): readonly Idea[] => IDEAS;
const subscribeNoop = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

export function CatalogueGrid({
  basePath,
  mode,
}: {
  basePath: string;
  mode: GridMode;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [query, setQuery] = useState("");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const favoriteSlugs = useFavorites((s) => s.slugs);

  const orderedIdeas = useSyncExternalStore(
    subscribeNoop,
    getClientIdeas,
    getServerIdeas,
  );
  const isHydrated = useSyncExternalStore(subscribeNoop, getTrue, getFalse);

  // Re-rendering the grid (50+ IdeaCards with images) on every keystroke
  // makes typing feel sluggish. useDeferredValue lets React interrupt the
  // grid re-render to keep the input responsive — the input updates
  // immediately, the filtered results catch up a tick later.
  const deferredQuery = useDeferredValue(query);

  const baseIdeas = useMemo(
    () =>
      mode === "favorites"
        ? orderedIdeas.filter((i) => favoriteSlugs.includes(i.slug))
        : orderedIdeas,
    [mode, favoriteSlugs, orderedIdeas],
  );

  const visibleIdeas = useMemo(
    () =>
      applySearch(applyFilters(baseIdeas, filters), deferredQuery, ideaHaystack),
    [baseIdeas, filters, deferredQuery],
  );

  const activeCount = countActive(filters);
  const hasNarrowing = activeCount > 0 || query.trim().length > 0;

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          backHref="/"
          backLabel="Back to Novelty World"
          titlePrimary="Finland"
          titleSecondary="Catalogue"
          subhead="Hand-picked things to do in Finland — for friends, family, and anyone planning a visit."
          rightActions={
            <div className="flex flex-wrap gap-3 sm:flex-nowrap">
              <TopicsLink basePath={basePath} />
              <FavoritesSwitch
                mode={mode}
                basePath={basePath}
                favoriteCount={favoriteSlugs.length}
              />
            </div>
          }
        />

        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search ideas"
          ariaLabel="Search ideas"
        />

        <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
          <aside className="mb-6 lg:mb-0">
            <button
              type="button"
              onClick={() => setMobilePanelOpen((v) => !v)}
              aria-expanded={mobilePanelOpen}
              className="flex w-full items-center justify-between rounded-md border border-border-default bg-surface-secondary px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-border-hover lg:hidden"
            >
              <span className="inline-flex items-center gap-2">
                <SlidersHorizontal size={16} />
                Filters
                {activeCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-pink px-1.5 text-xs text-surface-primary">
                    {activeCount}
                  </span>
                )}
              </span>
              <span className="text-xs text-text-muted">
                {mobilePanelOpen ? "Hide" : "Show"}
              </span>
            </button>

            <div
              className={cn(
                "rounded-lg border border-border-default bg-surface-secondary p-5",
                "mt-3 lg:mt-0",
                "lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto",
                mobilePanelOpen ? "block" : "hidden lg:block",
              )}
            >
              <FilterPanel filters={filters} onChange={setFilters} />
            </div>
          </aside>

          <section>
            {!isHydrated ? (
              <LoadingSpinner label="Loading ideas…" accentClass="border-t-brand-pink" />
            ) : (
              <>
                <ResultsHeader
                  total={baseIdeas.length}
                  showing={visibleIdeas.length}
                  narrowed={hasNarrowing}
                />

                {visibleIdeas.length === 0 ? (
                  <EmptyState
                    mode={mode}
                    narrowed={hasNarrowing}
                    basePath={basePath}
                  />
                ) : (
                  <div className="columns-1 gap-5 sm:columns-2 xl:columns-3 2xl:columns-4">
                    {visibleIdeas.map((idea) => (
                      <div key={idea.slug} className="mb-5 break-inside-avoid">
                        <IdeaCard idea={idea} basePath={basePath} />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function TopicsLink({ basePath }: { basePath: string }) {
  return (
    <Link
      href={`${basePath}/topics`}
      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border-default bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-hover"
    >
      <BookOpen size={16} className="text-brand-blue" />
      <span>Learn about Finland</span>
    </Link>
  );
}

function FavoritesSwitch({
  mode,
  basePath,
  favoriteCount,
}: {
  mode: GridMode;
  basePath: string;
  favoriteCount: number;
}) {
  const router = useRouter();
  const on = mode === "favorites";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => router.push(on ? basePath : `${basePath}/favorites`)}
      className="inline-flex shrink-0 items-center gap-3 rounded-full border border-border-default bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-hover"
    >
      <Star
        size={16}
        className={on ? "text-brand-orange" : "text-text-secondary"}
        fill={on ? "currentColor" : "none"}
      />
      <span>Favorites only</span>
      {favoriteCount > 0 && (
        <span className="text-xs text-text-muted">({favoriteCount})</span>
      )}
      <SwitchTrack on={on} />
    </button>
  );
}

function SwitchTrack({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors",
        on ? "bg-brand-orange" : "bg-surface-primary",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-text-primary shadow-sm transition-transform",
          on ? "translate-x-4" : "translate-x-0",
        )}
      />
    </span>
  );
}

function ResultsHeader({
  total,
  showing,
  narrowed,
}: {
  total: number;
  showing: number;
  narrowed: boolean;
}) {
  if (total === 0) return null;
  return (
    <div className="mb-4 text-sm text-text-muted">
      {narrowed ? (
        <>
          Showing <span className="font-medium text-text-primary">{showing}</span> of{" "}
          {total}
        </>
      ) : (
        <>
          {total} {total === 1 ? "idea" : "ideas"}
        </>
      )}
    </div>
  );
}

function EmptyState({
  mode,
  narrowed,
  basePath,
}: {
  mode: GridMode;
  narrowed: boolean;
  basePath: string;
}) {
  if (narrowed) {
    return (
      <div className="rounded-lg border border-border-default bg-surface-secondary p-8 text-center text-text-secondary">
        No ideas match your search and filters.
      </div>
    );
  }
  if (mode === "favorites") {
    return (
      <div className="rounded-lg border border-border-default bg-surface-secondary p-8 text-center text-text-secondary">
        No favorites yet — tap the{" "}
        <Star size={14} className="inline align-text-bottom" /> on any idea to save it
        here.{" "}
        <Link href={basePath} className="text-brand-pink hover:underline">
          Browse the catalogue
        </Link>
        .
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border-default bg-surface-secondary p-8 text-center text-text-secondary">
      Nothing here yet — check back soon.
    </div>
  );
}
