"use client";

import { useDeferredValue, useMemo, useState, useSyncExternalStore } from "react";
import { shuffleArray } from "@/shared/lib/utils";
import { applySearch, topicHaystack } from "../filters";
import { TOPICS } from "../topics";
import type { Topic } from "../types";
import { LoadingSpinner } from "./loading-spinner";
import { PageHeader } from "./page-header";
import { SearchBar } from "./search-bar";
import { TopicCard } from "./topic-card";

// Session-stable shuffle — see catalogue-grid for the full reasoning.
let clientShuffledTopics: readonly Topic[] | null = null;
const getClientTopics = (): readonly Topic[] => {
  if (clientShuffledTopics === null) clientShuffledTopics = shuffleArray(TOPICS);
  return clientShuffledTopics;
};
const getServerTopics = (): readonly Topic[] => TOPICS;
const subscribeNoop = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

export function TopicsLanding({ basePath }: { basePath: string }) {
  const [query, setQuery] = useState("");
  // Same reasoning as on the catalogue grid: defer the filter pass so the
  // input stays responsive while the topic cards re-render.
  const deferredQuery = useDeferredValue(query);

  const orderedTopics = useSyncExternalStore(
    subscribeNoop,
    getClientTopics,
    getServerTopics,
  );
  const isHydrated = useSyncExternalStore(subscribeNoop, getTrue, getFalse);

  const visibleTopics = useMemo(
    () => applySearch(orderedTopics, deferredQuery, topicHaystack),
    [orderedTopics, deferredQuery],
  );

  const total = TOPICS.length;
  const showing = visibleTopics.length;
  const narrowed = query.trim().length > 0;

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          backHref={basePath}
          backLabel="Back to catalogue"
          titlePrimary="Finland"
          titleSecondary="Topics"
          subhead="Cultural and educational explainers — the things to know about Finland while you visit."
        />

        {total > 0 && (
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search topics"
            ariaLabel="Search topics"
          />
        )}

        {total === 0 ? (
          <div className="rounded-lg border border-border-default bg-surface-secondary p-8 text-center text-text-secondary">
            Topics coming soon.
          </div>
        ) : !isHydrated ? (
          <LoadingSpinner label="Loading topics…" accentClass="border-t-brand-blue" />
        ) : (
          <>
            <div className="mb-4 text-sm text-text-muted">
              {narrowed ? (
                <>
                  Showing{" "}
                  <span className="font-medium text-text-primary">{showing}</span> of{" "}
                  {total}
                </>
              ) : (
                <>
                  {total} {total === 1 ? "topic" : "topics"}
                </>
              )}
            </div>
            {showing === 0 ? (
              <div className="rounded-lg border border-border-default bg-surface-secondary p-8 text-center text-text-secondary">
                No topics match your search.
              </div>
            ) : (
              <div className="columns-1 gap-5 sm:columns-2 xl:columns-3 2xl:columns-4">
                {visibleTopics.map((topic) => (
                  <div key={topic.slug} className="mb-5 break-inside-avoid">
                    <TopicCard topic={topic} basePath={basePath} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
