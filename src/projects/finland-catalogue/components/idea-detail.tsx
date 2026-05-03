import {
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
import { EntryDetail } from "./entry-detail";
import { StarButton } from "./star-button";

const DURATION_LABELS: Record<Idea["duration"], string> = {
  "<1h": "Less than an hour",
  "1-3h": "1-3 hours",
  "half-day": "Half day",
  "full-day": "Full day",
  "multi-day": "Multi-day",
};

const COMPLEXITY_LABELS: Record<Idea["accessFromLauttasaari"]["complexity"], string> = {
  simple: "Simple",
  moderate: "Moderate",
  complex: "Complex",
};

const COMPLEXITY_TONE: Record<
  Idea["accessFromLauttasaari"]["complexity"],
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

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAgeRange(range: { min: number; max?: number }): string {
  if (range.max === undefined) {
    return range.min === 0 ? "All ages" : `Ages ${range.min}+`;
  }
  if (range.min === range.max) return `Age ${range.min}`;
  return `Ages ${range.min}–${range.max}`;
}

function googleMapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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

function IdeaMetadataAside({ idea }: { idea: Idea }) {
  return (
    <>
      <MetaRow icon={<MapPin size={14} />} label="Location">
        <div>{idea.location.region.join(" · ")}</div>
        {idea.location.address && (
          <a
            href={googleMapsUrl(`${idea.title}, ${idea.location.address}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-text-secondary underline-offset-2 transition-colors hover:text-brand-pink hover:underline"
          >
            {idea.location.address}
            <ExternalLink size={12} />
          </a>
        )}
      </MetaRow>

      <MetaRow icon={<Route size={14} />} label="Access from Lauttasaari">
        <div className="flex items-center gap-2">
          <span
            className={`font-medium ${
              COMPLEXITY_TONE[idea.accessFromLauttasaari.complexity]
            }`}
          >
            {COMPLEXITY_LABELS[idea.accessFromLauttasaari.complexity]}
          </span>
          <span className="text-text-muted">·</span>
          <span>{idea.accessFromLauttasaari.duration}</span>
        </div>
        <div className="mt-1 text-text-secondary">
          {idea.accessFromLauttasaari.notes}
        </div>
      </MetaRow>

      <MetaRow icon={<Euro size={14} />} label="Cost per person">
        <div className="font-medium">
          {idea.cost.perPersonEur === 0 ? "Free" : idea.cost.perPersonEur}
        </div>
        {idea.cost.notes && (
          <div className="mt-1 text-text-secondary">{idea.cost.notes}</div>
        )}
      </MetaRow>

      <MetaRow icon={<Calendar size={14} />} label="Booking">
        <div className="font-medium">{LEAD_TIME_LABELS[idea.booking.leadTime]}</div>
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
        <div>{titleCase(idea.indoorOutdoor)}</div>
      </MetaRow>

      <MetaRow icon={<Baby size={14} />} label="Children-friendly">
        <div className="font-medium">
          {idea.suitableAgeRange
            ? formatAgeRange(idea.suitableAgeRange)
            : "Not recommended for kids"}
        </div>
        {idea.childrenNotes && (
          <div className="mt-1 text-text-secondary">{idea.childrenNotes}</div>
        )}
      </MetaRow>

      {idea.tags.length > 0 && (
        <MetaRow icon={<Map size={14} />} label="Tags">
          <div className="flex flex-wrap gap-1.5">
            {idea.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-surface-elevated px-2 py-0.5 text-xs capitalize text-text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        </MetaRow>
      )}
    </>
  );
}

export function IdeaDetail({ idea, basePath }: { idea: Idea; basePath: string }) {
  return (
    <EntryDetail
      backHref={basePath}
      backLabel="Back to Finland Catalogue"
      basePath={basePath}
      title={idea.title}
      shortDescription={idea.shortDescription}
      thumbnailUrl={idea.thumbnailUrl}
      galleryUrls={idea.galleryUrls}
      longDescription={idea.longDescription}
      headerAction={
        <StarButton
          slug={idea.slug}
          size="lg"
          showLabel
          className="self-start shrink-0"
        />
      }
      bodyExtras={
        idea.website ? (
          <a
            href={idea.website}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-2 self-start rounded-md bg-brand-orange px-4 py-2 text-sm font-medium text-surface-primary transition-colors hover:bg-brand-orange/90"
          >
            <ExternalLink size={16} />
            Visit official site
          </a>
        ) : null
      }
      aside={<IdeaMetadataAside idea={idea} />}
    />
  );
}
