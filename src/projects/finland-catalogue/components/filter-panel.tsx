"use client";

import { X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  type AccessComplexity,
  type CostBucket,
  type Duration,
  type Filters,
  type IndoorOutdoor,
  countActive,
  EMPTY_FILTERS,
  KNOWN_REGIONS,
  KNOWN_TAGS,
} from "../filters";
import { ALL_MONTHS, MONTH_ABBREV } from "../months";

const COST_OPTIONS: { value: CostBucket; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "under-30", label: "Under €30" },
  { value: "under-100", label: "€30–100" },
  { value: "over-100", label: "€100+" },
];

const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: "<1h", label: "< 1 hour" },
  { value: "1-3h", label: "1–3 hours" },
  { value: "half-day", label: "Half day" },
  { value: "full-day", label: "Full day" },
  { value: "multi-day", label: "Multi-day" },
];

const ACCESS_OPTIONS: { value: AccessComplexity; label: string }[] = [
  { value: "simple", label: "Simple" },
  { value: "moderate", label: "Moderate" },
  { value: "complex", label: "Complex" },
];

const INDOOR_OUTDOOR_OPTIONS: { value: IndoorOutdoor; label: string }[] = [
  { value: "indoor", label: "Indoor" },
  { value: "outdoor", label: "Outdoor" },
  { value: "mixed", label: "Mixed" },
];

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

interface FilterPanelProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function FilterPanel({ filters, onChange }: FilterPanelProps) {
  const active = countActive(filters);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          Filters
        </h2>
        {active > 0 && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1 text-xs text-text-secondary transition-colors hover:text-brand-pink"
          >
            <X size={12} />
            Reset
          </button>
        )}
      </div>

      <MonthGrid
        selected={filters.months}
        onToggle={(m) => onChange({ ...filters, months: toggle(filters.months, m) })}
      />

      <ChipGroup
        label="Region"
        options={KNOWN_REGIONS.map((r) => ({ value: r, label: r }))}
        selected={filters.regions}
        onToggle={(v) => onChange({ ...filters, regions: toggle(filters.regions, v) })}
      />

      <ChipGroup
        label="Cost per person"
        options={COST_OPTIONS}
        selected={filters.costs}
        onToggle={(v) => onChange({ ...filters, costs: toggle(filters.costs, v) })}
      />

      <ChipGroup
        label="Time on site"
        options={DURATION_OPTIONS}
        selected={filters.durations}
        onToggle={(v) =>
          onChange({ ...filters, durations: toggle(filters.durations, v) })
        }
      />

      <ChipGroup
        label="Access from Lauttasaari"
        options={ACCESS_OPTIONS}
        selected={filters.access}
        onToggle={(v) => onChange({ ...filters, access: toggle(filters.access, v) })}
      />

      <ChipGroup
        label="Indoor / outdoor"
        options={INDOOR_OUTDOOR_OPTIONS}
        selected={filters.indoorOutdoor}
        onToggle={(v) =>
          onChange({ ...filters, indoorOutdoor: toggle(filters.indoorOutdoor, v) })
        }
      />

      <ChipGroup
        label="Tags"
        options={KNOWN_TAGS.map((t) => ({ value: t, label: capitalize(t) }))}
        selected={filters.tags}
        onToggle={(v) => onChange({ ...filters, tags: toggle(filters.tags, v) })}
      />
    </div>
  );
}

interface ChipGroupProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
}

interface MonthGridProps {
  selected: number[];
  onToggle: (month: number) => void;
}

function MonthGrid({ selected, onToggle }: MonthGridProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
        Visiting in
      </span>
      <div className="grid grid-cols-4 gap-1.5">
        {ALL_MONTHS.map((m) => {
          const isSelected = selected.includes(m);
          return (
            <button
              key={m}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(m)}
              className={cn(
                "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                isSelected
                  ? "border-brand-pink bg-brand-pink text-surface-primary"
                  : "border-border-default bg-surface-elevated text-text-secondary hover:border-border-hover",
              )}
            >
              {MONTH_ABBREV[m - 1]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: ChipGroupProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isSelected = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(opt.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                isSelected
                  ? "border-brand-pink bg-brand-pink text-surface-primary"
                  : "border-border-default bg-surface-elevated text-text-secondary hover:border-border-hover",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
