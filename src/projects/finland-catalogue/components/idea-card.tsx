"use client";

import Link from "next/link";
import { Baby, Clock, Euro, Snowflake, Sun, Leaf, CalendarDays } from "lucide-react";
import type { Idea } from "../types";
import { HotlinkImage } from "./hotlink-image";
import { StarButton } from "./star-button";

const DURATION_LABELS: Record<Idea["duration"], string> = {
  "<1h": "< 1 hour",
  "1-3h": "1-3 hours",
  "half-day": "Half day",
  "full-day": "Full day",
  "multi-day": "Multi-day",
};

function formatCost(cost: Idea["cost"]): string {
  if (cost.perPersonEur === 0) return "Free";
  return `€${cost.perPersonEur}`;
}

function SeasonChip({ availability }: { availability: Idea["availability"] }) {
  const seasons = availability.seasons;

  if (seasons === "year-round") {
    return (
      <Chip>
        <Sun size={13} />
        Year-round
      </Chip>
    );
  }

  if (availability.specificDates) {
    return (
      <Chip>
        <CalendarDays size={13} />
        {availability.specificDates.length > 18
          ? `${seasons.map(capitalize).join(", ")} only`
          : availability.specificDates}
      </Chip>
    );
  }

  const onlyWinter = seasons.length === 1 && seasons[0] === "winter";
  const onlySummer = seasons.length === 1 && seasons[0] === "summer";
  const Icon = onlyWinter ? Snowflake : onlySummer ? Sun : Leaf;
  const label = `${seasons.map(capitalize).join(", ")} only`;

  return (
    <Chip>
      <Icon size={13} />
      {label}
    </Chip>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-elevated px-2 py-1 text-xs text-text-secondary">
      {children}
    </span>
  );
}

export function IdeaCard({ idea, basePath }: { idea: Idea; basePath: string }) {
  return (
    <Link
      href={`${basePath}/${idea.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border-default bg-surface-secondary transition-colors hover:border-brand-pink"
    >
      <div className="relative aspect-[4/3] w-full bg-surface-tertiary">
        <HotlinkImage src={idea.thumbnailUrl} alt={idea.title} fit="cover" />
        <StarButton slug={idea.slug} size="sm" className="absolute right-2 top-2" />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold leading-tight text-text-primary group-hover:text-brand-pink">
            {idea.title}
          </h3>
          <p className="line-clamp-2 text-sm text-text-secondary">
            {idea.shortDescription}
          </p>
        </div>

        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          <Chip>
            <Euro size={13} />
            {formatCost(idea.cost)}
          </Chip>
          <Chip>
            <Clock size={13} />
            {DURATION_LABELS[idea.duration]}
          </Chip>
          <SeasonChip availability={idea.availability} />
          {idea.toddlerFriendly && (
            <Chip>
              <Baby size={13} />
              Toddler-friendly
            </Chip>
          )}
        </div>
      </div>
    </Link>
  );
}
