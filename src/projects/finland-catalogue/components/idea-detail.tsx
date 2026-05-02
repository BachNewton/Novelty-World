import Link from "next/link";
import {
  ArrowLeft,
  Baby,
  Calendar,
  CalendarDays,
  Clock,
  Euro,
  ExternalLink,
  Footprints,
  Map,
  MapPin,
  Route,
  Trees,
} from "lucide-react";
import type { Idea } from "../types";
import { formatEventRange, summarizeMonths } from "../months";
import { ImageCarousel } from "./image-carousel";
import { StarButton } from "./star-button";

const DURATION_LABELS: Record<Idea["duration"], string> = {
  "<1h": "Less than an hour",
  "1-3h": "1-3 hours",
  "half-day": "Half day",
  "full-day": "Full day",
  "multi-day": "Multi-day",
};

const COMPLEXITY_LABELS: Record<Idea["accessFromHelsinki"]["complexity"], string> = {
  simple: "Simple",
  moderate: "Moderate",
  complex: "Complex",
};

const COMPLEXITY_TONE: Record<
  Idea["accessFromHelsinki"]["complexity"],
  string
> = {
  simple: "text-brand-green",
  moderate: "text-brand-orange",
  complex: "text-brand-pink",
};

const LEAD_TIME_LABELS: Record<Idea["booking"]["leadTime"], string> = {
  "same-day": "Same-day OK",
  "few-days": "Few days ahead",
  weeks: "Weeks ahead",
  months: "Months ahead",
};

const INTENSITY_LABELS: Record<Idea["physicalIntensity"], string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function MetaRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border-default py-3 last:border-b-0">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
        {icon}
        {label}
      </div>
      <div className="text-sm text-text-primary">{children}</div>
    </div>
  );
}

export function IdeaDetail({ idea, basePath }: { idea: Idea; basePath: string }) {
  const allImages = [idea.thumbnailUrl, ...idea.galleryUrls];

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link
          href={basePath}
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-brand-pink"
        >
          <ArrowLeft size={16} />
          Back to Finland Catalogue
        </Link>

        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              {idea.title}
            </h1>
            <p className="mt-2 text-base text-text-secondary sm:text-lg">
              {idea.shortDescription}
            </p>
          </div>
          <StarButton slug={idea.slug} size="lg" showLabel className="self-start shrink-0" />
        </header>

        <div className="mb-8">
          <ImageCarousel images={allImages} alt={idea.title} />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article className="flex flex-col gap-4 text-text-primary">
            {idea.longDescription.map((paragraph, i) => (
              <p key={i} className="text-base leading-relaxed">
                {paragraph}
              </p>
            ))}

            {idea.website && (
              <a
                href={idea.website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 self-start rounded-md bg-brand-orange px-4 py-2 text-sm font-medium text-surface-primary transition-colors hover:bg-brand-orange/90"
              >
                <ExternalLink size={16} />
                Visit official site
              </a>
            )}
          </article>

          <aside className="rounded-lg border border-border-default bg-surface-secondary px-5 py-2">
            <MetaRow icon={<MapPin size={14} />} label="Location">
              <div>{idea.location.region}</div>
              {idea.location.address && (
                <div className="mt-1 text-text-secondary">
                  {idea.location.address}
                </div>
              )}
            </MetaRow>

            <MetaRow icon={<Route size={14} />} label="Access from Helsinki">
              <div className="flex items-center gap-2">
                <span
                  className={`font-medium ${
                    COMPLEXITY_TONE[idea.accessFromHelsinki.complexity]
                  }`}
                >
                  {COMPLEXITY_LABELS[idea.accessFromHelsinki.complexity]}
                </span>
                <span className="text-text-muted">·</span>
                <span>{idea.accessFromHelsinki.duration}</span>
              </div>
              <div className="mt-1 text-text-secondary">
                {idea.accessFromHelsinki.notes}
              </div>
            </MetaRow>

            <MetaRow icon={<Euro size={14} />} label="Cost per person">
              <div className="font-medium">
                {idea.cost.perPersonEur === 0
                  ? "Free"
                  : `€${idea.cost.perPersonEur}`}
              </div>
              {idea.cost.notes && (
                <div className="mt-1 text-text-secondary">{idea.cost.notes}</div>
              )}
            </MetaRow>

            <MetaRow icon={<Calendar size={14} />} label="Booking">
              <div className="font-medium">
                {LEAD_TIME_LABELS[idea.booking.leadTime]}
              </div>
              {idea.booking.notes && (
                <div className="mt-1 text-text-secondary">{idea.booking.notes}</div>
              )}
            </MetaRow>

            <MetaRow icon={<CalendarDays size={14} />} label="When to go">
              <div className="font-medium">
                {summarizeMonths(idea.availability.suitableMonths)}
              </div>
              {idea.availability.events && idea.availability.events.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 text-text-secondary">
                  {idea.availability.events.map((event, i) => (
                    <li key={i} className="flex items-baseline gap-2">
                      <span className="text-text-primary">
                        {formatEventRange(event)}
                      </span>
                      {event.name && <span>· {event.name}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {idea.availability.weeklySchedule && (
                <div className="mt-1 text-text-secondary">
                  {idea.availability.weeklySchedule}
                </div>
              )}
              {idea.availability.notes && (
                <div className="mt-1 text-text-secondary">
                  {idea.availability.notes}
                </div>
              )}
            </MetaRow>

            <MetaRow icon={<Clock size={14} />} label="Time on site">
              <div>{DURATION_LABELS[idea.duration]}</div>
            </MetaRow>

            <MetaRow icon={<Footprints size={14} />} label="Physical intensity">
              <div>{INTENSITY_LABELS[idea.physicalIntensity]}</div>
            </MetaRow>

            <MetaRow icon={<Trees size={14} />} label="Indoor / outdoor">
              <div>{capitalize(idea.indoorOutdoor)}</div>
            </MetaRow>

            <MetaRow icon={<Baby size={14} />} label="Toddler-friendly (ages 2-5)">
              <div className="font-medium">
                {idea.toddlerFriendly ? "Yes" : "No"}
              </div>
              {idea.toddlerNotes && (
                <div className="mt-1 text-text-secondary">{idea.toddlerNotes}</div>
              )}
            </MetaRow>

            {idea.tags.length > 0 && (
              <MetaRow icon={<Map size={14} />} label="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {idea.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-text-secondary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </MetaRow>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
