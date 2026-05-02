"use client";

import Link from "next/link";
import { Baby, Clock, Euro, Snowflake, Sun, Leaf, CalendarDays } from "lucide-react";
import type { Idea } from "../types";
import { summarizeMonths } from "../months";
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

/** Pick a glanceable icon for the months chip. Year-round = sun
 *  (always-on); winter-dominated window = snowflake; summer-dominated =
 *  sun; transitional/mixed = leaf. */
function MonthsIcon({ months }: { months: number[] }) {
  if (months.length >= 12) return <Sun size={13} />;
  const winterCount = months.filter((m) => m === 12 || m === 1 || m === 2).length;
  const summerCount = months.filter((m) => m >= 6 && m <= 8).length;
  if (winterCount >= 2 && summerCount === 0) return <Snowflake size={13} />;
  if (summerCount >= 2 && winterCount === 0) return <Sun size={13} />;
  return <Leaf size={13} />;
}

function MonthsChip({ months }: { months: number[] }) {
  return (
    <Chip>
      <MonthsIcon months={months} />
      {summarizeMonths(months)}
    </Chip>
  );
}

function EventsChip({ events }: { events: NonNullable<Idea["availability"]["events"]> }) {
  // Card-level chip is just a count + first event name (if any) — full
  // detail goes on the detail page.
  const label =
    events.length === 1
      ? events[0].name ?? "Annual event"
      : `${events.length} annual events`;
  return (
    <Chip>
      <CalendarDays size={13} />
      {label}
    </Chip>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-elevated px-2 py-1 text-xs text-text-secondary">
      {children}
    </span>
  );
}

export function IdeaCard({ idea, basePath }: { idea: Idea; basePath: string }) {
  const events = idea.availability.events;

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
          <MonthsChip months={idea.availability.suitableMonths} />
          {events && events.length > 0 && <EventsChip events={events} />}
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
