"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, SlidersHorizontal, Star } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { IDEAS } from "../ideas";
import {
  applyFilters,
  collectTags,
  countActive,
  EMPTY_FILTERS,
  type Filters,
} from "../filters";
import { useFavorites } from "../store";
import { FilterPanel } from "./filter-panel";
import { IdeaCard } from "./idea-card";

type GridMode = "all" | "favorites";

export function CatalogueGrid({
  basePath,
  mode,
}: {
  basePath: string;
  mode: GridMode;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const favoriteSlugs = useFavorites((s) => s.slugs);

  const baseIdeas = useMemo(
    () =>
      mode === "favorites"
        ? IDEAS.filter((i) => favoriteSlugs.includes(i.slug))
        : IDEAS,
    [mode, favoriteSlugs],
  );

  const visibleIdeas = useMemo(
    () => applyFilters(baseIdeas, filters),
    [baseIdeas, filters],
  );

  const availableTags = useMemo(() => collectTags(baseIdeas), [baseIdeas]);

  const activeCount = countActive(filters);

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 self-start text-sm text-text-secondary transition-colors hover:text-brand-pink"
          >
            <ArrowLeft size={16} />
            Back to Novelty World
          </Link>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                <span className="text-brand-blue">Finland</span>{" "}
                <span className="text-text-primary">
                  {mode === "favorites" ? "Favorites" : "Catalogue"}
                </span>
              </h1>
              <p className="mt-2 text-text-secondary">
                {mode === "favorites"
                  ? "Ideas you've starred for later."
                  : "Hand-picked things to do in Finland — for friends, family, and anyone planning a visit."}
              </p>
            </div>

            <ModeToggle mode={mode} basePath={basePath} favoriteCount={favoriteSlugs.length} />
          </div>
        </div>

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
                mobilePanelOpen ? "block" : "hidden lg:block",
              )}
            >
              <FilterPanel
                filters={filters}
                onChange={setFilters}
                availableTags={availableTags}
              />
            </div>
          </aside>

          <section>
            <ResultsHeader
              total={baseIdeas.length}
              showing={visibleIdeas.length}
              activeCount={activeCount}
            />

            {visibleIdeas.length === 0 ? (
              <EmptyState mode={mode} hasFilters={activeCount > 0} basePath={basePath} />
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {visibleIdeas.map((idea) => (
                  <IdeaCard key={idea.slug} idea={idea} basePath={basePath} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ModeToggle({
  mode,
  basePath,
  favoriteCount,
}: {
  mode: GridMode;
  basePath: string;
  favoriteCount: number;
}) {
  const tabClass = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      active
        ? "bg-surface-elevated text-text-primary"
        : "text-text-secondary hover:text-text-primary",
    );

  return (
    <div className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border-default bg-surface-secondary p-1">
      <Link href={basePath} className={tabClass(mode === "all")}>
        All
      </Link>
      <Link href={`${basePath}/favorites`} className={tabClass(mode === "favorites")}>
        <Star size={14} fill={mode === "favorites" ? "currentColor" : "none"} />
        Favorites
        {favoriteCount > 0 && (
          <span className="ml-0.5 text-xs text-text-muted">({favoriteCount})</span>
        )}
      </Link>
    </div>
  );
}

function ResultsHeader({
  total,
  showing,
  activeCount,
}: {
  total: number;
  showing: number;
  activeCount: number;
}) {
  if (total === 0) return null;
  return (
    <div className="mb-4 text-sm text-text-muted">
      {activeCount > 0 ? (
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
  hasFilters,
  basePath,
}: {
  mode: GridMode;
  hasFilters: boolean;
  basePath: string;
}) {
  if (hasFilters) {
    return (
      <div className="rounded-lg border border-border-default bg-surface-secondary p-8 text-center text-text-secondary">
        No ideas match the current filters.
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
      No ideas yet — add some with the{" "}
      <code className="rounded bg-surface-elevated px-1.5 py-0.5 text-xs">
        /add-finland-idea
      </code>{" "}
      skill.
    </div>
  );
}
